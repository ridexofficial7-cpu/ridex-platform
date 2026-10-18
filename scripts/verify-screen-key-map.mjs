#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
function literalKeyUsage(){const out=[];const dir=path.join(root,'apps/admin-web/src');for(const file of walk(dir)){if(!/\.(tsx?|jsx?)$/.test(file)||/\.d\./.test(file))continue;const rel=path.relative(root,file).split(path.sep).join('/');const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);for(let i=0;i<lines.length;i++)for(const m of lines[i].matchAll(/\bt\s*\(\s*(['"])([^'"\n]+)\1(?=\s*[,)\n])/g))out.push({key:m[2],file:rel,line:i+1});}return out;}
function walk(dir){const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())out.push(...walk(p));else out.push(p);}return out;}
const map=load('config/screen-to-key-map.json');const catalog=load('config/translation-key-catalog.json');const placement=load('config/language-selector-placement-map.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const locInv=load('config/localization-source-inventory.json');const pkg=load('package.json');
req(Boolean(map&&catalog&&placement&&baseline&&source&&locInv&&pkg),'screen-key map, catalog, screen placement and project manifests parse');
if(map&&catalog&&placement&&baseline&&source&&locInv&&pkg){
 const screenIds=(map.screens||[]).map(s=>s.screenId);const expectedKeys=(catalog.keys||[]).map(k=>k.key).sort();const mapKeys=(map.keyMappings||[]).map(k=>k.key).sort();
 req(map.status==='STATIC_92_SCREEN_MAP; CORE_MOBILE_KEY_USAGE_WIRED; REMAINING_COPY_AND_SEMANTIC_REVIEW_PENDING','mapping status does not overstate semantic review or mobile integration');
 req(map.screens?.length===92&&new Set(screenIds).size===92&&map.screenInventorySummary?.count===92&&map.screenInventorySummary?.uniqueIds===92,'all 92 original UI/UX screen IDs are included exactly once');
 req(/^[a-f0-9]{64}$/.test(map.sourceProvenance?.screenInventorySha256||'')&&map.sourceProvenance?.screenCount===92&&placement.sourceProvenance?.uiUxPackage?.screenInventoryCsvSha256===map.sourceProvenance.screenInventorySha256,'screen inventory provenance SHA-256 matches the selector map baseline');
 req(map.keyMappings?.length===catalog.keyCount&&new Set(mapKeys).size===catalog.keyCount&&map.sourceProvenance?.keyCatalogUniqueCandidates===catalog.keyCount&&JSON.stringify(mapKeys)===JSON.stringify(expectedKeys),'every stable-key candidate has one map record matching the canonical catalog');
 const knownScreens=new Set(screenIds), knownKeys=new Set(expectedKeys);let sourcePathFailures=0,unknownKeyLinks=0,unknownScreenLinks=0;
 for(const s of map.screens||[]){
  if(!s.appSurface||!s.screenName||!['P0','P1','P2'].includes(s.priority))errors.push(`invalid inventory record ${s.screenId}`);
  for(const sp of s.sourcePaths||[])if(!fs.existsSync(path.join(root,sp)))sourcePathFailures++;
  for(const k of s.allLinkedCandidateKeys||[])if(!knownKeys.has(k))unknownKeyLinks++;
  const should=(map.keyMappings||[]).filter(k=>(k.candidateScreenIds||[]).includes(s.screenId)||(k.directScreenIds||[]).includes(s.screenId)).map(k=>k.key).sort();
  if(JSON.stringify(should)!==JSON.stringify((s.allLinkedCandidateKeys||[]).slice().sort()))errors.push(`reverse key links diverge for screen ${s.screenId}`);
 }
 for(const k of map.keyMappings||[]){
  for(const sid of [...(k.directScreenIds||[]),...(k.candidateScreenIds||[])])if(!knownScreens.has(sid))unknownScreenLinks++;
  for(const u of k.directSourceUsage||[])if(!fs.existsSync(path.join(root,u.file))||!Number.isInteger(u.line)||u.line<1)sourcePathFailures++;
 }
 req(sourcePathFailures===0,'all mapped source paths and literal-use line references exist');
 req(unknownKeyLinks===0&&unknownScreenLinks===0,'all forward/reverse links point to registered screen and key IDs');
 const actual=literalKeyUsage().filter(u=>knownKeys.has(u.key)).map(u=>({key:u.key,file:u.file,line:u.line})).sort((a,b)=>a.key.localeCompare(b.key)||a.file.localeCompare(b.file)||a.line-b.line);
 const recorded=[];for(const k of map.keyMappings||[])for(const u of k.directSourceUsage||[])recorded.push({key:k.key,file:u.file,line:u.line});recorded.sort((a,b)=>a.key.localeCompare(b.key)||a.file.localeCompare(b.file)||a.line-b.line);
 req(JSON.stringify(actual)===JSON.stringify(recorded),'literal Admin Web key usage is freshly scanned and matches recorded source evidence');
 req(actual.length===map.sourceUsageSummary?.adminWebLiteralKeyUseCount&&new Set(actual.map(x=>x.key)).size===map.sourceUsageSummary?.uniqueKeysWithLiteralSourceUse,'literal key-use counts match source scan');
 req(map.screens.filter(s=>s.directKeysFromSourceUsage?.length>0).length===map.sourceUsageSummary?.screensWithDirectKeyUsage,'direct Screen ID associations are not overstated');
 req(map.screens.every(s=>Array.isArray(s.candidateKeysForReview)&&Array.isArray(s.directKeysFromSourceUsage)&&Array.isArray(s.allLinkedCandidateKeys)),'each screen carries separate candidate and direct-key lists');
 req(map.keyMappings.every(k=>['DIRECT_ADMIN_WEB_LITERAL_USAGE; SEMANTIC_REVIEW_FOR_CROSS_SURFACE','CANDIDATE_SCREEN_MAPPING; OWNER_REVIEW_REQUIRED','UNMAPPED_REVIEW_REQUIRED'].includes(k.mappingStatus)),'key mapping status preserves direct/candidate/unmapped distinctions');
 req(map.reviewQueues?.unmappedKeyIds?.every(k=>knownKeys.has(k))&&map.reviewQueues?.screensWithoutKeyLinks?.every(s=>knownScreens.has(s)),'unmapped key and screen queues reference actual IDs');
 req(map.mappingPolicy?.mobile?.includes('source strings')&&map.mappingPolicy?.physicalTests?.includes('NOT_RUN'),'mobile localization and physical tests remain explicitly pending');
 req(map.reviewQueues?.nextSteps?.K?.includes('preserve')&&map.reviewQueues?.nextSteps?.L?.includes('Wire')&&map.reviewQueues?.nextSteps?.W?.includes('CI'),'dictionary review remains preserved, core journey wiring is tracked, and CI is still queued');
 req(baseline.screenToKeyMap?.path==='config/screen-to-key-map.json'&&source.screenToKeyMap?.path==='config/screen-to-key-map.json'&&locInv.screenToKeyMap?.path==='config/screen-to-key-map.json','project baseline and localization source inventory link the screen-to-key map');
 req(pkg.scripts?.['verify:screen-key-map']==='node scripts/verify-screen-key-map.mjs','screen-key map validator is registered in root scripts');
 const rs=source.components?.find(c=>c.id==='rootBuildScripts');const actualScripts=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rs?.scripts?.includes('verify-screen-key-map.mjs')&&rs.fileCount===actualScripts.length&&JSON.stringify(rs.scripts.slice().sort())===JSON.stringify(actualScripts),'source inventory root script list and count are current');
 req(locInv.nextSteps?.J?.includes('DONE')&&locInv.nextSteps?.K?.includes('SKIPPED')&&locInv.nextSteps?.L?.includes('CORE_JOURNEY'),'localization inventory records static Step J, skipped Step K and core Step L wiring');
 req((map.reviewQueues?.screensWithoutKeyLinks||[]).length>0,'screens with no candidate key remain explicit for owner review');
}
if(errors.length){console.error(`SCREEN-KEY MAP CHECK: FAIL (${errors.length} failures)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log(`SCREEN-KEY MAP CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('Note: candidate semantic links are not fully approved; core Mobile key wiring is partial, cross-catalog review is skipped, and all UI/LQA tests remain NOT_RUN.');
