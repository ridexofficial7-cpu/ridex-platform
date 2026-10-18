#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
function flatten(obj,prefix=''){const out={};for(const [k,v] of Object.entries(obj||{})){const key=prefix?`${prefix}.${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))Object.assign(out,flatten(v,key));else out[key]=v;}return out;}
const catalog=load('config/translation-key-catalog.json');const source=load('config/localization-source-inventory.json');const base=load('config/project-baseline.json');const manifest=load('config/source-inventory.json');const iface=load('config/localization-interface.json');const pkg=load('package.json');const en=load('apps/admin-web/src/locales/en-IN.json');const hi=load('apps/admin-web/src/locales/hi-IN.json');
req(Boolean(catalog&&source&&base&&manifest&&iface&&pkg&&en&&hi),'catalogue, source inventories, interface, manifest and existing Web catalogs parse');
if(catalog&&source&&base&&manifest&&iface&&pkg&&en&&hi){
 const template=new Set(source.baselinePackage.sourceFiles.translationKeyTemplate.keys);const mobile=new Set(source.baselinePackage.sourceFiles.mobileExamples.english.keys);const webEn=new Set(Object.keys(flatten(en)));const webHi=new Set(Object.keys(flatten(hi)));const expected=[...new Set([...template,...mobile,...webEn])].sort();const keys=catalog.keys||[];const actual=keys.map(k=>k.key);
 req(catalog.status==='CANDIDATE_KEY_CATALOG_CREATED; EXISTING_KEYS_PRESERVED; SEMANTIC_AND_SCREEN_MAPPING_PENDING','catalogue status does not overstate approved/translated/completed keys');
 req(catalog.keyCount===expected.length&&keys.length===expected.length&&new Set(actual).size===expected.length,'union catalogue contains the source-derived unique stable-key candidates');
 req(JSON.stringify(actual.slice().sort())===JSON.stringify(expected),'catalogue key IDs exactly match the union of starter, example and current Admin Web key sets');
 const expectedCounts={STARTER_TEMPLATE:template.size,MOBILE_EXAMPLE:mobile.size,ADMIN_WEB:webEn.size};
 req(JSON.stringify(Object.fromEntries(Object.entries(catalog.sourceCatalogs).map(([k,v])=>[k,v.keyCount])))===JSON.stringify(expectedCounts),'source catalogue counts match the current source dictionaries');
 const templateMobile=[...template].filter(k=>mobile.has(k)).length;const templateWeb=[...template].filter(k=>webEn.has(k)).length;const mobileWeb=[...mobile].filter(k=>webEn.has(k)).length;
 req(catalog.sourceSetComparison?.templateMobile===templateMobile&&catalog.sourceSetComparison?.templateAdminWeb===templateWeb&&catalog.sourceSetComparison?.mobileAdminWeb===mobileWeb,'overlap counts are sourced from actual key sets, not assumed equivalence');
 req(catalog.sourceSetComparison?.unionKeyCount===expected.length,'union set count matches source-derived key union');
 req(JSON.stringify([...new Set(catalog.supportedLocales)].sort())===JSON.stringify(['en-IN','hi-IN']),'only approved initial locales appear in key catalog');
 req(catalog.policy?.noSilentMerge?.includes('remain separate')&&catalog.policy?.noInventedTranslations?.includes('no translation strings'),'catalogue records provenance only and invents no translation text');
 req(catalog.policy?.stableIdentifier?.includes('No existing key is renamed')&&catalog.policy?.unknownNamespace?.includes('do not remap'),'key rename and namespace remap require traceable review');
 req(JSON.stringify(catalog.canonicalTargetNamespaces)===JSON.stringify(['common','auth','booking','driver','payment','safety','admin','errors','notifications','settings']),'canonical target namespaces are explicit and stable');
 const roots=[...new Set(expected.map(k=>k.split('.')[0]))].sort();req(JSON.stringify(catalog.observedSourceRoots)===JSON.stringify(roots),'all existing source roots are preserved');
 req(catalog.namespaceRegistry.some(n=>n.namespace==='notifications'&&n.sourceKeyCount===0&&n.status.includes('DO_NOT_SYNTHESIZE')),'notifications namespace is planned without inventing keys');
 req(catalog.namespaceRegistry.some(n=>n.namespace==='admin'&&n.sourceKeyCount===0&&n.status.includes('DO_NOT_SYNTHESIZE')),'admin namespace is planned without silently renaming Admin Web keys');
 req(keys.every(e=>typeof e.key==='string'&&e.key.includes('.')&&e.sourceRoot===e.key.split('.')[0]&&e.namespace===e.sourceRoot&&Array.isArray(e.sourceCatalogs)&&e.sourceCatalogs.length>0&&e.mappingStatus==='SCREEN_OWNER_AND_SEMANTIC_REVIEW_PENDING'),'every candidate retains exact key and source-root provenance');
 req(keys.every(e=>e.localeValueAvailability?.adminWebEnglish===webEn.has(e.key)&&e.localeValueAvailability?.adminWebHindi===webHi.has(e.key)),'Admin Web locale value availability flags reflect current dictionaries');
 req(keys.every(e=>!Object.hasOwn(e,'en-IN')&&!Object.hasOwn(e,'hi-IN')&&!Object.hasOwn(e,'translationText')),'catalogue stores no translation strings or executable content');
 req(catalog.validation?.screenMapping==='STATIC_MAP_DONE_SEMANTIC_REVIEW_PENDING'&&catalog.validation?.dictionaryValueReconciliation==='SKIPPED_PENDING_FINAL_CROSS_CATALOG_REVIEW'&&catalog.validation?.journeyWiring==='CORE_AUTH_OTP_BOOKING_DRIVER_REQUEST_AND_ADMIN_OTP_WIRED; FULL_SCREEN_COVERAGE_PENDING'&&catalog.validation?.languageQA==='NOT_RUN','downstream screen mapping, value reconciliation and QA are not prematurely closed');
 req(base.translationKeyCatalog?.path==='config/translation-key-catalog.json'&&manifest.translationKeyCatalog?.path==='config/translation-key-catalog.json'&&source.translationKeyCatalog?.path==='config/translation-key-catalog.json','baseline and both inventory records reference the canonical key catalog');
 req(iface.catalogPolicy?.canonicalKeyCatalog==='config/translation-key-catalog.json','shared runtime contract points at the candidate key catalog');
 req(pkg.scripts?.['verify:translation-key-catalog']==='node scripts/verify-translation-key-catalog.mjs','dedicated catalog verifier is exposed by root npm script');
 const rootScripts=manifest.components?.find(c=>c.id==='rootBuildScripts');const actualScripts=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rootScripts?.scripts?.includes('verify-translation-key-catalog.mjs')&&rootScripts.fileCount===actualScripts.length&&JSON.stringify(rootScripts.scripts.slice().sort())===JSON.stringify(actualScripts),'source inventory root-script listing/count is current');
 req(source.nextSteps?.I&&source.nextSteps.I.includes('DONE')&&source.nextSteps?.J&&source.nextSteps.J.includes('DONE')&&source.nextSteps?.K&&source.nextSteps.K.includes('PENDING'),'source inventory tracks completed Steps I/J and keeps Step K pending');
}
if(errors.length){console.error(`TRANSLATION KEY CATALOG CHECK: FAIL (${errors.length} failures)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log(`TRANSLATION KEY CATALOG CHECK: PASS (${checks.length} checks)`);for(const c of checks)console.log(c);console.log('Note: stable-key catalogue is a provenance/mapping artifact; it does not imply screen wiring, value approval or LQA pass.');
