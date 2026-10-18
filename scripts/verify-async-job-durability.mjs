#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let contract,baseline,requirements;
try{contract=JSON.parse(read('config/async-job-durability-contract.json'));baseline=JSON.parse(read('config/project-baseline.json'));requirements=JSON.parse(read('config/security-requirement-register.json'));pass('async-job contract and linked registers parse')}catch(e){console.error(`FAIL async job metadata: ${e.message}`);process.exit(1)}
if(contract.status!=='STATIC_DURABILITY_AND_RETRY_GUARDS_MAPPED_PHYSICAL_TESTS_DEFERRED')fail('async job contract must remain static-only');else pass('contract does not claim runtime job tests passed');
if(contract.testStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH')fail('physical job tests must remain deferred');else pass('physical job tests explicitly deferred');
if((contract.durableDomains||[]).length!==6)fail('expected six async durable domains');else pass('six async durable domains mapped');
if((contract.controls||[]).length!==12)fail('expected 12 async job controls');else pass('12 async job controls registered');
if((contract.finalPhysicalTests||[]).length<12)fail('durable jobs final physical test plan is incomplete');else pass(`${contract.finalPhysicalTests.length} durable job physical tests listed`);
if(baseline.asyncJobDurabilityContract?.path!=='config/async-job-durability-contract.json'||baseline.asyncJobDurabilityContract?.validator!=='scripts/verify-async-job-durability.mjs')fail('baseline does not link async job contract/validator');else pass('project baseline links async job contract');
if(baseline.asyncJobDurabilityContract?.status!==contract.status)fail('baseline async job status differs from contract');else pass('baseline async job status consistent');
const providerStorage=read('services/broadcaster-provider/src/services/provider-storage.service.ts');
const backendOutbox=read('services/broadcaster-provider/src/services/backend-result-outbox.service.ts');
const selection=read('services/broadcaster-provider/src/services/delivery-selection.service.ts');
const sms=read('services/broadcaster-provider/src/services/sms-delivery.service.ts');
const call=read('services/broadcaster-provider/src/services/call-delivery.service.ts');
const pg=read('services/broadcaster-provider/src/services/provider-postgres.service.ts');
const schema=read('services/backend/prisma/schema.prisma');
for(const [condition,msg] of [
 [/leaseUntilEpochMs\?: number/.test(providerStorage),'SMS/call records have optional finite lease field'],
 [/item\.leaseUntilEpochMs = now \+ queueLeaseDurationMs\(\)/.test(selection),'queue claim assigns lease expiry'],
 [/item\.leaseUntilEpochMs === undefined \|\| item\.leaseUntilEpochMs <= now/.test(selection),'queue claim respects active lease'],
 [/item\.gatewayId !== input\.gatewayId \|\| item\.deviceId !== input\.deviceId/.test(sms)&&/CALL_QUEUE_ITEM_NOT_FOUND|CALL_QUEUE_OWNERSHIP_REJECTED/.test(call),'queue finalization checks caller ownership'],
 [/Idempotency-Key/.test(backendOutbox)&&/parsed\.resultId/.test(backendOutbox),'Backend result HTTP post has stable idempotency key'],
 [/encryptValue\(payload\)/.test(backendOutbox),'outbox payload is encrypted before storage'],
 [/AbortController/.test(backendOutbox)&&/const RESULT_HTTP_TIMEOUT_MS = 10_000/.test(backendOutbox)&&/setTimeout\(\(\) => controller\.abort\(\), RESULT_HTTP_TIMEOUT_MS\)/.test(backendOutbox),'Backend result request has a 10-second timeout'],
 [/CREATE TABLE IF NOT EXISTS public\.ridex_provider_state/.test(pg)&&/FOR UPDATE/.test(pg),'PostgreSQL Provider state update is serialized with SELECT FOR UPDATE'],
 [/model RealtimeEventOutbox\s*\{/.test(schema)&&/model NotificationDeliveryAttempt\s*\{/.test(schema)&&/@@unique\(\[notificationId, attemptNumber\]\)/.test(schema),'Backend realtime outbox and unique notification-attempt model exist'],
 [/model DataMergeJob\s*\{/.test(schema),'DataMergeJob schema record exists; executor still explicitly needs verification'],
]){if(condition)pass(msg);else fail(msg)}
if(!/status\?: 'READY' \| 'DEAD_LETTER'/.test(providerStorage)||!/deadLetteredAt\?: string/.test(providerStorage))fail('retry outbox record must keep backwards-compatible dead-letter fields');else pass('retry outbox supports READY and retained DEAD_LETTER state');
if(!/status: 'READY'/.test(backendOutbox))fail('new retry outbox records must start READY');else pass('new retry outbox records start READY');
if(!/\(item\.status \?\? 'READY'\) === 'READY'/.test(backendOutbox))fail('old records must default to READY while dead-letter records are excluded');else pass('legacy status defaults to READY and DEAD_LETTER is excluded from dispatch');
if(!/current\.status = 'DEAD_LETTER'/.test(backendOutbox)||!/current\.deadLetteredAt = new Date\(\)\.toISOString\(\)/.test(backendOutbox))fail('invalid/retry-exhausted outbox work must be marked dead-letter instead of deleted');else pass('poison payloads and exhausted retries retain dead-letter record');
if((backendOutbox.match(/delete data\.retryOutbox\[entry\.outboxId\]/g)||[]).length!==1)fail('only successful ACK may remove the retry outbox row');else pass('only acknowledged Backend result removes retry outbox entry');
if(!/const retryLimit = maxAttempts\(\)/.test(backendOutbox)||!/current\.attempts >= retryLimit/.test(backendOutbox))fail('max attempt threshold must terminate retry loop');else pass('retry max attempts remains bounded');
if(/failure = error instanceof Error \? error\.message/.test(backendOutbox))fail('network exception text must not be persisted as job failure detail');else if(/BACKEND_RESULT_NETWORK_FAILURE/.test(backendOutbox)&&/BACKEND_RESULT_TIMEOUT/.test(backendOutbox))pass('outbox persists safe network failure classes rather than arbitrary exception text');
if(!contract.knownResidualsRequiringFinalReview?.some(x=>/storage driver/i.test(x))||!contract.knownResidualsRequiringFinalReview?.some(x=>/DataMergeJob/i.test(x)))fail('storage and DataMergeJob implementation gaps must remain explicit');else pass('storage choice and missing DataMergeJob worker remain pending');
for(const id of ['REQ-ASYNC-001','REQ-ASYNC-003','REQ-ASYNC-005']){
 const r=(requirements.requirements||[]).find(x=>x.id===id);
 if(!r)fail(`security requirement missing: ${id}`);
 else if(!(r.sourceEvidence||[]).includes('config/async-job-durability-contract.json'))fail(`${id} does not link async-job contract`);
 else if(r.implementationStatus!=='UNVERIFIED')fail(`${id} must remain UNVERIFIED until physical tests pass`);
 else pass(`${id} links contract and remains UNVERIFIED`);
}
if(errors.length){console.error('\nASYNC JOB DURABILITY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nASYNC JOB DURABILITY CHECK: PASS');for(const p of passes)console.log(p);console.log('Static mapping/source guard only; no provider DB, crash/restart, cross-worker or callback runtime tests were run.');
