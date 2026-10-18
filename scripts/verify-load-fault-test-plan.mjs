#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[]; const passes=[];
const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let plan,baseline,sourceInventory,requirements,controlMap;
try {
 plan=JSON.parse(read('config/load-fault-test-plan.json'));
 baseline=JSON.parse(read('config/project-baseline.json'));
 sourceInventory=JSON.parse(read('config/source-inventory.json'));
 requirements=JSON.parse(read('config/security-requirement-register.json'));
 controlMap=JSON.parse(read('config/security-control-test-map.json'));
 pass('load/fault plan and linked registers parse');
} catch(e) { console.error(`FAIL load/fault plan metadata: ${e.message}`); process.exit(1); }
if(plan.project!=='RideX-Super_Admin_Controle') fail('wrong project identity'); else pass('project identity is canonical');
if(plan.status!=='STATIC_LOAD_FAULT_PLAN_DEFINED_TARGETS_PENDING_PHYSICAL_TESTS_DEFERRED') fail('plan status must distinguish static planning from execution'); else pass('plan clearly distinguishes planning from physical execution');
if(plan.testStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH') fail('physical load/fault test status must remain deferred'); else pass('physical load/fault tests remain not run until all package implementations finish');
if(plan.safetyBoundary?.productionTrafficAllowed!==false||plan.safetyBoundary?.liveDatabaseAllowed!==false||plan.safetyBoundary?.livePaymentOrMessagingProvidersAllowed!==false) fail('production/live systems must be prohibited'); else pass('live systems are prohibited from the load/fault test plan');
if(plan.safetyBoundary?.fixtureDataOnly!==true||plan.safetyBoundary?.destructiveFaultInjectionAllowedBeforeFinalPhase!==false) fail('fixture-only and final-phase safeguards missing'); else pass('fixture-only and final-phase safeguards are explicit');
if(plan.workloadProfile?.status!=='NOT_APPROVED'||plan.workloadProfile?.decisionId!=='RX-DEC-048'||plan.workloadProfile?.noValuesInvented!==true) fail('workload profile must remain unapproved without invented targets'); else pass('workload profile values are not invented and RX-DEC-048 is identified');
if(plan.performanceTargets?.status!=='NOT_APPROVED'||plan.performanceTargets?.decisionId!=='RX-DEC-049'||plan.performanceTargets?.noValuesInvented!==true) fail('performance SLO values must remain unapproved without invented targets'); else pass('performance SLO values are not invented and RX-DEC-049 is identified');
const ids=(plan.scenarios||[]).map(s=>s.id);
if(ids.length!==10||new Set(ids).size!==ids.length) fail('expected 10 unique LF scenarios'); else pass('10 unique load/fault scenarios are registered');
const requiredCats=['API_LOAD','DATABASE_SLOW_OR_UNAVAILABLE','EXTERNAL_PROVIDER_TIMEOUT_OR_OUTAGE','CLIENT_NETWORK_DISCONNECT','REALTIME_BACKPRESSURE_AND_REPLAY','ASYNC_QUEUE_BURST_AND_POISON_ITEMS','PROCESS_CRASH_AND_RESTART','CONCURRENT_BOOKING_AND_FINANCIAL_WRITES','DATABASE_CONTENTION_AND_DEADLOCK','RESOURCE_SATURATION_AND_GRACEFUL_DEGRADATION'];
for(const c of requiredCats) { if(!(plan.scenarios||[]).some(s=>s.category===c)) fail(`missing category ${c}`); }
if(requiredCats.every(c=>(plan.scenarios||[]).some(s=>s.category===c))) pass('API/DB/provider/network/realtime/queue/restart/financial/contention/resource fault classes all covered');
for(const s of plan.scenarios||[]) {
 if(!s.id||!s.component||!s.injection||!s.expectedSafeBehavior||!Array.isArray(s.metrics)||!s.metrics.length) fail(`scenario ${s.id||'<missing>'} lacks required fields`);
 if(s.physicalExecutionStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH') fail(`${s.id} must remain unexecuted`);
}
if(!errors.some(e=>e.startsWith('scenario ')) && (plan.scenarios||[]).every(s=>s.physicalExecutionStatus==='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH')) pass('all scenarios include injection, expected safety, metrics and remain NOT_RUN');
if(!(plan.metricSchema||[]).includes('testRunId')||!(plan.metricSchema||[]).includes('buildRevision')||!(plan.metricSchema||[]).includes('environmentId')) fail('measurement schema must identify build/run/environment'); else pass('metric schema includes build, run and environment identifiers');
if(!(plan.metricSchema||[]).includes('p95Ms')||!(plan.metricSchema||[]).includes('p99Ms')||!(plan.metricSchema||[]).includes('recoveryDurationMs')||!(plan.metricSchema||[]).includes('invariantCheckResults')) fail('latency, recovery and invariant measures missing'); else pass('metrics include latency percentiles, recovery time and invariants');
for(const id of ['RX-DEC-048','RX-DEC-049']) { const d=(baseline.decisions||[]).find(x=>x.id===id); if(!d||d.status!=='VERIFY') fail(`${id} must remain VERIFY in project baseline`); else pass(`${id} remains VERIFY in project baseline`); }
if(!baseline.loadFaultTestPlan||baseline.loadFaultTestPlan.path!=='config/load-fault-test-plan.json'||baseline.loadFaultTestPlan.validator!=='scripts/verify-load-fault-test-plan.mjs') fail('project baseline does not link load/fault plan and validator'); else pass('project baseline links load/fault plan and validator');
if(baseline.loadFaultTestPlan?.status!==plan.status) fail('baseline plan status differs from contract'); else pass('baseline status matches plan status');
if(!sourceInventory.loadFaultTestPlan||sourceInventory.loadFaultTestPlan.path!=='config/load-fault-test-plan.json') fail('source inventory does not link load/fault plan'); else pass('source inventory links load/fault plan');
const req=(requirements.requirements||[]).find(r=>r.id==='REQ-QA-016');
if(!req) fail('REQ-QA-016 missing');
else {
 if(!(req.sourceEvidence||[]).includes('config/load-fault-test-plan.json')) fail('REQ-QA-016 must link the new plan'); else pass('REQ-QA-016 links the load/fault plan');
 if(req.implementationStatus!=='UNVERIFIED') fail('REQ-QA-016 must remain UNVERIFIED until physical evidence'); else pass('REQ-QA-016 remains UNVERIFIED pending physical evidence');
}
const ctl=(controlMap.controls||[]).filter(c=>c.requirementId==='REQ-QA-016');
if(ctl.length<2) fail('REQ-QA-016 should keep its positive and failure controls');
else if(ctl.some(c=>!(c.sourceEvidence||[]).includes('config/load-fault-test-plan.json')||c.status!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED')) fail('REQ-QA-016 control scenarios must link plan and remain NOT_RUN');
else pass('REQ-QA-016 positive/failure controls link plan and remain NOT_RUN');
const pkg=JSON.parse(read('package.json'));
if(pkg.scripts?.['verify:load-fault-plan']!=='node scripts/verify-load-fault-test-plan.mjs') fail('npm verify:load-fault-plan script missing'); else pass('dedicated npm validation command exists');
if(errors.length) { console.error('\nLOAD/FAULT PLAN CHECK: FAIL'); for(const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
console.log('\nLOAD/FAULT PLAN CHECK: PASS'); for(const p of passes) console.log(p);
console.log(`Scenarios: ${plan.scenarios.length}; executed: 0; workload/SLO decisions pending. Static planning only.`);
