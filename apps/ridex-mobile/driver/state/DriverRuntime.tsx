import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { openRideXEventStream, type RideXStreamEvent } from '../../shared/realtime/client';
import { chooseDriverDisplayAsset, chooseDriverHomeAsset, makeRideXRemoteImageSource, type RideXRemoteAssetImageSource } from '../../shared/assets/remote';
import { getCachedRideXAssetManifest, syncRideXAssetCache } from '../../shared/assets/cache';
import { setDriverActiveBookingId, startDriverBackgroundLocation, stopDriverBackgroundLocation } from '../backgroundLocation';
import { registerRideXPushToken } from '../../pushNotifications';
import { startRideXPushLifecycle } from '../../shared/notifications/lifecycle';
import { getDriverApiBase, DRIVER_TOKEN_KEY, DRIVER_SESSION_KEY, passwordLogin, verifyOtp, resendOtp, logout as apiLogout, getDriver, getDriverServiceCapabilities, getOnboardingStatus, getVehicleCatalog, getDriverHistory, getDriverEarnings, getDriverWallet, getPayoutProfile, getRideRequests, getActiveBooking, getBooking, sendOtp, registerDriverOtp, verifyDriverRegistration, setOnline, acceptRide, rejectRide, arriveRide, startRide, completeRide, prepareRideQr, verifyRideCredential, updateGps, getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, getSupportCases, createSupportCase, sendSupportMessage, triggerSos, createDocumentSlot, uploadDocument, createVehicle, updateVehicle, savePayoutProfile, requestWithdrawal, submitOnboarding } from '../api/driverApi';

import { getSecureToken, setSecureToken, removeSecureToken } from "../../shared/security/secureTokenStorage";
const Ctx = createContext<any>(null);

function rowsFrom(data: any): any[] {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.rows)) return data.data.rows;
  if (Array.isArray(data?.data?.transactions)) return data.data.transactions;
  return [];
}

