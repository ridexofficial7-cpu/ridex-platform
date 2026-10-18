#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const passes = [];
const pass = (message) => passes.push(`PASS ${message}`);
const fail = (message) => errors.push(message);
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
let model, boundaries, ownership, auth, connections, requirements, controlMap;
try {
  model = read('config/threat-model.json');
  boundaries = read('config/system-boundaries.json');
  ownership = read('config/data-ownership.json');
  auth = read('config/authorization-boundaries.json');
  connections = read('config/connection-register.json');
  requirements = read('config/security-requirement-register.json');
  controlMap = read('config/security-control-test-map.json');
  pass('threat model and its referenced baseline registers parse');
} catch (error) {
  console.error(`FAIL threat-model register parse: ${error.message}`);
  process.exit(1);
}

if (model.schemaVersion !== 1 || model.project !== 'RideX-Super_Admin_Controle') fail('unsupported threat-model schema/project');
else pass('project and schema version are canonical');
if (model.status !== 'DESIGN_MAPPED_NOT_TESTED') fail('threat model must remain design-mapped/not-tested until physical tests');
else pass('threat model is not falsely marked tested/approved');
if (model.method?.physicalTests !== 'DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED') fail('physical-test deferral policy is missing');
else pass('physical tests explicitly deferred until all four packages complete');

const boundaryIds = new Set((boundaries.components || []).map(x => x.id));
const trustIds = (model.trustZones || []).map(x => x.id);
if (new Set(trustIds).size !== trustIds.length) fail('duplicate trust-zone IDs');
if (boundaryIds.size !== trustIds.length || [...boundaryIds].some(id => !trustIds.includes(id))) fail('trust zones must map all system boundary components exactly');
else pass(`all ${trustIds.length} trust zones map to system boundaries`);

const reqIds = new Set((requirements.requirements || []).map(x => x.id));
const controlIds = new Set((controlMap.controls || []).map(x => x.controlId));
const archConnectionIds = new Set((boundaries.connections || []).map(x => x.id));
const connectionIds = new Set((connections.connections || []).map(x => x.id));
const knownExternalAssets = new Set(['private-storage', 'local-operator', 'local-build-to-artifacts', 'build-runner', 'external-providers', 'business-database']);
const knownSourceFiles = ['config/system-boundaries.json', 'config/data-ownership.json', 'config/authorization-boundaries.json', 'config/connection-register.json', 'config/security-requirement-register.json', 'config/security-control-test-map.json'];
for (const rel of knownSourceFiles) if (!fs.existsSync(path.join(root, rel))) fail(`referenced baseline source missing: ${rel}`);
else pass(`baseline source present: ${rel}`);

const threats = model.threats || [];
const threatIds = new Set();
for (const [index, t] of threats.entries()) {
  const label = t.id || `threat[${index}]`;
  if (!t.id || threatIds.has(t.id)) fail(`${label}: missing or duplicate threat ID`);
  else threatIds.add(t.id);
  for (const field of ['title', 'attackOrFailureScenario', 'requiredMitigations', 'owner', 'priority']) {
    if (!String(t[field] || '').trim()) fail(`${label}: required field ${field} is blank`);
  }
  if (!['P0', 'P1', 'P2'].includes(t.priority)) fail(`${label}: invalid priority ${t.priority}`);
  if (t.status !== 'DESIGN_MAPPED_NOT_TESTED') fail(`${label}: status must remain DESIGN_MAPPED_NOT_TESTED`);
  if (!Array.isArray(t.linkedRequirements) || t.linkedRequirements.length === 0) fail(`${label}: no linked requirements`);
  for (const id of t.linkedRequirements || []) if (!reqIds.has(id)) fail(`${label}: unknown requirement ${id}`);
  if (!Array.isArray(t.linkedControlCases) || t.linkedControlCases.length === 0) fail(`${label}: no linked security control cases`);
  for (const id of t.linkedControlCases || []) if (!controlIds.has(id)) fail(`${label}: unknown control case ${id}`);
  if (!Array.isArray(t.sourceEvidence) || t.sourceEvidence.length === 0) fail(`${label}: no source evidence paths`);
  for (const rel of t.sourceEvidence || []) {
    if (!fs.existsSync(path.join(root, rel))) fail(`${label}: source evidence path not found: ${rel}`);
  }
  for (const id of t.architectureConnectionRefs || []) if (!archConnectionIds.has(id)) fail(`${label}: unknown architecture connection ${id}`);
  for (const id of t.connectionRegisterRefs || []) if (!connectionIds.has(id)) fail(`${label}: unknown master connection ${id}`);
  for (const alias of t.unmatchedConnectionAliases || []) fail(`${label}: unaligned connection alias ${alias}`);
  for (const id of t.assetsAndComponents || []) if (!boundaryIds.has(id) && !knownExternalAssets.has(id)) fail(`${label}: unknown component/asset ${id}`);
}
if (threats.length !== 18) fail(`expected 18 threats, found ${threats.length}`);
if (threatIds.size === threats.length) pass(`unique threat register: ${threats.length} scenarios`);
if (threats.filter(t => t.priority === 'P0').length < 15) fail('expected broad P0 coverage of critical threats');
else pass(`critical threat coverage recorded: ${threats.filter(t => t.priority === 'P0').length} P0 scenarios`);
if (threats.some(t => t.id === 'THR-005' && t.linkedRequirements.includes('REQ-MOB-007') && t.attackOrFailureScenario.toLowerCase().includes('private key'))) pass('Super Admin private-key distribution risk is explicitly mapped');
else fail('Super Admin private-key risk missing');
if (threats.some(t => t.id === 'THR-013' && t.requiredMitigations.toLowerCase().includes('authoritative provider storage'))) pass('Provider storage ambiguity is explicitly mapped');
else fail('Provider storage ambiguity missing');
if (model.openReviews?.length < 5) fail('open final-review items are incomplete');
else pass(`${model.openReviews.length} unresolved architecture/security decisions retained`);
if (!(model.globalControls || []).some(c => c.id === 'TM-GC-04' && c.status === 'DEFERRED')) fail('physical test deferral control missing');
else pass('physical test plan remains deferred rather than fabricated as complete');
if (errors.length) {
  console.error('\nTHREAT MODEL CHECK: FAIL');
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('THREAT MODEL CHECK: PASS');
for (const p of passes) console.log(p);
console.log('Note: this is a traceability/static mapping check, not a penetration test or security approval.');
