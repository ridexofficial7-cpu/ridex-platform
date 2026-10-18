#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config', 'project-baseline.json');
const errors = [];
const checks = [];
function pass(message) { checks.push(`PASS ${message}`); }
function fail(message) { errors.push(message); }
function requireValue(condition, message) { if (condition) pass(message); else fail(message); }

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  pass('project baseline JSON parses');
} catch (err) {
  console.error(`FAIL unable to read/parse ${path.relative(root, configPath)}: ${err.message}`);
  process.exit(1);
}

requireValue(cfg.schemaVersion === 1, 'schemaVersion is supported');
requireValue(cfg.baselineRevision >= 1, 'baselineRevision is versioned');
requireValue(cfg.project?.id === 'ridex-super-admin-controle', 'project ID is canonical');
requireValue(cfg.project?.rootDirectory === 'D:\\RideX-Super_Admin_Controle', 'root directory matches requested project path');
requireValue(cfg.project?.buildMode === 'fresh-standalone-project', 'fresh standalone project boundary is recorded');
requireValue(cfg.environmentBoundary?.developmentDatabase === 'dedicated-local-postgresql-only', 'local PostgreSQL boundary is explicit');
requireValue(cfg.environmentBoundary?.reuseLegacyDatabase === false, 'legacy database reuse is prohibited');
requireValue(cfg.environmentBoundary?.connectToRemoteDatabaseDuringFoundation === false, 'remote database access during foundation is prohibited');
requireValue(cfg.sourceOfTruth?.businessRules === 'services/backend', 'Backend is identified as business source of truth');
requireValue(cfg.sourceOfTruth?.databaseSchema === 'services/backend/prisma/schema.prisma', 'canonical schema path is identified');

const allowedStatuses = new Set(['DECIDED', 'PROPOSED', 'VERIFY', 'REMAINING']);
const decisionIds = new Set();
requireValue(Array.isArray(cfg.decisions) && cfg.decisions.length >= 10, 'decision register contains project decisions');
for (const [index, d] of (cfg.decisions || []).entries()) {
  if (!d.id || decisionIds.has(d.id)) fail(`decision[${index}] has missing/duplicate ID`);
  else decisionIds.add(d.id);
  if (!allowedStatuses.has(d.status)) fail(`decision ${d.id || index} has invalid status ${d.status}`);
  if (['PROPOSED','VERIFY','REMAINING'].includes(d.status) && !String(d.owner || '').trim()) fail(`unresolved decision ${d.id || index} has no owner`);
  if (!String(d.decision || '').trim()) fail(`decision ${d.id || index} has no decision/question text`);
}
if (decisionIds.size === (cfg.decisions || []).length) pass(`decision IDs are unique (${decisionIds.size})`);
if ((cfg.decisions || []).every(d => allowedStatuses.has(d.status) && (!['PROPOSED','VERIFY','REMAINING'].includes(d.status) || String(d.owner || '').trim()))) pass('all decision statuses valid and unresolved items have an owner');

const componentIds = new Set();
for (const [index, c] of (cfg.components || []).entries()) {
  if (!c.id || componentIds.has(c.id)) fail(`component[${index}] has missing/duplicate ID`);
  else componentIds.add(c.id);
  if (!String(c.status || '').trim()) fail(`component ${c.id || index} has no status`);
  if (c.currentPath) {
    const abs = path.resolve(root, c.currentPath);
    if (!abs.startsWith(root + path.sep)) fail(`component ${c.id} path escapes project root`);
    else if (!fs.existsSync(abs)) fail(`declared current source path missing: ${c.currentPath}`);
  }
}
if (componentIds.size === (cfg.components || []).length) pass(`component IDs are unique (${componentIds.size})`);
for (const id of ['backend','broadcasterProvider','unifiedMobileTestClient','adminWeb','gatewayAndroid','publicWebsite','superAdminControl']) {
  requireValue(componentIds.has(id), `component boundary recorded: ${id}`);
}
const superAdmin = (cfg.components || []).find(c => c.id === 'superAdminControl');
requireValue(['REMAINING','TARGET_CREATED_FUNCTIONALITY_PENDING'].includes(superAdmin?.status), 'Super Admin Control implementation status remains explicitly pending');
const mobile = (cfg.components || []).find(c => c.id === 'unifiedMobileTestClient');
requireValue(mobile?.status === 'COMBINED_TEST_APP', 'unified mobile source is not falsely marked as separate production apps');

if (errors.length) {
  console.error('\nPROJECT BASELINE CHECK: FAIL');
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('PROJECT BASELINE CHECK: PASS');
for (const check of checks) console.log(check);
console.log(`Decisions recorded: ${cfg.decisions.length}; components mapped: ${cfg.components.length}`);
console.log('Note: this validates baseline metadata only; it does not certify application build/runtime behavior.');
