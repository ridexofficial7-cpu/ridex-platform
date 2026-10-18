import fs from 'node:fs';
import assert from 'node:assert/strict';
const m=JSON.parse(fs.readFileSync('config/uiux-independent-app-shells.json','utf8'));
const read=p=>fs.readFileSync(p,'utf8');
for(const [app,expected] of [['customer-mobile','CUSTOMER_SCREENS'],['driver-mobile','DRIVER_SCREENS'],['admin-mobile','ADMIN_SCREENS']]){const s=read(`apps/${app}/navigation/routes.ts`);assert.ok(s.includes(`export const ${expected}`));for(const forbidden of ['CUSTOMER_SCREENS','DRIVER_SCREENS','ADMIN_SCREENS'])if(forbidden!==expected)assert.ok(!s.includes(`export const ${forbidden}`),`${app} contains cross-app route registry ${forbidden}`);}
const sa=read('apps/super-admin-control/navigation/routes.ts');assert.ok(sa.includes('SUPER_ADMIN_CONTROL_SCREENS'));assert.ok(!sa.includes('ADMIN_SCREENS'));
const values=Object.values(m.apps);assert.equal(values.length,4);assert.ok(values.every(x=>x.environment==='TEST'&&x.identityIndependent));assert.equal(new Set(values.map(x=>x.androidPackage)).size,4);assert.equal(new Set(values.map(x=>x.scheme)).size,4);
for(const [app,x] of Object.entries(m.apps)){const config=JSON.parse(read(`apps/${app}/app.json`)).expo;assert.equal(config.name,x.displayName);assert.equal(config.android.package,x.androidPackage);assert.equal(config.scheme,x.scheme);}
console.log('P4-G INDEPENDENT APP SHELLS: PASS (4 distinct TEST build identities and role-specific route registries)');
console.log('Runtime navigation, visible environment badges and Super Admin privileged flows remain unverified/pending.');
