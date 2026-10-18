#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let cfg,baseline;try{cfg=JSON.parse(read('config/financial-correctness-contract.json'));baseline=JSON.parse(read('config/project-baseline.json'));pass('financial correctness contract and baseline parse');}catch(e){console.error(`FAIL financial contract: ${e.message}`);process.exit(1)}
if(cfg.status!=='STATIC_FINANCIAL_INVARIANTS_MAPPED_POLICY_AND_RUNTIME_TESTS_PENDING')fail('financial contract must remain static-only');else pass('no financial runtime pass is claimed');
if(cfg.testStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH')fail('financial tests must remain deferred');else pass('physical financial tests deferred by owner instruction');
const pay=read('services/backend/src/routes/payments.ts'),razor=read('services/backend/src/integrations/razorpay.ts'),payout=read('services/backend/src/routes/payouts.ts'),schema=read('services/backend/prisma/schema.prisma');
const tests=[
 [/verifyPaymentSignature\s*\(/.test(pay)&&/export function verifyPaymentSignature/.test(razor),'payment signature function is present and used'],
 [/verifyWebhookSignature\s*\(/.test(pay)&&/export function verifyWebhookSignature/.test(razor),'webhook signature verification is present and used'],
 [/payment amount or currency does not match/i.test(pay)&&/providerPayment\?\.currency/.test(pay),'payment amount/currency mismatch path present'],
 [/timingSafeEqual/.test(razor),'timing-safe signature comparison present'],
 [/reconcileRazorpayPayment/.test(pay),'provider reconciliation entrypoint present'],
 [/prisma\.\$transaction\s*\(/.test(pay)&&/prisma\.\$transaction\s*\(/.test(payout),'financial transaction call sites present'],
 [/providerPayment|providerOrder/i.test(pay)&&/fetchRazorpayPayment/.test(razor),'provider-state references present in Backend and adapter'],
 [/model\s+PaymentWebhookEvent\s*\{[\s\S]*?payloadHash\s+String/.test(schema)&&/@@unique\(\[provider,\s*eventId\]\)/.test(schema),'webhook unique identity and payload-hash schema present'],
 [/model\s+Refund\s*\{[\s\S]*?amount\s+Decimal\s+@db\.Decimal\(12,\s*2\)/.test(schema),'Refund amount uses declared fixed precision'],
 [/model\s+LedgerEntry\s*\{[\s\S]*?amount\s+Decimal\s+@db\.Decimal\(12,\s*2\)/.test(schema),'LedgerEntry amount uses declared fixed precision'],
 [/model\s+DriverSettlement\s*\{[\s\S]*?status\s+SettlementStatus/.test(schema),'settlement status/model present'],
 [/config\/financial-domain-map\.json/.test(cfg.sourceEvidence.map(x=>x.path).join('\n')),'source financial domain map is linked'],
];for(const [ok,msg] of tests){if(ok)pass(msg);else fail(msg)}
if(!Array.isArray(cfg.unresolvedBusinessDecisions)||cfg.unresolvedBusinessDecisions.length<5)fail('finance policy decisions were silently lost');else pass(`business/accounting decisions remain open (${cfg.unresolvedBusinessDecisions.length})`);
if((cfg.finalRequiredTests||[]).length<10)fail('final finance test matrix incomplete');else pass(`final-phase financial tests recorded (${cfg.finalRequiredTests.length})`);
if(baseline.financialCorrectnessContract?.path!=='config/financial-correctness-contract.json')fail('project baseline does not reference financial contract');else pass('baseline links financial contract');
if(errors.length){console.error('\nFINANCIAL CORRECTNESS CONTRACT: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}console.log('\nFINANCIAL CORRECTNESS CONTRACT: PASS');for(const p of passes)console.log(p);console.log('Static code/schema presence only; no payment provider, finance or DB tests run.');
