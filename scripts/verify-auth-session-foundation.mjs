#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>{const p=path.join(root,rel);if(!fs.existsSync(p)){fail(`required source missing: ${rel}`);return '';}return fs.readFileSync(p,'utf8');};
let cfg;try{cfg=JSON.parse(read('config/auth-session-baseline.json'));pass('auth/session baseline JSON parses');}catch(e){console.error(`AUTH SESSION CHECK: FAIL\nFAIL ${e.message}`);process.exit(1);}
const service=read(cfg.source.sessionService);const routes=read(cfg.source.backendRoutes);const middleware=read(cfg.source.authMiddleware);const schema=read(cfg.source.sessionModel);
if(cfg.projectId==='ridex-super-admin-controle'&&cfg.schemaVersion===1)pass('fresh project/session contract identity is correct');else fail('session contract identity/schema version mismatch');
const checks=[
 ['uses cryptographically secure random token bytes','crypto.randomBytes(TOKEN_BYTES)',service],
 ['persists SHA-256 token hash','createHash("sha256")',service],
 ['checks absolute expiry','expiresAt',service],
 ['does not extend expiry from lastSeenAt','lastSeenAt never extends expiresAt',service],
 ['rechecks user status','user.status',service],
 ['supports device binding','deviceId',service],
 ['supports revocation','revokeAuthSession',service],
 ['has password login route','/password/login',routes],
 ['has separate OTP request route','/send-otp',routes],
 ['has separate OTP resend route','/resend-otp',routes],
 ['has exact-purpose OTP verification route','/verify-otp',routes],
 ['has logout/revocation route','/logout',routes],
 ['session model exists','model AuthSession',schema],
 ['protected request resolves session from bearer token','Bearer',middleware]
];
for(const [label,needle,src] of checks){if(src.includes(needle))pass(label);else fail(`${label}: marker missing`);}
const rules=cfg.knownSessionRules||{};
for(const key of ['rawSessionTokenReturnedOnlyOnCreate','absoluteExpiry','userStatusRecheckedOnResolve','deviceBindingSupported','singleSessionRevokeSupported','allSessionRevokeSupported','otherSessionRevokeSupported'])if(rules[key]===true)pass(`session policy recorded: ${key}`);else fail(`session policy must be true: ${key}`);
if(rules.lastSeenExtendsExpiry===false&&rules.tokensMayBeLogged===false)pass('session expiry/token secrecy policy is explicit');else fail('unsafe session expiry/token logging policy');
if((cfg.openContracts||[]).some(x=>x.id==='AUTH-OPEN-01'&&x.status==='SOURCE_IDENTITY_RULE_MAPPED_RUNTIME_TEST_PENDING'))pass('pre-auth and protected actor identity rules are mapped; runtime identity tests remain pending');else fail('pre-auth identity-resolution contract status missing');
if((cfg.openContracts||[]).some(x=>x.id==='AUTH-OPEN-03'&&x.status==='DEFERRED_TO_MOBILE_SECURITY_IMPLEMENTATION_AND_FINAL_TESTS'))pass('secure mobile token storage work remains explicitly deferred');else fail('mobile secure storage work must remain tracked');
if(errors.length){console.error('AUTH SESSION CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('AUTH SESSION FOUNDATION CHECK: PASS');for(const m of passes)console.log(m);console.log('Static source check only; authentication/session runtime and device tests are deferred until all four packages are implemented.');
