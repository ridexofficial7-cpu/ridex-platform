#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/security-requirement-register.json'));pass('security requirement register JSON parses')}catch(e){console.error(`FAIL security requirement register: ${e.message}`);process.exit(1)}
const rows=cfg.requirements||[], ids=rows.map(r=>r.id), unique=new Set(ids);
if(rows.length!==67)fail(`expected 67 requirements, got ${rows.length}`);else pass('67 baseline requirements preserved');
if(unique.size!==ids.length)fail('duplicate requirement IDs');else pass('requirement IDs are unique');
const p0=rows.filter(r=>r.priority==='P0').length,p1=rows.filter(r=>r.priority==='P1').length;
if(p0!==43||p1!==24)fail(`priority distribution mismatch: P0=${p0}, P1=${p1}`);else pass('priority distribution P0=43 / P1=24');
if(rows.some(r=>r.baselineInitialStatus!=='VERIFY'))fail('baseline Initial Status values should remain unchanged');else pass('baseline initial VERIFY statuses preserved');
if(rows.some(r=>r.implementationStatus!=='UNVERIFIED'))fail('requirements must not be marked implemented/tested without evidence');else pass('all implementation statuses remain UNVERIFIED');
if(cfg.summary?.totalRequirements!==67||cfg.summary?.priorityCounts?.P0!==43||cfg.summary?.priorityCounts?.P1!==24||cfg.summary?.passClaims!==0)fail('register summary counts/status inconsistent');
for(const r of rows){
 if(!r.area||!r.priority||!r.requirement||!r.acceptanceCriteria||!r.verificationEvidenceRequested||!r.suggestedOwner)fail(`${r.id} missing baseline fields`);
 if(!Array.isArray(r.sourceEvidence)||!Array.isArray(r.unresolvedEvidencePaths))fail(`${r.id} missing source mapping arrays`);
 for(const p of r.sourceEvidence||[])if(!fs.existsSync(path.join(root,p)))fail(`${r.id} references missing source evidence ${p}`);
 for(const p of r.unresolvedEvidencePaths||[])if(fs.existsSync(path.join(root,p)))fail(`${r.id} unresolved path actually exists; refresh mapping ${p}`);
 if(!r.auditStatus||!r.analysisNote)fail(`${r.id} missing audit classification/note`);
}
const requiredGroups={'REQ-SEC-001':'SEC','REQ-CORE-001':'CORE','REQ-OTP-001':'OTP','REQ-RIDE-001':'RIDE','REQ-ASYNC-001':'ASYNC','REQ-DATA-001':'DATA','REQ-MOB-006':'MOB','REQ-WEB-009':'WEB','REQ-OPS-010':'OPS','REQ-QA-015':'QA'};
for(const [id,area] of Object.entries(requiredGroups)){const r=rows.find(x=>x.id===id);if(!r||r.area!==area)fail(`required category coverage missing/mismatched ${id}`)}
if(!cfg.policy?.some(x=>x.includes('Source paths are evidence candidates only'))||!cfg.openItems?.some(x=>x.includes('24 acceptance tests')))fail('source-only evidence and deferred test policy missing');
if(cfg.status!=='STATIC_REQUIREMENT_REGISTER_AUDITED_IMPLEMENTATION_AND_TEST_STATUS_UNVERIFIED')fail('register status must not imply implementation PASS');
const baseline=JSON.parse(read('config/project-baseline.json'));
if(baseline.securityRequirementRegister?.path!=='config/security-requirement-register.json')fail('project baseline does not reference the security requirements register');
if(errors.length){console.error('\nSECURITY REQUIREMENT REGISTER CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nSECURITY REQUIREMENT REGISTER CHECK: PASS');for(const p of passes)console.log(p);console.log(`P0 ${p0}; P1 ${p1}; all 67 remain UNVERIFIED; this is traceability, not a passing security test suite.`);
