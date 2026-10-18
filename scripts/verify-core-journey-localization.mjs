#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveRideXTranslation, translateRideXText } from '../packages/localization/src/translationRuntime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors=[]; const checks=[]; const pass=m=>checks.push(`PASS ${m}`); const fail=m=>errors.push(m); const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
const read=rel=>{try{return fs.readFileSync(path.join(root,rel),'utf8');}catch(e){fail(`${rel}: ${e.message}`);return '';}};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function flatten(obj,prefix=''){const out={};for(const [k,v] of Object.entries(obj||{})){const key=prefix?`${prefix}.${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))Object.assign(out,flatten(v,key));else out[key]=v;}return out;}
const contract=load('config/core-journey-localization.json'); const en=load('packages/localization/src/catalogs/mobile/en-IN.json'); const hi=load('packages/localization/src/catalogs/mobile/hi-IN.json');
const inv=load('config/localization-source-inventory.json'); const base=load('config/project-baseline.json'); const source=load('config/source-inventory.json'); const iface=load('config/localization-interface.json'); const support=load('config/localization-support-policy.json'); const pkg=load('package.json');
req(Boolean(contract&&en&&hi&&inv&&base&&source&&iface&&support&&pkg),'core localization contract, dictionaries and linked manifests parse');
if(contract&&en&&hi&&inv&&base&&source&&iface&&support&&pkg){
 const ef=flatten(en), hf=flatten(hi); const ekeys=Object.keys(ef).sort(), hkeys=Object.keys(hf).sort();
 req(contract.status==='CORE_MOBILE_JOURNEY_KEYS_WIRED_STATIC_VERIFY; FULL_SCREEN_COPY_NATIVE_REVIEW_AND_LQA_PENDING'&&contract.status===base.coreJourneyLocalization?.status&&contract.status===source.coreJourneyLocalization?.status,'core journey status matches linked manifests without claiming full-screen localization or tests');
 req(ekeys.length===44&&hkeys.length===44&&JSON.stringify(ekeys)===JSON.stringify(hkeys),'mobile example catalogs have exactly 44 matching keys per locale');
 req(sha(fs.readFileSync(path.join(root,'packages/localization/src/catalogs/mobile/en-IN.json')) )===contract.sourceCatalogs['en-IN'].sha256&&sha(fs.readFileSync(path.join(root,'packages/localization/src/catalogs/mobile/hi-IN.json')) )===contract.sourceCatalogs['hi-IN'].sha256,'mobile dictionaries remain byte-identical to original baseline example assets');
 req(Object.values(ef).every(v=>typeof v==='string'&&v.trim())&&Object.values(hf).every(v=>typeof v==='string'&&v.trim()),'mobile dictionary values are non-empty strings');
 const provider=read(contract.sharedProvider.path);
 req(provider.includes("@react-native-async-storage/async-storage")&&provider.includes("ridex.language.preference.v1"),'shared mobile provider uses existing AsyncStorage dependency and a dedicated preference key');
 req(/preferenceStore\.load\(\)\.then\(stored => \{[\s\S]*?if \(!active \|\| generation\.current !== startGeneration\) return;[\s\S]*?setLocaleState\(resolution\.locale\)/.test(provider)&&/const setLocale = useCallback\(\(next: RideXMobileLocale\) => \{[\s\S]*?const selectionGeneration = \+\+generation\.current;[\s\S]*?setLocaleState\(next\)/.test(provider),'startup hydration is generation-guarded and explicit locale selection updates state immediately');
 req(/const setLocale = useCallback\(\(next: RideXMobileLocale\) => \{[\s\S]*?queuePreferenceSave\(next, selectionGeneration\)/.test(provider)&&/const saved = await preferenceStore\.save\(next\);[\s\S]*?saved\.status !== 'SAVED'[\s\S]*?saved\.locale !== next/.test(provider),'explicit locale selection queues best-effort canonical persistence and validates the stored locale');
 req(provider.includes("'en-IN'")&&provider.includes("'hi-IN'")&&provider.includes('if (!supportedLocale(next)) return'),'provider only enables the two approved base locales');
 req(provider.includes("'__proto__'")&&provider.includes("'prototype'")&&provider.includes("'constructor'")&&provider.includes('Text unavailable'),'unsafe key paths/raw keys are blocked by safe fallback behavior');
 req(provider.includes('interpolate(text: string')&&provider.includes('unresolved {{placeholders}}'),'interpolation helper avoids visibly emitting unresolved placeholder tokens');
 req(!provider.includes('fetch(')&&!provider.includes('createRideXFetch')&&!provider.includes('preferredLanguage'),'provider does not invent or call an unapproved account-preference API');
 const apps=['customer-mobile','driver-mobile','admin-mobile','super-admin-control'];
 for(const app of apps){
   const facadeBase=`apps/${app}/shared/localization`; const metro=`apps/${app}/metro.config.js`; const entry=`apps/${app}/App.tsx`;
   const facade=['.ts','.tsx','.js','.jsx'].map(ext=>facadeBase+ext).find(rel=>fs.existsSync(path.join(root,rel)));
   const f=facade?read(facade):''; const m=read(metro); const e=read(entry);
   req(Boolean(facade)&&f.includes('packages/localization/src/RideXMobileLocaleProvider')&&e.includes('./shared/localization'),'shared facade is resolved from the app entrypoint for '+app);
   req(m.includes('packages')&&m.includes('localization')&&m.includes('watchFolders'),'Metro watches the shared localization source for '+app);
   req(e.includes('RideXMobileLocaleProvider'),'app entrypoint wraps the app with provider for '+app);
 }
 const customer=read('apps/customer-mobile/customer/App.tsx');
 for(const key of contract.clientTargets.customerMobile.keyUsage) req(customer.includes(`t("${key}"`)||customer.includes(`t('${key}'`),'Customer uses stable key '+key);
 req(customer.includes('accessibilityRole="button"')&&customer.includes('onPress={toggleLocale}')&&customer.includes('हिन्दी'),'Customer language selector is interactive and accessible');
 const driverAuth=read('apps/driver-mobile/driver/screens/auth/AuthScreens.tsx'); const driverHome=read('apps/driver-mobile/driver/screens/home/HomeScreens.tsx');
 for(const key of ['auth.login','auth.enterOtp','auth.verifyOtp','auth.resendOtp','auth.mobileNumber','auth.sendOtp']) req(driverAuth.includes(`t('${key}'`),'Driver auth uses stable key '+key);
 for(const key of ['driver.goOnline','driver.goOffline','driver.acceptRequest','driver.rejectRequest']) req(driverHome.includes(`t('${key}'`),'Driver operations uses stable key '+key);
 const admin=read('apps/admin-mobile/admin/App.tsx');
 for(const key of contract.clientTargets.adminMobile.keyUsage) req(admin.includes(`t("${key}"`),'Admin Mobile uses stable key '+key);
 const superAdmin=read('apps/super-admin-control/App.tsx');
 req(superAdmin.includes('RideXLanguageToggle')&&superAdmin.includes('Control actions are disabled'),'Super Admin language toggle does not enable privileged actions');
 req(read('apps/admin-web/src/lib/i18n.tsx').includes('resolveRideXTranslation'),'Admin Web remains wired to shared lookup runtime');
 req(resolveRideXTranslation({locale:'hi-IN',key:'auth.sendOtp',dictionaries:{'en-IN':en,'hi-IN':hi}}).text==='OTP भेजें','pure runtime resolves Hindi mobile auth copy');
 req(translateRideXText({locale:'en-IN',key:'booking.pickup',dictionaries:{'en-IN':en,'hi-IN':hi}})==='Pickup location','pure runtime resolves English booking copy');
 req(resolveRideXTranslation({locale:'hi-IN',key:'driver.acceptRequest',dictionaries:{'en-IN':en,'hi-IN':hi}}).text==='अनुरोध स्वीकार करें','pure runtime resolves Hindi Driver action copy');
 req(contract.testStatus?.mobileBuilds==='NOT_RUN'&&contract.testStatus?.physicalUiTests==='DEFERRED_UNTIL_ALL_FOUR_PACKAGES_COMPLETE'&&contract.testStatus?.languageQACases==='NOT_RUN','native build/UI/LQA are explicitly deferred, not falsely passed');
 req(contract.deliberatelyNotClaimed.some(x=>x.includes('All 92 screen IDs'))&&contract.deliberatelyNotClaimed.some(x=>x.includes('Backend account')),'full-screen translation and Backend account sync remain explicit gaps');
 req(base.coreJourneyLocalization?.path==='config/core-journey-localization.json'&&source.coreJourneyLocalization?.path==='config/core-journey-localization.json'&&inv.coreJourneyLocalization?.path==='config/core-journey-localization.json','baseline and inventories link the core journey localization contract');
 req(iface.surfaceIntegration.customerMobile.startsWith('CORE_AUTH')&&iface.surfaceIntegration.driverMobile.startsWith('CORE_AUTH')&&iface.surfaceIntegration.adminMobile.startsWith('CORE_LOGIN'),'shared localization interface records the actual core journey scope');
 req(support.surfaceReadiness.some(x=>x.surface==='Customer Mobile'&&x.currentStatus==='CORE_AUTH_OTP_BOOKING_KEYS_WIRED_LOCAL_SELECTOR_ACTIVE'),'support policy matches interactive Customer localization');
 req(pkg.scripts?.['verify:core-journey-localization']==='node scripts/verify-core-journey-localization.mjs','core journey verifier is registered');
 const rb=source.components?.find(c=>c.id==='rootBuildScripts'); const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rb?.scripts?.includes('verify-core-journey-localization.mjs')&&rb.fileCount===actual.length&&JSON.stringify(rb.scripts.slice().sort())===JSON.stringify(actual),'root source inventory lists the core journey verifier and correct script count');
}
if(errors.length){console.error(`CORE JOURNEY LOCALIZATION CHECK: FAIL (${errors.length} failures)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);} console.log(`CORE JOURNEY LOCALIZATION CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('Static source contract only; native builds, UI interaction, AsyncStorage on device, account sync and 25 LQA cases remain NOT_RUN.');
