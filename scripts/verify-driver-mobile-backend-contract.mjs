#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const api = read('apps/driver-mobile/driver/api/driverApi.ts');
const runtime = read('apps/driver-mobile/driver/state/DriverRuntime.tsx');
const apiConfig = read('apps/driver-mobile/shared/api/config.ts');
const apiClient = read('apps/driver-mobile/shared/api/client.ts');
const lifecycle = read('apps/driver-mobile/shared/notifications/lifecycle.ts');
const backgroundGps = read('apps/driver-mobile/driver/backgroundLocation.ts');
const main = read('services/backend/src/main.ts');
const auth = read('services/backend/src/routes/auth.ts');
const driver = read('services/backend/src/routes/driver.ts');
const trips = read('services/backend/src/routes/trips.ts');
const gps = read('services/backend/src/routes/gps.ts');
const meta = read('services/backend/src/routes/meta.ts');
const notifications = read('services/backend/src/routes/notifications.ts');
const devices = read('services/backend/src/routes/devices.ts');
const support = read('services/backend/src/routes/support.ts');
const safety = read('services/backend/src/routes/safety.ts');

check(apiConfig.includes("/api/v1"), 'Driver API uses canonical /api/v1 prefix');
check(apiConfig.includes('LIVE RideX API URLs must use HTTPS'), 'remote LIVE API refuses plain HTTP');
check(apiClient.includes("headers.set('X-Request-ID'"), 'shared API client attaches request correlation ID');
check(apiClient.includes("headers.set('Authorization', `Bearer ${token}`)"), 'shared API client applies session token to configured API origin');
check(api.includes("createRideXFetch({ tokenKey: DRIVER_TOKEN_KEY })"), 'Driver API uses shared authenticated fetch client');
check(main.includes('`${API_PREFIX}/auth`') && main.includes('`${API_PREFIX}/driver`') && main.includes('`${API_PREFIX}/trips`') && main.includes('`${API_PREFIX}/gps`'), 'backend mounts auth, driver, trips and GPS routers');
check(main.includes('`${API_PREFIX}/notifications`') && main.includes('`${API_PREFIX}/devices`') && main.includes('`${API_PREFIX}/support`') && main.includes('`${API_PREFIX}/sos`'), 'backend mounts notifications, device, support and SOS routers');
for (const [needle, label] of [
  ['`${API_PREFIX}/driver`,\n  appAuth,\n  actorIdentity,\n  driverRouter', 'driver router is protected by authentication and actor identity'],
  ['`${API_PREFIX}/trips`,\n  appAuth,\n  actorIdentity,\n  tripsRouter', 'trip router is protected by authentication and actor identity'],
  ['`${API_PREFIX}/gps`,\n  appAuth,\n  actorIdentity,\n  gpsRouter', 'GPS router is protected by authentication and actor identity'],
  ['`${API_PREFIX}/devices`,\n  appAuth,\n  actorIdentity,\n  devicesRouter', 'device registration router is protected by authentication and actor identity'],
]) check(main.includes(needle), label);

