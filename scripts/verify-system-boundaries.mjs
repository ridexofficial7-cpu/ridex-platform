#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'config', 'system-boundaries.json');
const errors = [];
const passes = [];
const pass = (message) => passes.push(`PASS ${message}`);
const fail = (message) => errors.push(message);

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  pass('system boundary configuration parses');
} catch (error) {
  console.error(`SYSTEM BOUNDARY CHECK: FAIL\nFAIL cannot read configuration: ${error.message}`);
  process.exit(1);
}

if (cfg.schemaVersion !== 1) fail('unsupported schemaVersion');
else pass('schema version is supported');
if (cfg.projectId !== 'ridex-super-admin-controle') fail('project ID mismatch');
else pass('project ID matches fresh project');
const authority = cfg.authorityRules || {};
for (const key of [
  'clientsMayConnectDirectlyToBusinessDatabase',
  'gatewayMayChangeBusinessTripStateDirectly',
  'superAdminPrivateKeyMayBeEmbeddedInApp',
  'localEnvironmentOnlyDuringFoundation'
]) {
  if (authority[key] !== false && key !== 'localEnvironmentOnlyDuringFoundation') fail(`${key} must be false`);
}
if (authority.clientsMayConnectDirectlyToBusinessDatabase === false) pass('client direct database access is prohibited');
if (authority.businessRulesOwner === 'services/backend') pass('Backend is authoritative for business rules');
else fail('Backend authority must be explicit');
if (authority.businessDatabaseOwner === 'services/backend/prisma/schema.prisma') pass('canonical database schema owner is recorded');
else fail('canonical database schema owner is missing');
if (authority.superAdminPrivateKeyMayBeEmbeddedInApp === false) pass('private key embedding is prohibited');
else fail('private key embedding must be prohibited');
if (authority.localEnvironmentOnlyDuringFoundation === true) pass('foundation environment is local-only');
else fail('foundation must be local-only');

const componentIds = new Set();
for (const component of cfg.components || []) {
  if (!component.id || componentIds.has(component.id)) fail(`missing/duplicate component ID ${component.id || '(blank)'}`);
  else componentIds.add(component.id);
  if (!component.trustZone || !component.kind || !component.authority) fail(`component ${component.id} has incomplete trust/authority metadata`);
  if (component.path) {
    const resolved = path.resolve(root, component.path);
    if (!resolved.startsWith(root + path.sep)) fail(`component path escapes project root: ${component.id}`);
    else if (!fs.existsSync(resolved)) fail(`component source path is missing: ${component.id} -> ${component.path}`);
  }
}
for (const required of ['backend','business-database','customer-mobile','driver-mobile','admin-mobile','super-admin-control','admin-web','public-website','broadcaster-provider','gateway-android','external-providers']) {
  if (componentIds.has(required)) pass(`component boundary recorded: ${required}`);
  else fail(`required component boundary is missing: ${required}`);
}

const connectionIds = new Set();
const outgoing = new Set();
for (const connection of cfg.connections || []) {
  if (!connection.id || connectionIds.has(connection.id)) fail(`missing/duplicate connection ID ${connection.id || '(blank)'}`);
  else connectionIds.add(connection.id);
  if (!componentIds.has(connection.from) || !componentIds.has(connection.to)) fail(`connection ${connection.id} references unknown component`);
  if (!connection.protocol || !connection.authentication || !connection.dataRule) fail(`connection ${connection.id} is missing protocol/auth/data rules`);
  outgoing.add(`${connection.from}->${connection.to}`);
}
if ((cfg.connections || []).length >= 10) pass(`connection boundaries recorded (${cfg.connections.length})`);
else fail('insufficient connection boundaries');
if (outgoing.has('customer-mobile->business-database') || outgoing.has('driver-mobile->business-database') || outgoing.has('admin-mobile->business-database') || outgoing.has('admin-web->business-database') || outgoing.has('super-admin-control->business-database')) fail('direct client-to-business-database connection is prohibited');
else pass('no direct client-to-business-database connection is declared');
if (!outgoing.has('backend->business-database')) fail('Backend-to-business-database path is missing');
else pass('Backend is the only declared business database writer boundary');
if (!outgoing.has('gateway-android->broadcaster-provider')) fail('Gateway-to-Provider boundary is missing');
else pass('Gateway communicates through Provider boundary');
const sa = (cfg.components || []).find(c => c.id === 'super-admin-control');
if (sa?.authority?.includes('current shell has no live authority')) pass('Super Admin shell is not treated as operational');
else fail('Super Admin operational status must remain pending until security approval');

if (errors.length) {
  console.error('SYSTEM BOUNDARY CHECK: FAIL');
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
console.log('SYSTEM BOUNDARY CHECK: PASS');
for (const message of passes) console.log(message);
console.log('Static boundary metadata only; this does not prove network/firewall/runtime enforcement.');
