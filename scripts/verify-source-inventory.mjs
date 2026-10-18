#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = path.join(root, 'config', 'source-inventory.json');
const errors=[]; const passes=[];
const pass=m=>passes.push(`PASS ${m}`); const fail=m=>errors.push(m);
const excludedDirectories=new Set(['node_modules','.git','dist','build','.gradle','.expo','.cxx','coverage']);
const isExcludedFile=rel=>{
 const name=path.basename(rel);
 return (name.startsWith('.env')&&name!=='.env.example') ||
   /\.(?:bak|backup)(?:[-.]|$)/i.test(name) ||
   /\.(?:before-|prepatch-)/i.test(name) ||
   name==='local.properties' ||
   rel==='apps/driver-mobile/android/app/debug.keystore' ||
   name.toLowerCase().endsWith('.zip') ||
   rel==='apps/admin-web/docs/API_CONTRACT_VERIFICATION.md';
};
const isExcludedDirectory=name=>excludedDirectories.has(name);
let cfg;
try { cfg=JSON.parse(fs.readFileSync(cfgPath,'utf8')); pass('source inventory JSON parses'); }
catch(e) { console.error(`FAIL source inventory JSON: ${e.message}`); process.exit(1); }
if(cfg.schemaVersion!==1) fail('unsupported source inventory schemaVersion'); else pass('source inventory schema version supported');
const checkCount=(label, actual, expected)=>{ if(actual===expected) pass(`${label}: ${actual}`); else fail(`${label}: expected ${expected}, observed ${actual}; inventory must be reviewed and regenerated`); };
const listFiles=rel=>{
 const abs=path.resolve(root,rel);
 if(!abs.startsWith(root+path.sep)) { fail(`path escapes project root: ${rel}`); return []; }
 if(!fs.existsSync(abs)) { fail(`required root missing: ${rel}`); return []; }
 const out=[]; const walk=p=>{ for(const ent of fs.readdirSync(p,{withFileTypes:true})){ const q=path.join(p,ent.name); if(ent.isDirectory()) { if(!isExcludedDirectory(ent.name)) walk(q); } else { const relFile=path.relative(root,q).replaceAll(path.sep,'/'); if(!isExcludedFile(relFile)) out.push(q); } } };
 walk(abs); return out;
};
const seen=new Set();
for(const c of cfg.components||[]) {
 if(seen.has(c.id)) { fail(`duplicate component ID ${c.id}`); continue; } seen.add(c.id);
 const files=listFiles(c.root);
 if(files.length!==c.fileCount) fail(`${c.id} file count changed: expected ${c.fileCount}, observed ${files.length}; update inventory after reviewing change`);
 else pass(`${c.id} file count ${files.length}`);
 for(const rel of [c.manifest,...(c.entrypoints||[]),c.prismaSchema,...(c.buildFiles||[]),...(c.navigationRegistries||[]),...(c.storageCandidates||[]),...(c.scripts||[]).map(s=>c.id==='rootBuildScripts'?`${c.root}/${s}`:`${c.root}/scripts/${s}`)].filter(Boolean)) {
   const p=path.resolve(root,rel); if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()) fail(`${c.id} expected path missing: ${rel}`);
 }
 if(c.routeModules) {
   const routeFiles=fs.readdirSync(path.join(root,c.root,'src','routes')).filter(n=>n.endsWith('.ts')).sort();
   const supportFiles=[...(c.routeSupportFiles||[])].sort();
   const mappedFiles=[...[...c.routeModules].sort(),...supportFiles].sort();
   if(c.routeModules.length!==c.routeModuleCount) fail(`backend HTTP router module count differs from inventory: expected ${c.routeModuleCount}, listed ${c.routeModules.length}`);
   else pass(`backend HTTP router modules listed ${c.routeModules.length}`);
   if(JSON.stringify(routeFiles)!==JSON.stringify(mappedFiles)) fail('backend route-directory file classification differs from HTTP router + support-file inventory');
   else pass(`backend route-directory files classified: ${c.routeModules.length} HTTP routers + ${supportFiles.length} support files`);
   if(supportFiles.length!==(c.routeSupportFileCount||0)) fail(`backend route support-file count mismatch: expected ${c.routeSupportFileCount||0}, listed ${supportFiles.length}`);
   const schema=fs.readFileSync(path.join(root,c.prismaSchema),'utf8');
   const models=[...schema.matchAll(/^model\s+(\w+)/gm)].map(m=>m[1]);
   const enums=[...schema.matchAll(/^enum\s+(\w+)/gm)].map(m=>m[1]);
   checkCount('Prisma model declarations',models.length,c.prismaModelCount);
   checkCount('Prisma enum declarations',enums.length,c.prismaEnumCount);
   if(JSON.stringify(models)!==JSON.stringify(c.prismaModels)) fail('Prisma model names differ from inventory');
   if(JSON.stringify(enums)!==JSON.stringify(c.prismaEnums)) fail('Prisma enum names differ from inventory');
   const migRoot=path.join(root,c.root,'prisma','migrations');
   const mig=fs.readdirSync(migRoot,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();
   if(JSON.stringify(mig)!==JSON.stringify([...c.activeMigrationDirectories].sort())) fail('active migration directory list differs from inventory');
   else pass(`active migration directories ${mig.length} (inventory only; do not infer canonicality)`);
 }
 if(c.scriptCount!==undefined) {
   const current=fs.readdirSync(path.join(root,c.root,'scripts')).filter(n=>fs.statSync(path.join(root,c.root,'scripts',n)).isFile()&&!isExcludedFile(`${c.root}/scripts/${n}`)).sort();
   if(current.length!==c.scriptCount) fail(`${c.id} script count changed: expected ${c.scriptCount}, observed ${current.length}`);
   else pass(`${c.id} scripts ${current.length}`);
   if(c.scripts && JSON.stringify(current)!==JSON.stringify([...c.scripts].sort())) fail(`${c.id} script names differ from inventory`);
 }
 if(c.testFileCount!==undefined) {
   const testFiles=listFiles(c.root).filter(p=>/(test|spec)\./i.test(path.basename(p))).map(p=>path.relative(root,p).replaceAll(path.sep,'/')).sort();
   if(testFiles.length!==c.testFileCount) fail(`${c.id} test file count changed: expected ${c.testFileCount}, observed ${testFiles.length}`);
   else pass(`${c.id} test files ${testFiles.length}`);
   if(JSON.stringify(testFiles)!==JSON.stringify([...c.testFiles].sort())) fail(`${c.id} test file list differs from inventory`);
 }
 if(c.kotlinFileCount!==undefined) {
   const kts=listFiles(c.root).filter(p=>p.endsWith('.kt'));
   checkCount('Gateway Kotlin source files',kts.length,c.kotlinFileCount);
   const tests=kts.filter(p=>/Test\.kt$/.test(p)).map(p=>path.relative(root,p).replaceAll(path.sep,'/')).sort();
   checkCount('Gateway Kotlin *Test.kt files',tests.length,c.kotlinUnitTestCount);
   if(JSON.stringify(tests)!==JSON.stringify([...c.kotlinUnitTestFiles].sort())) fail('Gateway Kotlin test file list differs from inventory');
 }
}
const extensions=new Set(['.p12','.pfx','.jks','.keystore','.key','.pem']);
const forbidden=[];
const sourceRoots=['apps','config','packages','scripts','services'];
const walkRoot=p=>{ for(const ent of fs.readdirSync(p,{withFileTypes:true})){ const q=path.join(p,ent.name); const rel=path.relative(root,q).replaceAll(path.sep,'/'); if(ent.isDirectory()) { if(!isExcludedDirectory(ent.name)) walkRoot(q); } else { if(isExcludedFile(rel)) continue; const ext=path.extname(ent.name).toLowerCase(); if(extensions.has(ext)) forbidden.push(rel); if(['.crt','.cer','.der'].includes(ext)&&rel!=='services/broadcaster-provider/certs/supabase-root.crt') forbidden.push(rel); if(['.png','.jpg','.jpeg','.webp','.gif','.svg','.bmp','.ico'].includes(ext)&&!rel.startsWith('apps/driver-mobile/android/app/src/main/res/')) forbidden.push(rel); } } };
for(const rel of sourceRoots){const abs=path.join(root,rel);if(fs.existsSync(abs))walkRoot(abs);}
if(forbidden.length) for(const item of forbidden) fail(`forbidden source credential/asset: ${item}`); else pass('source scan excludes local backups, environment files, dependencies and generated/build outputs; approved Android assets and Provider root CA remain allowed');
for(const c of cfg.plannedComponentsNotYetPresent||[]) {
 if(c.status==='REMAINING' && fs.existsSync(path.join(root,c.targetRoot))) fail(`planned target ${c.targetRoot} exists but inventory still marks it REMAINING; review status`);
}
if(errors.length) { console.error('\nSOURCE INVENTORY CHECK: FAIL'); for(const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
console.log('SOURCE INVENTORY CHECK: PASS'); for(const p of passes) console.log(p);
console.log(`Mapped components: ${cfg.components.length}; planned component boundaries recorded: ${(cfg.plannedComponentsNotYetPresent||[]).length}`);
console.log('Note: inventory consistency only; it does not certify compilation, API security, migration safety or runtime E2E behavior.');
