#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors=[]; const passes=[];
const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let contract;
try { contract=JSON.parse(read('config/authentication-security-contract.json')); pass('authentication security contract JSON parses'); }
catch(e) { console.error(`FAIL authentication contract parse: ${e.message}`); process.exit(1); }
const paths=[contract.authority?.sessionAuthority,contract.authority?.requestAuthenticationMiddleware,contract.authority?.loginAndOtpRoutes,'services/backend/src/routes/admin.ts','services/backend/prisma/schema.prisma'];
for(const rel of paths) { if(!rel || !fs.existsSync(path.join(root,rel))) fail(`required auth source missing: ${rel}`); else pass(`auth source present: ${rel}`); }
const session=read(contract.authority.sessionAuthority);
const middleware=read(contract.authority.requestAuthenticationMiddleware);
const routes=read(contract.authority.loginAndOtpRoutes);
const admin=read('services/backend/src/routes/admin.ts');
const schema=read('services/backend/prisma/schema.prisma');
const checks=[
 [/crypto\.randomBytes\(TOKEN_BYTES\)/.test(session),'cryptographically secure random session token generation present'],
 [/createHash\("sha256"\)/.test(session),'server stores a one-way token hash'],
 [/tokenHash/.test(session)&&/expiresAt/.test(session)&&/revokedAt/.test(session),'session lookup includes token hash, absolute expiry and revocation'],
 [/resolveAuthSession\(/.test(middleware),'protected request middleware resolves a server-side session'],
 [/user\.status/.test(session)&&/user\.status/.test(middleware),'user status is rechecked on session resolution/request'],
 [/deviceId/.test(session)&&/matchesBinding/.test(session),'device binding support is present'],
 [/router\.post\("\/password\/login"/.test(routes),'password login route is inventoried'],
 [/router\.post\("\/send-otp"/.test(routes)&&/router\.post\("\/resend-otp"/.test(routes)&&/router\.post\("\/verify-otp"/.test(routes),'separate OTP request/resend/verify endpoints are inventoried'],
 [/router\.post\("\/logout"/.test(routes)&&/revokeAuthSession\(/.test(routes),'logout server-side revocation path is present'],
 [/revokeAuthSessionById/.test(admin)&&/revokeAllAuthSessionsForUser/.test(admin),'privileged Admin session revocation operations are present'],
 [/model AuthSession/.test(schema)&&/tokenHash/.test(schema)&&/expiresAt/.test(schema)&&/revokedAt/.test(schema),'Prisma AuthSession schema fields are present']
];
for(const [ok,message] of checks) ok?pass(message):fail(message);
if(contract.status!=='SOURCE_CONTRACT_MAPPED_RUNTIME_TEST_DEFERRED') fail('contract must not claim runtime-tested status');
if(contract.requiredInvariants?.length!==8) fail('expected eight explicit auth/session/protected-grant invariants');
if((contract.routes||[]).length!==7) fail('expected seven auth routes');
const verifierStart=routes.indexOf('async function consumeOtpChallenge(');
const verifierEnd=routes.indexOf('\nfunction ',verifierStart+1);
const verifierBlock=routes.slice(verifierStart,verifierEnd<0?undefined:verifierEnd);
if(!/!\/\^\\d\{4\}\$\//.test(verifierBlock)) fail('shared OTP verifier must enforce exactly four digits');
const registrationStart=routes.indexOf('router.post("/driver/register/verify"');
const registrationNext=routes.indexOf('\nrouter.',registrationStart+1);
const registrationBlock=routes.slice(registrationStart,registrationNext<0?undefined:registrationNext);
if(!registrationBlock.includes('purposeCode !== "DRIVER.AUTH.REGISTRATION"') || !registrationBlock.includes('parsedPurpose.action !== "REGISTRATION"')) fail('Driver registration must require exact DRIVER.AUTH.REGISTRATION purpose');
const resetStart=routes.indexOf('router.post("/password/reset/complete"');
const resetNext=routes.indexOf('\nrouter.',resetStart+1);
const resetBlock=routes.slice(resetStart,resetNext<0?undefined:resetNext);
if(!/!\/\^\\d\{4\}\$\//.test(registrationBlock) || !/!\/\^\\d\{4\}\$\//.test(resetBlock)) fail('registration and password-reset routes must validate exactly four digits');
if(!(contract.knownGaps||[]).some(x=>x.id==='AUTH-GAP-001'&&x.status==='PENDING_DEPENDENCY_INSTALL_AND_IMPLEMENTATION')) fail('mobile secure token storage gap must remain open');
if(contract.policy?.physicalTestsDeferredUntilAllFourPackagesImplemented!==true) fail('physical test deferral is not explicit');
const authSource=read('services/backend/src/routes/auth.ts');
const verifyStart=authSource.indexOf('router.post("/verify-otp"');
const verifyEnd=authSource.indexOf('\nrouter.',verifyStart+1);
const verifyBlock=authSource.slice(verifyStart,verifyEnd<0?undefined:verifyEnd);
const protectedBranchStart=verifyBlock.indexOf('if (parsedPurpose.category !== "AUTH")'); const protectedBranchEnd=verifyBlock.indexOf('/* -------------------------------------------------------\n       FIND EXISTING USER',protectedBranchStart); const protectedBranch=verifyBlock.slice(protectedBranchStart,protectedBranchEnd<0?undefined:protectedBranchEnd); if(protectedBranchStart>=0&&protectedBranch.includes('createProtectedActionGrant(tx')&&protectedBranch.includes('return res.json({')&&!protectedBranch.includes('createAuthSession(')) pass('protected-action OTP verification issues a bound grant without minting a login session'); else fail('protected-action OTP verification must not mint a login session');
const unsupportedPurposeGate = verifyBlock.indexOf('PROTECTED_OTP_PURPOSE_NOT_IMPLEMENTED');
const otpConsumeCall = verifyBlock.indexOf('const result = await consumeOtpChallenge');
if (unsupportedPurposeGate >= 0 && otpConsumeCall > unsupportedPurposeGate && verifyBlock.includes('GRANT_BACKED_PROTECTED_OTP_PURPOSES.has(purposeCode)')) pass('generic protected OTP verification fails closed for purposes without a grant-consuming mutation route before consuming the OTP'); else fail('unsupported protected OTP purposes must be rejected before OTP consumption until their mutation routes enforce grants');
if (verifyBlock.includes('unsupported_protected_purpose_no_grant_consumer') && verifyBlock.includes('otpConsumed: false') && verifyBlock.includes('grantCreated: false') && verifyBlock.includes('grantTokenLogged: false')) pass('unsupported protected-purpose rejection is security-audited without consuming OTP or logging grant secrets'); else fail('unsupported protected-purpose rejection must be audited as non-consuming and secret-safe');
if(verifyBlock.includes('Authentication identity:')&&verifyBlock.includes('Authentication actorId must contain a valid 10-digit mobile')&&verifyBlock.includes('Protected-action identity:')&&verifyBlock.includes('actorId does not match the authenticated session')&&verifyBlock.includes('mobile = normalizeMobile')) pass('pre-auth mobile identity and authenticated protected-action profile identity are separately resolved and mismatch-checked'); else fail('OTP actor identity resolution must distinguish pre-auth mobile from canonical authenticated profile identity');
if(!(contract.knownGaps||[]).some(x=>x.id==='AUTH-GAP-004'&&x.status==='SOURCE_IMPLEMENTED_MIGRATION_AND_NEGATIVE_TESTS_PENDING')) fail('server-side protected-action OTP grant must remain pending migration/runtime negative-test evidence');
const bookingSource=read('services/backend/src/routes/bookings.ts');
const grantService=read('services/backend/src/services/protectedActionGrants.ts');
const grantMigration=read('services/backend/prisma/migrations/20261012_protected_action_otp_grant/migration.sql');
const finalizerSource=read('services/backend/src/services/finalizeTrip.ts');
const driverSource=read('services/backend/src/routes/driver.ts');
if(!bookingSource.includes('consumeProtectedActionGrant')||!bookingSource.includes('CUSTOMER.BOOKING.CANCEL')||!bookingSource.includes('CUSTOMER.RIDE.TRIP_END')) fail('customer cancel/end routes must enforce exact-purpose OTP grants');
if(!/model ProtectedActionOtpGrant/.test(schema)||!/tokenHash\s+String\s+@unique/.test(schema)||!/user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade/.test(schema)) fail('durable unique-hash OTP grant model or owner-cascade relation missing');
if(!grantMigration.includes('FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE')||!grantMigration.includes('ProtectedActionOtpGrant_tokenHash_key')) fail('grant migration must enforce owner cascade and unique token hash');
if(!verifyBlock.includes('createProtectedActionGrant(tx')||!verifyBlock.includes('otpVerificationGrant: grant.token')||!verifyBlock.includes('grantTtlSeconds: 120')) fail('successful protected OTP verification must issue a 120-second one-time grant');
if(!verifyBlock.includes('await prisma.$transaction(async (tx) =>')||!verifyBlock.includes('await tx.auditLog.create({')||!verifyBlock.includes('grantTokenLogged: false')) fail('grant creation and successful verification audit must commit atomically without logging the raw token');
if(!verifyBlock.includes('protectedActionContextId')||!verifyBlock.includes('protectedActionContextId.length > 128')||!verifyBlock.includes('resourceId: actionContextId')) fail('protected OTP verification must bind a bounded action context before issuing a grant');
for(const clientPath of ['apps/customer-mobile/customer/App.tsx','apps/ridex-mobile/customer/App.tsx']) { const client=read(clientPath); if(!client.includes('actionContextId: bookingId')) fail(`${clientPath} must bind OTP verification to the selected booking`); else pass(`OTP verification binds the selected booking resource: ${clientPath}`); }
if(!grantService.includes('crypto.randomBytes(32).toString("base64url")')||!grantService.includes('createHash("sha256")')||!grantService.includes('GRANT_TTL_MS = 120_000')) fail('grant must use 32 random bytes, SHA-256-only persistence and a two-minute expiry'); else pass('grant entropy, hash-only persistence and 120-second expiry are explicit');
for(const field of ['tokenHash: digestToken(token)','actorType: normalized.actorType','actorId: normalized.actorId','userId: normalized.userId','sessionId: normalized.sessionId','purposeCode: normalized.purposeCode','resourceId: normalized.resourceId','expiresAt: { gt: now }','consumedAt: null']) if(!grantService.includes(field)) fail(`grant consumption is missing binding/expiry condition: ${field}`); else pass(`grant consumption enforces ${field}`);
if(!grantService.includes('tx.protectedActionOtpGrant.updateMany')||!grantService.includes('if (claim.count !== 1) throw new Error("PROTECTED_ACTION_GRANT_INVALID_OR_EXPIRED")')) fail('grant consumption must be atomic, one-time and fail closed');
if(!bookingSource.includes('const cancellationClaim = await tx.booking.updateMany')||!bookingSource.includes('if (cancellationClaim.count !== 1)')) fail('Customer cancellation must use compare-and-set to prevent concurrent stale-state mutation'); else pass('Customer cancellation uses compare-and-set against the current booking state');
if(!bookingSource.includes('purposeCode: CUSTOMER_CANCEL_OTP_PURPOSE')||!bookingSource.includes('resourceId: booking.id')||!bookingSource.includes('client: tx')||!bookingSource.includes('throwOnFailure: true')) fail('Customer cancellation grant consumption/audit must bind the booking and share its transaction');
if(!bookingSource.includes('beforeFinalize: async (tx)')||!bookingSource.includes('purposeCode: CUSTOMER_TRIP_END_OTP_PURPOSE')||!bookingSource.includes('resourceId: booking.id')||!bookingSource.includes('client: tx')||!bookingSource.includes('throwOnFailure: true')) fail('Customer ride-end grant consumption/audit must share the finalization transaction');
if(!driverSource.includes('purposeCode: "DRIVER.RIDE.TRIP_START_VERIFY"')||!driverSource.includes('resourceId: booking.id')||!driverSource.includes('consumeProtectedActionGrant(tx, otpVerificationGrant')) fail('Driver trip-start mutation must consume its exact-purpose grant in the trip-start transaction');
if(!finalizerSource.includes('if (beforeFinalize)')||!finalizerSource.includes('await beforeFinalize(tx)')) fail('ride-end authorization must run inside the authoritative finalization transaction'); else pass('ride-end authorization executes inside authoritative finalization transaction');
if(!bookingSource.includes('A valid, unexpired cancellation verification grant is required')||!bookingSource.includes('A valid, unexpired ride-end verification grant is required')) fail('protected-action grant rejection must return safe client messages');
if(!grantService.includes('tokenHash: digestToken(token)')||grantService.includes('token: token,')) fail('raw grant token must never be persisted'); else pass('only the SHA-256 grant digest is persisted');
pass(`${contract.requiredInvariants.length} invariants, ${contract.routes.length} routes and ${(contract.knownGaps||[]).length} explicit auth gaps tracked; grant runtime tests remain pending`);
if(errors.length){console.error('\nAUTHENTICATION SECURITY CONTRACT: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('AUTHENTICATION SECURITY CONTRACT: PASS');for(const p of passes)console.log(p);
console.log('Note: source-presence checks are not runtime authentication/security test evidence.');
