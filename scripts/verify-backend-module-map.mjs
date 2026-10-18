#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mapPath=path.join(root,'config','backend-module-map.json');
const mainPath=path.join(root,'services','backend','src','main.ts');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
let map;try{map=JSON.parse(fs.readFileSync(mapPath,'utf8'));pass('module map JSON parses')}catch(e){console.error(`FAIL module map JSON: ${e.message}`);process.exit(1)}
const main=fs.readFileSync(mainPath,'utf8');
const importMap=new Map();
for(const m of main.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']\.\/routes\/([^"']+)["'];?/g)){
 const file=m[2]+'.ts';const names=m[1].split(',').map(s=>s.trim().split(' as ').at(-1).trim()).filter(Boolean);importMap.set(file,names);
}
const mountBlocks=[];
for(const m of main.matchAll(/app\.use\(\s*`\$\{API_PREFIX\}([^`]*)`\s*,([\s\S]*?)\);/g)){
 const suffix=m[1]||'',body=m[2];
 const symbols=[...importMap.values()].flat().filter(sym=>new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`).test(body));
 if(symbols.length){const pathName='/api/v1'+suffix;mountBlocks.push({path:pathName,body,symbols});}
}
if(map.apiPrefix!='/api/v1')fail('API prefix differs from the source module map');
if(!fs.existsSync(mainPath))fail('Backend entrypoint missing');
const routers=map.httpRouters||[];const supports=map.routeSupportFiles||[];
if(routers.length!==map.httpRouterFileCount)fail(`router file count mismatch: ${routers.length} vs ${map.httpRouterFileCount}`);else pass(`router file entries ${routers.length}`);
const seen=new Set();let exportMounts=0;
for(const entry of routers){
 if(seen.has(entry.file))fail(`duplicate router file ${entry.file}`);seen.add(entry.file);
 const abs=path.join(root,'services','backend','src','routes',entry.file);
 if(!fs.existsSync(abs)){fail(`router source missing: ${entry.file}`);continue;}
 if(entry.kind!=='http-router')fail(`${entry.file} is not classified as http-router`);
 if(!importMap.has(entry.file))fail(`${entry.file} is not imported by main.ts`);
 const imported=importMap.get(entry.file)||[];
 for(const route of entry.routerExports||[]){
   exportMounts++;
   if(!imported.includes(route.symbol))fail(`${entry.file} export ${route.symbol} not imported by main.ts`);
   for(const mount of route.mounts||[]){
     const matching=mountBlocks.filter(b=>b.path===mount.path&&b.symbols.includes(route.symbol));
     if(!matching.length)fail(`${route.symbol} mount not found: ${mount.path}`);
     else {pass(`${route.symbol} mounted at ${mount.path}`);const observed=matching[0].body;for(const mw of mount.middleware||[])if(!new RegExp(`\\b${mw}\\b`).test(observed))fail(`${route.symbol} expected mount middleware ${mw} at ${mount.path}`);}
   }
   if(!(route.mounts||[]).length)fail(`${route.symbol} has no route mount recorded`);
 }
}
if(exportMounts!==map.routerMountCount)fail(`router export mount mapping count ${exportMounts} differs from ${map.routerMountCount}`);else pass(`router export/mount records ${exportMounts}`);
for(const entry of supports){if(seen.has(entry.file))fail(`support file duplicates router classification: ${entry.file}`);seen.add(entry.file);const abs=path.join(root,'services','backend','src','routes',entry.file);if(!fs.existsSync(abs))fail(`support candidate missing: ${entry.file}`);if(entry.kind!=='support-file')fail(`${entry.file} must be a support-file classification`);if(!['ORPHAN_CANDIDATE_NEEDS_FINAL_REVIEW','DUPLICATE_CONTENT_CANDIDATE_NEEDS_FINAL_REVIEW','ROUTE_SUPPORT_IMPORTED_BY_ADMIN_ROUTER_NOT_MOUNTED_DIRECTLY','ROUTE_SUPPORT_IMPORTED_BY_ADMIN_ROUTER_DUPLICATE_COPY_REVIEWED'].includes(entry.status))fail(`${entry.file} missing explicit support/review status`);if(importMap.has(entry.file))fail(`${entry.file} must not be classified as unimported support while imported by main.ts`);else pass(`${entry.file} classified as route-support source not directly mounted by main.ts`);}
const actual=fs.readdirSync(path.join(root,'services/backend/src/routes')).filter(n=>n.endsWith('.ts')).sort();
if(JSON.stringify(actual)!==JSON.stringify([...seen].sort()))fail('route directory files do not exactly match router/support catalogue');else pass(`all ${actual.length} route-directory files classified exactly once`);
if(errors.length){console.error('\nBACKEND MODULE MAP CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nBACKEND MODULE MAP CHECK: PASS');for(const p of passes)console.log(p);console.log('Static module map only; no runtime or route-local security test was performed.');
