#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveRideXLocale, normalizeExplicitRideXLocale, normalizeDeviceRideXLocale, RIDEX_SUPPORTED_LOCALES } from '../packages/localization/src/localeResolver.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(c,m)=>c?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
const contract=load('config/locale-first-launch-resolution.json');const policy=load('config/localization-support-policy.json');const registry=load('config/locale-registry.json');const cases=load('config/locale-first-launch-test-cases.json');const base=load('config/project-baseline.json');const inv=load('config/source-inventory.json');const pkg=load('package.json');
req(Boolean(contract&&policy&&registry&&cases&&base&&inv&&pkg),'first-launch contract and linked policies/manifests parse');
if(contract&&policy&&registry&&cases&&base&&inv&&pkg){
 req(contract.status==='RESOLVER_AND_SHARED_MOBILE_PROVIDER_WIRED; ACCOUNT_SYNC_AND_PHYSICAL_QA_PENDING','resolver status does not overclaim client integration');
 req(JSON.stringify([...RIDEX_SUPPORTED_LOCALES])===JSON.stringify(['en-IN','hi-IN']),'runtime resolver exposes only en-IN and hi-IN');
 req(JSON.stringify(contract.supportedLocales)===JSON.stringify(['en-IN','hi-IN'])&&contract.defaultFallbackLocale==='en-IN','resolver contract agrees with baseline locale policy');
 req(contract.implementation.runtimeModule==='packages/localization/src/localeResolver.mjs'&&fs.existsSync(path.join(root,contract.implementation.typescriptDeclarations)),'runtime module and TypeScript declaration exist');
 req(contract.precedence.beforeAuthentication[0].includes('explicit')&&contract.precedence.beforeAuthentication.at(-1)==='en-IN fallback','unauthenticated precedence is explicit local/session > local preference > device > fallback');
 req(contract.precedence.afterAuthentication[0].includes('current-session explicit')&&contract.precedence.afterAuthentication[1].includes('account preference'),'authenticated precedence preserves explicit session choice before account preference');
 req(String(policy.selectionAndSync.serverRouteStatus).startsWith('NOT_ESTABLISHED')&&contract.integrationStatus.backendAccountPreference==='API_AND_SCHEMA_DECISION_PENDING','account preference synchronization is not falsely enabled before API/schema approval');
 req(['customerMobile','driverMobile','adminMobile','superAdminControl'].every(app=>contract.integrationStatus[app]?.startsWith('WIRED_TO_SHARED_MOBILE_PROVIDER')),'all four mobile provider integrations are represented in the contract');
 req(contract.qaStatus.all25Lqa==='NOT_RUN'&&contract.qaStatus.deviceBrowserApiDatabasePhysicalTests==='DEFERRED_UNTIL_RUNTIME_DEVICE_RESTART_TESTS_RUN','physical/LQA tests remain deferred pending runtime verification');
 req(cases.cases.length>=18&&new Set(cases.cases.map(c=>c.id)).size===cases.cases.length,'locale resolver test vectors are present and uniquely identified');
 let caseFailures=0;
 for(const t of cases.cases){
  try{
   const input=structuredClone(t.input);const before=structuredClone(t.input);
   const result=resolveRideXLocale(input);
   assert.deepEqual(result,t.expected,`case ${t.id}`);
   assert.deepEqual(input,before,`case ${t.id} mutates input`);
   if(result.diagnostics.some(d=>typeof d!=='string'||d.includes('bn-IN')||d.includes('ta-IN'))) throw new Error(`case ${t.id} exposes raw value in diagnostics`);
  }catch(e){caseFailures++;fail(`${t.id}: ${e.message}`)}
 }
 req(caseFailures===0,`${cases.cases.length} first-launch decision cases pass pure logic checks`);
 req(normalizeExplicitRideXLocale('HI_in')==='hi-IN'&&normalizeExplicitRideXLocale('bn-IN')===undefined,'explicit choice canonicalizes casing but never enables an unsupported locale');
 req(normalizeDeviceRideXLocale('en-US')==='en-IN'&&normalizeDeviceRideXLocale('hi-NP')==='hi-IN'&&normalizeDeviceRideXLocale('hi-Latn-IN')===undefined,'device locale region/script mapping follows declared rules');
 req(Object.isFrozen(resolveRideXLocale({authenticated:true,accountPreference:'hi-IN'})),'resolver returns immutable result contract');
 req(base.localeFirstLaunchResolution?.path==='config/locale-first-launch-resolution.json'&&inv.localeFirstLaunchResolution?.path==='config/locale-first-launch-resolution.json'&&base.localeFirstLaunchResolution?.runtimeModule===contract.implementation.runtimeModule&&inv.localeFirstLaunchResolution?.runtimeModule===contract.implementation.runtimeModule,'baseline and inventory link the resolver');
 req(pkg.scripts?.['verify:locale-first-launch']==='node scripts/verify-locale-first-launch.mjs','dedicated resolver validator is registered');
 const rb=inv.components?.find(c=>c.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rb?.scripts?.includes('verify-locale-first-launch.mjs')&&rb.fileCount===actual.length&&JSON.stringify(rb.scripts.slice().sort())===JSON.stringify(actual),'root script inventory/count includes the new verifier');
 const lp=inv.plannedComponentsNotYetPresent?.find(c=>c.id==='localization');
 req(String(lp?.status||'').includes('CORE_JOURNEY_WIRING_STATIC_VERIFY'),'localization package remains tracked as partial, not fully complete');
}
if(errors.length){console.error('FIRST-LAUNCH LOCALE RESOLVER CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('FIRST-LAUNCH LOCALE RESOLVER CHECK: PASS');for(const c of checks)console.log(c);console.log('Pure resolver logic checks only. No device, browser, network, API or database test was run.');
