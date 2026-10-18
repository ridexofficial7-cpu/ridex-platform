#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>{const p=path.join(root,rel);if(!fs.existsSync(p)){fail(`required source missing: ${rel}`);return '';}return fs.readFileSync(p,'utf8');};
let cfg;try{cfg=JSON.parse(read('config/authorization-boundaries.json'));pass('authorization boundary registry parses');}catch(e){console.error(`AUTHORIZATION BOUNDARY CHECK: FAIL\nFAIL ${e.message}`);process.exit(1);}
if(cfg.schemaVersion===1&&cfg.projectId==='ridex-super-admin-controle')pass('authorization registry version and project identity match');else fail('authorization registry identity/version mismatch');
const main=read('services/backend/src/main.ts');const scope=read(cfg.sourceEvidence.adminScopeService);const scopeCtx=read(cfg.sourceEvidence.adminScopeContext);const driver=read(cfg.sourceEvidence.driverOnboarding);const schema=read(cfg.sourceEvidence.canonicalSchema);const auth=read(cfg.sourceEvidence.authMiddleware);
for(const mount of cfg.protectedMounts||[]){
 const routeSuffix=mount.path.replace(/^\/api\/v1/,'');
 const sourceMarker=`\`${'${API_PREFIX}'}${routeSuffix}\``;
 const at=main.indexOf(sourceMarker);
 if(at<0){fail(`protected mount not found in Backend entrypoint: ${mount.path}`);continue;}
 const block=main.slice(at,Math.min(main.length,at+300));
 if(!block.includes(mount.router))fail(`${mount.path}: expected router ${mount.router} not found near mount`);
 for(const middleware of mount.requiredMiddleware){if(!block.includes(middleware))fail(`${mount.path}: required middleware ${middleware} not found near route mount`);}
 if(block.includes(mount.router)&&mount.requiredMiddleware.every(m=>block.includes(m)))pass(`${mount.path} mount includes required middleware (${mount.requiredMiddleware.join(', ')})`);
}
if(scope.includes('const SCOPED_MODELS')&&scope.includes('const GLOBAL_MODELS')&&scope.includes('SUPPORTED_MODEL_REGISTRY'))pass('Admin scope defines scoped/global model registries');else fail('Admin scope model registries incomplete');
if(/fail.closed|fail closed/i.test(scope)&&/throw new Error\("Admin geographic scope violation"\)/.test(scope))pass('scope service includes fail-closed/violation logic');else fail('scope service fail-closed guard marker missing');
if(scope.includes('modelHasField')&&scope.includes('cityId')&&scope.includes('stateId'))pass('scope service has canonical geographic field-aware handling');else fail('geographic field-aware handling missing');
if(auth.includes('enforceActorIdentity')&&auth.includes('requireAppAuth'))pass('auth middleware exposes session and actor identity enforcement');else fail('auth/actor middleware functions not identified');
const driverModel=schema.match(/model\s+Driver\s*\{([\s\S]*?)\n\}/)?.[1]||'';
if(/stateId\s+String\?/.test(driverModel)&&/cityId\s+String\?/.test(driverModel)&&/city\s+City\?\s+@relation\(fields:\s*\[cityId\]/.test(driverModel)&&/state\s+State\?\s+@relation\(fields:\s*\[stateId\]/.test(driverModel))pass('Driver has canonical stateId/cityId fields and relations');else fail('Driver canonical geography fields/relations missing');
const driverChecks=['if (!driver.stateId || !driver.cityId)','cityId: driver.cityId','!geographicAssignment.serviceAvailable','geographicAssignment.stateId !== driver.stateId','!geographicAssignment.active','!geographicAssignment.state.active'];
for(const marker of driverChecks){if(driver.includes(marker))pass(`Driver submission gate includes: ${marker}`);else fail(`Driver submission gate marker missing: ${marker}`);}
const rules=cfg.rules||{};if(rules.clientMayChooseEffectiveActorIdentity===false&&rules.uiVisibilityIsSecurityBoundary===false&&rules.directDatabaseAccessFromClients===false)pass('client identity, UI, and database are not trusted security boundaries');else fail('unsafe client trust rule');
if(rules.adminGeographicScope?.GLOBAL&&rules.adminGeographicScope?.STATE&&rules.adminGeographicScope?.CITY)pass('GLOBAL/STATE/CITY scope semantics recorded');else fail('geographic scope semantics incomplete');
if(rules.unknownModelOrScope==='FAIL_CLOSED')pass('unknown model/scope behavior is fail-closed');else fail('unknown model/scope must fail closed');
if(errors.length){console.error('AUTHORIZATION BOUNDARY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('AUTHORIZATION BOUNDARY CHECK: PASS');for(const m of passes)console.log(m);console.log('Static source/mount check only; per-route negative authorization tests are deferred to final physical-test phase.');
