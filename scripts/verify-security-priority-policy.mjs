#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let policy,req;try{policy=JSON.parse(read('config/security-priority-policy.json'));req=JSON.parse(read('config/security-requirement-register.json'));pass('security priority policy and requirements register parse')}catch(e){console.error(`FAIL priority policy: ${e.message}`);process.exit(1)}
const levels=new Map((policy.priorityLevels||[]).map(x=>[x.level,x]));
for(const level of ['P0','P1','P2'])if(!levels.has(level))fail(`priority level missing ${level}`);else pass(`${level} semantics defined`);
if(levels.get('P0')?.releaseRule?.toLowerCase().includes('before enabling')!==true)fail('P0 release gate is not explicit');
if(policy.approvalsAndEvidence?.mandatoryP0WaiverAllowed!==false)fail('mandatory P0 waiver must be explicitly disallowed');else pass('mandatory P0 cannot be waived by risk acceptance');
for(const required of ['P0_IF_ENABLED','P0_BLOCKING','P1_RELEASE_TARGETED'])if(!(policy.conditionalPriorityRules||[]).some(x=>x.rule===required))fail(`conditional priority rule missing ${required}`);
if(!policy.separationRules?.some(x=>x.includes('UI screen P0/P1/P2')))fail('security priority vs screen priority separation missing');
if(!policy.separationRules?.some(x=>x.includes('Skipped for final review')))fail('skip status semantics missing');
const expectedFields=['riskId','requirementId','impact','owner','rationale','compensatingControls','approvalAuthority','approvedAt','expiresAt','reviewDate','evidenceReference'];
for(const f of expectedFields)if(!policy.approvalsAndEvidence?.requiredRiskFields?.includes(f))fail(`risk approval field missing ${f}`);
const p0=req.requirements.filter(r=>r.priority==='P0').length,p1=req.requirements.filter(r=>r.priority==='P1').length;
if(p0!==43||p1!==24)fail('security requirement priorities disagree with the approved baseline counts');else pass('P0/P1 counts match 43/24 requirements');
if(req.priorityPolicy!=='config/security-priority-policy.json')fail('requirements register does not link priority policy');
if(policy.physicalTestPolicy!=='DEFERRED_UNTIL_ALL_FOUR_PACKAGE_A_TO_Z_IMPLEMENTATIONS_COMPLETE')fail('physical-test deferral policy mismatch');
if(policy.approvalsAndEvidence?.policyApprovalStatus!=='PENDING_FORMAL_PROJECT_OWNER_SIGNOFF')fail('policy must not be represented as formally approved');
if(errors.length){console.error('\nSECURITY PRIORITY POLICY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}console.log('\nSECURITY PRIORITY POLICY CHECK: PASS');for(const p of passes)console.log(p);console.log('Policy semantics are recorded; formal sign-off and release gate tests remain pending.');
