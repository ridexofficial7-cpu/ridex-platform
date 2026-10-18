#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
let map,inventory,requirements;
try{map=read('config/input-validation-coverage-map.json');inventory=read('config/source-inventory.json');requirements=read('config/security-requirement-register.json');pass('input validation map and source registers parse');}catch(e){console.error(`FAIL parse: ${e.message}`);process.exit(1);}
if(map.status!=='STATIC_INPUT_VALIDATION_COVERAGE_MAPPED_RUNTIME_NOT_TESTED')fail('must not claim runtime validation tests');
if(map.policy?.physicalTests!=='DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED')fail('physical-test deferral missing');
if(map.policy?.serverAuthoritativeValues?.length<5||map.policy?.inputValidationIsNotAuthorization!==true)fail('authoritative value/authorization distinction missing');else pass('validation and authorization boundaries remain distinct');
const backend=inventory.components.find(c=>c.id==='backend');const modules=new Set(backend?.routeModules||[]);const rows=map.routes||[];if(rows.length!==backend?.routeModuleCount||map.routeModuleCount!==backend?.routeModuleCount)fail('route coverage count differs from Backend inventory');else pass(`all ${rows.length} Backend router modules are mapped`);
const seen=new Set();for(const r of rows){if(seen.has(r.module))fail(`duplicate route module ${r.module}`);seen.add(r.module);if(!modules.has(r.module))fail(`unknown route module ${r.module}`);if(!fs.existsSync(path.join(root,r.source)))fail(`source path missing ${r.source}`);if(!Array.isArray(r.requiredChecks)||r.requiredChecks.length<3)fail(`insufficient required checks for ${r.module}`);if(r.status!=='STATIC_COVERAGE_MAP_RUNTIME_NOT_TESTED')fail(`route module falsely marked tested ${r.module}`);if(!r.knownGap)fail(`known-gap statement missing for ${r.module}`);}
for(const surface of ['Customer Mobile','Driver Mobile','Admin Mobile','Admin Web','Super Admin Control','Android Gateway','Public Website'])if(!(map.clientInputSurfaces||[]).some(x=>x.surface===surface))fail(`missing input surface ${surface}`);else pass(`input surface mapped: ${surface}`);
const reqIds=new Set((requirements.requirements||[]).map(r=>r.id));for(const id of map.linkedSecurityRequirements||[])if(!reqIds.has(id))fail(`unknown security requirement ${id}`);else pass(`linked requirement exists: ${id}`);
if((map.requiredFailureCases||[]).length<8)fail('negative/malformed input cases incomplete');else pass(`${map.requiredFailureCases.length} malformed/failure cases registered`);
if(!map.commonContract?.errors?.includes('Canonical active Backend response envelope is success:boolean')||!map.commonContract?.errors?.includes('ok:false remains read-only client compatibility'))fail('canonical success envelope and read-only legacy compatibility policy must remain visible');else pass('canonical success envelope and read-only legacy compatibility policy are recorded; runtime compatibility remains pending');
if(errors.length){console.error('\nINPUT VALIDATION COVERAGE: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log('INPUT VALIDATION COVERAGE: PASS');for(const p of passes)console.log(p);console.log('Note: source-path/coverage mapping only; no input/security tests have been run.');
