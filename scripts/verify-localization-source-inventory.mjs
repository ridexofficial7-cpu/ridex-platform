#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel} parse/read failed: ${e.message}`);return null;}};
function flatten(obj,prefix=''){const out={};for(const [k,v] of Object.entries(obj||{})){const key=prefix?`${prefix}.${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))Object.assign(out,flatten(v,key));else out[key]=v;}return out;}
const inv=load('config/localization-source-inventory.json');const baseline=load('config/project-baseline.json');const sourceInv=load('config/source-inventory.json');const pkg=load('package.json');
const en=load('apps/admin-web/src/locales/en-IN.json');const hi=load('apps/admin-web/src/locales/hi-IN.json');
const schemaPath=path.join(root,'services/backend/prisma/schema.prisma');
let schema='';try{schema=fs.readFileSync(schemaPath,'utf8');}catch(e){fail(`cannot read Prisma schema: ${e.message}`);}
const customerPath=path.join(root,'apps/customer-mobile/customer/App.tsx');let customer='';try{customer=fs.readFileSync(customerPath,'utf8');}catch(e){fail('Customer App source missing');}
function req(v,m){if(v)pass(m);else fail(m);}
req(Boolean(inv&&baseline&&sourceInv&&pkg&&en&&hi),'localization inventory, baseline, source manifest, package and Web dictionaries parse');
if(inv&&baseline&&sourceInv&&pkg&&en&&hi){
 const lc=inv.baselinePackage?.sourceFiles?.localeRegistry;
 const tt=inv.baselinePackage?.sourceFiles?.translationKeyTemplate;
 const pl=inv.baselinePackage?.sourceFiles?.languageScreenPlacement;
 const qa=inv.baselinePackage?.sourceFiles?.languageQAMatrix;
 const ex=inv.baselinePackage?.sourceFiles?.mobileExamples;
 const aw=inv.currentProjectSource?.adminWeb;
 req(lc?.rowCount===25&&lc.records?.length===25,'baseline locale inventory contains 25 records');
 const localeTags=(lc?.records||[]).map(r=>r.locale_tag);
 req(new Set(localeTags).size===25,'locale tags are unique');
 req(localeTags.includes('en-IN')&&localeTags.includes('hi-IN')&&JSON.stringify(inv.baselinePackage.supportedFirstLocales)===JSON.stringify(['en-IN','hi-IN']),'English and Hindi are registered as first supported candidates');
 const badGu=(lc?.records||[]).find(r=>r.locale_tag==='gu-IN');
 req(badGu?.language_english_name==='ગુજરાતી'&&inv.baselinePackage.knownDataQualityIssues?.some(x=>x.id==='LANG-DQ-001'&&['OPEN_FOR_PACKAGE_3_STEP_C','RESOLVED_IN_CANONICAL_REGISTRY_SOURCE_EVIDENCE_PRESERVED'].includes(x.status)),'Gujarati English-name data-quality issue is explicitly preserved for Step C');
 req(Object.values(inv.baselinePackage.localeStatusCounts||{}).reduce((a,b)=>a+b,0)===25,'locale status counts total 25');
 req(tt?.rowCount===31&&tt.keys?.length===31&&new Set(tt.keys).size===31,'starter translation template has 31 unique keys');
 req(ex?.english?.leafKeyCount===44&&ex?.hindi?.leafKeyCount===44&&JSON.stringify(ex.english.keys)===JSON.stringify(ex.hindi.keys),'mobile example dictionaries each have 44 matching keys');
 req(ex.webExampleDictionariesMatchMobileExampleKeySets===true,'baseline Web example key sets match baseline Mobile example keys');
 req(pl?.rowCount===12&&pl.screenIds?.length===12,'12 language-selector placement entries are inventoried');
 req(qa?.rowCount===25&&qa.testIds?.length===25&&qa.testIds[0]==='LQA-001'&&qa.testIds[24]==='LQA-025'&&qa.executionStatus==='NOT_RUN','25 language QA cases are registered and explicitly NOT_RUN');
 const templateKeys=new Set(tt?.keys||[]), mobileKeys=new Set(ex?.english?.keys||[]), webKeys=new Set(aw?.englishDictionary?.keys||[]);
 req(templateKeys.size===31&&[...templateKeys].every(k=>mobileKeys.has(k))&&mobileKeys.size-templateKeys.size===13,'starter template is a 31-key subset of the 44-key example dictionary, with 13 additional example keys');
 req((templateKeys.size-intersection(templateKeys,webKeys))===24&&intersection(templateKeys,webKeys)===7,'only seven starter-template keys overlap Admin Web; mismatch remains visible, not silently merged');
 req(intersection(mobileKeys,webKeys)===inv.keySetComparison.mobileAdminWebOverlapCount&&webKeys.size===aw.englishDictionary.leafKeyCount&&mobileKeys.size===44,'Mobile-example/Admin-Web dictionary overlap and distinct catalog sizes match inventory');
 const actualEn=flatten(en),actualHi=flatten(hi);const actualEnKeys=Object.keys(actualEn).sort(),actualHiKeys=Object.keys(actualHi).sort();
 req(actualEnKeys.length===aw.englishDictionary.leafKeyCount&&actualHiKeys.length===aw.hindiDictionary.leafKeyCount,'current Admin Web dictionaries match their inventoried leaf-key counts');
 req(JSON.stringify(actualEnKeys)===JSON.stringify(actualHiKeys),'current Admin Web English/Hindi key sets match');
 req(JSON.stringify(actualEnKeys)===JSON.stringify((aw.englishDictionary.keys||[]).slice().sort())&&JSON.stringify(actualHiKeys)===JSON.stringify((aw.hindiDictionary.keys||[]).slice().sort()),'Admin Web dictionary inventory keys match actual files');
 req(aw.i18nProviderExists&&aw.preferenceHelperExists&&fs.existsSync(path.join(root,aw.i18nProviderPath))&&fs.existsSync(path.join(root,aw.languagePreferencePath)),'existing Admin Web localization provider and preference helper are preserved');
 req(aw.currentlyDeclaredLanguages?.includes('en-IN')&&aw.currentlyDeclaredLanguages?.includes('hi-IN'),'Admin Web currently declares English and Hindi');
 const mobileStates=Object.values(inv.currentProjectSource.mobileApps||{});
 req(mobileStates.length===4&&mobileStates.every(x=>x.centralLocalizationFound===true&&x.sharedProviderWired===true&&fs.existsSync(path.join(root,x.providerFacade))&&fs.existsSync(path.join(root,x.metroConfig))),'four Mobile build targets wire the shared locale provider without a published package dependency');
 req(inv.currentProjectSource.customerLanguagePill?.present===true&&inv.currentProjectSource.customerLanguagePill?.currentlyInteractive===true&&customer.includes('toggleLocale')&&/हिन्दी/.test(customer),'Customer TopLanguage is wired to the local supported-locale toggle');
 req(inv.currentProjectSource.backendLanguagePreference?.preferredLanguageFieldPresent===false&&inv.currentProjectSource.backendLanguagePreference?.localePreferenceFieldPresent===false&&!/\bpreferredLanguage\b|\bpreferredLocale\b|\blanguagePreference\b/.test(schema),'current Backend schema still lacks an explicit persisted locale-preference field');
 req(inv.currentProjectSource.qaExecution==='NOT_RUN','language QA is not misreported as executed');
 req(['SOURCE_INVENTORY_COMPLETE_WITH_LANGUAGE_INTEGRATION_GAPS','SOURCE_INVENTORY_COMPLETE_CANONICAL_REGISTRY_ADDED','SOURCE_INVENTORY_COMPLETE_CANONICAL_KEY_CATALOG_ADDED','SOURCE_INVENTORY_COMPLETE_CANDIDATE_KEY_CATALOG_ADDED','SOURCE_INVENTORY_COMPLETE_SCREEN_KEY_MAP_ADDED','SOURCE_INVENTORY_COMPLETE_VALUE_RECONCILIATION_ADDED','SOURCE_INVENTORY_COMPLETE_CORE_MOBILE_LOCALIZATION_WIRED; FULL_SCREEN_AND_API_SYNC_GAPS_REMAIN','SOURCE_INVENTORY_COMPLETE_DYNAMIC_FORMATTING_IMPLEMENTED; NATIVE_REVIEW_AND_LQA_PENDING','SOURCE_INVENTORY_COMPLETE_DYNAMIC_FORMATTING_AND_LAYOUT_GUARDRAILS; NATIVE_REVIEW_AND_LQA_PENDING','SOURCE_INVENTORY_COMPLETE_DYNAMIC_FORMATTING_LAYOUT_AND_DIRECTION_ACCESSIBILITY_GUARDS; NATIVE_REVIEW_AND_LQA_PENDING','SOURCE_INVENTORY_COMPLETE_DIRECTION_ACCESSIBILITY_GUARDS; ACCOUNT_LOCALE_API_DECISION_PENDING','SOURCE_INVENTORY_COMPLETE_SHARED_LOCALIZATION_AND_TEST_ONLY_DIAGNOSTICS; ACCOUNT_LOCALE_API_PENDING'].includes(inv.status),'Step A status reflects complete inventory with integration gaps');
 req(baseline.localizationSourceInventory?.path==='config/localization-source-inventory.json'&&sourceInv.localizationSourceInventory?.path==='config/localization-source-inventory.json','project baseline and source inventory link localization source inventory');
 req(pkg.scripts?.['verify:localization-inventory']==='node scripts/verify-localization-source-inventory.mjs','localization inventory verifier is exposed through root npm script');
 const rootScripts=sourceInv.components?.find(c=>c.id==='rootBuildScripts');
 const actualScripts=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rootScripts?.scripts?.includes('verify-localization-source-inventory.mjs')&&rootScripts.fileCount===actualScripts.length&&JSON.stringify(rootScripts.scripts.slice().sort())===JSON.stringify(actualScripts),'source inventory includes the new localization verifier and actual script list');
 req(inv.nextSteps?.B&&inv.nextSteps?.C&&inv.nextSteps?.D,'subsequent language steps are explicitly sequenced');
}
function intersection(a,b){let n=0;for(const k of a)if(b.has(k))n++;return n;}
if(errors.length){console.error('LOCALIZATION SOURCE INVENTORY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('LOCALIZATION SOURCE INVENTORY CHECK: PASS');for(const c of checks)console.log(c);console.log('Note: inventory is static source evidence; mobile integration, preference API, native layout, notifications and all LQA cases remain untested.');
