#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const passes = [];
const pass = (m) => passes.push(`PASS ${m}`);
const fail = (m) => errors.push(m);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const grants = read('services/backend/src/services/protectedActionGrants.ts');
const auth = read('services/backend/src/routes/auth.ts');
const bookings = read('services/backend/src/routes/bookings.ts');
const trip = read('services/backend/src/services/finalizeTrip.ts');
const schema = read('services/backend/prisma/schema.prisma');
const migration = read('services/backend/prisma/migrations/20261012_protected_action_otp_grant/migration.sql');

for (const [condition, message] of [
  [/randomBytes\(32\)/.test(grants), 'grant token is generated from 32 cryptographically random bytes'],
  [/createHash\("sha256"\)/.test(grants) && /tokenHash:\s*digestToken\(token\)/.test(grants), 'only SHA-256 token digest is persisted'],
  [/GRANT_TTL_MS\s*=\s*120_000/.test(grants), 'grant expiry is exactly 120 seconds'],
  [/actorType:\s*normalized\.actorType/.test(grants) && /actorId:\s*normalized\.actorId/.test(grants) && /userId:\s*normalized\.userId/.test(grants) && /sessionId:\s*normalized\.sessionId/.test(grants) && /purposeCode:\s*normalized\.purposeCode/.test(grants) && /resourceId:\s*normalized\.resourceId/.test(grants), 'grant issuance binds actor, user, session, exact purpose and resource'],
  [/expiresAt:\s*\{\s*gt:\s*now\s*\}/.test(grants) && /consumedAt:\s*null/.test(grants) && /updateMany\(/.test(grants), 'grant consumption is expiry-bound, one-time and atomic via conditional update'],
  [/tokenHash\s+String\s+@unique/.test(schema) && /resourceId\s+String\s/.test(schema) && /onDelete:\s*Cascade/.test(schema), 'schema declares unique token hash, required resource binding and owner cascade'],
  [/CHECK \(\"tokenHash\" ~/.test(migration) && /CHECK \(length\(trim\("resourceId"\)\) > 0\)/.test(migration), 'migration adds token-hash and non-empty resource integrity constraints'],
  [/GRANT_BACKED_PROTECTED_OTP_PURPOSES/.test(auth) && /PROTECTED_OTP_PURPOSE_NOT_IMPLEMENTED/.test(auth) && /otpConsumed:\s*false/.test(auth) && /grantCreated:\s*false/.test(auth), 'unsupported protected purposes fail closed and are audited before OTP consumption'],
  [/"CUSTOMER\.BOOKING\.CANCEL"/.test(auth) && /"CUSTOMER\.RIDE\.TRIP_END"/.test(auth) && /"DRIVER\.RIDE\.TRIP_START_VERIFY"/.test(auth), 'generic OTP verification allowlist contains the approved grant-backed ride purposes'],
  [/await prisma\.\$transaction\(async \(tx\) =>/.test(auth) && /tx\.auditLog\.create\(/.test(auth) && /grantTokenLogged:\s*false/.test(auth), 'grant issuance and mandatory redacted audit share a transaction'],
  [/consumeProtectedActionGrant\(tx, grantToken/.test(bookings) && /resourceId:\s*booking\.id/.test(bookings) && /CUSTOMER_CANCEL_OTP_PURPOSE/.test(bookings), 'customer cancellation consumes a grant bound to the same booking and exact purpose'],
  [/consumeProtectedActionGrant\(tx, req\.body\?\.otpVerificationGrant/.test(bookings) && /CUSTOMER_TRIP_END_OTP_PURPOSE/.test(bookings) && /resourceId:\s*booking\.id/.test(bookings), 'customer trip-end consumes a grant bound to the same booking and exact purpose'],
  [/beforeFinalize\?: \(tx: any\) => Promise<void>/.test(trip) && /if \(beforeFinalize\)/.test(trip), 'trip finalization supports grant consumption inside the authoritative mutation transaction'],
]) condition ? pass(message) : fail(message);

const consumeAt = auth.indexOf('const result = await consumeOtpChallenge({', auth.indexOf('router.post("/verify-otp"'));
const gateAt = auth.indexOf('GRANT_BACKED_PROTECTED_OTP_PURPOSES.has(purposeCode)', auth.indexOf('router.post("/verify-otp"'));
if (gateAt >= 0 && consumeAt > gateAt) pass('unsupported-purpose gate executes before OTP challenge consumption');
else fail('unsupported-purpose gate must execute before OTP challenge consumption');

if (errors.length) {
  console.error(`PROTECTED ACTION GRANT CHECK: FAIL (${passes.length} passed, ${errors.length} failed)`);
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
console.log(`PROTECTED ACTION GRANT CHECK: PASS (${passes.length} assertions)`);
for (const item of passes) console.log(item);
console.log('Source-level checks only; database concurrency/runtime tests and migration execution remain deferred.');
