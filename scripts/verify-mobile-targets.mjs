#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const passes = [];
const pass = (m) => passes.push(`PASS ${m}`);
const fail = (m) => errors.push(m);
const roles = [
  {id:'customer', root:'apps/customer-mobile', folder:'customer', name:'RideX Customer TEST', slug:'ridex-customer-test', android:'com.ridex.customer.test', ios:'com.ridex.customer.test', disallowedFolders:['driver','admin'], backgroundLocation:false},
  {id:'driver', root:'apps/driver-mobile', folder:'driver', name:'RideX Driver TEST', slug:'ridex-driver-test', android:'com.ridex.driver.test', ios:'com.ridex.driver.test', disallowedFolders:['customer','admin'], backgroundLocation:true},
  {id:'admin', root:'apps/admin-mobile', folder:'admin', name:'RideX Admin TEST', slug:'ridex-admin-test', android:'com.ridex.admin.test', ios:'com.ridex.admin.test', disallowedFolders:['customer','driver'], backgroundLocation:false},
];
const identities = {android:new Set(), ios:new Set(), slugs:new Set(), packages:new Set()};
function resolveLocalImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, ...['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.d.ts'].map(ext=>base+ext), ...['index.ts','index.tsx','index.js','index.jsx','index.mjs','index.cjs'].map(f=>path.join(base,f))];
  return candidates.find(p=>fs.existsSync(p) && fs.statSync(p).isFile());
}
for (const role of roles) {
  const appRoot = path.join(root, role.root);
  const pkgPath = path.join(appRoot,'package.json');
  const lockPath = path.join(appRoot,'package-lock.json');
  const appJsonPath = path.join(appRoot,'app.json');
  const envExample = path.join(appRoot,'.env.example');
  const appEntry = path.join(appRoot,'App.tsx');
  for (const p of [pkgPath,lockPath,appJsonPath,envExample,appEntry,path.join(appRoot,role.folder)]) {
    if (fs.existsSync(p)) pass(`${role.id} required path exists: ${path.relative(root,p).replaceAll(path.sep,'/')}`);
    else fail(`${role.id} required path missing: ${path.relative(root,p).replaceAll(path.sep,'/')}`);
  }
  for (const forbidden of role.disallowedFolders) {
    if (fs.existsSync(path.join(appRoot,forbidden))) fail(`${role.id} target contains another role source folder: ${forbidden}`);
  }
  if (fs.existsSync(path.join(appRoot,'.env'))) fail(`${role.id} contains a copied .env file; use reviewed local configuration, not legacy values`);
  if (!fs.existsSync(appEntry)) continue;
  let pkg,lock,app;
  try { pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8')); lock=JSON.parse(fs.readFileSync(lockPath,'utf8')); app=JSON.parse(fs.readFileSync(appJsonPath,'utf8')).expo; }
  catch(e) { fail(`${role.id} JSON manifest parse failed: ${e.message}`); continue; }
  if (pkg.name !== `ridex-${role.id}-mobile`) fail(`${role.id} package name is not unique/canonical: ${pkg.name}`); else pass(`${role.id} package name ${pkg.name}`);
  if (lock.name !== pkg.name || lock.version !== pkg.version || lock.packages?.['']?.name !== pkg.name || lock.packages?.['']?.version !== pkg.version) fail(`${role.id} package-lock root identity differs from package.json`); else pass(`${role.id} package-lock root identity matches`);
  if (app.name !== role.name || app.slug !== role.slug) fail(`${role.id} Expo name/slug mismatch`); else pass(`${role.id} Expo name and slug are role-specific TEST identities`);
  if (app.android?.package !== role.android || app.ios?.bundleIdentifier !== role.ios) fail(`${role.id} Android/iOS build identity mismatch`); else pass(`${role.id} Android/iOS identifiers are unique TEST identities`);
  for (const [set,val,label] of [[identities.android,app.android?.package,'Android package'],[identities.ios,app.ios?.bundleIdentifier,'iOS bundle'],[identities.slugs,app.slug,'Expo slug'],[identities.packages,pkg.name,'npm package']]) {
    if (set.has(val)) fail(`${label} collision: ${val}`); else set.add(val);
  }
  const permissions=app.android?.permissions || [];
  const hasBg=permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION');
  if (hasBg !== role.backgroundLocation) fail(`${role.id} background location permission does not match the role baseline`); else pass(`${role.id} background-location permission ${hasBg?'enabled for Driver':'not declared'}`);
  if (permissions.includes('android.permission.RECORD_AUDIO')) fail(`${role.id} declares RECORD_AUDIO without approved need`);
  const content=fs.readFileSync(appEntry,'utf8');
  if (!content.includes(`./${role.folder}/App`)) fail(`${role.id} entrypoint does not load its own role app`); else pass(`${role.id} entrypoint loads only its role app`);
  if (role.id==='driver' && !content.includes('./driver/backgroundLocation')) fail('Driver entrypoint must register the background-location task in the Driver app only');
  if (role.id!=='driver' && content.includes('backgroundLocation')) fail(`${role.id} entrypoint must not register Driver background-location task`);
  if (/from\s+["'][.][/]((customer|driver|admin)\/App)["']/.test(content.replace(`./${role.folder}/App`,''))) fail(`${role.id} wrapper imports another role app`);
  // Validate relative static imports for the role-specific tree and shared code.
  const scanRoots=[path.join(appRoot,role.folder),path.join(appRoot,'shared'),path.join(appRoot,'navigation'),path.join(appRoot,'plugins')];
  const scanFiles=[appEntry,path.join(appRoot,'pushNotifications.ts'),path.join(appRoot,'app.config.js')];
  const walk=p=>{if(!fs.existsSync(p))return; for(const ent of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,ent.name); if(ent.isDirectory()) walk(q); else if(/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) scanFiles.push(q);}};
  for(const p of scanRoots) walk(p);
  const unique=[...new Set(scanFiles.filter(p=>fs.existsSync(p)))];
  const importPattern=/(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g;
  let importCount=0;
  for(const file of unique){const text=fs.readFileSync(file,'utf8'); for(const m of text.matchAll(importPattern)){const spec=m[1]; importCount++; if(!resolveLocalImport(file,spec)) fail(`${role.id} unresolved relative import in ${path.relative(appRoot,file).replaceAll(path.sep,'/')}: ${spec}`);}}
  if (!errors.some(e=>e.startsWith(`${role.id} unresolved relative import`))) pass(`${role.id} relative imports resolve in statically scanned source files (${importCount} import references)`);
}
// Super Admin has a separate TEST shell, but no privileged actions are enabled.
const superRoot = path.join(root, 'apps', 'super-admin-control');
for (const rel of ['App.tsx','app.json','app.config.js','package.json','package-lock.json','.env.example']) {
  if (fs.existsSync(path.join(superRoot, rel))) pass(`Super Admin structural path exists: ${rel}`);
  else fail(`Super Admin structural path missing: ${rel}`);
}
if (fs.existsSync(path.join(superRoot, '.env'))) fail('Super Admin shell must not contain an active .env file');
try {
  const sp = JSON.parse(fs.readFileSync(path.join(superRoot,'package.json'),'utf8'));
  const sl = JSON.parse(fs.readFileSync(path.join(superRoot,'package-lock.json'),'utf8'));
  const se = JSON.parse(fs.readFileSync(path.join(superRoot,'app.json'),'utf8')).expo;
  if (sp.name !== 'ridex-super-admin-control' || sl.name !== sp.name || sl.packages?.['']?.name !== sp.name) fail('Super Admin package/lock identity mismatch');
  else pass('Super Admin package-lock identity matches');
  if (se.slug !== 'ridex-super-admin-control-test' || se.android?.package !== 'com.ridex.superadmin.test' || se.ios?.bundleIdentifier !== 'com.ridex.superadmin.test') fail('Super Admin TEST build identities do not match');
  else pass('Super Admin has independent TEST Android/iOS/Expo identities');
  if (!(se.android?.blockedPermissions || []).includes('android.permission.ACCESS_BACKGROUND_LOCATION') || !(se.android?.blockedPermissions || []).includes('android.permission.CAMERA')) fail('Super Admin shell must block unneeded location/camera permissions');
  else pass('Super Admin shell blocks location/camera permissions at the Expo config layer');
  const appText = fs.readFileSync(path.join(superRoot,'App.tsx'),'utf8');
  if (!appText.includes('Secure provisioning required') || !appText.includes('Control actions are disabled')) fail('Super Admin shell must remain explicitly disabled until security contracts are approved');
  else pass('Super Admin shell exposes no operational controls before security approval');
  const files=[]; const walk=(p)=>{for(const ent of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,ent.name);if(ent.isDirectory())walk(q);else if(/\.(ts|tsx|js|jsx|json|md)$/i.test(ent.name))files.push(q);}}; walk(superRoot);
  for(const f of files){const t=fs.readFileSync(f,'utf8'); if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(t)) fail(`private key material found in Super Admin shell source: ${path.relative(superRoot,f)}`);}
  if (!errors.some(e=>e.includes('private key material found in Super Admin'))) pass('no plaintext private-key PEM material exists in Super Admin shell source');
} catch (e) { fail(`Super Admin manifest validation failed: ${e.message}`); }

const projectPkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
for (const role of roles) {
  const key=`install:${role.id}-mobile`;
  if(!projectPkg.scripts?.[key]) fail(`root package is missing ${key} script`); else pass(`root package exposes ${key}`);
}
if (!projectPkg.scripts?.['install:super-admin-control']) fail('root package is missing install:super-admin-control'); else pass('root package exposes install:super-admin-control');
if(errors.length){console.error('MOBILE TARGET STRUCTURE CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('MOBILE TARGET STRUCTURE CHECK: PASS');for(const p of passes)console.log(p);
console.log('Note: structural/import checks only; dependencies, Expo prebuild, native compilation and device tests have not been run.');
