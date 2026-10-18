#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[], passes=[]; const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/connection-register.json'));pass('connection register JSON parses')}catch(e){console.error(`FAIL connection register: ${e.message}`);process.exit(1)}
const ids=new Set();const refs1=new Set(),refs2=new Set();
if(!Array.isArray(cfg.connections)||cfg.connections.length<20)fail('canonical register unexpectedly small');
for(const c of cfg.connections||[]){
 if(!c.id||ids.has(c.id))fail(`missing/duplicate connection id: ${c.id}`);ids.add(c.id);
 for(const f of ['from','to','transport','purpose','owner','authIdentity','dataContract','failureTimeoutRetry','status','priority'])if(!c[f])fail(`${c.id} missing ${f}`);
 if(!Array.isArray(c.sourceEvidence)||!c.sourceEvidence.length)fail(`${c.id} missing source evidence`);
 for(const rel of c.sourceEvidence||[]){if(!fs.existsSync(path.join(root,rel)))fail(`${c.id} source evidence missing: ${rel}`)}
 if(!/^[A-Z]{2,4}-\d{3,4}$/.test(c.id))fail(`connection id format invalid: ${c.id}`);
 for(const r of c.legacyBaselineRefs||[]){if(/^CON-\d{2}$/.test(r))refs1.add(r);else if(/^CON-\d{3}$/.test(r))refs2.add(r);else fail(`${c.id} has unrecognized legacy baseline reference ${r}`)}
}
const expected1=new Set(Array.from({length:14},(_,i)=>`CON-${String(i+1).padStart(2,'0')}`));
const expected2=new Set(Array.from({length:18},(_,i)=>`CON-${String(i+1).padStart(3,'0')}`));
for(const r of expected1)if(!refs1.has(r))fail(`Package 1 baseline ref not mapped: ${r}`);
for(const r of expected2)if(!refs2.has(r))fail(`Package 2 security-matrix ref not mapped: ${r}`);
if(cfg.reconciliation?.package1BaselineConnections!==14||cfg.reconciliation?.package2SecurityChecks!==18)fail('legacy inventory counts do not match the baseline');
if(cfg.reconciliation?.canonicalConnections!==cfg.connections?.length)fail('canonical connection count mismatch');
if(cfg.reconciliation?.localFirstOverride?.includes('future/out-of-scope')!==true)fail('hosted deployment must remain out-of-scope under local-first baseline');
for(const f of cfg.fieldsRequiredPerConnection||[])for(const c of cfg.connections||[])if(!c[f]&&f!=='sourceEvidence')fail(`${c.id} has incomplete mandatory connection field ${f}`);
if(!cfg.pendingFinalChecks?.length)fail('final physical-test items missing');
const serialized=JSON.stringify(cfg);
for(const forbidden of ['BEGIN PRIVATE KEY','PRIVATE KEY-----','sk_live_','rzp_live_','Authorization: Bearer','OTP value'])if(serialized.includes(forbidden))fail(`possible secret/sample value found in register: ${forbidden}`);
const baseline=JSON.parse(read('config/project-baseline.json'));
if(!baseline.connectionRegister||baseline.connectionRegister.path!=='config/connection-register.json')fail('project baseline does not reference connection register');
if(errors.length){console.error('\nCONNECTION REGISTER CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nCONNECTION REGISTER CHECK: PASS');for(const p of passes)console.log(p);console.log(`Canonical connections: ${cfg.connections.length}; Package 1 refs mapped: ${refs1.size}/14; Package 2 refs mapped: ${refs2.size}/18.`);console.log('Physical connectivity and authorization tests remain deferred.');
