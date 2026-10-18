#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[]; const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let c,b,inv,req,runRecovery;
try{c=JSON.parse(read('config/incident-response-contract.json'));b=JSON.parse(read('config/project-baseline.json'));inv=JSON.parse(read('config/source-inventory.json'));req=JSON.parse(read('config/security-requirement-register.json'));runRecovery=JSON.parse(read('config/run-recovery-baseline.json'));pass('incident contract and linked baseline registers parse')}catch(e){console.error(`FAIL incident-response metadata: ${e.message}`);process.exit(1)}
if(c.project!=='RideX-Super_Admin_Controle')fail('incident contract project identity incorrect');else pass('canonical project identity recorded');
if(c.status!=='STATIC_INCIDENT_RESPONSE_PLAYBOOK_DEFINED_ESCALATION_SLA_PENDING_PHYSICAL_DRILLS_DEFERRED')fail('contract status must distinguish static playbook from tested incident response');else pass('static-only status is explicit');
if(c.decisionPending?.id!=='RX-DEC-052'||c.decisionPending?.status!=='VERIFY'||c.decisionPending?.noValuesInvented!==true)fail('severity/on-call SLA ownership must remain pending RX-DEC-052');else pass('on-call/escalation SLA remains a pending owner decision');
if((c.severityModel||[]).length!==4||(c.roles||[]).length<5)fail('expected four severity levels and at least five incident roles');else pass('severity levels and incident roles defined');
if((c.responsePhases||[]).map(x=>x.id).join(',')!=='DETECT,TRIAGE,CONTAIN,PRESERVE_EVIDENCE,ERADICATE_AND_RECOVER,VALIDATE,COMMUNICATE,POST_INCIDENT')fail('incident lifecycle phases incomplete or out of expected order');else pass('incident lifecycle phases are ordered');
const ids=(c.playbooks||[]).map(x=>x.id);if(ids.length!==10||new Set(ids).size!==ids.length)fail('expected ten unique incident playbooks');else pass('ten incident scenarios are registered');
for(const x of c.playbooks||[]) { if(!x.scenario||!x.ownerRoles?.length||!x.immediateActions?.length||!x.evidence?.length)fail(`${x.id} lacks owner/actions/evidence`); if(x.physicalDrillStatus!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGES_COMPLETE')fail(`${x.id} must remain untested`); }
if(!(c.playbooks||[]).some(x=>x.id==='IR-003'&&/payment/i.test(x.scenario))||!(c.playbooks||[]).some(x=>x.id==='IR-008'&&/database/i.test(x.scenario)))fail('financial and database recovery incidents missing');else pass('financial and data-loss scenarios included');
if(c.evidencePolicy?.sensitiveValuesAllowed!==false||c.evidencePolicy?.tokensOtpPasswordsPrivateKeysRawSignedUrlsAllowed!==false||c.evidencePolicy?.personalDataInBroadIncidentChannelsAllowed!==false)fail('sensitive evidence redaction rules missing');else pass('secrets, OTPs, signed URL tokens and broad-channel PII are prohibited');
if(c.physicalDrills?.status!=='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH')fail('incident drills must remain deferred until all four packages complete');else pass('incident drills explicitly deferred');
if(!b.incidentResponseContract||b.incidentResponseContract.path!=='config/incident-response-contract.json'||b.incidentResponseContract.validator!=='scripts/verify-incident-response.mjs')fail('project baseline must link the incident contract');else pass('project baseline links incident contract');
if(!inv.incidentResponseContract||inv.incidentResponseContract.path!=='config/incident-response-contract.json')fail('source inventory must link incident contract');else pass('source inventory links incident contract');
for(const id of ['RX-DEC-052']){const d=(b.decisions||[]).find(x=>x.id===id);if(!d||d.status!=='VERIFY')fail(`${id} must remain VERIFY`);else pass(`${id} remains VERIFY in baseline`)}
if(!req.incidentResponseContract||req.incidentResponseContract.path!=='config/incident-response-contract.json')fail('security requirement register must link incident contract');else pass('security requirement register links incident contract');
for(const id of ['REQ-SEC-004','REQ-SEC-009','REQ-SEC-011','REQ-OPS-011','REQ-OPS-013']){const r=(req.requirements||[]).find(x=>x.id===id);if(!r)fail(`${id} is missing`);else if(!(r.sourceEvidence||[]).includes('config/incident-response-contract.json'))fail(`${id} does not link incident contract`);else if(r.implementationStatus!=='UNVERIFIED')fail(`${id} must remain UNVERIFIED until physical evidence`);else pass(`${id} links contract and remains UNVERIFIED`)}
if(!runRecovery.openItems?.some(x=>x.includes('RX-DEC-052')))fail('run/recovery baseline must list incident response decision');else pass('run/recovery baseline references incident decision dependency');
const pkg=JSON.parse(read('package.json'));if(pkg.scripts?.['verify:incident-response']!=='node scripts/verify-incident-response.mjs')fail('root npm validator command missing');else pass('dedicated root validator command exists');
if(errors.length){console.error('\nINCIDENT RESPONSE CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nINCIDENT RESPONSE CHECK: PASS');for(const p of passes)console.log(p);console.log(`Playbooks: ${(c.playbooks||[]).length}; physical drills run: 0; response-SLA decision pending.`);
