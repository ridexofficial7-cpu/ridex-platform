#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[], passes=[]; const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
let contract, connections;
try { contract=JSON.parse(read('config/super-admin-control-integration-contract.json')); pass('Super Admin Control integration contract parses'); } catch(e) { console.error(`FAIL integration contract: ${e.message}`); process.exit(1); }
try { connections=JSON.parse(read('config/connection-register.json')); pass('canonical connection register parses'); } catch(e) { console.error(`FAIL connection register: ${e.message}`); process.exit(1); }
const app=read('apps/super-admin-control/App.tsx');
const routes=read('apps/super-admin-control/navigation/routes.ts');
const env=read('apps/super-admin-control/.env.example');
const appConfig=read('apps/super-admin-control/app.json');
const platform=read('services/backend/src/routes/platform.ts');
const configuration=read('services/backend/src/routes/configuration.ts');
const admin=read('services/backend/src/routes/admin.ts');
const main=read('services/backend/src/main.ts');
if(contract.schemaVersion!==1||contract.connectionId!=='CX-005') fail('contract schema or canonical connection ID invalid'); else pass('contract maps to canonical CX-005');
if(contract.status!=='DISABLED_STRUCTURAL_TEST_SHELL'||contract.clientAuthority!=='NONE') fail('Super Admin Control must remain a disabled shell until approved'); else pass('client authority explicitly remains NONE');
if(!app.includes('Control actions are disabled')||!app.includes('structural TEST shell')) fail('app shell does not visibly declare privileged actions disabled'); else pass('UI clearly states privileged controls are disabled');
if(/\b(fetch|axios)\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(app)) fail('direct network call found in Super Admin shell'); else pass('no direct network calls in Super Admin shell');
if(/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|PRIVATE KEY-----|sk_live_|rzp_live_/.test(app+'\n'+env+'\n'+appConfig)) fail('private key or live credential marker found in client files'); else pass('no private-key/live-credential marker in Super Admin client files');
if(!routes.includes('privateUnlock')||!routes.includes('trustedDeviceEnrollment')||!routes.includes('secureRecovery')) fail('required shell route identities missing'); else pass('unlock, trusted-device enrollment and recovery route identities present');
if(!/EXPO_PUBLIC_RIDEX_TEST_MODE=true/.test(env)||!/127\.0\.0\.1/.test(env)) fail('Super Admin example environment must stay TEST and loopback-only'); else pass('example environment remains TEST and loopback-only');
if(!/ridex-super-admin-control-test/.test(appConfig)||!/com\.ridex\.superadmin\.test/.test(appConfig)) fail('unique TEST build identity missing'); else pass('unique TEST app identity retained');
const edge=(connections.connections||[]).find(x=>x.id==='CX-005');
if(!edge||edge.status!=='PLANNED_SOURCE_SHELL_ONLY'||edge.priority!=='P0') fail('CX-005 must remain P0 and planned/source-shell-only'); else pass('connection register keeps CX-005 blocked as P0');
for(const item of contract.mappedBackendBoundaries||[]) if(!exists(item.path)) fail(`mapped backend source missing: ${item.path}`);
if(!main.includes('`${API_PREFIX}/admin/platform`')||!main.includes('`${API_PREFIX}/admin/configuration`')) fail('platform/configuration route mounts not found at documented boundaries'); else pass('backend route mount paths match contract');
if(!platform.includes('async function requireSuperAdmin')||!platform.includes('roleName !== "SUPER_ADMIN"')) fail('platform routes lack expected approved Super Admin role guard evidence'); else pass('platform routes contain approved SUPER_ADMIN role guard');
if(!configuration.includes('requireConfigurationAdmin')) fail('configuration admin guard evidence missing'); else pass('configuration routes contain server-side admin guard');
if(!admin.includes('SERVICE_ENABLEMENT_SUPER_ADMIN_REQUIRED')||!admin.includes('eventEnabled')) fail('service enablement Super Admin enforcement evidence missing'); else pass('service enablement changes have backend Super Admin enforcement evidence');
if((contract.requiredBeforeActivation||[]).length<6) fail('activation blocker checklist unexpectedly incomplete'); else pass(`activation blockers recorded: ${contract.requiredBeforeActivation.length}`);
if(!String(contract.policy||'').includes('Do not add direct client control calls')) fail('fail-closed activation policy missing'); else pass('fail-closed activation policy documented');
if(errors.length){console.error('\nSUPER ADMIN CONTROL CONTRACT: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nSUPER ADMIN CONTROL CONTRACT: PASS');for(const p of passes)console.log(p);console.log('Static source mapping only. Device trust, signed commands, runtime authorization and physical-device tests remain NOT VERIFIED.');
