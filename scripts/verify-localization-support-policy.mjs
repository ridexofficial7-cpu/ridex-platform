#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel} parse/read failed: ${e.message}`);return null;}};
const p=load('config/localization-support-policy.json');const inv=load('config/localization-source-inventory.json');const registry=load('config/locale-registry.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const pkg=load('package.json');
function req(x,m){if(x)pass(m);else fail(m);}
req(Boolean(p&&inv&&registry&&baseline&&source&&pkg),'locale policy and all linked manifests parse');
if(p&&inv&&baseline&&source&&pkg){
 req(p.status==='SHARED_LOCAL_PREFERENCE_STORE_WIRED; DEVICE_STARTUP_AND_NATIVE_REVIEW_PENDING','policy status reflects shared preference wiring without claiming full cross-surface completion');
 req(p.productLocalePolicy.sourceLocale==='en-IN'&&p.productLocalePolicy.defaultFallbackLocale==='en-IN','English India is canonical source and default fallback');
 req(JSON.stringify(p.productLocalePolicy.firstSupportedLocales)===JSON.stringify(['en-IN','hi-IN']),'only en-IN and hi-IN are first supported locales');
 req(p.productLocalePolicy.localeRegistryPath==='config/locale-registry.json'&&registry.rules?.defaultFallbackLocale==='en-IN','support policy references the canonical locale registry and fallback');
 const sourceRegistry=inv.baselinePackage?.sourceFiles?.localeRegistry?.records||[];
 req(['en-IN','hi-IN'].every(tag=>sourceRegistry.some(r=>r.locale_tag===tag&&r.status==='Supported first')),'base locales align with original registry');
 req(p.productLocalePolicy.unsupportedExplicitSelection.includes('reject')&&p.productLocalePolicy.unsupportedAccountPreferenceOnRead.includes('en-IN')&&p.productLocalePolicy.unsupportedPreferenceWrite.includes('reject'),'unsupported locale behavior is explicit');
 req(p.productLocalePolicy.missingTranslation.includes('en-IN')&&p.productLocalePolicy.missingTranslation.includes('raw internal translation key'),'missing-key fallback does not reveal raw keys');
 req(p.selectionAndSync.beforeAuthentication.length===3&&p.selectionAndSync.beforeAuthentication[0].includes('local')&&p.selectionAndSync.beforeAuthentication[1].includes('device')&&p.selectionAndSync.beforeAuthentication[2]==='en-IN fallback','pre-auth selection precedence is defined');
 req(p.selectionAndSync.afterAuthentication.length===4&&p.selectionAndSync.afterAuthentication[0].includes('explicitly changed')&&p.selectionAndSync.afterAuthentication[1].includes('account saved')&&p.selectionAndSync.afterAuthentication[2].includes('account preference is missing')&&p.selectionAndSync.afterAuthentication[3].includes('device locale'),'post-auth explicit/account/local/device precedence is defined');
 req(p.selectionAndSync.syncFailureBehavior.includes('do not revert')&&p.selectionAndSync.localSelectionBehavior.includes('without network dependency'),'local language remains usable during sync failure');
 req(p.languageChangeMustNotResetOrMutate.length===6,'language selection cannot mutate auth/OTP/booking/trip/payment/Admin/Gateway state');
 req(p.surfaceReadiness.length===8&&p.surfaceReadiness.some(x=>x.surface==='Admin Web'&&x.currentStatus==='LOCAL_EN_HI_I18N_PRESENT'),'all known surface readiness boundaries remain explicit');
 req(p.surfaceReadiness.some(x=>x.surface==='Customer Mobile'&&x.currentStatus==='CORE_AUTH_OTP_BOOKING_KEYS_WIRED_LOCAL_SELECTOR_ACTIVE'),'Customer Mobile core auth/OTP/booking keys and local selector are recorded accurately');
 req(p.surfaceReadiness.some(x=>x.surface==='Driver Mobile'&&x.currentStatus==='CORE_AUTH_REGISTRATION_HOME_REQUEST_KEYS_WIRED'),'Driver Mobile core journey wiring is recorded accurately');
 req(p.surfaceReadiness.some(x=>x.surface==='Admin Mobile'&&x.currentStatus==='CORE_LOGIN_OTP_KEYS_WIRED'),'Admin Mobile login/OTP key wiring is recorded accurately');
 req(p.selectionAndSync.serverRouteStatus.startsWith('NOT_ESTABLISHED')&&p.selectionAndSync.accountPreferencePersistenceStatus==='NOT_IMPLEMENTED_OR_NOT_FOUND_IN_CURRENT_SCHEMA','proposed API/schema is not misreported as existing implementation');
 req(p.testStatus.languageQAScenarios==='NOT_RUN'&&p.testStatus.productionApproval===false,'QA and production are not falsely marked complete');
 req(baseline.localizationSupportPolicy?.path==='config/localization-support-policy.json'&&source.localizationSupportPolicy?.path==='config/localization-support-policy.json','baseline and source inventory link the base locale policy');
 req(pkg.scripts?.['verify:localization-support-policy']==='node scripts/verify-localization-support-policy.mjs','support-policy validator is registered');
 const rb=source.components?.find(c=>c.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rb?.scripts?.includes('verify-localization-support-policy.mjs')&&rb.fileCount===actual.length&&JSON.stringify(rb.scripts.slice().sort())===JSON.stringify(actual),'root static script inventory remains current');
}
if(errors.length){console.error('LOCALIZATION SUPPORT POLICY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log('LOCALIZATION SUPPORT POLICY CHECK: PASS');for(const x of checks)console.log(x);console.log('Language selection QA/API synchronization remains NOT_RUN; only policy contract is verified.');
