#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [], passes = [];
const pass = m => passes.push(`PASS ${m}`);
const fail = m => errors.push(m);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let cfg;
try { cfg = JSON.parse(read('config/observability-audit-contract.json')); pass('observability/audit contract JSON parses'); }
catch (e) { console.error(`FAIL observability contract JSON: ${e.message}`); process.exit(1); }
const obs = read('services/backend/src/services/observability.ts');
const main = read('services/backend/src/main.ts');
const schema = read('services/backend/prisma/schema.prisma');
const providerAudit = read('services/broadcaster-provider/src/services/security-audit.service.ts');
const providerStorage = read('services/broadcaster-provider/src/services/provider-storage.service.ts');
const auditModel = schema.match(/model\s+AuditLog\s*\{([\s\S]*?)\n\}/)?.[1] || '';
if (!auditModel) fail('Backend AuditLog schema missing');
for (const field of ['actorType','actorId','sessionId','requestId','purposeCode','success','action','module','entityType','entityId','beforeData','afterData','securityData','ipAddress','userAgent','createdAt']) {
  if (!new RegExp(`^\\s*${field}\\s+`, 'm').test(auditModel)) fail(`AuditLog missing ${field}`);
}
if (auditModel && !errors.some(e => e.startsWith('AuditLog missing'))) pass('Backend AuditLog schema has correlation, actor, action and data fields');
for (const token of ['RIDEX_OBSERVABILITY_ALERT_WINDOW_MS','RIDEX_OBSERVABILITY_5XX_ALERT_COUNT','RIDEX_SLOW_REQUEST_MS','RIDEX_5XX_ALERT','RIDEX_SLOW_REQUEST','safeRouteLabel']) {
  if (!obs.includes(token)) fail(`observability source missing ${token}`); else pass(`observability source contains ${token}`);
}
if (obs.includes('req.originalUrl')) fail('observability source must not log raw originalUrl');
if (!obs.includes("typeof req.route?.path === 'string' ? req.route.path : '/[unmatched]'")) fail('safe route-template fallback missing'); else pass('slow-request telemetry uses a bounded route template');
if (!main.includes('req.headers') || !main.includes('"x-request-id"') || !main.includes('randomUUID()') || !main.includes('res.setHeader')) fail('request correlation middleware incomplete'); else pass('request correlation middleware has header, UUID fallback and response header');
if (main.includes('req.originalUrl ||')) fail('404 handler must not fall back to originalUrl'); else pass('404 path reflection does not use originalUrl fallback');
for (const rel of ['services/backend/src/routes/notifications.ts','services/backend/src/routes/configuration.ts','services/backend/src/routes/admin.ts','services/backend/src/routes/events.ts','services/backend/src/routes/support.ts','services/backend/src/routes/trips.ts','services/backend/src/routes/safety.ts','services/backend/src/routes/health.ts']) { const source=read(rel); if (/\b(?:route|path):\s*req\.originalUrl/.test(source)) fail(`${rel} logging metadata must not include raw originalUrl/query strings`); else pass(`${rel} logging metadata avoids raw originalUrl/query strings`); }
for (const rel of ['services/backend/src/routes/ratings.ts','services/backend/src/routes/payments.ts']) { const source=read(rel); const start=source.indexOf('function securityLog('); const end=source.indexOf('\nfunction ',start+10); const logger=source.slice(start,end<0?undefined:end); if (/\bpath:\s*req\.originalUrl/.test(logger)) fail(`${rel} security logging must not include raw originalUrl/query strings`); else pass(`${rel} security logging avoids raw originalUrl/query strings while preserving idempotency request hashing`); }
for (const field of ['eventType','gatewayId','deviceId','requestId','success','metadata','createdAt']) if (!providerStorage.includes(field)) fail(`Provider security audit record missing ${field}`);
if (!providerAudit.includes('data.securityAudit.length >= 5000') || !providerAudit.includes('PROVIDER_SECURITY_AUDIT_CAPACITY_REACHED') || !providerStorage.includes('securityAudit: []')) fail('Provider audit must fail closed at capacity rather than evict historic security records'); else pass('Provider security audit fails closed at capacity and preserves historic records');
const gatewayRoutes = read('services/broadcaster-provider/src/routes/gateway.routes.ts');
const providerErrorRoutes = ['services/broadcaster-provider/src/routes/provider.routes.ts','services/broadcaster-provider/src/routes/provider-admin.routes.ts','services/broadcaster-provider/src/middleware/gateway-auth.middleware.ts'].map(read).join('\n');
if (gatewayRoutes.includes('safeProviderErrorCode') && providerErrorRoutes.includes('safeProviderErrorCode') && read('services/broadcaster-provider/src/services/safe-provider-error.ts').includes('CONNECTION_STRING') && gatewayRoutes.includes("safeDeliveryResultFailure(error, 'SMS')") && gatewayRoutes.includes("safeDeliveryResultFailure(error, 'CALL')")) pass('Provider Gateway/Provider/Admin/Auth route errors use shared safe error-code disclosure'); else fail('Provider route error disclosure must redact raw exception text');
if (cfg.providerRouteErrorDisclosure?.status !== 'STATIC_IMPLEMENTED_RUNTIME_REDACTION_TEST_PENDING') fail('Provider route error redaction must remain static-only until runtime test');
for (const key of ['requestCorrelation','telemetry','auditData','providerAudit','alertAndMonitoringRequirements','openItems']) if (!(key in cfg)) fail(`contract missing ${key}`);
if (cfg.routeLoggingPrivacy?.status !== 'STATIC_IMPLEMENTED_RUNTIME_LOG_REDACTION_TEST_PENDING' || !cfg.routeLoggingPrivacy?.rule?.includes('never raw req.originalUrl/query strings')) fail('route query-string logging privacy contract missing'); else pass('route logging privacy rule is explicit and remains static-only');
for (const secret of ['passwords','OTP values','Authorization headers','access/refresh/session tokens','protected-action OTP grant tokens','private keys','provider credentials']) if (!cfg.auditData?.neverLog?.includes(secret)) fail(`sensitive-data redaction rule missing ${secret}`);
if (cfg.status !== 'STATIC_AUDIT_AND_OBSERVABILITY_CONTRACT_CREATED_RUNTIME_REDACTION_AND_RETENTION_TESTS_DEFERRED') fail('contract must retain deferred runtime status');
if (!cfg.auditData?.retentionAndDeletionPolicy?.startsWith('PENDING')) fail('audit retention must remain pending rather than assumed approved');
const bookingSecurity = read('services/backend/src/routes/bookings.ts');
if (!bookingSecurity.includes('PROTECTED_ACTION_GRANT_CONSUMED') || !bookingSecurity.includes('grantTokenLogged: false') || !bookingSecurity.includes('client: tx') || !bookingSecurity.includes('throwOnFailure: true')) fail('protected-action OTP grant consumption audit must be redacted and transactional');
if (cfg.protectedActionOtpGrantAudit?.transactionalWithGrantConsumption !== true || !cfg.protectedActionOtpGrantAudit?.neverPersist?.includes('raw grant token')) fail('protected-action grant audit contract missing token-redaction/atomicity policy');
if (cfg.protectedActionOtpGrantAudit?.transactionalWithMutation !== true || !cfg.protectedActionOtpGrantAudit?.mutationTransactionSources?.includes('services/backend/src/services/finalizeTrip.ts')) fail('protected-action grant consumption must be atomic with the protected mutation/finalization transaction'); else pass('protected-action grant consumption/audit shares the Customer cancel/end mutation transaction');
const authOtp = read('services/backend/src/routes/auth.ts');
if (!authOtp.includes('createProtectedActionGrant(tx') || !authOtp.includes('await tx.auditLog.create({') || !authOtp.includes('grantTokenLogged: false') || cfg.protectedActionOtpGrantAudit?.issuanceTransactionalWithGrantCreation !== true) fail('protected-action grant issuance audit must be atomic and raw-token-free');

if (errors.length) { console.error('\nOBSERVABILITY/AUDIT CONTRACT CHECK: FAIL'); for (const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
console.log('\nOBSERVABILITY/AUDIT CONTRACT CHECK: PASS');
for (const p of passes) console.log(p);
console.log('Static contract only; redaction behavior, alert operation, retention and access controls still require final-phase tests.');
