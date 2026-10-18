import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureToken, setSecureToken, removeSecureToken } from '../../shared/security/secureTokenStorage';
import * as Location from 'expo-location';
import { openRideXEventStream, type RideXStreamEvent } from '../../shared/realtime/client';
import { chooseDriverDisplayAsset, chooseDriverHomeAsset, makeRideXRemoteImageSource, type RideXRemoteAssetImageSource } from '../../shared/assets/remote';
import { getCachedRideXAssetManifest, syncRideXAssetCache } from '../../shared/assets/cache';
import { setDriverActiveBookingId, startDriverBackgroundLocation, stopDriverBackgroundLocation } from '../backgroundLocation';
import { startRideXPushLifecycle } from '../../shared/notifications/lifecycle';
import { getDriverApiBase, DRIVER_TOKEN_KEY, DRIVER_SESSION_KEY, passwordLogin, verifyOtp, resendOtp, logout as apiLogout, getDriver, getDriverServiceCapabilities, getOnboardingStatus, getVehicleCatalog, getDriverHistory, getDriverEarnings, getDriverWallet, getPayoutProfile, getRideRequests, getActiveBooking, getBooking, sendOtp, registerDriverOtp, verifyDriverRegistration, setOnline, acceptRide, rejectRide, arriveRide, startRide, completeRide, prepareRideQr, prepareRideOtp, verifyRideCredential, updateGps, getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, getSupportCases, createSupportCase, sendSupportMessage, triggerSos, createDocumentSlot as createDocumentSlotApi, uploadDocument as uploadDocumentApi, createVehicle as createVehicleApi, updateVehicle as updateVehicleApi, savePayoutProfile, requestWithdrawal, submitOnboarding as submitOnboardingApi } from '../api/driverApi';

const Ctx = createContext<any>(null);

function rowsFrom(data: any): any[] {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.rows)) return data.data.rows;
  if (Array.isArray(data?.data?.transactions)) return data.data.transactions;
  return [];
}

function currentLeg(booking: any, driverId: string) {
  const legs = Array.isArray(booking?.legs) ? booking.legs : [];
  const activeLegs = legs.filter((leg: any) => !['COMPLETED','CANCELLED'].includes(String(leg?.status || '').toUpperCase()));
  const assigned = driverId ? activeLegs.find((leg: any) => String(leg?.driverId || '') === driverId) : null;
  if (assigned) return assigned;
  // The booking endpoint is Driver-scoped; allow an unassigned driverId only for a
  // single active leg. Never fall back to another driver's leg in a multi-leg booking.
  if (driverId && activeLegs.length === 1 && !String(activeLegs[0]?.driverId || '').trim()) return activeLegs[0];
  return null;
}

