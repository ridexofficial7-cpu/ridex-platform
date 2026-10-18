#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passes = [];
const check = (condition, message) => (condition ? passes : failures).push(message);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const customerApp = read('apps/customer-mobile/customer/App.tsx');
const apiConfig = read('apps/customer-mobile/shared/api/config.ts');
const apiClient = read('apps/customer-mobile/shared/api/client.ts');
const eventScreen = read('apps/customer-mobile/customer/EventSessionScreen.tsx');
const pushLifecycle = read('apps/customer-mobile/shared/notifications/lifecycle.ts');
const main = read('services/backend/src/main.ts');
const routes = {
  auth: read('services/backend/src/routes/auth.ts'),
  customer: read('services/backend/src/routes/customer.ts'),
  bookings: read('services/backend/src/routes/bookings.ts'),
  bookingOptions: read('services/backend/src/routes/bookingOptions.ts'),
  events: read('services/backend/src/routes/events.ts'),
  realtime: read('services/backend/src/routes/realtime.ts'),
  trips: read('services/backend/src/routes/trips.ts'),
  payments: read('services/backend/src/routes/payments.ts'),
  notifications: read('services/backend/src/routes/notifications.ts'),
  devices: read('services/backend/src/routes/devices.ts'),
  support: read('services/backend/src/routes/support.ts'),
  safety: read('services/backend/src/routes/safety.ts'),
  ratings: read('services/backend/src/routes/ratings.ts'),
  calls: read('services/backend/src/routes/calls.ts'),
  meta: read('services/backend/src/routes/meta.ts'),
  sharedRide: read('services/backend/src/routes/sharedRide.ts'),
  quickLocations: read('services/backend/src/routes/quick-locations.ts'),
};

check(apiConfig.includes("export const RIDEX_API_V1_PREFIX = '/api/v1'"), 'mobile API config uses canonical /api/v1 prefix');
check(apiConfig.includes('LIVE RideX API URLs must use HTTPS'), 'remote LIVE API refuses plain HTTP');
check(apiClient.includes("headers.set('X-Request-ID'"), 'API client attaches a request correlation ID');
check(apiClient.includes("headers.set('Authorization', `Bearer ${token}`)"), 'API client attaches secure session token only for the configured API origin');
check(main.includes('`${API_PREFIX}/customer`') && main.includes('`${API_PREFIX}/bookings`') && main.includes('`${API_PREFIX}/realtime`'), 'backend mounts customer, booking, and realtime API routers under /api/v1');

const requiredRouteEvidence = [
  [routes.meta, 'router.get(\n  "/vehicle-catalog"', 'vehicle catalog'],
  [routes.events, 'eventsRouter.get("/published"', 'published events'],
  [routes.bookingOptions, 'router.get("/"', 'booking options / availability'],
  [routes.events, 'eventBookingRouter.post("/"', 'event booking creation'],
  [routes.realtime, 'realtimeRouter.get(', 'authenticated realtime stream'],
  [routes.trips, 'router.get("/customer/:customerId/active"', 'customer active trip lookup'],
  [routes.customer, 'router.get("/:customerId/profile"', 'customer profile read'],
  [routes.customer, 'router.patch("/:customerId/profile"', 'customer profile update'],
  [routes.customer, 'router.get("/:customerId/subscriptions/plans"', 'subscription plan list'],
  [routes.customer, 'router.post("/:customerId/subscriptions/order"', 'subscription order creation'],
  [routes.customer, 'router.post("/:customerId/subscriptions/verify"', 'subscription verification'],
  [routes.customer, 'router.get("/:customerId/gallery"', 'customer gallery read'],
  [routes.customer, 'router.get("/:customerId/wallet"', 'customer wallet read'],
  [routes.customer, 'router.get("/:customerId/saved-locations"', 'saved locations read'],
  [routes.bookings, 'router.post( "/:bookingId/rebook"', 'booking rebook'],
  [routes.bookings, 'router.post( "/:bookingId/customer-cancel"', 'customer cancellation'],
  [routes.payments, 'router.post("/intent"', 'payment intent creation'],
  [routes.payments, 'router.post("/test-success"', 'TEST-only payment completion route exists for backend enforcement'],
  [routes.notifications, 'router.patch("/:notificationId/read"', 'notification read marker'],
  [routes.notifications, 'router.patch("/read-all"', 'mark all notifications read'],
  [routes.devices, 'router.post(\n  "/register"', 'push device registration'],
  [routes.devices, 'router.post(\n  "/touch"', 'push device touch'],
  [routes.support, 'router.post("/cases/:caseId/messages"', 'support case message'],
  [routes.safety, 'router.get("/emergency-contacts"', 'customer emergency contacts'],
  [routes.ratings, 'router.post("/"', 'customer rating creation'],
  [routes.calls, 'router.post("/start"', 'masked call start'],
  [routes.sharedRide, 'router.get("/"', 'shared ride catalogue'],
  [routes.quickLocations, 'router.get("/"', 'quick location lookup'],
  [routes.auth, 'router.post("/send-otp"', 'OTP delivery request'],
  [routes.auth, 'router.post("/verify-otp"', 'OTP verification'],
];
const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
for (const [source, marker, label] of requiredRouteEvidence) check(normalizeWhitespace(source).includes(normalizeWhitespace(marker)), `backend source declares ${label}`);

check(customerApp.includes('createRideXFetch({ tokenKey: CUSTOMER_AUTH_TOKEN_KEY, apiUrl: API })'), 'Customer Mobile routes API calls through shared authenticated API client');
check(customerApp.includes('startRideXPushLifecycle({ api: API, authToken: token'), 'push registration/touch is owned by the authenticated app lifecycle');
check(!customerApp.includes('registerRideXPushToken('), 'no duplicate ad-hoc push registration calls remain in Customer App');
check(pushLifecycle.includes("'/register' | '/touch' | '/deactivate'"), 'push lifecycle uses the backend device action contract');
check(eventScreen.includes('createRideXFetch({') && eventScreen.includes('RIDEX_EVENT_API.published'), 'Event Session screen uses the shared API client and published-event endpoint');
check(customerApp.includes('RIDEX_EVENT_API.availability') && customerApp.includes('RIDEX_EVENT_API.booking'), 'Customer booking flow uses shared Event API path constants');
check(customerApp.includes('lastEventIdStorageKey: `ridex_realtime_cursor_customer_v1:'), 'realtime stream persists a customer-specific replay cursor');

for (const message of passes) console.log(`PASS ${message}`);
for (const message of failures) console.error(`FAIL ${message}`);
console.log(`\nCustomer Mobile backend contract: ${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
