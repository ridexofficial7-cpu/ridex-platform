#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);const load=r=>{try{return JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));}catch(e){fail(`${r}: ${e.message}`);return null;}};
const policy=load('config/localization-rollout-policy.json');const registry=load('config/locale-registry.json');const support=load('config/localization-support-policy.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const loc=load('config/localization-source-inventory.json');const pkg=load('package.json');
req(Boolean(policy&&registry&&support&&baseline&&source&&loc&&pkg),'rollout policy and source manifests parse');
if(policy&&registry&&support&&baseline&&source&&loc&&pkg){
 const tags=policy.localeReadiness.map(x=>x.localeTag).sort();const regTags=registry.locales.map(x=>x.localeTag).sort();
 req(tags.length===25&&new Set(tags).size===25&&JSON.stringify(tags)===JSON.stringify(regTags),'all 25 registry locales have one readiness entry');
 req(policy.rules.onlySelectableByPolicy.join(',')===support.productLocalePolicy.firstSupportedLocales.join(',')&&policy.rules.onlySelectableByPolicy.join(',')==='en-IN,hi-IN','rollout allowlist matches supported-locale policy');
 req(policy.localeReadiness.filter(x=>x.selectableByPolicy).map(x=>x.localeTag).sort().join(',')==='en-IN,hi-IN','planned/backlog locales are not selectable');
 req(policy.localeReadiness.every(x=>x.productionEnabled===false)&&policy.productionEnabledLocales.length===0&&policy.productionApproved===false,'no locale is falsely marked production-enabled/approved');
 req(policy.requiredReleaseGates.length===8&&policy.localeReadiness.every(x=>policy.requiredReleaseGates.every(g=>Object.hasOwn(x.gates,g))),'every locale has the full release-gate set');
 req(policy.localeReadiness.filter(x=>x.rolloutStatus!=='SUPPORTED_FIRST').every(x=>x.readinessStatus==='NOT_STARTED'&&!x.productionEnabled),'planned/backlog locale rollout has not started');
 req(policy.localeReadiness.filter(x=>x.rolloutStatus==='SUPPORTED_FIRST').every(x=>x.readinessStatus==='BLOCKED_REVIEW_AND_LQA'&&x.gates.relevantLanguageQACases==='NOT_RUN'&&x.gates.productOwnerApproval==='PENDING'),'initial locales remain blocked until QA/review/approval evidence exists');
 req(baseline.localizationRolloutPolicy?.path==='config/localization-rollout-policy.json'&&source.localizationRolloutPolicy?.path==='config/localization-rollout-policy.json'&&loc.localizationRolloutPolicy?.path==='config/localization-rollout-policy.json','baseline and inventories link rollout policy');
 req(pkg.scripts?.['verify:localization-rollout']==='node scripts/verify-localization-rollout.mjs','rollout verifier is registered in root package');
 const roots=source.components.find(x=>x.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(roots.fileCount===actual.length&&JSON.stringify(roots.scripts.slice().sort())===JSON.stringify(actual),'root source inventory script list/count matches disk');
 if(process.argv.includes('--target=LIVE'))fail('LIVE rollout blocked: en-IN/hi-IN native/domain, critical copy, notifications, visual accessibility, LQA and owner approval gates are not complete');
}
if(errors.length){console.error(`LOCALIZATION ROLLOUT CHECK: FAIL (${errors.length} errors, ${checks.length} assertions)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}console.log(`LOCALIZATION ROLLOUT CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('Static rollout policy only; current productionEnabledLocales is empty.');
