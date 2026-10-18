#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
let map,policy,req,inventory;
try{map=read('config/authorization-coverage-map.json');policy=read('config/authorization-boundaries.json');req=read('config/security-requirement-register.json');inventory=read('config/source-inventory.json');pass('authorization coverage and referenced policy parse');}catch(e){console.error(`FAIL authorization map parse: ${e.message}`);process.exit(1);}
if(map.status!=='STATIC_SCOPE_COVERAGE_MAPPED_RUNTIME_TEST_DEFERRED')fail('map must not claim runtime-tested status');else pass('authorization map status accurately defers runtime testing');
if(map.policy?.serverSideEnforcementRequired!==true||map.policy?.uiVisibilityIsNotSecurityBoundary!==true||map.policy?.unknownModelOrScope!=='FAIL_CLOSED'||map.policy?.directClientDatabaseAccess!==false)fail('global authorization policy missing');else pass('server-side, fail-closed and no-direct-DB rules present');
if(map.policy?.physicalTests!=='DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED')fail('physical test deferral missing');else pass('physical access-control tests deferred');
const roles=new Set((map.actorScopeMatrix||[]).map(x=>x.actor));for(const r of ['SUPER_ADMIN','ADMIN_GLOBAL','ADMIN_STATE','ADMIN_CITY','CUSTOMER','DRIVER','GATEWAY'])if(!roles.has(r))fail(`missing actor-scope row ${r}`);else pass(`actor/scope coverage present for ${r}`);
const sourceMounts=policy.protectedMounts||[];const mapped=map.protectedMountCoverage||[];if(mapped.length!==sourceMounts.length)fail(`protected mount coverage mismatch: ${mapped.length} vs ${sourceMounts.length}`);else pass(`all ${mapped.length} protected API mounts represented`);
const byKey=new Map(mapped.map(x=>[`${x.path}|${x.router}`,x]));
for(const m of sourceMounts){const c=byKey.get(`${m.path}|${m.router}`);if(!c){fail(`missing mount mapping: ${m.path}`);continue;}if(JSON.stringify(c.requiredMiddleware)!==JSON.stringify(m.requiredMiddleware))fail(`middleware mismatch: ${m.path}`);if(c.adminNetworkRequired!==m.path.startsWith('/api/v1/admin'))fail(`admin network flag mismatch: ${m.path}`);if(!fs.existsSync(path.join(root,c.sourceEvidence)))fail(`source evidence missing for ${m.path}: ${c.sourceEvidence}`);if(c.staticStatus!=='MAPPED_NOT_RUNTIME_TESTED')fail(`mount status falsely completed: ${m.path}`);}
if((map.operationCoverage||[]).length<8)fail('CRUD/export/bulk/realtime operation coverage incomplete');else pass(`${map.operationCoverage.length} operation/bypass dimensions listed`);
if((map.protectedObjectClasses||[]).length<8)fail('protected object classes incomplete');else pass(`${map.protectedObjectClasses.length} protected object classes listed`);
const rids=new Set((req.requirements||[]).map(x=>x.id));for(const id of map.requirements||[])if(!rids.has(id))fail(`unknown security requirement link ${id}`);else pass(`linked requirement exists: ${id}`);
if(!map.requiredTestDimensions?.some(x=>x.includes('out-of-scope state/city'))||!map.requiredTestDimensions?.some(x=>x.includes('export/download'))||!map.requiredTestDimensions?.some(x=>x.includes('realtime')))fail('negative/bypass tests missing');else pass('scope, export and realtime bypass tests prepared for deferred physical testing');
if(errors.length){console.error('\nAUTHORIZATION COVERAGE CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log('AUTHORIZATION COVERAGE CHECK: PASS');for(const p of passes)console.log(p);console.log('Note: this checks traceability only; it does not prove runtime authorization correctness.');