function currentLeg(booking: any, driverId: string) {
  const legs = Array.isArray(booking?.legs) ? booking.legs : [];
  return legs.find((l: any) => String(l?.driverId || '') === driverId && !['COMPLETED','CANCELLED'].includes(String(l?.status || '').toUpperCase())) || legs.find((l: any) => !['COMPLETED','CANCELLED'].includes(String(l?.status || '').toUpperCase())) || null;
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportCases, setSupportCases] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [pendingOtpActorId, setPendingOtpActorId] = useState('');
  const [loading, setLoading] = useState(false);
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

  const refreshDriver = useCallback(async (id = driverId) => {
    if (!id) return;
    const [d, capabilities, o, p, e, w, h, n, c, active] = await Promise.all([
      getDriver(id), getDriverServiceCapabilities(id), getOnboardingStatus(id), getPayoutProfile(id), getDriverEarnings(id), getDriverWallet(id), getDriverHistory(id), getNotifications(id), getUnreadCount(id), getActiveBooking(id),
    ]);
    if (capabilities.response.ok && capabilities.data?.success) setServiceCapabilities(capabilities.data.data ?? null);
    if (d.response.ok && d.data?.success) setDriver(d.data.data ?? null);
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
    if (c.response.ok && c.data?.success) setUnreadCount(Number(c.data.data?.unreadCount ?? 0));
    if (active.response.ok && active.data?.success) {
      const activeData = active.data.data;
      const bookingId = String(
        activeData?.bookingId || activeData?.leg?.bookingId || '',
      ).trim();

      if (bookingId) {
        const bookingResponse = await getBooking(bookingId);
        if (bookingResponse.response.ok && bookingResponse.data?.success && bookingResponse.data?.data?.id) {
          const booking = bookingResponse.data.data;
          setActiveRide(booking);
          const s = String(booking.status || '').toUpperCase();
          setScreen(s === 'DRIVER_ARRIVED' ? 'arrived' : ['STARTED','IN_PROGRESS'].includes(s) ? 'trip' : 'accepted');
        }
      } else if (!activeData) {
        setActiveRide((current: any) => {
          const status = String(current?.status || '').toUpperCase();
          return ['STARTED','IN_PROGRESS'].includes(status) ? null : current;
        });
      }
    }
  }, [driverId]);

  const completeAuth = useCallback(async (data: any) => {
    const id = String(data?.driverId || '').trim();
    const token = String(data?.token || '').trim();
    if (!id || !token) { setAuthMessage('Authentication response did not include a Driver session'); return false; }
    await setSecureToken(DRIVER_TOKEN_KEY, token);
    await AsyncStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify({ driverId: id }));
    void registerRideXPushToken({ api: getDriverApiBase(), authToken: token, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? '') , deviceName: `RideX Driver ${id}` });
    setDriverId(id);
    await refreshDriver(id);
    const next = String(data?.nextStep || '').toUpperCase();
    setScreen(next === 'HOME' || String(data?.driverVerificationStatus || '').toUpperCase() === 'APPROVED' ? 'home' : 'onboardingStatus');
    return true;
  }, [refreshDriver]);

  const restore = useCallback(async () => {
    try {
      const rawSession = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
      const token = await getSecureToken(DRIVER_TOKEN_KEY);
      const id = String(JSON.parse(rawSession || '{}')?.driverId || '');
      if (!id || !token) return;
      const current = await getDriver(id);
      if (!current.response.ok || !current.data?.success) {
        await removeSecureToken(DRIVER_TOKEN_KEY);
        await AsyncStorage.removeItem(DRIVER_SESSION_KEY);
        return;
      }
      setDriverId(id);
      await refreshDriver(id);
      setScreen(String(current.data?.data?.verificationStatus || current.data?.data?.driverVerificationStatus || '').toUpperCase() === 'APPROVED' ? 'home' : 'onboardingStatus');
    } catch {
      await removeSecureToken(DRIVER_TOKEN_KEY);
        await AsyncStorage.removeItem(DRIVER_SESSION_KEY);
    }
  }, [refreshDriver]);

  useEffect(() => { void restore(); }, [restore]);
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
    setLoading(true); setAuthMessage('');
    try {
      const { response, data } = await passwordLogin(identifier.trim(), password);
      if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to sign in'); return false; }
      if (data?.data?.requiresOtp) { setPendingOtpActorId(String(data?.data?.actorId || '')); setAuthMessage(data?.data?.testOtp ? `TEST OTP: ${data.data.testOtp}` : 'New-device OTP required'); setScreen('otp'); return true; }
      return completeAuth(data.data);
    } catch { setAuthMessage('Unable to reach RideX service'); return false; } finally { setLoading(false); }
  }, [completeAuth]);

  const verifyLoginOtp = useCallback(async (actorId: string, otp: string) => {
    setLoading(true); setAuthMessage('');
    try { const { response, data } = await verifyOtp(actorId, 'DRIVER.AUTH.NEW_DEVICE', otp); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'OTP verification failed'); return false; } return completeAuth(data.data); }
    catch { setAuthMessage('Unable to verify OTP'); return false; } finally { setLoading(false); }
  }, [completeAuth]);

  const resendLoginOtp = useCallback(async (actorId: string) => { const { response, data } = await resendOtp(actorId, 'DRIVER.AUTH.NEW_DEVICE'); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to resend OTP'); return false; } setAuthMessage(data?.testOtp ? `TEST OTP: ${data.testOtp}` : 'OTP resent successfully'); return true; }, []);
  const sendRegistrationOtp = useCallback(async (mobile: string) => { const { response, data } = await registerDriverOtp(mobile); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to send registration OTP'); return false; } setAuthMessage(data?.testOtp ? `TEST OTP: ${data.testOtp}` : 'Registration OTP sent'); return true; }, []);
  const completeRegistration = useCallback(async (mobile: string, otp: string, fullName: string, address: string) => { const { response, data } = await verifyDriverRegistration({ mobile, otp, fullName, address }); if (!response.ok || data?.success === false) { setAuthMessage(data?.message || 'Unable to complete registration'); return false; } return completeAuth(data.data); }, [completeAuth]);

  const toggleOnline = useCallback(async () => {
    if (!driverId) return false;
    setLoading(true);
    try {
      let lat = gps?.latitude, lng = gps?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== 'granted') { setMessage('Location permission is required before going online'); return false; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude; lng = loc.coords.longitude; setGps({ latitude: lat, longitude: lng, accuracy: loc.coords.accuracy ?? null });
      }
      const { response, data } = await setOnline(driverId, !online, lat, lng);
      if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to change online status'); return false; }
      setOnlineState(!online); setMessage(!online ? 'You are ONLINE' : 'You are OFFLINE'); return true;
    } finally { setLoading(false); }
  }, [driverId, gps, online]);

  const refreshRequests = useCallback(async () => { if (!driverId || !online || activeRide) return; const { response, data } = await getRideRequests(driverId); if (response.ok && data?.success) setRequests(Array.isArray(data.data) ? data.data : []); }, [driverId, online, activeRide]);
  useEffect(() => { if (!online || activeRide || !driverId) return; void refreshRequests(); const timer = setInterval(() => void refreshRequests(), 15000); return () => clearInterval(timer); }, [online, activeRide, driverId, refreshRequests]);

  const runGps = useCallback(async () => { if (!driverId || !online) return false; const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== 'granted') return false; const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); const payload = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? null, heading: loc.coords.heading ?? null, speed: loc.coords.speed ?? null, recordedAt: new Date(loc.timestamp || Date.now()).toISOString(), isOnline: online }; setGps(payload); const { response, data } = await updateGps(driverId, payload); return response.ok && data?.success !== false; }, [driverId, online]);
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

  const accept = useCallback(async (request: any) => { const { response, data } = await acceptRide(String(request.id)); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to accept ride'); return false; } const b = await getBooking(String(request.bookingId)); setActiveRide(b.data?.success ? b.data.data : request.booking); setRequests([]); setScreen('accepted'); await runGps(); return true; }, [runGps]);
  const reject = useCallback(async (requestId: string) => { const { response, data } = await rejectRide(requestId); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to reject ride'); return false; } setRequests(r => r.filter(x => String(x.id) !== requestId)); return true; }, []);
  const arrive = useCallback(async () => { if (!activeRide?.id) return false; const { response, data } = await arriveRide(activeRide.id); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to mark arrival'); return false; } const b = await getBooking(activeRide.id); setActiveRide(b.data?.success ? b.data.data : { ...activeRide, status: 'DRIVER_ARRIVED' }); setScreen('arrived'); return true; }, [activeRide]);
  const prepareQr = useCallback(async () => { if (!activeRide?.id) return null; const leg = currentLeg(activeRide, driverId); if (!leg?.id) return null; const { response, data } = await prepareRideQr(activeRide.id, leg.id); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to prepare QR'); return null; } return data.data; }, [activeRide, driverId]);
  const refreshActiveRide = useCallback(async () => {
    if (!activeRide?.id) return false;
    const { response, data } = await getBooking(activeRide.id);
    if (!response.ok || data?.success === false || !data?.data) return false;
    setActiveRide(data.data);
    return true;
  }, [activeRide]);
  const verifyOtpRide = useCallback(async (otp: string) => { if (!activeRide?.id) return false; const leg = currentLeg(activeRide, driverId); if (!leg?.id) return false; const { response, data } = await verifyRideCredential(activeRide.id, leg.id, otp); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Ride OTP verification failed'); return false; } await refreshDriver(driverId); return true; }, [activeRide, driverId, refreshDriver]);
  const start = useCallback(async () => {
    if (!activeRide?.id) return false;
    const leg = currentLeg(activeRide, driverId);
    if (!leg?.id) { setMessage('Active booking leg is unavailable'); return false; }
    const { response, data } = await startRide(activeRide.id, leg.id);
    if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to start ride. Both OTP and QR verification are required.'); return false; }
    const result = data?.data ?? {};
    const trip = result?.trip ?? null;
    const startedLeg = result?.leg ?? null;
    setActiveRide({
      ...activeRide,
      status: 'IN_PROGRESS',
      legs: Array.isArray(activeRide.legs)
        ? activeRide.legs.map((item: any) => String(item?.id) === String(leg.id)
          ? { ...item, ...(startedLeg || {}), status: 'IN_PROGRESS', tripId: trip?.id ?? item?.tripId ?? null, trip }
          : item)
        : activeRide.legs,
    });
    setScreen('trip');
    return true;
  }, [activeRide, driverId]);
  const complete = useCallback(async () => { if (!activeRide?.id) return false; await stopDriverBackgroundLocation(); const { response, data } = await completeRide(activeRide.id); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to complete ride'); return false; } setActiveRide(null); setScreen('completed'); await refreshDriver(driverId); return true; }, [activeRide, driverId, refreshDriver]);

  const savePayout = useCallback(async (body: any) => { if (!driverId) return false; const { response, data } = await savePayoutProfile(driverId, body); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to save payout details'); return false; } setPayout(data.data); return true; }, [driverId]);
  const withdraw = useCallback(async (amount: number) => { if (!driverId) return false; const { response, data } = await requestWithdrawal(driverId, amount); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to create withdrawal request'); return false; } await refreshDriver(driverId); return true; }, [driverId, refreshDriver]);
  const createCase = useCallback(async (subject: string, description: string, priority = 'NORMAL') => { if (!driverId) return null; const { response, data } = await createSupportCase(driverId, subject, description, priority); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to create support case'); return null; } await refreshDriver(driverId); return data.data; }, [driverId, refreshDriver]);
  const sendMessage = useCallback(async (caseId: string, text: string) => { if (!driverId) return false; const { response, data } = await sendSupportMessage(caseId, driverId, text); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to send message'); return false; } await refreshDriver(driverId); return true; }, [driverId, refreshDriver]);
  const markRead = useCallback(async (id: string) => { if (!driverId) return; const { response } = await markNotificationRead(id, driverId); if (response.ok) { setNotifications(r => r.map(n => String(n.id) === id ? { ...n, readAt: new Date().toISOString() } : n)); setUnreadCount(c => Math.max(0, c - 1)); } }, [driverId]);
  const markAllRead = useCallback(async () => { if (!driverId) return; const { response } = await markAllNotificationsRead(driverId); if (response.ok) { const now = new Date().toISOString(); setNotifications(r => r.map(n => ({ ...n, readAt: n.readAt || now }))); setUnreadCount(0); } }, [driverId]);
  const sos = useCallback(async () => { if (!driverId) return false; const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== 'granted') { setMessage('Location permission is required for SOS'); return false; } const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); const { response, data } = await triggerSos(driverId, { bookingId: activeRide?.id, latitude: loc.coords.latitude, longitude: loc.coords.longitude, reason: 'Driver emergency' }); if (!response.ok || data?.success === false) { setMessage(data?.message || 'Unable to send SOS'); return false; } setScreen('sos'); return true; }, [driverId, activeRide]);

  const logout = useCallback(async () => {
    await stopDriverBackgroundLocation();
    await setDriverActiveBookingId(null);
    try { await apiLogout(); } catch { /* backend session revocation is best effort on local cleanup */ }
    if (streamClose.current) streamClose.current();
    streamClose.current = null;
    await removeSecureToken(DRIVER_TOKEN_KEY);
        await AsyncStorage.removeItem(DRIVER_SESSION_KEY);
    setDriverId('');
    setDriver(null);
    setServiceCapabilities(null);
    setActiveRide(null);
    setRequests([]);
    setOnlineState(false);
    setRealtimeConnected(false);
    setScreen('welcome');
  }, []);

  const value = useMemo(() => ({ screen, setScreen, driverId, driverHomeAssetSource, driverDisplayAssetSource, pendingOtpActorId, driver, serviceCapabilities, onboarding, vehicleCatalog, history, earnings, earningTotals, wallet, walletRows, payout, requests, activeRide, notifications, unreadCount, supportCases, message, setMessage, authMessage, setAuthMessage, loading, online, realtimeConnected, gps, refreshDriver, login, verifyLoginOtp, resendLoginOtp, sendRegistrationOtp, completeRegistration, toggleOnline, refreshRequests, runGps, accept, reject, arrive, prepareQr, refreshActiveRide, verifyOtpRide, start, complete, logout, savePayout, withdraw, createCase, sendMessage, markRead, markAllRead, sos, createDocumentSlot, uploadDocument, createVehicle, updateVehicle, submitOnboarding }), [screen, driverId, driverHomeAssetSource, driverDisplayAssetSource, pendingOtpActorId, driver, serviceCapabilities, onboarding, vehicleCatalog, history, earnings, earningTotals, wallet, walletRows, payout, requests, activeRide, notifications, unreadCount, supportCases, message, authMessage, loading, online, realtimeConnected, gps, refreshDriver, login, verifyLoginOtp, resendLoginOtp, sendRegistrationOtp, completeRegistration, toggleOnline, refreshRequests, runGps, accept, reject, arrive, prepareQr, refreshActiveRide, verifyOtpRide, start, complete, logout, savePayout, withdraw, createCase, sendMessage, markRead, markAllRead, sos]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDriverRuntime() { const ctx = useContext(Ctx); if (!ctx) throw new Error('useDriverRuntime must be used inside DriverRuntimeProvider'); return ctx; }
