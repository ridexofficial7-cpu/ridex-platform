#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/package1-foundation-signoff.json'));pass('Package 1 sign-off record parses')}catch(e){console.error(`FAIL Package 1 handoff: ${e.message}`);process.exit(1)}
const expected='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');const seen=(cfg.steps||[]).map(s=>s.step);
if(seen.length!==26||expected.some((s,i)=>seen[i]!==s))fail('Package 1 must record all A-Z steps exactly once and in order');else pass('all Package 1 A-Z steps recorded in order');
const unique=new Set(seen);if(unique.size!==26)fail('duplicate Package 1 step IDs');
const skipped=(cfg.steps||[]).filter(s=>s.status.startsWith('SKIPPED')).map(s=>s.step);
if(JSON.stringify(skipped)!==JSON.stringify(['E','I','K','N','P']))fail(`skipped-step list mismatch: ${skipped.join(',')}`);else pass('blocked steps E/I/K/N/P are explicitly skipped for final review');
if(JSON.stringify(cfg.skippedStepIDs)!==JSON.stringify(skipped))fail('skippedStepIDs does not match step status');
if(cfg.completedStaticSteps!==21||cfg.skippedSteps!==5)fail('Package 1 static completion/skipped counts mismatch');else pass('21 static steps done and 5 steps deferred/skipped are counted');
if(cfg.runtimePhysicalTests!=='DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED')fail('physical tests must remain deferred until all four package implementations');
if(cfg.status!=='STATIC_FOUNDATION_HANDOFF_COMPLETE_WITH_SKIPS_NOT_PRODUCTION_APPROVED')fail('Package 1 must not be marked production approved');else pass('Package 1 handoff explicitly is not production approval');
if(!cfg.finalReviewItems||cfg.finalReviewItems.length<8)fail('final review register is incomplete');
const dependencyReview=(cfg.finalReviewItems||[]).find(x=>x.id==='FINAL-001');if(!dependencyReview||dependencyReview.status!=='SKIPPED_PER_USER_INSTRUCTION'||!dependencyReview.reason.includes('Do not retry npm install'))fail('dependency/native verification must remain explicitly skipped per user instruction without retry');else pass('dependency installation and Android SDK verification remain skipped per user instruction');
for(const f of ['config/project-baseline.json','config/source-inventory.json','config/connection-register.json','config/run-recovery-baseline.json','config/observability-audit-contract.json'])if(!fs.existsSync(path.join(root,f)))fail(`support contract missing ${f}`);
const baseline=JSON.parse(read('config/project-baseline.json'));
if(!baseline.package1FoundationSignoff||baseline.package1FoundationSignoff.path!=='config/package1-foundation-signoff.json')fail('project baseline lacks Package 1 handoff reference');
if(!read('package.json').includes('verify:package1-signoff'))fail('Package 1 sign-off validator command missing');
if(errors.length){console.error('\nPACKAGE 1 FOUNDATION HANDOFF CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nPACKAGE 1 FOUNDATION HANDOFF CHECK: PASS');for(const p of passes)console.log(p);console.log(`A-Z recorded: 26; static steps done: 21; skipped for final review: 5; production approval: NO.`);
