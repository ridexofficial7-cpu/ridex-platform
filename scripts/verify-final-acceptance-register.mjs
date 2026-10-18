#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[]; const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m); const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let c,b,inv,req,controlMap;
try{c=JSON.parse(read('config/final-acceptance-test-register.json'));b=JSON.parse(read('config/project-baseline.json'));inv=JSON.parse(read('config/source-inventory.json'));req=JSON.parse(read('config/security-requirement-register.json'));controlMap=JSON.parse(read('config/security-control-test-map.json'));pass('acceptance register and linked metadata parse')}catch(e){console.error(`FAIL acceptance register metadata: ${e.message}`);process.exit(1)}
if(c.project!=='RideX-Super_Admin_Controle')fail('wrong project identity');else pass('canonical project identity recorded');
if(c.status!=='STATIC_ACCEPTANCE_EXECUTION_REGISTER_PREPARED_CASE_DETAIL_RECONCILIATION_PENDING_ALL_TESTS_DEFERRED')fail('status must not imply acceptance tests executed');else pass('static-only / not-run status is explicit');
if(c.baselineSummary?.acceptanceTestCount!==24||c.cases?.length!==24)fail('expected exactly 24 baseline acceptance IDs');else pass('24 baseline acceptance IDs are reserved');
const ids=(c.cases||[]).map(x=>x.id);if(new Set(ids).size!==24||ids[0]!=='T-001'||ids[23]!=='T-024')fail('test IDs must be unique and span T-001 through T-024');else pass('acceptance test IDs are unique and complete');
if(c.baselineSummary?.priorityDistribution?.P0!==19||c.baselineSummary?.priorityDistribution?.P1!==5)fail('baseline aggregate priorities must remain 19 P0 / 5 P1');else pass('baseline aggregate priority distribution preserved');
if(c.caseDetailPolicy?.titlesAndExpectedResultsInvented!==false||c.caseDetailPolicy?.perIdPriorityAssignedWithoutSourceRow!==false)fail('per-case metadata must not be invented');else pass('per-case title/expected-result/priority is not guessed');
if(c.caseDetailPolicy?.status!=='PENDING_ROW_LEVEL_RECONCILIATION_TO_BASELINE_ACCEPTANCE_MATRIX')fail('case detail reconciliation status missing');else pass('exact row-level case details remain pending reconciliation');
for(const x of c.cases||[]){if(x.priority!==null||x.title!==null||x.expectedResult!==null)fail(`${x.id} contains unverified title/priority/expected result`);if(x.detailStatus!=='PENDING_BASELINE_ROW_RECONCILIATION'||x.executionStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH'||x.result!=='NOT_RUN')fail(`${x.id} must remain pending and NOT_RUN`)}
if(!errors.some(x=>/contains unverified title|must remain pending/.test(x)))pass('all 24 cases remain NOT_RUN and pending row-level reconciliation');
if(c.testStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH'||c.executionEvidenceSchema?.physicalExecutionAllowedBeforeAllFourPackagesComplete!==false)fail('physical execution must remain deferred');else pass('physical acceptance tests remain deferred until four package implementations finish');
if(!b.finalAcceptanceTestRegister||b.finalAcceptanceTestRegister.path!=='config/final-acceptance-test-register.json'||b.finalAcceptanceTestRegister.validator!=='scripts/verify-final-acceptance-register.mjs')fail('project baseline link missing');else pass('project baseline links acceptance register');
if(!inv.finalAcceptanceTestRegister||inv.finalAcceptanceTestRegister.path!=='config/final-acceptance-test-register.json')fail('source inventory link missing');else pass('source inventory links acceptance register');
if(!req.finalAcceptanceTestRegister||req.finalAcceptanceTestRegister.path!=='config/final-acceptance-test-register.json')fail('security requirement register link missing');else pass('security requirement register links acceptance register');
if(!controlMap.finalAcceptanceTestRegister||controlMap.finalAcceptanceTestRegister.path!=='config/final-acceptance-test-register.json')fail('security control map link missing');else pass('security control map links acceptance register');
const pkg=JSON.parse(read('package.json'));if(pkg.scripts?.['verify:acceptance-register']!=='node scripts/verify-final-acceptance-register.mjs')fail('npm validator command missing');else pass('dedicated static acceptance-register validation command exists');
if(errors.length){console.error('\nFINAL ACCEPTANCE REGISTER CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}console.log('\nFINAL ACCEPTANCE REGISTER CHECK: PASS');for(const p of passes)console.log(p);console.log('Cases registered: 24; cases executed: 0; exact per-case priority/details reconciliation pending.');
