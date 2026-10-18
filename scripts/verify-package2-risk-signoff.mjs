#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];
const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);
function load(rel){try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel} could not be parsed: ${e.message}`);return null;}}
const baseline=load('config/project-baseline.json');
const gate=load('config/pre-live-release-gate.json');
const risks=load('config/security-risk-exception-register.json');
const signoff=load('config/package2-security-signoff.json');
const inventory=load('config/source-inventory.json');
const reqs=load('config/security-requirement-register.json');
const controls=load('config/security-control-test-map.json');
const pkg=load('package.json');
function req(v,m){if(v)pass(m);else fail(m);}
req(Boolean(baseline&&gate&&risks&&signoff&&inventory&&reqs&&controls&&pkg),'all source-of-truth risk/signoff files parse');
if(baseline&&gate&&risks&&signoff&&inventory&&reqs&&controls&&pkg){
 const expected=Array.from({length:14},(_,i)=>`RX-DEC-${String(i+41).padStart(3,'0')}`);
 const decisionMap=new Map((baseline.decisions||[]).map(d=>[d.id,d]));
 req(expected.every(id=>decisionMap.has(id)),'all 14 release decisions exist in project baseline');
 req(expected.every(id=>decisionMap.get(id)?.status==='VERIFY'),'all 14 release decisions remain VERIFY');
 req(JSON.stringify(expected)===JSON.stringify(gate.blockingDecisions.map(d=>d.id)),'pre-LIVE gate decision IDs use canonical padded IDs');
 req(risks.status==='OPEN_RISK_EXCEPTION_REGISTER_NO_RISKS_ACCEPTED','risk register status is open and accepts no risks');
 req(risks.riskPolicy?.acceptedRiskAllowedInThisRegister===false,'risk policy prohibits accepted risk in this handoff');
 req(risks.riskPolicy?.mandatoryP0MayBeWaived===false,'mandatory P0 controls cannot be waived');
 const ids=new Set();let uniqueness=true, noAccepted=true, allOpen=true, p0NoWaivers=true;
 for(const r of risks.risks||[]){if(!r.riskId||ids.has(r.riskId))uniqueness=false;ids.add(r.riskId);if(r.acceptedRisk!==false)noAccepted=false;if(!['OPEN','VERIFY'].includes(r.status))allOpen=false;if(r.priority==='P0'&&(r.waiverPolicy||'').toLowerCase().includes('may waive'))p0NoWaivers=false;if(!r.owner||!Array.isArray(r.closureEvidenceRequired)||!r.closureEvidenceRequired.length)allOpen=false;}
 req(uniqueness,'risk IDs unique');
 req(risks.risks.length===risks.summary.openRiskCount,'risk count matches summary');
 req(noAccepted&&risks.summary.acceptedRiskCount===0,'no risk is accepted');
 req(allOpen&&risks.risks.every(r=>['OPEN','VERIFY'].includes(r.status)),'all risks remain open/verify and have owner/closure evidence');
 req(p0NoWaivers,'P0 risk policy contains no waiver');
 req(risks.risks.filter(r=>r.linkedDecisionId).length===14,'all 14 decision risks are represented');
 req(signoff.package==='Package 2 — Smooth & Secure Requirements'&&signoff.totalSteps===26,'Package 2 sign-off covers A–Z');
 req(signoff.steps.length===26&&new Set(signoff.steps.map(s=>s.step)).size===26&&'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').every(c=>signoff.steps.some(s=>s.step===c)),'all A–Z step IDs appear exactly once');
 req(JSON.stringify(signoff.skippedForFinalReview)===JSON.stringify(['F','J']),'only F and J are skipped for final review');
 req(signoff.productionApproval===false&&signoff.releaseBlocked===true,'sign-off is not production approval and remains blocked');
 req(signoff.runtimeVerification==='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH'&&signoff.databaseMigrationVerification==='NOT_RUN'&&signoff.deviceProviderVerification==='NOT_RUN','physical/build/database/device/provider tests remain explicitly NOT_RUN');
 req(gate.releaseApproved===false&&gate.gateItems.length===18&&gate.gateItems.every(x=>x.blocking&&x.status==='NOT_VERIFIED'),'all 18 pre-LIVE gate items remain blocking and unverified');
 req(signoff.riskCount===risks.risks.length&&signoff.acceptedRiskCount===0,'sign-off risk totals match and accepted count is zero');
 req(baseline.baselineRevision>=51&&baseline.securityRiskExceptionRegister?.path==='config/security-risk-exception-register.json'&&baseline.package2SecuritySignoff?.path==='config/package2-security-signoff.json','baseline revision and risk/signoff links are current');
 req(inventory.inventoryRevision>=44&&inventory.securityRiskExceptionRegister?.path==='config/security-risk-exception-register.json'&&inventory.package2SecuritySignoff?.path==='config/package2-security-signoff.json','source inventory revision and links are current');
 req(reqs.registerRevision===25&&reqs.securityRiskExceptionRegister?.path==='config/security-risk-exception-register.json','security requirement register links risk handoff');
 req(controls.mapRevision===17&&controls.package2SecuritySignoff?.physicalTests==='NOT_RUN','control map records deferred test state');
 req(pkg.scripts?.['verify:package2-security-signoff']==='node scripts/verify-package2-risk-signoff.mjs','package command is registered');
 const rootScripts=inventory.components.find(c=>c.id==='rootBuildScripts');
 const actualScripts=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rootScripts?.scripts?.includes('verify-package2-risk-signoff.mjs')&&rootScripts.fileCount===actualScripts.length&&JSON.stringify(rootScripts.scripts.slice().sort())===JSON.stringify(actualScripts),'source inventory lists the sign-off validator and current root script inventory');
}
if(errors.length){console.error('PACKAGE 2 RISK/SIGN-OFF CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('PACKAGE 2 RISK/SIGN-OFF CHECK: PASS');for(const c of checks)console.log(c);console.log(`Open risks: ${risks.risks.length}; accepted: 0; releaseApproved: false; physical tests: NOT_RUN.`);