const endpointEvidence = [
  [auth, 'router.post("/password/login"', 'driver password login endpoint'],
  [auth, 'router.post("/send-otp"', 'OTP send endpoint'],
  [auth, 'router.post("/verify-otp"', 'OTP verification endpoint'],
  [auth, 'router.post("/driver/register/verify"', 'driver registration verification endpoint'],
  [driver, 'router.get("/:driverId"', 'driver profile endpoint'],
  [driver, 'router.get("/:driverId/service-capabilities"', 'driver service capability endpoint'],
  [driver, 'router.get("/:driverId/onboarding-status"', 'driver onboarding status endpoint'],
  [meta, '"/vehicle-catalog"', 'vehicle catalogue endpoint'],
  [driver, 'router.get("/:driverId/history"', 'driver trip history endpoint'],
  [driver, 'router.get("/:driverId/earnings"', 'driver earnings endpoint'],
  [driver, 'router.get("/:driverId/wallet"', 'driver wallet endpoint'],
  [driver, 'router.get("/:driverId/payout-profile"', 'driver payout profile endpoint'],
  [driver, 'router.get("/:driverId/ride-requests"', 'driver ride request endpoint'],
  [trips, 'router.get("/driver/:driverId/active"', 'driver active-trip endpoint'],
  [driver, 'router.get("/bookings/:bookingId"', 'driver booking detail endpoint'],
  [driver, 'router.post("/:driverId/online"', 'driver online/offline endpoint'],
  [driver, 'router.post("/ride-requests/:requestId/accept"', 'ride accept endpoint'],
  [driver, 'router.post("/ride-requests/:requestId/reject"', 'ride reject endpoint'],
  [driver, 'router.post("/bookings/:bookingId/arrived"', 'driver arrival endpoint'],
  [trips, 'router.post("/booking/:bookingId/start"', 'trip start endpoint'],
  [driver, 'router.post("/bookings/:bookingId/complete"', 'trip completion endpoint'],
  [trips, 'router.post("/verification"', 'trip QR preparation endpoint'],
  [trips, 'router.post("/verification/verify"', 'trip OTP/QR verification endpoint'],
  [gps, '"/location"', 'driver GPS location endpoint'],
  [notifications, 'router.get("/"', 'driver in-app notifications endpoint'],
  [devices, '"/register"', 'push-device registration endpoint'],
  [support, 'router.post("/cases"', 'support case creation endpoint'],
  [support, 'router.post("/cases/:caseId/messages"', 'support message endpoint'],
  [safety, 'router.post("/"', 'SOS endpoint'],
  [driver, 'router.post("/:driverId/documents"', 'KYC document slot endpoint'],
  [driver, 'router.post("/:driverId/documents/:documentId/upload"', 'KYC upload endpoint'],
  [driver, 'router.post("/:driverId/vehicles"', 'driver vehicle creation endpoint'],
  [driver, 'router.patch("/:driverId/vehicles/:vehicleId"', 'driver vehicle update endpoint'],
  [driver, 'router.put("/:driverId/payout-profile"', 'payout profile save endpoint'],
  [driver, 'router.post("/:driverId/withdrawals/request"', 'withdrawal request endpoint'],
  [driver, 'router.post("/:driverId/onboarding/submit"', 'onboarding submit endpoint'],
];
for (const [source, needle, label] of endpointEvidence) check(source.includes(needle), label);

check(runtime.includes('startRideXPushLifecycle('), 'push registration/touch lifecycle is wired to authenticated app lifecycle');
check(!runtime.includes('registerRideXPushToken('), 'no duplicate direct push registration from authentication completion');
check(lifecycle.includes("'/register' | '/touch' | '/deactivate'"), 'push lifecycle owns register/touch/deactivate device actions');
check(!runtime.includes('testOtp') && !runtime.includes('TEST OTP'), 'Driver Mobile never exposes OTP values in app UI');
check(runtime.includes("'New-device OTP required'"), 'new-device login UI uses neutral OTP prompt');
check(backgroundGps.includes('DRIVER_ACTIVE_BOOKING_KEY') && backgroundGps.includes('if (!token || !driverId || !bookingId) return'), 'background location requires authenticated session and active booking');
check(backgroundGps.includes('Authorization: `Bearer ${token}`'), 'background location sends authenticated requests');
check(api.includes("'Idempotency-Key': `ridex-trip-start-${bookingId}`"), 'trip start request includes idempotency key');
check(api.includes('Number(latitude) >= -90') && api.includes('Number(longitude) <= 180'), 'online toggle validates coordinate ranges');

console.log(`Driver Mobile backend contract: ${passes.length} passed, ${failures.length} failed`);
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.error(`FAIL ${item}`);
if (failures.length) process.exitCode = 1;
