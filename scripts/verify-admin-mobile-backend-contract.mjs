#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const app = read('apps/admin-mobile/admin/App.tsx');
const apiConfig = read('apps/admin-mobile/shared/api/config.ts');
const apiClient = read('apps/admin-mobile/shared/api/client.ts');
const lifecycle = read('apps/admin-mobile/shared/notifications/lifecycle.ts');
const main = read('services/backend/src/main.ts');
const auth = read('services/backend/src/routes/auth.ts');
const admin = read('services/backend/src/routes/admin.ts');
const events = read('services/backend/src/routes/events.ts');
const devices = read('services/backend/src/routes/devices.ts');
const support = read('services/backend/src/routes/support.ts');

check(apiConfig.includes("'/api/v1'") || apiConfig.includes('"/api/v1"'), 'Admin Mobile uses canonical /api/v1 API prefix');
check(apiConfig.includes('LIVE RideX API URLs must use HTTPS'), 'LIVE remote API rejects plain HTTP');
check(apiClient.includes("headers.set('X-Request-ID'"), 'shared API client adds request correlation ID');
check(apiClient.includes("headers.set('Authorization', `Bearer ${token}`)"), 'shared API client attaches authenticated bearer token');
check(app.includes('createRideXFetch({ tokenKey: ADMIN_AUTH_TOKEN_KEY, apiUrl: API })'), 'Admin Mobile uses shared authenticated API client');
check(main.includes('`${API_PREFIX}/auth`') && main.includes('`${API_PREFIX}/admin`'), 'backend mounts auth and admin routers');
check(main.includes('`${API_PREFIX}/admin`,\n  appAuth,\n  actorIdentity,\n  adminNetwork,\n  adminRouter'), 'admin API requires session authentication, actor identity and admin network boundary');
check(main.includes('`${API_PREFIX}/admin/events`,\n  appAuth,\n  actorIdentity,\n  adminNetwork,\n  eventAdminRouter'), 'event admin API has separate authenticated and network-restricted mount');
check(main.includes('`${API_PREFIX}/devices`,\n  appAuth,\n  actorIdentity,\n  devicesRouter'), 'device API is authenticated and actor-bound');
check(main.includes('`${API_PREFIX}/notifications`,\n  appAuth,\n  actorIdentity,\n  notificationsRouter'), 'notification API is authenticated and actor-bound');

for (const [source, needle, label] of [
  [auth, 'router.post("/password/login"', 'password login endpoint'],
  [auth, 'router.post("/send-otp"', 'OTP send endpoint'],
  [auth, 'router.post("/resend-otp"', 'OTP resend endpoint'],
  [auth, 'router.post("/verify-otp"', 'OTP verification endpoint'],
  [auth, 'router.post("/logout"', 'session logout endpoint'],
  [admin, '"/dashboard"', 'admin dashboard endpoint'],
  [admin, 'router.get("/admin-presence"', 'admin session/presence endpoint'],
  [admin, 'router.get("/matching/configuration"', 'matching configuration read endpoint'],
  [admin, 'router.put("/matching/configuration"', 'matching configuration update endpoint'],
  [admin, 'router.get("/locations"', 'location list endpoint'],
  [admin, 'router.post("/locations"', 'location create endpoint'],
  [admin, 'router.get("/routes"', 'route list endpoint'],
  [admin, 'router.post("/routes"', 'route create endpoint'],
  [admin, "router.get('/support/cases'", 'support cases endpoint'],
  [admin, "router.patch('/support/cases/:caseId'", 'support case update endpoint'],
  [admin, "router.post('/notifications/broadcast'", 'admin broadcast endpoint'],
  [admin, 'router.get("/security/otp-configurations"', 'OTP policy read endpoint'],
  [admin, 'router.post("/security/otp-configurations"', 'OTP policy create endpoint'],
  [admin, 'router.get("/operations/pricing-rules"', 'pricing rules read endpoint'],
  [admin, 'router.post("/operations/pricing-rules"', 'pricing rules create endpoint'],
  [events, 'eventAdminRouter', 'event management router exists'],
  [devices, '"/register"', 'push device registration endpoint'],
  [devices, '"/touch"', 'push device touch endpoint'],
  [devices, '"/deactivate"', 'push device deactivation endpoint'],
  [support, 'router.post("/cases"', 'support case creation endpoint'],
]) check(source.includes(needle), label);

check(app.includes('startRideXPushLifecycle('), 'push registration/touch is managed by authenticated lifecycle');
check(!app.includes('registerRideXPushToken('), 'no duplicate direct push registration after login');
check(lifecycle.includes("'/register' | '/touch' | '/deactivate'"), 'push lifecycle owns register/touch/deactivate actions');
check(!app.includes('testOtp') && !app.includes('TEST OTP') && !app.includes('adminTestOtp'), 'Admin Mobile never exposes OTP values in UI or messages');
check(app.includes('A new-device OTP is required before Admin access can continue.'), 'new-device verification uses neutral OTP prompt');
check(app.includes('realtime/stream?actorType=ADMIN'), 'Admin realtime stream identifies ADMIN actor');
check(app.includes('lastEventIdStorageKey'), 'realtime client persists replay cursor');

console.log(`Admin Mobile backend contract: ${passes.length} passed, ${failures.length} failed`);
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.error(`FAIL ${item}`);
if (failures.length) process.exitCode = 1;
