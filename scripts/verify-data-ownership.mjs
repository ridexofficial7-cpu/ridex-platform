#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cfgPath=path.join(root,'config/data-ownership.json');
const errors=[]; const passes=[]; const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
let cfg; try { cfg=JSON.parse(fs.readFileSync(cfgPath,'utf8')); pass('data ownership registry parses'); } catch(e) { console.error(`DATA OWNERSHIP CHECK: FAIL\nFAIL ${e.message}`); process.exit(1); }
if(cfg.schemaVersion===1) pass('schema version supported'); else fail('unsupported schemaVersion');
if(cfg.projectId==='ridex-super-admin-controle') pass('project ID matches'); else fail('project ID mismatch');
const p=cfg.policy||{};
for (const key of ['oneAuthoritativeOwnerPerDomain','clientPersistentCopiesAreNonAuthoritative','businessStateWritesAreBackendControlled','sensitiveValuesMayBeLogged','unknownOwnershipMustFailReview']) {
 const expected=key==='sensitiveValuesMayBeLogged'?false:true;
 if(p[key]===expected) pass(`${key} policy is explicit`); else fail(`${key} must be ${expected}`);
}
const ids=new Set();
const validStatuses=new Set(['OWNER_DECIDED_STORAGE_FIELDS_REQUIRE_SCHEMA_REVIEW','OWNER_DECIDED_CLIENT_SECURE_STORAGE_VERIFICATION_PENDING','OWNER_DECIDED_RULE_EDGE_CASES_REMAIN_OPEN','OWNER_DECIDED_TRANSITION_MATRIX_REVIEW_PENDING','OWNER_DECIDED_FARE_RULES_REVIEW_PENDING','OWNER_DECIDED_ACCOUNTING_INVARIANTS_AND_PROVIDER_POLICY_PENDING','OWNER_DECIDED_STORAGE_PROVIDER_AND_RETENTION_REQUIRE_APPROVAL','OWNER_DECIDED_BACKGROUND_LIFECYCLE_RECOVERY_PENDING','OWNER_DECIDED_REPLAY_RETENTION_REVIEW_PENDING','OWNER_DECIDED_PROVIDER_RECORD_RECONCILIATION_PENDING','OWNER_DECIDED_STORAGE_TECHNOLOGY_PENDING_FINAL_REVIEW','OWNER_DECIDED_ENROLLMENT_AND_REVOCATION_CONTRACT_PENDING','OWNER_DECIDED_AUDIT_EXCEPTION_REVIEW_PENDING','PENDING_BACKEND_API_AND_SCHEMA_CONTRACT','OWNER_DECIDED_LINK_DESTINATIONS_REQUIRE_VERIFICATION','OWNER_DECIDED_STORAGE_ADAPTER_REVIEW_PENDING','OWNER_DECIDED_RETENTION_POLICY_REVIEW_PENDING']);
for (const d of cfg.domains||[]) {
 if(!d.id||ids.has(d.id)) fail(`missing/duplicate domain ID ${d.id||'(blank)'}`); else ids.add(d.id);
 for(const key of ['authoritativeOwner','authoritativeStore','clientCopyAuthority','sensitivity','retentionPolicy','status']) if(!String(d[key]??'').trim()) fail(`${d.id} missing ${key}`);
 if(!Array.isArray(d.clientCopies)) fail(`${d.id} clientCopies must be an array`);
 if(!validStatuses.has(d.status)) fail(`${d.id} has unregistered status ${d.status}`);
 if(/customer-mobile|driver-mobile|admin-mobile|admin-web|super-admin-control/.test(d.authoritativeOwner)) fail(`${d.id} wrongly assigns authoritative ownership to a UI client`);
 if(/DISPLAY_ONLY|CACHE_ONLY|UI_HINT_ONLY|FALLBACK|PRESENTATION_ONLY|EXECUTION_COPY|CURSOR_AND_VIEW|REGENERABLE_CACHE/.test(d.clientCopyAuthority)) pass(`${d.id}: client-copy boundary is non-authoritative`);
}
if(ids.size>=15) pass(`ownership domains inventoried (${ids.size})`); else fail(`expected broad coverage; only ${ids.size} domains listed`);
for(const required of ['authentication-session','booking-and-trip-state','payments-wallet-ledger-settlement','broadcaster-delivery-jobs','language-preference','security-audit-and-operational-logs']) if(ids.has(required)) pass(`critical data domain present: ${required}`); else fail(`critical data domain missing: ${required}`);
if((cfg.domains||[]).some(d=>d.id==='broadcaster-delivery-jobs'&&d.status==='OWNER_DECIDED_STORAGE_TECHNOLOGY_PENDING_FINAL_REVIEW')) pass('Provider persistence technology remains explicitly pending'); else fail('Provider storage decision must not be silently treated as final');
if((cfg.domains||[]).some(d=>d.id==='language-preference'&&d.status==='PENDING_BACKEND_API_AND_SCHEMA_CONTRACT')) pass('language preference Backend contract remains explicitly pending'); else fail('language preference contract must remain pending');
if(errors.length){ console.error('DATA OWNERSHIP CHECK: FAIL'); for(const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
console.log('DATA OWNERSHIP CHECK: PASS'); for(const m of passes) console.log(m); console.log('Static ownership inventory only; it does not certify database schema, retention implementation or runtime behavior.');
