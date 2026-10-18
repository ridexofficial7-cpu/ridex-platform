#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg,req;try{cfg=JSON.parse(read('config/security-control-test-map.json'));req=JSON.parse(read('config/security-requirement-register.json'));pass('security control map and source register parse')}catch(e){console.error(`FAIL control map: ${e.message}`);process.exit(1)}
const controls=cfg.controls||[], requirementIds=new Set((req.requirements||[]).map(r=>r.id)),seen=new Set(),byReq=new Map();
if(controls.length!==134)fail(`expected 134 controls, got ${controls.length}`);else pass('134 control scenarios are present');
for(const t of controls){
 if(!t.controlId||seen.has(t.controlId))fail(`missing/duplicate control ID ${t.controlId}`);seen.add(t.controlId);
 if(!requirementIds.has(t.requirementId))fail(`${t.controlId} maps to unknown requirement ${t.requirementId}`);
 byReq.set(t.requirementId,(byReq.get(t.requirementId)||[]).concat(t));
 for(const f of ['area','priority','kind','scenario','expectedResult','evidenceRequired','status'])if(!t[f])fail(`${t.controlId} missing ${f}`);
 if(!['POSITIVE','NEGATIVE','FAILURE','RECOVERY','AUDIT','CONFIGURATION','STATIC_SCAN','INTEGRATION','PRIVACY','PERFORMANCE','RECONCILIATION','DOCUMENTATION'].includes(t.kind))fail(`${t.controlId} invalid kind ${t.kind}`);
 if(t.status!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED')fail(`${t.controlId} must remain not-run/deferred`);
 for(const p of t.sourceEvidence||[])if(!fs.existsSync(path.join(root,p)))fail(`${t.controlId} source evidence missing ${p}`);
}
if(byReq.size!==67)fail(`only ${byReq.size}/67 requirements have controls`);else pass('all 67 requirements have control coverage');
for(const r of req.requirements||[]){const set=byReq.get(r.id)||[];if(set.length<2)fail(`${r.id} has fewer than two control scenarios`);if(set.some(t=>t.priority!==r.priority||t.area!==r.area))fail(`${r.id} control priority/area mismatch`);if(r.priority==='P0'&&!set.some(t=>['NEGATIVE','FAILURE','RECOVERY'].includes(t.kind)))fail(`${r.id} P0 lacks a negative/failure/recovery case`)}
if(cfg.summary?.requirementCount!==67||cfg.summary?.controlCount!==134||cfg.summary?.controlsExecuted!==0)fail('control-map summary is inconsistent or implies tests ran');
if(!cfg.pendingItems?.some(x=>x.includes('final physical-test phase')))fail('final-phase test deferral missing');
const baseline=JSON.parse(read('config/project-baseline.json'));if(baseline.securityControlTestMap?.path!=='config/security-control-test-map.json')fail('baseline does not reference testable control map');
if(errors.length){console.error('\nSECURITY CONTROL MAP CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nSECURITY CONTROL MAP CHECK: PASS');for(const p of passes)console.log(p);console.log(`Requirements ${byReq.size}; testable controls ${controls.length}; executed controls 0; physical tests deferred.`);
