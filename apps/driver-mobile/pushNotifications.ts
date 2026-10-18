import { Platform } from 'react-native';

export type RegisterRideXPushTokenInput = {
  api: string;
  authToken: string;
  appVersion?: string;
  deviceName?: string;
  /** Internal lifecycle override used after native token acquisition. */
  providerTokenOverride?: string;
};

export type RideXPushRegistrationResult = {
  ok: boolean;
  status: number;
  token?: string;
};

/**
 * Registers the native FCM/APNs token with the locked RideX /devices API.
 * The backend remains authoritative for device activation and invalid-token
 * deactivation. This client helper intentionally never logs or returns the
 * raw token outside this module.
 */
export async function registerRideXPushToken(input: RegisterRideXPushTokenInput): Promise<RideXPushRegistrationResult> {
  const authToken = String(input.authToken || '').trim();
  if (!authToken) return { ok: false, status: 401 };

  try {
    const providerToken = String(input.providerTokenOverride || '').trim();
    if (!providerToken) return { ok: false, status: 0 };

    const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'web' ? 'WEB' : 'ANDROID';
    const response = await fetch(`${String(input.api).replace(/\/+$/, '')}/devices/register`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token: providerToken,
        platform,
        appVersion: String(input.appVersion || '').slice(0, 100) || undefined,
        deviceName: String(input.deviceName || 'RideX Mobile').slice(0, 200),
      }),
    });

    if (!response.ok) return { ok: false, status: response.status };

    try {
      await fetch(`${String(input.api).replace(/\/+$/, '')}/devices/touch`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token: providerToken }),
      });
    } catch {}

    return { ok: true, status: response.status, token: providerToken };
  } catch {
    return { ok: false, status: 0 };
  }
}
