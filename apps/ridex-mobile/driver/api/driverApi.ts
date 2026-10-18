import { createRideXFetch, getRideXApiUrl } from '../../shared/api/client';

export const DRIVER_TOKEN_KEY = 'ridex_driver_auth_token_v1';
export const DRIVER_SESSION_KEY = 'ridex_driver_session_v1';

export type ApiPayload = Record<string, unknown>;

const ridexFetch = createRideXFetch({ tokenKey: DRIVER_TOKEN_KEY });

async function request<T = any>(path: string, init: RequestInit = {}): Promise<{ response: Response; data: T }> {
  const response = await ridexFetch(path, init);
  const data = await response.json().catch(() => ({} as T));
  return { response, data };
}

export function getDriverApiBase() { return getRideXApiUrl(); }

export async function health() { return request<any>('/health'); }
export async function authMe() { return request<any>('/auth/me'); }
export async function adminMe() { return request<any>('/admin/me'); }

export async function passwordLogin(identifier: string, password: string) {
  return request<any>('/auth/password/login', {
    method: 'POST', body: JSON.stringify({ actorType: 'DRIVER', identifier, password }),
  });
}

export async function verifyOtp(actorId: string, purposeCode: string, otp: string) {
  return request<any>('/auth/verify-otp', {
    method: 'POST', body: JSON.stringify({ actorType: 'DRIVER', actorId, purposeCode, otp }),
  });
}

export async function sendOtp(actorId: string, purposeCode: string) {
  return request<any>('/auth/send-otp', {
    method: 'POST', body: JSON.stringify({ actorType: 'DRIVER', actorId, purposeCode }),
  });
}

export async function resendOtp(actorId: string, purposeCode: string) {
  return request<any>('/auth/resend-otp', {
    method: 'POST', body: JSON.stringify({ actorType: 'DRIVER', actorId, purposeCode }),
  });
}

export async function logout() { return request<any>('/auth/logout', { method: 'POST' }); }

export async function getDriver(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}`); }
export async function getDriverServiceCapabilities(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/service-capabilities`); }
export async function getOnboardingStatus(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/onboarding-status`); }
export async function getVehicleCatalog() { return request<any>('/meta/vehicle-catalog'); }
export async function getDriverHistory(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/history`); }
export async function getDriverEarnings(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/earnings?limit=100`); }
export async function getDriverWallet(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/wallet`); }
export async function getPayoutProfile(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/payout-profile`); }
export async function getRideRequests(driverId: string) { return request<any>(`/driver/${encodeURIComponent(driverId)}/ride-requests`); }
export async function getActiveBooking(driverId: string) { return request<any>(`/trips/driver/${encodeURIComponent(driverId)}/active`); }
export async function getBooking(bookingId: string) { return request<any>(`/driver/bookings/${encodeURIComponent(bookingId)}`); }

export async function registerDriverOtp(mobile: string) {
  return sendOtp(mobile, 'DRIVER.AUTH.REGISTRATION');
}

export async function verifyDriverRegistration(input: { mobile: string; otp: string; fullName: string; address: string }) {
  return request<any>('/auth/driver/register/verify', {
    method: 'POST', body: JSON.stringify({
      actorType: 'DRIVER', actorId: input.mobile, purposeCode: 'DRIVER.AUTH.REGISTRATION',
      mobile: input.mobile, otp: input.otp, fullName: input.fullName, address: input.address,
    }),
  });
}

export async function setOnline(driverId: string, online: boolean, latitude?: number, longitude?: number) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/online`, {
    method: 'POST', body: JSON.stringify({ online, latitude: latitude ?? 0, longitude: longitude ?? 0 }),
  });
}

