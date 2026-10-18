import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { registerRideXPushToken } from '../../pushNotifications';
import type { RegisterRideXPushTokenInput } from '../../pushNotifications';

const REGISTRATION_BACKOFF_MS = [1_000, 2_000, 4_000];
const TOUCH_INTERVAL_MS = 5 * 60 * 1_000;
const RETRYABLE_STATUS_MIN = 500;
const PUSH_STATE_KEY = 'ridex_push_lifecycle_v2';

let unsubscribe: (() => void) | null = null;
let notificationSubscription: { remove: () => void } | null = null;
let responseSubscription: { remove: () => void } | null = null;

export type RideXPushLifecycleHandlers = {
  onNotificationReceived?: (notification: unknown) => void;
  onNotificationResponse?: (response: unknown) => void;
  onRegistrationState?: (state: 'REGISTERING' | 'REGISTERED' | 'RETRYING' | 'DISABLED' | 'AUTH_EXPIRED' | 'ERROR') => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canRetry(status: number | null): boolean {
  return status === null || status >= RETRYABLE_STATUS_MIN;
}

async function postDeviceAction(
  input: RegisterRideXPushTokenInput,
  path: '/register' | '/touch' | '/deactivate',
  token: string,
  extra?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  const url = `${String(input.api).replace(/\/+$/, '')}/devices${path}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(input.authToken).trim()}`,
      },
      body: JSON.stringify({ token, ...extra }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function bestEffortReadStoredState(): Promise<Record<string, unknown>> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function persistState(input: RegisterRideXPushTokenInput, providerToken?: string): Promise<void> {
  try {
    const existing = await bestEffortReadStoredState();
    await AsyncStorage.setItem(PUSH_STATE_KEY, JSON.stringify({
      ...existing,
      api: String(input.api).replace(/\/+$/, ''),
      platform: Platform.OS,
      appVersion: String(input.appVersion || '').slice(0, 100),
      lastRegisteredAt: Date.now(),
      tokenRegistered: Boolean(providerToken),
      tokenFingerprint: providerToken ? `${providerToken.slice(0, 6)}…${providerToken.slice(-4)}` : existing.tokenFingerprint,
    }));
  } catch {}
}

async function getNativePushToken(): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');
    let Device: any = null;
    try { Device = await import('expo-device'); } catch { Device = null; }
    if (Device && Device.isDevice === false) return null;
    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;
    const native = await Notifications.getDevicePushTokenAsync();
    const token = String(native?.data || '').trim();
    return token || null;
  } catch {
    return null;
  }
}

async function registerWithRetry(
  input: RegisterRideXPushTokenInput,
  handlers?: RideXPushLifecycleHandlers,
): Promise<string | null> {
  const authToken = String(input.authToken || '').trim();
  if (!authToken) {
    handlers?.onRegistrationState?.('AUTH_EXPIRED');
    return null;
  }

  handlers?.onRegistrationState?.('REGISTERING');

  const nativeToken = await getNativePushToken();
  if (!nativeToken) {
    handlers?.onRegistrationState?.('DISABLED');
    return null;
  }

  for (let attempt = 0; attempt <= REGISTRATION_BACKOFF_MS.length; attempt += 1) {
    const result = await registerRideXPushToken({ ...input, providerTokenOverride: nativeToken });
    if (result.ok) {
      await persistState(input, nativeToken);
      handlers?.onRegistrationState?.('REGISTERED');
      return nativeToken;
    }

    if (result.status === 401 || result.status === 403) {
      handlers?.onRegistrationState?.('AUTH_EXPIRED');
      return null;
    }

    if (!canRetry(result.status) || attempt === REGISTRATION_BACKOFF_MS.length) break;
    handlers?.onRegistrationState?.('RETRYING');
    await sleep(REGISTRATION_BACKOFF_MS[attempt]);
  }

  handlers?.onRegistrationState?.('ERROR');
  return null;
}

export function startRideXPushLifecycle(
  input: RegisterRideXPushTokenInput,
  minimumRefreshMs = TOUCH_INTERVAL_MS,
  handlers?: RideXPushLifecycleHandlers,
): () => void {
  if (unsubscribe) unsubscribe();
  notificationSubscription?.remove();
  responseSubscription?.remove();
  notificationSubscription = null;
  responseSubscription = null;

  let stopped = false;
  let registrationBusy = false;
  let lastRefreshAt = 0;
  let currentProviderToken = '';

  const refresh = async () => {
    if (stopped || registrationBusy) return;
    const now = Date.now();
    if (lastRefreshAt && now - lastRefreshAt < minimumRefreshMs) return;
    registrationBusy = true;
    try {
      const token = await registerWithRetry(input, handlers);
      if (!token) return;
      currentProviderToken = token;
      lastRefreshAt = Date.now();
    } finally {
      registrationBusy = false;
    }
  };

  const handleAppState = (state: AppStateStatus) => {
    if (state === 'active') void refresh();
  };

  const setupNativeListeners = async () => {
    try {
      const Notifications = await import('expo-notifications');
      if (stopped) return;
      notificationSubscription = Notifications.addNotificationReceivedListener((notification) => {
        handlers?.onNotificationReceived?.(notification);
      });
      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        handlers?.onNotificationResponse?.(response);
      });
    } catch {}
  };

  void setupNativeListeners();
  void refresh();

  const sub = AppState.addEventListener('change', handleAppState);
  unsubscribe = () => {
    stopped = true;
    sub.remove();
    notificationSubscription?.remove();
    responseSubscription?.remove();
    notificationSubscription = null;
    responseSubscription = null;
    if (unsubscribe) unsubscribe = null;

    const token = currentProviderToken;
    if (token && String(input.authToken).trim()) {
      void postDeviceAction(input, '/deactivate', token);
    }
  };
  return unsubscribe;
}

export async function reactivateRideXPushToken(input: RegisterRideXPushTokenInput): Promise<boolean> {
  const token = await getNativePushToken();
  if (!token) return false;
  const result = await postDeviceAction(input, '/register', token, {
    platform: Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'web' ? 'WEB' : 'ANDROID',
    appVersion: String(input.appVersion || '').slice(0, 100) || undefined,
    deviceName: input.deviceName,
  });
  if (result.ok) await persistState(input, token);
  return result.ok;
}

export async function deactivateRideXPushToken(input: RegisterRideXPushTokenInput, providerToken: string): Promise<boolean> {
  const token = String(providerToken || '').trim();
  if (!token || !String(input.authToken || '').trim()) return false;
  return (await postDeviceAction(input, '/deactivate', token)).ok;
}
