#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
}
const providerEnv = read('services/broadcaster-provider/.env.example');
const providerRoutes = read('services/broadcaster-provider/src/routes/provider.routes.ts');
const callbackService = read('services/broadcaster-provider/src/services/backend-result-outbox.service.ts');
const backendRoute = read('services/backend/src/routes/provider.ts');
const authMiddleware = read('services/broadcaster-provider/src/middleware/ridex-backend-auth.middleware.ts');
const storage = read('services/broadcaster-provider/src/services/provider-storage.service.ts');

check('Provider callback example uses canonical plural backend route',
  providerEnv.includes('/api/v1/provider/delivery-results') &&
  !providerEnv.includes('/api/v1/provider/delivery-result='));
check('Backend callback route is registered for delivery-results',
  backendRoute.includes('router.post("/delivery-results"'));
check('Provider callback URL validator enforces exact backend callback path',
  callbackService.includes("const BACKEND_RESULT_PATH = '/api/v1/provider/delivery-results'") &&
  callbackService.includes('pathname !== BACKEND_RESULT_PATH'));
check('Production callback requires HTTPS and rejects loopback',
  callbackService.includes("url.protocol !== 'https:'") &&
  callbackService.includes('RIDEX_BACKEND_RESULT_URL_LOOPBACK_FORBIDDEN'));
check('Provider delivery endpoints require backend bearer authentication',
  providerRoutes.includes("router.post('/v1/delivery/sms', backendAuth") &&
  providerRoutes.includes("router.post('/v1/delivery/call', backendAuth") &&
  authMiddleware.includes('crypto.timingSafeEqual'));
check('Delivery-result callback is authenticated and signed with timestamp',
  backendRoute.includes('x-ridex-timestamp') &&
  backendRoute.includes('x-ridex-signature') &&
  backendRoute.includes('signatureForBody(expected, signedTimestamp, body)'));
check('Callback enforces matching environment and schema version',
  backendRoute.includes('x-ridex-environment') &&
  backendRoute.includes('getEnvironment()') &&
  backendRoute.includes('x-ridex-schema-version'));
check('Callback idempotency binds body and headers to same result ID',
  backendRoute.includes('headerResultId !== resultId') &&
  backendRoute.includes('idem !== resultId'));
check('Provider callback outbox signs requests and includes idempotency key',
  callbackService.includes("createHmac('sha256', backendApiKey)") &&
  callbackService.includes("'Idempotency-Key': parsed.resultId"));
check('Provider result retry outbox retains bounded retry/dead-letter behavior',
  callbackService.includes('current.attempts >= retryLimit') &&
  callbackService.includes('backoff(current.attempts)'));
check('Provider storage refuses environment mismatch and production JSON storage',
  storage.includes('PROVIDER_DATA_ENVIRONMENT_MISMATCH') &&
  storage.includes('PROVIDER_PRODUCTION_STORAGE_DRIVER_UNSAFE'));
check('Delivery response reports configured provider identity, not a fixed TEST identity',
  providerRoutes.includes('provider: providerIdentity()') &&
  providerRoutes.includes('function providerIdentity()') &&
  !providerRoutes.includes("provider: 'RIDEX_TEST_BROADCASTER_PROVIDER'"));

let failed = 0;
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.pass) failed += 1;
}
console.log(`\nProvider/backend integration contract: ${checks.length - failed}/${checks.length} passed; ${failed} failed.`);
process.exit(failed ? 1 : 0);