export async function acceptRide(requestId: string) {
  return request<any>(`/driver/ride-requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST', body: '{}' });
}
export async function rejectRide(requestId: string) {
  return request<any>(`/driver/ride-requests/${encodeURIComponent(requestId)}/reject`, { method: 'POST', body: '{}' });
}
export async function arriveRide(bookingId: string) {
  return request<any>(`/driver/bookings/${encodeURIComponent(bookingId)}/arrived`, { method: 'POST' });
}
export async function startRide(bookingId: string, legId: string) {
  return request<any>(`/trips/booking/${encodeURIComponent(bookingId)}/start`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `ridex-trip-start-${bookingId}` },
    body: JSON.stringify({ bookingId, legId }),
  });
}
export async function completeRide(bookingId: string) {
  return request<any>(`/driver/bookings/${encodeURIComponent(bookingId)}/complete`, { method: 'POST', body: '{}' });
}
export async function prepareRideQr(bookingId: string, legId: string) {
  return request<any>('/trips/verification', { method: 'POST', body: JSON.stringify({ bookingId, legId, method: 'QR' }) });
}
export async function verifyRideCredential(bookingId: string, legId: string, otp: string) {
  return request<any>('/trips/verification/verify', { method: 'POST', body: JSON.stringify({ bookingId, legId, method: 'OTP', credential: otp }) });
}

export async function updateGps(driverId: string, payload: { latitude: number; longitude: number; accuracy?: number | null; heading?: number | null; speed?: number | null; recordedAt: string; isOnline: boolean }) {
  return request<any>('/gps/location', { method: 'POST', body: JSON.stringify({ driverId, ...payload }) });
}

export async function getNotifications(driverId: string) {
  return request<any>(`/notifications?actorType=DRIVER&actorId=${encodeURIComponent(driverId)}&channel=IN_APP`);
}
export async function getUnreadCount(driverId: string) {
  return request<any>(`/notifications/unread-count?actorType=DRIVER&actorId=${encodeURIComponent(driverId)}`);
}
export async function markNotificationRead(notificationId: string, driverId: string) {
  return request<any>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', body: JSON.stringify({ actorType: 'DRIVER', actorId: driverId }) });
}
export async function markAllNotificationsRead(driverId: string) {
  return request<any>('/notifications/read-all', { method: 'PATCH', body: JSON.stringify({ actorType: 'DRIVER', actorId: driverId }) });
}

export async function getSupportCases(driverId: string) {
  return request<any>(`/support/cases?actorType=DRIVER&actorId=${encodeURIComponent(driverId)}`);
}
export async function createSupportCase(driverId: string, subject: string, description: string, priority = 'NORMAL') {
  return request<any>('/support/cases', { method: 'POST', body: JSON.stringify({ actorType: 'DRIVER', actorId: driverId, subject, description, priority }) });
}
export async function sendSupportMessage(caseId: string, driverId: string, message: string) {
  return request<any>(`/support/cases/${encodeURIComponent(caseId)}/messages`, { method: 'POST', body: JSON.stringify({ actorType: 'DRIVER', actorId: driverId, message }) });
}

export async function triggerSos(driverId: string, payload: { bookingId?: string; latitude: number; longitude: number; reason?: string }) {
  return request<any>('/sos', { method: 'POST', body: JSON.stringify({ driverId, ...payload, source: 'DRIVER_APP' }) });
}

export async function createDocumentSlot(driverId: string, documentType: string) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/documents`, { method: 'POST', body: JSON.stringify({ documentType }) });
}
export async function uploadDocument(driverId: string, documentId: string, fileName: string, mimeType: string, base64: string) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}/upload`, { method: 'POST', body: JSON.stringify({ fileName, mimeType, base64 }) });
}
export async function createVehicle(driverId: string, body: ApiPayload) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/vehicles`, { method: 'POST', body: JSON.stringify(body) });
}
export async function updateVehicle(driverId: string, vehicleId: string, body: ApiPayload) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/vehicles/${encodeURIComponent(vehicleId)}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function savePayoutProfile(driverId: string, body: ApiPayload) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/payout-profile`, { method: 'PUT', body: JSON.stringify(body) });
}
export async function requestWithdrawal(driverId: string, amount: number) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/withdrawals/request`, { method: 'POST', body: JSON.stringify({ amount }) });
}
export async function submitOnboarding(driverId: string) {
  return request<any>(`/driver/${encodeURIComponent(driverId)}/onboarding/submit`, { method: 'POST', body: '{}' });
}
