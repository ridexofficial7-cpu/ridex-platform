#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];
const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let contract,baseline,eventContract,requirements;
try {
 contract=JSON.parse(read('config/realtime-safety-contract.json'));
 baseline=JSON.parse(read('config/project-baseline.json'));
 eventContract=JSON.parse(read('config/realtime-event-contract.json'));
 requirements=JSON.parse(read('config/security-requirement-register.json'));
 pass('realtime safety metadata and linked registers parse');
} catch(e) { console.error(`FAIL realtime safety metadata: ${e.message}`); process.exit(1); }
if(contract.status!=='STATIC_REALTIME_SAFETY_IMPLEMENTED_RUNTIME_AND_FAULT_TESTS_DEFERRED') fail('contract must remain static-only'); else pass('contract avoids false runtime-test pass claims');
if(contract.testStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH') fail('runtime tests must remain deferred'); else pass('physical realtime tests remain deferred');
if((contract.controls||[]).length!==14) fail('expected 14 realtime safety controls'); else pass('14 realtime safety controls registered');
if((contract.finalPhysicalTests||[]).length<12) fail('final realtime physical-test plan incomplete'); else pass(`${contract.finalPhysicalTests.length} final realtime tests registered`);
if(!contract.knownResidualsRequiringFinalReview?.some(x=>/concurrent stream/i.test(x))) fail('stream-cap policy must remain for final review'); else pass('concurrency and semantic payload review remain open');
if(baseline.realtimeSafetyContract?.path!=='config/realtime-safety-contract.json'||baseline.realtimeSafetyContract?.validator!=='scripts/verify-realtime-safety.mjs') fail('project baseline does not link realtime safety contract/validator'); else pass('project baseline links realtime safety contract');
if(baseline.realtimeSafetyContract?.status!==contract.status) fail('project baseline realtime safety status disagrees with contract'); else pass('baseline realtime status consistent');
if(eventContract.safetyPolicy?.path!=='config/realtime-safety-contract.json'||eventContract.safetyPolicy?.validator!=='scripts/verify-realtime-safety.mjs') fail('realtime event contract does not cross-link safety policy'); else pass('existing event contract cross-links safety policy');
const route=read('services/backend/src/routes/realtime.ts');
const service=read('services/backend/src/services/realtime.ts');
const main=read('services/backend/src/main.ts');
const mount=main.slice(main.indexOf('app.use(\n  `${API_PREFIX}/realtime`'),main.indexOf('app.use(\n  `${API_PREFIX}/trips`'));
if(!mount.includes('appAuth')||!mount.includes('actorIdentity')||!mount.includes('realtimeRouter')||mount.indexOf('appAuth')>mount.indexOf('realtimeRouter')||mount.indexOf('actorIdentity')>mount.indexOf('realtimeRouter')) fail('realtime router is not mounted behind authentication and actor identity middleware'); else pass('realtime router mount is protected by appAuth and actorIdentity');
for(const [rx,msg] of [
 [/sessionType\s*===\s*requestedType[\s\S]*?sessionActorId\s*===\s*requestedId/,'stream actor type/id must match authenticated actor'],
 [/getRideXRealtimeReplay\([\s\S]*?target[\s\S]*?lastEventId[\s\S]*?STREAM_REPLAY_LIMIT/,'replay requests a bounded actor-scoped target'],
 [/Cache-Control",\s*"private, no-store, no-transform"/,'SSE response disables shared/private cache retention'],
 [/X-Content-Type-Options",\s*"nosniff"/,'SSE response sets nosniff'],
 [/res\.on\("close",\s*cleanup\)/,'response close triggers stream cleanup'],
 [/req\.on\("aborted",\s*cleanup\)/,'aborted request triggers stream cleanup'],
 [/res\.on\("drain",\s*flushPendingWrites\)/,'response drain resumes queued writes'],
 [/res\.on\("error",\s*cleanup\)/,'response error triggers stream cleanup'],
 [/const MAX_QUEUED_LIVE_EVENTS\s*=\s*1_000/,'live/replay queues are bounded by configured limit'],
 [/if \(pendingWriteEvents\.length >= MAX_QUEUED_LIVE_EVENTS\)/,'slow-consumer pending write queue closes at its safety bound'],
 [/if \(!writeBackpressured && !writeSseComment\(res, "heartbeat"\)\)/,'heartbeats do not write while stream is backpressured'],
 [/subscribeRideXEvents\([\s\S]*?const replay = await awaitReplay/,'live subscription is installed before awaited replay'],
 [/if \(replay\.replayGap\)[\s\S]*?STATE_RESYNC_REQUIRED/,'replay-gap control asks for authoritative resync'],
 [/writeSseEvent[\s\S]*?return res\.write\(frame\)/,'event frame is written atomically for reliable backpressure reporting'],
]) { if(rx.test(route)) pass(msg); else fail(msg); }
if(/req\.on\("close",\s*cleanup\)/.test(route)) fail('SSE stream cleanup must not depend on incoming request close'); else pass('no incorrect req.close cleanup listener remains');
for(const [rx,msg] of [
 [/SENSITIVE_KEY_PATTERN/,'event payload has sensitive-key redaction rules'],
 [/DEFAULT_MAX_PAYLOAD_BYTES\s*=\s*64\s*\*\s*1024/,'payload byte size is bounded'],
 [/DEFAULT_MAX_PAYLOAD_DEPTH\s*=\s*8/,'payload nesting depth is bounded'],
 [/DEFAULT_MAX_PAYLOAD_KEYS\s*=\s*128/,'payload key count is bounded'],
 [/DEFAULT_MAX_PAYLOAD_ARRAY_ITEMS\s*=\s*128/,'payload array length is bounded'],
 [/DEFAULT_MAX_PAYLOAD_STRING_LENGTH\s*=\s*4_000/,'payload string length is bounded'],
 [/getRideXRealtimeReplay\([\s\S]*?where:\s*\{[\s\S]*?actorType:[\s\S]*?actorId:/,'replay query includes actor audience scope'],
]) { if(rx.test(service)) pass(msg); else fail(msg); }
const mobilePaths=['apps/ridex-mobile/shared/realtime/client.ts','apps/customer-mobile/shared/realtime/client.ts','apps/driver-mobile/shared/realtime/client.ts','apps/admin-mobile/shared/realtime/client.ts'];
for(const rel of mobilePaths){
 const s=read(rel);
 if(!/JSON\.parse\(data\)/.test(s)||!/Array\.isArray\(decoded\)/.test(s)) fail(`${rel}: requires JSON object parsing before event delivery`); else pass(`${rel}: only JSON objects are accepted`);
 if(!/Malformed realtime event payload/.test(s)||/payload:\s*\{\s*raw:\s*data\s*\}/.test(s)) fail(`${rel}: malformed frame must be safely discarded without raw fallback`); else pass(`${rel}: malformed/raw payload is not forwarded`);
 const dedup=s.indexOf('if (eventId && seenEventIds.has(eventId)) continue;');
 const parsed=s.indexOf('const decoded: unknown = JSON.parse(data)');
 const cursor=s.indexOf('lastEventId = eventId;');
 if(parsed<0||dedup<parsed||cursor<dedup) fail(`${rel}: cursor update/dedup order is not valid-parse first`); else pass(`${rel}: valid parse and duplicate check precede cursor persistence`);
 if(!/persistCursor\(eventId\)/.test(s)) fail(`${rel}: validated SSE cursor is not persisted`); else pass(`${rel}: validated cursor persistence is wired`);
}
const web=read('apps/admin-web/src/lib/realtime.ts');
if(!/parsed = JSON\.parse\(raw\)/.test(web)||!/Array\.isArray\(parsed\)/.test(web)) fail('Admin Web must parse valid non-array JSON'); else pass('Admin Web accepts only parsed JSON objects');
if(!/this\.seenEventIds\.has\(eventId\)/.test(web)||!/this\.seenEventIds\.add\(eventId\)/.test(web)) fail('Admin Web duplicate event ID filtering missing'); else pass('Admin Web duplicate IDs are filtered');
const parse=web.slice(web.indexOf('private parseFrame('));
if(parse.indexOf('JSON.parse(raw)')>parse.indexOf('this.lastEventId = eventId')) fail('Admin Web cursor advances before JSON parse'); else pass('Admin Web cursor mutation follows valid JSON parse');
if(!/safetyPolicy/.test(JSON.stringify(eventContract))) fail('event contract must link safety policy'); else pass('realtime event contract references the safety addendum');
if(!contract.finalPhysicalTests.every(t=>typeof t==='string')||!contract.finalPhysicalTests.length) fail('final physical tests must be listed'); else pass('final physical test list is structured');
if(errors.length){console.error('\nREALTIME SAFETY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nREALTIME SAFETY CHECK: PASS');for(const p of passes)console.log(p);console.log('Static source/contract checks only; socket, reconnect, replay, backpressure and provider/database tests were not run.');