export function DriverRuntimeProvider({ children, startAt = 'welcome' }: { children: React.ReactNode; startAt?: 'welcome' | 'login' }) {
  const [screen, setScreen] = useState<any>(startAt);
  const [driverId, setDriverId] = useState('');
  const [driver, setDriver] = useState<any>(null);
  const [serviceCapabilities, setServiceCapabilities] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [vehicleCatalog, setVehicleCatalog] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [earningTotals, setEarningTotals] = useState({ gross: 0, commission: 0, net: 0 });
  const [wallet, setWallet] = useState<any>({ available: 0, pending: 0, lifetime: 0, withdrawn: 0 });
  const [walletRows, setWalletRows] = useState<any[]>([]);
  const [payout, setPayout] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [otpRequesting, setOtpRequesting] = useState(false);
  const otpRequestInFlight = useRef(false);
  const [completedRideSummary, setCompletedRideSummary] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportCases, setSupportCases] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [pendingOtpActorId, setPendingOtpActorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosOutcome, setSosOutcome] = useState<'idle' | 'success' | 'failure'>('idle');
  const sosInFlight = useRef(false);
  const gpsInFlight = useRef(false);
  const sessionEpoch = useRef(0);
  const [online, setOnlineState] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [gps, setGps] = useState<any>(null);
  const [driverHomeAssetSource, setDriverHomeAssetSource] = useState<RideXRemoteAssetImageSource | null>(null);
  const [driverDisplayAssetSource, setDriverDisplayAssetSource] = useState<RideXRemoteAssetImageSource | null>(null);
  const streamClose = useRef<null | (() => void)>(null);

  useEffect(() => {
    let active = true;
    if (!driverId) {
      setDriverHomeAssetSource(null);
      setDriverDisplayAssetSource(null);
      return () => { active = false; };
    }
    void (async () => {
      const cached = await Promise.all([
        getCachedRideXAssetManifest("DRIVER", "DRIVER", driverId),
        getCachedRideXAssetManifest("DRIVER", "SHARED", driverId),
      ]);
      if (active) {
        const combined = [...cached[0], ...cached[1]];
        setDriverHomeAssetSource(makeRideXRemoteImageSource(chooseDriverHomeAsset(combined), undefined, getDriverApiBase()));
        setDriverDisplayAssetSource(makeRideXRemoteImageSource(chooseDriverDisplayAsset(combined), undefined, getDriverApiBase()));
      }
      try {
        const token = String(await getSecureToken(DRIVER_TOKEN_KEY) || "");
        const fresh = await Promise.all([
          syncRideXAssetCache("DRIVER", "DRIVER", driverId, async (input, init) => fetch(`${getDriverApiBase()}${input.startsWith("/") ? input : `/${input}`}`, { ...(init || {}), headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } }), token),
          syncRideXAssetCache("DRIVER", "SHARED", driverId, async (input, init) => fetch(`${getDriverApiBase()}${input.startsWith("/") ? input : `/${input}`}`, { ...(init || {}), headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` } }), token),
        ]);
        if (active) {
          const combined = [...fresh[0], ...fresh[1]];
          setDriverHomeAssetSource(makeRideXRemoteImageSource(chooseDriverHomeAsset(combined), token, getDriverApiBase()));
          setDriverDisplayAssetSource(makeRideXRemoteImageSource(chooseDriverDisplayAsset(combined), token, getDriverApiBase()));
        }
      } catch (error) {
        console.warn("DRIVER ASSET CACHE SYNC:", error);
      }
    })();
    return () => { active = false; };
  }, [driverId]);

  // Driver push lifecycle: refresh/touch the registered device after authentication and on app resume.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    if (driverId) {
      void getSecureToken(DRIVER_TOKEN_KEY).then((token) => {
        if (cancelled || !token) return;
        stop = startRideXPushLifecycle({ api: getDriverApiBase(), authToken: token, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? ''), deviceName: `RideX Driver ${driverId}` });
      });
    }
    return () => { cancelled = true; stop?.(); };
  }, [driverId]);

  const refreshDriver = useCallback(async (id: string) => {
    if (!id) return undefined;
    const requestEpoch = sessionEpoch.current;
    const safeRequest = async (promise: Promise<any>) => {
      try { return await promise; }
      catch { return { response: { ok: false }, data: { success: false } }; }
    };
    const [d, capabilities, o, p, e, w, h, n, sc, c, active] = await Promise.all([
      safeRequest(getDriver(id)), safeRequest(getDriverServiceCapabilities(id)), safeRequest(getOnboardingStatus(id)), safeRequest(getPayoutProfile(id)), safeRequest(getDriverEarnings(id)), safeRequest(getDriverWallet(id)), safeRequest(getDriverHistory(id)), safeRequest(getNotifications(id)), safeRequest(getSupportCases(id)), safeRequest(getUnreadCount(id)), safeRequest(getActiveBooking(id)),
    ]);
    if (requestEpoch !== sessionEpoch.current) return undefined;
    let activeRideSynced = Boolean(active.response.ok && active.data?.success);
    let activeRideScreen: string | null = null;
    if (capabilities.response.ok && capabilities.data?.success) setServiceCapabilities(capabilities.data.data ?? null);
    if (d.response.ok && d.data?.success) {
      setDriver(d.data.data ?? null);
      const backendOnline = d.data.data?.online ?? d.data.data?.isOnline;
      if (typeof backendOnline === 'boolean') setOnlineState(backendOnline);
    }
    if (o.response.ok && o.data?.success) setOnboarding(o.data.data ?? null);
    if (p.response.ok && p.data?.success) setPayout(p.data.data ?? null);
    if (e.response.ok && e.data?.success) {
      const r = rowsFrom(e.data);
      setEarnings(r);
      const t = e.data?.data?.totals || {};
      setEarningTotals({
        gross: Number(t.gross ?? r.reduce((s: number, x: any) => s + Number(x?.grossFare ?? 0), 0)),
        commission: Number(t.commission ?? r.reduce((s: number, x: any) => s + Number(x?.commission ?? 0), 0)),
        net: Number(t.net ?? r.reduce((s: number, x: any) => s + Number(x?.netEarning ?? x?.driverEarning ?? 0), 0)),
      });
    }
    if (w.response.ok && w.data?.success) { setWallet(w.data.data?.summary ?? w.data.data ?? {}); setWalletRows(rowsFrom(w.data)); }
    if (h.response.ok && h.data?.success) setHistory(Array.isArray(h.data.data) ? h.data.data : []);
    if (n.response.ok && n.data?.success) setNotifications(Array.isArray(n.data.data) ? n.data.data : []);
    if (sc.response.ok && sc.data?.success) setSupportCases(Array.isArray(sc.data.data) ? sc.data.data : Array.isArray(sc.data?.data?.cases) ? sc.data.data.cases : []);
    if (c.response.ok && c.data?.success) setUnreadCount(Number(c.data.data?.unreadCount ?? 0));
    if (active.response.ok && active.data?.success) {
      const activeData = active.data.data;
      const bookingId = String(
        activeData?.bookingId || activeData?.leg?.bookingId || '',
      ).trim();

      if (bookingId) {
        const bookingResponse = await safeRequest(getBooking(bookingId));
        if (requestEpoch !== sessionEpoch.current) return undefined;
        if (bookingResponse.response.ok && bookingResponse.data?.success && bookingResponse.data?.data?.id) {
          const booking = bookingResponse.data.data;
          setActiveRide(booking);
          const s = String(booking.status || '').toUpperCase();
          activeRideScreen = s === 'DRIVER_ARRIVED' ? 'arrived' : ['STARTED','IN_PROGRESS'].includes(s) ? 'trip' : 'accepted';
        } else { activeRideSynced = false; }
      } else if (!activeData) {
        // A successful active-booking response with no booking is authoritative;
        // do not keep an old assigned/arrived/in-progress ride on screen.
        setActiveRide(null);
      } else {
        activeRideSynced = false;
      }
    }
    return {
      driver: Boolean(d.response.ok && d.data?.success),
      capabilities: Boolean(capabilities.response.ok && capabilities.data?.success),
      onboarding: Boolean(o.response.ok && o.data?.success),
      payout: Boolean(p.response.ok && p.data?.success),
      earnings: Boolean(e.response.ok && e.data?.success),
      wallet: Boolean(w.response.ok && w.data?.success),
      history: Boolean(h.response.ok && h.data?.success),
      notifications: Boolean(n.response.ok && n.data?.success),
      supportCases: Boolean(sc.response.ok && sc.data?.success),
      unreadCount: Boolean(c.response.ok && c.data?.success),
      activeRide: activeRideSynced,
      activeRideScreen,
    };
  }, []);

  const completeAuth = useCallback(async (data: any) => {
    const id = String(data?.driverId || '').trim();
    const token = String(data?.token || '').trim();
    if (!id || !token) { setAuthMessage('Authentication response did not include a Driver session'); return false; }
    const authEpoch = ++sessionEpoch.current;
    await setSecureToken(DRIVER_TOKEN_KEY, token);
    if (authEpoch !== sessionEpoch.current) { try { await removeSecureToken(DRIVER_TOKEN_KEY); } catch {} return false; }
    await AsyncStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify({ driverId: id }));
    if (authEpoch !== sessionEpoch.current) { try { await AsyncStorage.removeItem(DRIVER_SESSION_KEY); } catch {} try { await removeSecureToken(DRIVER_TOKEN_KEY); } catch {} return false; }
    setDriverId(id);
    const refreshed = await refreshDriver(id);
    if (authEpoch !== sessionEpoch.current) return false;
    const next = String(data?.nextStep || '').toUpperCase();
    setScreen(refreshed?.activeRideScreen || (next === 'HOME' || String(data?.driverVerificationStatus || '').toUpperCase() === 'APPROVED' ? 'home' : 'onboardingStatus'));
    return true;
  }, [refreshDriver]);

  const restore = useCallback(async () => {
    const requestEpoch = sessionEpoch.current;
    try {
      const rawSession = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
      if (requestEpoch !== sessionEpoch.current) return;
      const token = await getSecureToken(DRIVER_TOKEN_KEY);
      if (requestEpoch !== sessionEpoch.current) return;
      let savedDriverId = '';
      try { savedDriverId = String(JSON.parse(rawSession || '{}')?.driverId || ''); }
      catch { await AsyncStorage.removeItem(DRIVER_SESSION_KEY); return; }
      if (!savedDriverId || !token) return;
      const current = await getDriver(savedDriverId);
      if (requestEpoch !== sessionEpoch.current) return;
      if (!current.response.ok) {
        if ([401, 403].includes(current.response.status)) {
          await AsyncStorage.removeItem(DRIVER_SESSION_KEY);
          if (requestEpoch !== sessionEpoch.current) return;
          await removeSecureToken(DRIVER_TOKEN_KEY);
        } else {
          setAuthMessage('Could not verify the saved Driver session because the service is unavailable. Check your connection and retry login.');
        }
        return;
      }
      if (!current.data?.success) {
        setAuthMessage(String(current.data?.message || 'Saved Driver session could not be verified. Please sign in again.'));
        return;
      }
      setDriverId(savedDriverId);
      const refreshed = await refreshDriver(savedDriverId);
      if (requestEpoch !== sessionEpoch.current) return;
      setScreen(refreshed?.activeRideScreen || (String(current.data?.data?.verificationStatus || current.data?.data?.driverVerificationStatus || '').toUpperCase() === 'APPROVED' ? 'home' : 'onboardingStatus'));
    } catch {
      if (requestEpoch !== sessionEpoch.current) return;
      // Preserve saved credentials on transient network/storage failures; do not log
      // the Driver out solely because the backend could not be reached at startup.
      setAuthMessage('Could not restore the saved Driver session. Check your connection and sign in again if needed.');
    }
  }, [refreshDriver]);

  useEffect(() => { void restore(); }, [restore]);
  // Advance only within the active ride flow; ordinary profile/KYC/support refreshes
  // must not steal navigation from the screen the Driver is currently using.
  useEffect(() => {
    const status = String(activeRide?.status || '').toUpperCase();
    if (screen === 'accepted' && status === 'DRIVER_ARRIVED') setScreen('arrived');
    else if (['accepted','arrived'].includes(String(screen)) && ['STARTED','IN_PROGRESS'].includes(status)) setScreen('trip');
  }, [activeRide?.status, screen]);
  useEffect(() => { void (async () => { const c = await getVehicleCatalog(); if (c.response.ok && c.data?.success) setVehicleCatalog(Array.isArray(c.data.data) ? c.data.data : []); })(); }, []);

  const connectRealtime = useCallback((id: string) => {
    let stopped = false;
    const connect = async () => {
      const token = await getSecureToken(DRIVER_TOKEN_KEY);
      if (stopped || !token) return;
      streamClose.current?.();
      streamClose.current = openRideXEventStream({
        url: `${getDriverApiBase()}/realtime/stream?actorType=DRIVER&actorId=${encodeURIComponent(id)}`,
        headers: { Authorization: `Bearer ${token}` },
        heartbeatTimeoutMs: 60000,
        onOpen: () => { setRealtimeConnected(true); void refreshDriver(id); },
        onClose: () => setRealtimeConnected(false),
        onError: () => setRealtimeConnected(false),
        onReplayGap: () => { if (!stopped) void refreshDriver(id); },
        reconnect: true,
        lastEventIdStorageKey: `ridex_realtime_cursor_driver_v1:${id}`,

        onEvent: (event: RideXStreamEvent) => {
          const t = String(event.type || '').toUpperCase();
          if (['REQUEST_CREATED','REQUEST_ACCEPTED','DRIVER_ARRIVED','TRIP_STARTED','TRIP_COMPLETED','PAYMENT_UPDATED','CASH_COLLECTION_CREATED','CASH_COLLECTION_UPDATED','DRIVER_KYC_UPDATED','DRIVER_VERIFICATION_UPDATED','DRIVER_ONBOARDING_SUBMITTED','DRIVER_VEHICLE_UPDATED','SUPPORT_MESSAGE_CREATED','NOTIFICATION_CREATED','SOS_TRIGGERED','DRIVER_ONLINE','DRIVER_OFFLINE','GPS_UPDATED','TRIP_PROGRESS'].includes(t)) void refreshDriver(id);
        },
      });
    };
    void connect();
    return () => { stopped = true; streamClose.current?.(); };
  }, [refreshDriver]);

  useEffect(() => { if (!driverId) return; const cleanup = connectRealtime(driverId); return cleanup; }, [driverId, connectRealtime]);

  const login = useCallback(async (identifier: string, password: string) => {
    if (!identifier.trim()) { setAuthMessage('Enter your Driver User ID, mobile or email.'); return false; }
    if (!password) { setAuthMessage('Enter your password.'); return false; }
    setLoading(true); setAuthMessage('');
    try {
      const { response, data } = await passwordLogin(identifier.trim(), password);
      if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to sign in'); return false; }
      if (data?.data?.requiresOtp) { setPendingOtpActorId(String(data?.data?.actorId || '')); setAuthMessage('New-device OTP required'); setScreen('otp'); return true; }
      return completeAuth(data.data);
    } catch { setAuthMessage('Unable to reach RideX service'); return false; } finally { setLoading(false); }
  }, [completeAuth]);

  const verifyLoginOtp = useCallback(async (actorId: string, otp: string) => {
    setLoading(true); setAuthMessage('');
    try { const { response, data } = await verifyOtp(actorId, 'DRIVER.AUTH.NEW_DEVICE', otp); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'OTP verification failed'); return false; } return completeAuth(data.data); }
    catch { setAuthMessage('Unable to verify OTP'); return false; } finally { setLoading(false); }
  }, [completeAuth]);

  const resendLoginOtp = useCallback(async (actorId: string) => {
    if (!actorId) { setAuthMessage('The login identity is missing. Return to login and try again.'); return false; }
    setLoading(true); setAuthMessage('');
    try { const { response, data } = await resendOtp(actorId, 'DRIVER.AUTH.NEW_DEVICE'); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to resend OTP'); return false; } setAuthMessage('OTP resent successfully'); return true; }
    catch { setAuthMessage('Unable to resend OTP because of a network error.'); return false; }
    finally { setLoading(false); }
  }, []);
  const sendRegistrationOtp = useCallback(async (mobile: string) => {
    setLoading(true); setAuthMessage('');
    try { const { response, data } = await registerDriverOtp(mobile); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to send registration OTP'); return false; } setAuthMessage('Registration OTP sent'); return true; }
    catch { setAuthMessage('Unable to send registration OTP because of a network error.'); return false; }
    finally { setLoading(false); }
  }, []);
  const completeRegistration = useCallback(async (mobile: string, otp: string, fullName: string, address: string) => {
    setLoading(true); setAuthMessage('');
    try { const { response, data } = await verifyDriverRegistration({ mobile, otp, fullName, address }); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to complete registration'); return false; } return completeAuth(data.data); }
    catch { setAuthMessage('Unable to complete registration because of a network error.'); return false; }
    finally { setLoading(false); }
  }, [completeAuth]);

  const toggleOnline = useCallback(async () => {
    if (!driverId) return false;
    const requestEpoch = sessionEpoch.current;
    setLoading(true);
    try {
      let lat = gps?.latitude, lng = gps?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const permission = await Location.getForegroundPermissionsAsync();
        if (requestEpoch !== sessionEpoch.current) return false;
        const p = permission.status === 'granted' ? permission : await Location.requestForegroundPermissionsAsync();
        if (requestEpoch !== sessionEpoch.current) return false;
        if (p.status !== 'granted') { setMessage('Location permission is required before going online'); return false; }
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (requestEpoch !== sessionEpoch.current) return false;
        if (!servicesEnabled) { setMessage('Enable device GPS/location services before going online.'); return false; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (requestEpoch !== sessionEpoch.current) return false;
        lat = loc.coords.latitude; lng = loc.coords.longitude; setGps({ latitude: lat, longitude: lng, accuracy: loc.coords.accuracy ?? null });
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180) { setMessage('GPS returned invalid coordinates. Retry when device location is available.'); return false; }
      const { response, data } = await setOnline(driverId, !online, lat, lng);
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to change online status'); return false; }
      setOnlineState(!online); setMessage(!online ? 'You are ONLINE' : 'You are OFFLINE'); return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Could not change online status because of a location or network error. Check permissions and retry.'); return false; }
    finally { setLoading(false); }
  }, [driverId, gps, online]);

  const refreshRequests = useCallback(async () => {
    if (!driverId || !online || activeRide) return false;
    const requestEpoch = sessionEpoch.current;
    try {
      const { response, data } = await getRideRequests(driverId);
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'Ride requests could not be refreshed. Check your connection and retry.'); return false; }
      setRequests(Array.isArray(data.data) ? data.data : []);
      setMessage('');
      return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while refreshing ride requests. Check your connection and retry.'); return false; }
  }, [driverId, online, activeRide]);
  useEffect(() => { if (!online || activeRide || !driverId) return; void refreshRequests(); const timer = setInterval(() => void refreshRequests(), 15000); return () => clearInterval(timer); }, [online, activeRide, driverId, refreshRequests]);

  const runGps = useCallback(async () => {
    if (!driverId || !online || gpsInFlight.current) return false;
    const requestEpoch = sessionEpoch.current;
    gpsInFlight.current = true;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (requestEpoch !== sessionEpoch.current) return false;
      const p = permission.status === 'granted' ? permission : await Location.requestForegroundPermissionsAsync();
      if (requestEpoch !== sessionEpoch.current) return false;
      if (p.status !== 'granted') { setMessage('Location permission is required for live GPS updates. Enable it in device Settings.'); return false; }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!servicesEnabled) { setMessage('Enable device GPS/location services before refreshing live location.'); return false; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (requestEpoch !== sessionEpoch.current) return false;
      const payload = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? null, heading: loc.coords.heading ?? null, speed: loc.coords.speed ?? null, recordedAt: new Date(loc.timestamp || Date.now()).toISOString(), isOnline: online };
      if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude) || payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) { setMessage('GPS returned invalid coordinates. Retry when device location is available.'); return false; }
      setGps(payload); const { response, data } = await updateGps(driverId, payload);
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'GPS update was not confirmed by RideX.'); return false; }
      return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Could not update GPS because of a location or network error. Check location settings and retry.'); return false; }
    finally { gpsInFlight.current = false; }
  }, [driverId, online]);
  useEffect(() => { if (!online || !driverId) return; const timer = setInterval(() => void runGps(), activeRide ? 10000 : 60000); return () => clearInterval(timer); }, [online, driverId, activeRide, runGps]);

  useEffect(() => {
    void setDriverActiveBookingId(activeRide?.id ? String(activeRide.id) : null);
  }, [activeRide?.id]);

  useEffect(() => {
    let cancelled = false;
    const status = String(activeRide?.status || '').toUpperCase();
    const shouldTrack = Boolean(driverId && online && activeRide && ['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','STARTED','IN_PROGRESS'].includes(status));
    (async () => {
      if (!shouldTrack) { await stopDriverBackgroundLocation(); return; }
      const started = await startDriverBackgroundLocation();
      if (!cancelled && !started) setMessage('Background location permission is required during an active ride.');
    })();
    return () => { cancelled = true; };
  }, [driverId, online, activeRide]);

  // Prevent accidental double taps from issuing duplicate ride lifecycle mutations.
  const rideActionInFlight = useRef(false);
  const accept = useCallback(async (request: any) => {
    if (!request?.id || rideActionInFlight.current || activeRide) return false;
    const requestEpoch = sessionEpoch.current;
    rideActionInFlight.current = true; setLoading(true); setMessage('');
    try {
      const { response, data } = await acceptRide(String(request.id));
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to accept ride'); return false; }
      const b = await getBooking(String(request.bookingId || request.booking?.id || ''));
      if (requestEpoch !== sessionEpoch.current) return false;
      if (b.response.ok && b.data?.success && b.data?.data) setActiveRide(b.data.data);
      else if (request.booking) setActiveRide(request.booking);
      else { setMessage('Ride was accepted, but booking details could not be refreshed. Refresh the active ride before continuing.'); return false; }
      setRequests([]); setScreen('accepted'); await runGps(); return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while accepting ride. Refresh requests before trying again.'); return false; }
    finally { rideActionInFlight.current = false; setLoading(false); }
  }, [runGps, activeRide]);
  const reject = useCallback(async (requestId: string) => { if (!requestId || rideActionInFlight.current) return false; const requestEpoch = sessionEpoch.current; rideActionInFlight.current = true; setLoading(true); setMessage(''); try { const { response, data } = await rejectRide(requestId); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to reject ride'); return false; } setRequests(r => r.filter(x => String(x.id) !== requestId)); return true; } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while rejecting ride. Please refresh requests.'); return false; } finally { rideActionInFlight.current = false; setLoading(false); } }, []);
  const arrive = useCallback(async () => {
    const status = String(activeRide?.status || '').toUpperCase();
    if (!activeRide?.id || rideActionInFlight.current || !['DRIVER_ASSIGNED','DRIVER_ARRIVING'].includes(status)) { if (activeRide?.id && !['DRIVER_ASSIGNED','DRIVER_ARRIVING'].includes(status)) setMessage('Arrival can only be recorded for an assigned ride. Refresh ride status.'); return false; }
    const requestEpoch = sessionEpoch.current;
    rideActionInFlight.current = true; setLoading(true); setMessage('');
    try { const { response, data } = await arriveRide(activeRide.id); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to mark arrival'); return false; } const b = await getBooking(activeRide.id); if (requestEpoch !== sessionEpoch.current) return false; if (!b.response.ok || !b.data?.success || !b.data?.data) { setMessage('Arrival was recorded, but the latest ride status could not be refreshed. Refresh before continuing.'); return false; } setActiveRide(b.data.data); setScreen('arrived'); return true; }
    catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while recording arrival. Refresh ride status before retrying.'); return false; }
    finally { rideActionInFlight.current = false; setLoading(false); }
  }, [activeRide]);
  const prepareQr = useCallback(async () => {
    if (!driverId || !activeRide?.id) { setMessage('Driver session or active ride is unavailable. Refresh ride status before preparing QR.'); return null; }
    const leg = currentLeg(activeRide, driverId);
    if (!leg?.id) { setMessage('Your assigned booking leg could not be confirmed. Refresh ride status or contact support.'); return null; }
    const requestEpoch = sessionEpoch.current;
    try { const { response, data } = await prepareRideQr(activeRide.id, leg.id); if (requestEpoch !== sessionEpoch.current) return null; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to prepare QR'); return null; } return data.data; }
    catch { if (requestEpoch !== sessionEpoch.current) return null; setMessage('Network error while preparing verification QR. Check your connection and retry.'); return null; }
  }, [activeRide, driverId]);
  const requestRideOtp = useCallback(async () => {
    if (!driverId || !activeRide?.id) { setMessage('Driver session or active ride is unavailable. Refresh ride status before requesting the Ride OTP.'); return false; }
    if (String(activeRide.status || '').toUpperCase() !== 'DRIVER_ARRIVED') { setMessage('Ride OTP can only be requested after arrival is confirmed. Refresh ride status.'); return false; }
    const leg = currentLeg(activeRide, driverId);
    if (!leg?.id) { setMessage('Your assigned booking leg could not be confirmed. Refresh ride status before requesting the Ride OTP.'); return false; }

    const existingExpiry = Date.parse(String(leg.verificationExpiresAt ?? ''));
    if (leg.verificationOtpVerified || (Number.isFinite(existingExpiry) && existingExpiry > Date.now())) return true;
    if (otpRequestInFlight.current) return false;

    const requestEpoch = sessionEpoch.current;
    otpRequestInFlight.current = true;
    setOtpRequesting(true);
    setMessage('');
    try {
      const { response, data } = await prepareRideOtp(activeRide.id, leg.id);
      if (requestEpoch !== sessionEpoch.current) return false;

      const result = data?.data;
      const expiry = Date.parse(String(result?.expiresAt ?? ''));
      const acknowledged =
        response.ok &&
        data?.success === true &&
        result?.method === 'OTP' &&
        result?.bookingId === activeRide.id &&
        result?.legId === leg.id &&
        result?.purposeCode === 'DRIVER.RIDE.TRIP_START_VERIFY' &&
        Number.isFinite(expiry) &&
        expiry > Date.now() &&
        typeof result?.testDeliverySimulated === 'boolean';

      if (!acknowledged) {
        setMessage(data?.message || 'The Backend did not confirm the Ride OTP request. You can retry when ready.');
        return false;
      }

      setMessage(result.testDeliverySimulated
        ? 'TEST MODE: Ride OTP was generated for the test harness; no Customer push was attempted.'
        : 'Ride OTP request accepted. Ask the Customer to check their RideX notification; delivery is not confirmed by this response.');
      return true;
    } catch {
      if (requestEpoch !== sessionEpoch.current) return false;
      setMessage('Network error while requesting the Ride OTP. If the outcome is uncertain, check with the Customer before intentionally retrying.');
      return false;
    } finally {
      otpRequestInFlight.current = false;
      setOtpRequesting(false);
    }
  }, [activeRide, driverId]);
  const refreshActiveRide = useCallback(async () => {
    if (!activeRide?.id) { setMessage('No active ride is available to refresh.'); return false; }
    const requestEpoch = sessionEpoch.current;
    try {
      const { response, data } = await getBooking(activeRide.id);
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false || !data?.data) { setMessage(data?.message || 'Active ride status could not be refreshed.'); return false; }
      setActiveRide(data.data);
      setMessage('');
      return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while refreshing active ride status. Check your connection and retry.'); return false; }
  }, [activeRide]);
  const verifyOtpRide = useCallback(async (otp: string) => {
    if (!driverId || !activeRide?.id) { setMessage('Driver session or active ride is unavailable. Refresh ride status and retry.'); return false; }
    const normalizedOtp = String(otp || '').replace(/\D/g, '').slice(0, 4);
    if (normalizedOtp.length !== 4) { setMessage('Enter the 4-digit customer OTP.'); return false; }
    const leg = currentLeg(activeRide, driverId);
    if (!leg?.id) { setMessage('Your assigned booking leg could not be confirmed. Refresh ride status or contact support.'); return false; }
    const requestEpoch = sessionEpoch.current;
    try { const { response, data } = await verifyRideCredential(activeRide.id, leg.id, normalizedOtp); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Ride OTP verification failed'); return false; } const refreshed = await refreshActiveRide(); if (requestEpoch !== sessionEpoch.current) return false; if (!refreshed) { setMessage('OTP was accepted, but the latest verification status could not be confirmed. Refresh ride status before starting.'); return false; } return true; }
    catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while verifying ride OTP. Refresh ride status before retrying.'); return false; }
  }, [activeRide, driverId, refreshActiveRide]);
  const start = useCallback(async () => {
    const status = String(activeRide?.status || '').toUpperCase();
    if (!activeRide?.id || rideActionInFlight.current) return false;
    if (status !== 'DRIVER_ARRIVED') { setMessage('Ride can only start after arrival is confirmed. Refresh ride status.'); return false; }
    const leg = currentLeg(activeRide, driverId);
    if (!leg?.id) { setMessage('Active booking leg is unavailable'); return false; }
    if (!leg.verificationOtpVerified || !leg.verificationQrVerified) { setMessage('Both customer OTP and QR verification must be confirmed before starting the ride.'); return false; }
    const requestEpoch = sessionEpoch.current;
    rideActionInFlight.current = true; setLoading(true); setMessage('');
    try {
      const { response, data } = await startRide(activeRide.id, leg.id);
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to start ride. Both OTP and QR verification are required.'); return false; }
      const result = data?.data ?? {};
      const trip = result?.trip ?? null;
      const startedLeg = result?.leg ?? null;
      setActiveRide({ ...activeRide, status: 'IN_PROGRESS', legs: Array.isArray(activeRide.legs) ? activeRide.legs.map((item: any) => String(item?.id) === String(leg.id) ? { ...item, ...(startedLeg || {}), status: 'IN_PROGRESS', tripId: trip?.id ?? item?.tripId ?? null, trip } : item) : activeRide.legs });
      setScreen('trip'); return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while starting ride. Refresh ride status before retrying.'); return false; }
    finally { rideActionInFlight.current = false; setLoading(false); }
  }, [activeRide, driverId]);
  const complete = useCallback(async () => {
    const status = String(activeRide?.status || '').toUpperCase();
    if (!activeRide?.id || rideActionInFlight.current) return false;
    if (!['STARTED','IN_PROGRESS'].includes(status)) { setMessage('Only an in-progress ride can be completed. Refresh ride status.'); return false; }
    const requestEpoch = sessionEpoch.current;
    rideActionInFlight.current = true; setLoading(true); setMessage('');
    try {
      const { response, data } = await completeRide(activeRide.id);
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to complete ride'); return false; }
      setCompletedRideSummary(data?.data ?? null);
      await stopDriverBackgroundLocation(); if (requestEpoch !== sessionEpoch.current) return false; setActiveRide(null); setScreen('completed'); await refreshDriver(driverId); return true;
    } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while completing ride. Refresh ride status before retrying.'); return false; }
    finally { rideActionInFlight.current = false; setLoading(false); }
  }, [activeRide, driverId, refreshDriver]);

  const savePayout = useCallback(async (body: any) => { if (!driverId) return false; const requestEpoch = sessionEpoch.current; try { const { response, data } = await savePayoutProfile(driverId, body); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to save payout details'); return false; } setPayout(data.data); return true; } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while saving payout details.'); return false; } }, [driverId]);
  const withdraw = useCallback(async (amount: number) => { if (!driverId) return false; const requestEpoch = sessionEpoch.current; try { const { response, data } = await requestWithdrawal(driverId, amount); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to create withdrawal request'); return false; } return true; } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while creating withdrawal request.'); return false; } }, [driverId]);
  const createCase = useCallback(async (subject: string, description: string, priority = 'NORMAL') => { if (!driverId) return null; const requestEpoch = sessionEpoch.current; try { const { response, data } = await createSupportCase(driverId, subject, description, priority); if (requestEpoch !== sessionEpoch.current) return null; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to create support case'); return null; } await refreshDriver(driverId); if (requestEpoch !== sessionEpoch.current) return null; return data.data; } catch { if (requestEpoch !== sessionEpoch.current) return null; setMessage('Network error while creating support case.'); return null; } }, [driverId, refreshDriver]);
  const sendMessage = useCallback(async (caseId: string, text: string) => { if (!driverId) return false; const requestEpoch = sessionEpoch.current; try { const { response, data } = await sendSupportMessage(caseId, driverId, text); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to send message'); return false; } await refreshDriver(driverId); return requestEpoch === sessionEpoch.current; } catch { if (requestEpoch !== sessionEpoch.current) return false; setMessage('Network error while sending support message.'); return false; } }, [driverId, refreshDriver]);
  const markRead = useCallback(async (id: string) => {
    if (!driverId || !id) return false;
    const requestEpoch = sessionEpoch.current;
    if (notifications.some((notification: any) => String(notification.id) === id && Boolean(notification.readAt))) return true;
    try { const { response, data } = await markNotificationRead(id, driverId); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) return false; setNotifications(r => r.map(n => String(n.id) === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n)); setUnreadCount(c => Math.max(0, c - 1)); return true; }
    catch { return false; }
  }, [driverId, notifications]);
  const markAllRead = useCallback(async () => {
    if (!driverId) return false;
    const requestEpoch = sessionEpoch.current;
    try { const { response, data } = await markAllNotificationsRead(driverId); if (requestEpoch !== sessionEpoch.current) return false; if (!response.ok || data?.success === false) return false; const now = new Date().toISOString(); setNotifications(r => r.map(n => ({ ...n, readAt: n.readAt || now }))); setUnreadCount(0); return true; }
    catch { return false; }
  }, [driverId]);
  const sos = useCallback(async () => {
    if (!driverId) { setSosOutcome('failure'); setMessage('Please sign in again before sending SOS.'); return false; }
    if (sosInFlight.current) return false;
    const requestEpoch = sessionEpoch.current;
    sosInFlight.current = true; setSosLoading(true); setSosOutcome('idle'); setMessage('');
    const fail = (text: string) => { setMessage(text); setSosOutcome('failure'); return false; };
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (requestEpoch !== sessionEpoch.current) return false;
      const p = permission.status === 'granted' ? permission : await Location.requestForegroundPermissionsAsync();
      if (requestEpoch !== sessionEpoch.current) return false;
      if (p.status !== 'granted') return fail('Location permission is off. Enable location access in device Settings, then retry SOS. If there is immediate danger, contact local emergency services directly.');
      const services = await Location.hasServicesEnabledAsync();
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!services) return fail('Device location services are turned off. Enable GPS/location in device Settings and retry SOS. If there is immediate danger, contact local emergency services directly.');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!Number.isFinite(loc.coords.latitude) || !Number.isFinite(loc.coords.longitude)) return fail('A valid location could not be obtained. Retry SOS when GPS is available.');
      const { response, data } = await triggerSos(driverId, { bookingId: activeRide?.id, latitude: loc.coords.latitude, longitude: loc.coords.longitude, reason: 'Driver emergency' });
      if (requestEpoch !== sessionEpoch.current) return false;
      if (!response.ok || data?.success === false) return fail(String(data?.message || 'SOS was not confirmed by RideX. Check connection and retry; if danger is immediate, contact local emergency services.'));
      setMessage(String(data?.message || data?.data?.message || 'SOS request acknowledged by RideX.')); setSosOutcome('success'); setScreen('sos'); return true;
    } catch (error) {
      if (requestEpoch !== sessionEpoch.current) return false;
      return fail(error instanceof Error && /timeout/i.test(error.message) ? 'Getting your location timed out. Retry when GPS is available. If danger is immediate, contact local emergency services.' : 'Could not confirm the SOS request because of a location or network error. Retry, and contact local emergency services directly if danger is immediate.');
    } finally { sosInFlight.current = false; setSosLoading(false); }
  }, [driverId, activeRide]);

  const logout = useCallback(async () => {
    sessionEpoch.current += 1;
    try { await stopDriverBackgroundLocation(); } catch { /* continue local logout */ }
    try { await setDriverActiveBookingId(null); } catch { /* continue local logout */ }
    // Best-effort offline transition before revoking the session, so a logged-out Driver
    // is not intentionally left online in the backend after GPS tracking stops.
    if (driverId && online) {
      try { await setOnline(driverId, false, gps?.latitude, gps?.longitude); } catch { /* continue local logout even if the network is unavailable */ }
    }
    try { await apiLogout(); } catch { /* backend session revocation is best effort on local cleanup */ }
    if (streamClose.current) streamClose.current();
    streamClose.current = null;
    try { await AsyncStorage.removeItem(DRIVER_SESSION_KEY); } catch { /* clear in-memory session even if storage is unavailable */ }
    try { await removeSecureToken(DRIVER_TOKEN_KEY); } catch { /* server logout and local state cleanup still proceed */ }
    setDriverId('');
    setPendingOtpActorId('');
    setDriver(null);
    setMessage('');
    setAuthMessage('');
    setGps(null);
    setSosOutcome('idle');
    setSosLoading(false);
    sosInFlight.current = false;
    gpsInFlight.current = false;
    setServiceCapabilities(null);
    setOnboarding(null);
    setHistory([]);
    setEarnings([]);
    setEarningTotals({ gross: 0, commission: 0, net: 0 });
    setWallet({});
    setWalletRows([]);
    setPayout(null);
    setNotifications([]);
    setUnreadCount(0);
    setSupportCases([]);
    setActiveRide(null);
    setCompletedRideSummary(null);
    setRequests([]);
    setOnlineState(false);
    setRealtimeConnected(false);
    setScreen('welcome');
  }, [driverId, online, gps]);

  const submitOnboarding = useCallback(async (id = driverId) => {
    if (!id) return { response: { ok: false }, data: { success: false, message: 'Driver session is unavailable. Sign in again.' } };
    const requestEpoch = sessionEpoch.current;
    try {
      const result = await submitOnboardingApi(id);
      if (requestEpoch !== sessionEpoch.current) return { response: { ok: false }, data: { success: false, message: 'Session ended before application submission could be confirmed.' } };
      return result;
    } catch (error) {
      if (requestEpoch !== sessionEpoch.current) return { response: { ok: false }, data: { success: false, message: 'Session ended before application submission could be confirmed.' } };
      throw error;
    }
  }, [driverId]);

  const guardSessionAction = useCallback(async (id: string, action: () => Promise<any>) => {
    if (!id) return { response: { ok: false }, data: { success: false, message: 'Driver session is unavailable. Sign in again.' } };
    const requestEpoch = sessionEpoch.current;
    try {
      const result = await action();
      if (requestEpoch !== sessionEpoch.current) return { response: { ok: false }, data: { success: false, message: 'Session ended before this action could be confirmed.' } };
      return result;
    } catch (error) {
      if (requestEpoch !== sessionEpoch.current) return { response: { ok: false }, data: { success: false, message: 'Session ended before this action could be confirmed.' } };
      throw error;
    }
  }, []);
  const createDocumentSlot = useCallback((id: string, documentType: string) => guardSessionAction(id, () => createDocumentSlotApi(id, documentType)), [guardSessionAction]);
  const uploadDocument = useCallback((id: string, documentId: string, fileName: string, mimeType: string, base64: string) => guardSessionAction(id, () => uploadDocumentApi(id, documentId, fileName, mimeType, base64)), [guardSessionAction]);
  const createVehicle = useCallback((id: string, body: any) => guardSessionAction(id, () => createVehicleApi(id, body)), [guardSessionAction]);
  const updateVehicle = useCallback((id: string, vehicleId: string, body: any) => guardSessionAction(id, () => updateVehicleApi(id, vehicleId, body)), [guardSessionAction]);

  const value = useMemo(() => ({ screen, setScreen, driverId, driverHomeAssetSource, driverDisplayAssetSource, pendingOtpActorId, driver, serviceCapabilities, onboarding, vehicleCatalog, history, earnings, earningTotals, wallet, walletRows, payout, requests, activeRide, otpRequesting, completedRideSummary, notifications, unreadCount, supportCases, message, setMessage, authMessage, setAuthMessage, loading, online, realtimeConnected, gps, refreshDriver, login, verifyLoginOtp, resendLoginOtp, sendRegistrationOtp, completeRegistration, toggleOnline, refreshRequests, runGps, accept, reject, arrive, prepareQr, requestRideOtp, refreshActiveRide, verifyOtpRide, start, complete, logout, savePayout, withdraw, createCase, sendMessage, markRead, markAllRead, sos, sosLoading, sosOutcome, createDocumentSlot, uploadDocument, createVehicle, updateVehicle, submitOnboarding }), [screen, driverId, driverHomeAssetSource, driverDisplayAssetSource, pendingOtpActorId, driver, serviceCapabilities, onboarding, vehicleCatalog, history, earnings, earningTotals, wallet, walletRows, payout, requests, activeRide, otpRequesting, completedRideSummary, notifications, unreadCount, supportCases, message, authMessage, loading, online, realtimeConnected, gps, refreshDriver, login, verifyLoginOtp, resendLoginOtp, sendRegistrationOtp, completeRegistration, toggleOnline, refreshRequests, runGps, accept, reject, arrive, prepareQr, requestRideOtp, refreshActiveRide, verifyOtpRide, start, complete, logout, savePayout, withdraw, createCase, sendMessage, markRead, markAllRead, sos, sosLoading, sosOutcome, submitOnboarding, createDocumentSlot, uploadDocument, createVehicle, updateVehicle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDriverRuntime() { const ctx = useContext(Ctx); if (!ctx) throw new Error('useDriverRuntime must be used inside DriverRuntimeProvider'); return ctx; }
