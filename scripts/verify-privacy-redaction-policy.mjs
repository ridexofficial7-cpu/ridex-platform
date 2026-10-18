#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let policy;
try{policy=JSON.parse(read('config/privacy-redaction-policy.json'));pass('privacy redaction policy parses');}catch(e){console.error(`FAIL privacy policy JSON: ${e.message}`);process.exit(1);}
if(policy.status!=='PARTIAL_SHARED_AUDIT_REDACTION_IMPLEMENTED_FINAL_CROSS_ROUTE_REVIEW_PENDING')fail('privacy policy must preserve partial implementation and pending cross-route review');else pass('full privacy sign-off is not falsely claimed');
if(policy.runtimeTestStatus!=='NOT_RUN_PER_PROJECT_OWNER_INSTRUCTION')fail('privacy runtime tests must remain deferred');else pass('runtime/privacy tests correctly deferred');
const expectations=[
 ['services/backend/src/middleware/auth.ts','errorName,','authentication logs do not log raw error text'],
 ['services/backend/src/routes/admin.ts','debugErrorType','TEST diagnostics expose error type only'],
 ['services/backend/src/routes/admin.ts','function redactSensitiveData','Admin response audit redactor exists'],
 ['services/backend/src/routes/platform.ts','function safeAuditSnapshot','platform audit snapshot sanitizer exists'],
 ['services/backend/src/services/realtime.ts','SENSITIVE_KEY_PATTERN','realtime sensitive-key redaction exists'],
 ['services/broadcaster-provider/src/services/security-audit.service.ts','sanitizeAuditMetadata(input.metadata)','Provider audit metadata is sanitized before persistence'],
 ['services/backend/src/routes/appAssets.ts','errorName: error instanceof Error ? error.name : "UnknownError"','asset failure logs avoid raw error message'],
 ['services/backend/src/routes/bookings.ts','grantTokenLogged: false','protected-action grant audit omits raw token and records only redacted metadata'],
];
for(const [rel,needle,msg] of expectations){let text;try{text=read(rel);}catch{fail(`required source missing: ${rel}`);continue;}if(text.includes(needle))pass(msg);else fail(`${rel}: expected source control missing`);}
const adminRedactor=read('services/backend/src/routes/admin.ts');
const providerRedactor=read('services/broadcaster-provider/src/services/security-audit.service.ts');
if(!adminRedactor.includes('key.includes("otp")')||!adminRedactor.includes('key.includes("grant")'))fail('Admin entity redactor must cover OTP/grant field names');else pass('Admin entity redactor covers OTP/grant fields');
if(!providerRedactor.includes('otp[_-]?verification[_-]?grant')||!providerRedactor.includes('grant[_-]?token'))fail('Provider audit sanitizer must cover OTP verification grant fields');else pass('Provider audit sanitizer covers OTP verification grant fields');
const platform=read('services/backend/src/routes/platform.ts');
if(!/otp\|granttoken\|verificationgrant/.test(platform))fail('platform audit sanitizers must cover OTP verification grant fields');else pass('platform audit sanitizers cover OTP verification grant fields');
if(platform.includes('route: req.originalUrl'))fail('audit snapshots must not persist raw originalUrl/query strings');else pass('platform audit route references do not include raw originalUrl');
const auth=read('services/backend/src/middleware/auth.ts');
const authBlock=auth.slice(auth.indexOf('function logAuthError'),auth.indexOf('/* =========================================================\n   LOAD AUTH CONTEXT'));
if(authBlock.includes('error.message')||authBlock.includes('String(error)'))fail('auth error logger includes raw exception message');else pass('auth error logger does not include raw exception message');
if(!Array.isArray(policy.knownResidualsRequiringReview)||policy.knownResidualsRequiringReview.length<3)fail('known route/retention residuals must be explicit');else pass(`known residual review items ${policy.knownResidualsRequiringReview.length}`);
console.log([...passes,...errors.map(e=>`FAIL ${e}`)].join('\n'));
console.log(`PRIVACY REDACTION STATIC CHECK SUMMARY: ${passes.length}/${passes.length+errors.length} passed; ${errors.length} failed; runtime tests not run.`);
process.exit(errors.length?1:0);
