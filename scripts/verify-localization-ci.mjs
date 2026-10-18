#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
function flatten(value,prefix='',out={}){if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [k,v] of Object.entries(value)){const key=prefix?`${prefix}.${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))flatten(v,key,out);else out[key]=v;}}return out;}
function placeholders(value){return [...String(value).matchAll(/\{\{?([A-Za-z][A-Za-z0-9_]*)\}\}?/g)].map(m=>m[1]).sort();}
const policy=load('config/localization-ci-policy.json');const registry=load('config/locale-registry.json');const support=load('config/localization-support-policy.json');const catalog=load('config/translation-key-catalog.json');const valueReport=load('config/translation-value-reconciliation.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const loc=load('config/localization-source-inventory.json');const pkg=load('package.json');
req(Boolean(policy&&registry&&support&&catalog&&valueReport&&baseline&&source&&loc&&pkg),'policy, catalogs and linked manifests parse');
if(policy&&registry&&support&&catalog&&valueReport&&baseline&&source&&loc&&pkg){
 req(policy.supportedLocales.join(',')==='en-IN,hi-IN'&&support.productLocalePolicy.firstSupportedLocales.join(',')==='en-IN,hi-IN','only en-IN and hi-IN are in the supported policy');
 const selectable=registry.locales.filter(x=>x.selectableByPolicy).map(x=>x.localeTag).sort();
 req(selectable.join(',')==='en-IN,hi-IN'&&registry.locales.filter(x=>x.selectableByPolicy).every(x=>x.rolloutStatus==='SUPPORTED_FIRST'),'planned/backlog locales remain unselectable');
 let observedCatalogKeys=0;let pairChecks=0;let keyErrors=0;let placeholderErrors=0;
 for(const pair of policy.catalogPairs){
  const en=flatten(load(pair.english));const hi=flatten(load(pair.hindi));const ek=Object.keys(en).sort();const hk=Object.keys(hi).sort();
  req(ek.length===pair.expectedKeyCount&&hk.length===pair.expectedKeyCount&&JSON.stringify(ek)===JSON.stringify(hk),`${pair.id} English/Hindi key parity (${pair.expectedKeyCount} keys)`);
  observedCatalogKeys+=ek.length;pairChecks++;
  for(const key of ek){
   if(typeof en[key]!=='string'||!en[key].trim()||typeof hi[key]!=='string'||!hi[key].trim())keyErrors++;
   if(JSON.stringify(placeholders(en[key]))!==JSON.stringify(placeholders(hi[key])))placeholderErrors++;
  }
 }
 req(pairChecks===policy.catalogPairs.length&&observedCatalogKeys===policy.catalogPairs.reduce((sum,pair)=>sum+pair.expectedKeyCount,0),'both configured catalog pairs were evaluated without merging them');
 req(keyErrors===0,'active locale catalogs contain no empty/non-string values');
 req(placeholderErrors===0,'active locale catalogs preserve placeholder parity within each pair');
 req(catalog.keys?.length===catalog.keyCount&&catalog.keyCount===loc.translationKeyCatalog?.candidateKeyCount,'candidate keys retain exact provenance and match the source inventory');
 req(valueReport.status.includes('CROSS_CATALOG_SEMANTIC_CONFLICTS_REMAIN')&&valueReport.policy.nativeReview.includes('require native review'),'source conflict and native review states remain explicit');
 req(Number(valueReport.coverage?.overlapValueCompare?.english?.conflicts?.length??0)===3||Array.isArray(valueReport.coverage?.overlapValueCompare?.english?.conflicts),'English cross-catalog conflict record is preserved');
 const runtime=fs.readFileSync(path.join(root,'packages/localization/src/translationRuntime.mjs'),'utf8');
 const mobile=fs.readFileSync(path.join(root,'packages/localization/src/RideXMobileLocaleProvider.tsx'),'utf8');
 req(runtime.includes('RIDEX_GENERIC_MISSING_TRANSLATION')&&/never/i.test(runtime),'shared runtime has safe generic fallback policy');
 req(!/return\s+key\s*;/.test(runtime)&&!/(?:return|:\s*)key\s*;/.test(mobile),'raw internal translation keys are not used as visible fallback');
 req(policy.releaseGate.productionApproved===false&&policy.releaseGate.criticalNativeReview==='PENDING'&&policy.releaseGate.all25Lqa==='NOT_RUN','LIVE release remains blocked while mandatory review and LQA are pending');
 req(baseline.localizationCiPolicy?.path==='config/localization-ci-policy.json'&&source.localizationCiPolicy?.path==='config/localization-ci-policy.json'&&loc.localizationCiPolicy?.path==='config/localization-ci-policy.json','baseline and inventories link localization CI policy');
 req(pkg.scripts?.['verify:localization-ci']==='node scripts/verify-localization-ci.mjs','CI validator is registered as root command');
 const roots=source.components.find(x=>x.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(roots.fileCount===actual.length&&JSON.stringify(roots.scripts.slice().sort())===JSON.stringify(actual),'root source inventory script count and list are current');
 const targetLive=process.argv.includes('--target=LIVE');
 if(targetLive){
  if(policy.releaseGate.productionApproved!==true||policy.releaseGate.criticalNativeReview!=='APPROVED'||policy.releaseGate.crossCatalogSemanticConflicts!==0||policy.releaseGate.all25Lqa!=='PASS')fail('LIVE target blocked: native review, cross-catalog conflict closure, and all 25 LQA cases are mandatory and not approved');
  else pass('LIVE mandatory localization release gates are approved');
 }
}
if(errors.length){console.error(`LOCALIZATION CI CHECK: FAIL (${errors.length} errors, ${checks.length} assertions)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log(`LOCALIZATION CI CHECK: PASS (${checks.length} assertions)`);for(const m of checks)console.log(m);console.log(process.argv.includes('--target=LIVE')?'LIVE target check requested.':'Static/TEST catalogue checks only; use --target=LIVE to enforce release gate.');
