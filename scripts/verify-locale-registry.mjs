#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};const req=(c,m)=>c?pass(m):fail(m);
const reg=load('config/locale-registry.json');const src=load('config/localization-source-inventory.json');const pol=load('config/localization-support-policy.json');const base=load('config/project-baseline.json');const si=load('config/source-inventory.json');const pkg=load('package.json');
req(Boolean(reg&&src&&pol&&base&&si&&pkg),'canonical locale registry and linked policy/manifests parse');
if(reg&&src&&pol&&base&&si&&pkg){
 const locales=reg.locales||[];const tags=locales.map(l=>l.localeTag);const allowedStages=new Set(['SUPPORTED_FIRST','PLANNED','BACKLOG']);
 req(reg.status==='CANONICAL_LOCALE_REGISTRY_NORMALIZED; SURFACE_ENABLEMENT_PENDING','registry does not overclaim client enablement');
 req(locales.length===25&&new Set(tags).size===25,'25 unique locale records preserved');
 const tagPattern=/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?-[A-Z]{2}$/;
 req(locales.every(l=>tagPattern.test(l.localeTag)),'locale tags follow the recorded language/script/region format');
 req(locales.every(l=>l.languageEnglishName&&/^[\x00-\x7F]+$/.test(l.languageEnglishName)&&l.languageSelfName&&/^(LTR|RTL)$/.test(l.direction)&&/^[A-Z][a-z]{3}$/.test(l.scriptCode)&&allowedStages.has(l.rolloutStatus)),'English names, native names, scripts, directions and rollout statuses are populated/valid');
 const selectable=locales.filter(l=>l.selectableByPolicy).map(l=>l.localeTag).sort();
 req(JSON.stringify(selectable)===JSON.stringify(['en-IN','hi-IN']),'only en-IN and hi-IN are selectable by current policy');
 req(reg.rules.sourceLocale==='en-IN'&&reg.rules.defaultFallbackLocale==='en-IN'&&JSON.stringify(reg.rules.firstSelectableLocales)===JSON.stringify(['en-IN','hi-IN']),'source/default locales align with Step B policy');
 const counts=Object.fromEntries([...allowedStages].map(s=>[s,locales.filter(l=>l.rolloutStatus===s).length]));
 req(JSON.stringify(counts)===JSON.stringify(reg.rolloutCounts),'rollout status counts match registry records');
 const gu=locales.find(l=>l.localeTag==='gu-IN');
 req(gu?.languageEnglishName==='Gujarati'&&gu?.languageSelfName==='ગુજરાતી'&&gu?.sourceCorrection?.originalObservedValue==='ગુજરાતી','Gujarati display name corrected and native self-name preserved with provenance');
 req(reg.corrections?.some(c=>c.id==='LANG-DQ-001'&&c.status==='RESOLVED_IN_CANONICAL_REGISTRY_SOURCE_EVIDENCE_PRESERVED'),'LANG-DQ-001 resolution recorded');
 req(reg.sourceProvenance?.localeRegistryCsvSha256===src.baselinePackage.sourceFiles.localeRegistry.sha256,'canonical registry retains original CSV hash');
 req(reg.qaStatus?.LQA001To025==='NOT_RUN'&&reg.qaStatus?.crossSurfaceRuntimeEnablement==='PENDING','translation QA and cross-surface enablement remain pending');
 req(src.baselinePackage?.knownDataQualityIssues?.some(x=>x.id==='LANG-DQ-001'&&x.observedValue==='ગુજરાતી'&&x.status==='RESOLVED_IN_CANONICAL_REGISTRY_SOURCE_EVIDENCE_PRESERVED'),'historical data-quality observation is retained in source inventory');
 req(pol.productLocalePolicy.localeRegistryPath==='config/locale-registry.json','support policy uses canonical registry');
 req(base.localeRegistry?.path==='config/locale-registry.json'&&si.localeRegistry?.path==='config/locale-registry.json','baseline and source inventory link canonical registry');
 req(pkg.scripts?.['verify:locale-registry']==='node scripts/verify-locale-registry.mjs','locale registry verifier is registered');
 const rb=si.components?.find(c=>c.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rb?.scripts?.includes('verify-locale-registry.mjs')&&rb.fileCount===actual.length&&JSON.stringify(rb.scripts.slice().sort())===JSON.stringify(actual),'source inventory root script list/count updated');
}
if(errors.length){console.error('CANONICAL LOCALE REGISTRY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log('CANONICAL LOCALE REGISTRY CHECK: PASS');for(const c of checks)console.log(c);console.log('Note: registry metadata is statically validated; translation quality, rendering, locale sync and LQA remain NOT_RUN.');

