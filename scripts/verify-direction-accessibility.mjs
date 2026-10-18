#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveRideXTextDirection, isRideXLocaleDirectionSupported, isolateRideXDirectionalValue } from '../packages/localization/src/localeDirection.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
const cfg=load('config/direction-accessibility.json');const screenMap=load('config/screen-to-key-map.json');const layout=load('config/text-expansion-layout.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const loc=load('config/localization-source-inventory.json');const pkg=load('package.json');
function read(rel){try{return fs.readFileSync(path.join(root,rel),'utf8');}catch(e){fail(`${rel} missing: ${e.message}`);return '';}}
req(Boolean(cfg&&screenMap&&layout&&baseline&&source&&loc&&pkg),'direction/accessibility contracts and project manifests parse');
if(cfg&&screenMap&&layout&&baseline&&source&&loc&&pkg){
 const rows=cfg.screenMatrix||[];const ids=rows.map(x=>x.screenId);const expected=(screenMap.screens||[]).map(x=>x.screenId);
 req(rows.length===92&&new Set(ids).size===92&&JSON.stringify(ids.slice().sort())===JSON.stringify(expected.slice().sort()),'direction/accessibility matrix maps all 92 unique Screen IDs');
 req(JSON.stringify(cfg.supportedLocales)===JSON.stringify(['en-IN','hi-IN'])&&cfg.directionPolicy.direction==='ltr'&&cfg.directionPolicy.rtlLocalesEnabled===false,'only supported English/Hindi LTR policy is enabled; RTL is not silently enabled');
 req(rows.every(r=>r.directionPolicy==='LTR_ONLY_FOR_CURRENT_SUPPORTED_LOCALES'&&r.localeCases.includes('en-IN')&&r.localeCases.includes('hi-IN')),'every screen explicitly records current supported locale/direction cases');
 req(rows.every(r=>r.checks.length>=5&&r.executionStatus==='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGES_FINISH'),'each screen carries accessibility checks and honest deferred execution status');
 req(Object.keys(cfg.surfaceCounts).length===7&&Object.entries(rows.reduce((a,r)=>(a[r.appSurface]=(a[r.appSurface]||0)+1,a),{})).every(([k,v])=>cfg.surfaceCounts[k]===v),'surface counts agree with the 92-screen map');
 req(cfg.testExecution?.webKeyboardAndFocusTests==='NOT_RUN'&&cfg.testExecution?.nativeScreenReaderTests==='NOT_RUN'&&cfg.testExecution?.contrastMeasurements==='NOT_RUN'&&cfg.testExecution?.touchTargetMeasurements==='NOT_RUN','physical keyboard/screen-reader/contrast/touch-target checks are not falsely marked as passed');
 const adminHtml=read('apps/admin-web/index.html');const websiteHtml=read('apps/public-website/index.html');const webI18n=read('apps/admin-web/src/lib/i18n.tsx');
 req(/<html[^>]*lang="en-IN"[^>]*dir="ltr"/.test(adminHtml),'Admin Web initial document declares locale and LTR direction');
 req(/<html[^>]*lang="en-IN"[^>]*dir="ltr"/.test(websiteHtml),'Public Website declares its current locale and LTR direction');
 req(webI18n.includes('document.documentElement.lang = language')&&webI18n.includes('document.documentElement.dir = "ltr"'),'Admin Web synchronizes root language and current supported LTR direction');
 const adminCss=read('apps/admin-web/src/styles.css');const siteCss=read('apps/public-website/style.css');
 req(adminCss.includes('Step P — keyboard focus, touch targets')&&/:where\(button, a, input, select, textarea, summary, \[role="button"\]\):focus-visible/.test(adminCss),'Admin Web has persistent keyboard focus indication');
 req(adminCss.includes('.rx-icon-btn { min-width: 44px; min-height: 44px; width: 44px; height: 44px; }')&&adminCss.includes('.rx-btn { min-height: 44px; }'),'Admin Web common controls have 44px target-size guardrails');
 req(adminCss.includes('unicode-bidi: isolate')&&adminCss.includes('.rx-endpoint'),'Admin Web isolates technical IDs/endpoints against mixed-direction copy');
 req(siteCss.includes('Step P — visible keyboard focus')&&siteCss.includes('outline: 3px solid #145bc1')&&siteCss.includes('.menu-toggle { min-width: 44px; min-height: 44px; }'),'Public Website has visible keyboard focus and menu hit-area guards');
 req(siteCss.includes('bdi, .bidi-isolate, code { unicode-bidi: isolate; }'),'Public Website includes bidirectional value-isolation styles');
 const provider=read('packages/localization/src/RideXMobileLocaleProvider.tsx');
 req(provider.includes('hitSlop={8}')&&provider.includes('minWidth: 44, minHeight: 44'),'shared mobile language toggle has an accessible name and 44dp minimum target/hitSlop');
 const mapCards=['apps/customer-mobile/shared/ui/RideXMapCard.tsx','apps/driver-mobile/shared/ui/RideXMapCard.tsx','apps/admin-mobile/shared/ui/RideXMapCard.tsx'];
 req(mapCards.every(rel=>{const s=read(rel);return s.includes('accessibilityLabel="Recenter map"')&&s.includes('accessibilityLabel="Close selected location details"')&&s.includes('hitSlop={8}')&&s.includes('recenterButton: { minWidth: 44, minHeight: 44')&&s.includes('dismissButton: { minWidth: 44, minHeight: 44');}),'map recenter/close controls in Customer, Driver and Admin get labels, roles and expanded tap areas');
 const nativeRoots=['apps/customer-mobile/App.tsx','apps/driver-mobile/App.tsx','apps/admin-mobile/App.tsx','apps/super-admin-control/App.tsx'];
 req(nativeRoots.every(rel=>!read(rel).includes('allowFontScaling={false}')),'active mobile root components retain system font scaling');
 req(cfg.sourceGuardrails?.remainingReviewCandidates?.length>=3,'contrast, screen-reader and Gateway device review gaps remain explicit');
 req(baseline.directionAccessibility?.path==='config/direction-accessibility.json'&&source.directionAccessibility?.path==='config/direction-accessibility.json'&&loc.directionAccessibility?.path==='config/direction-accessibility.json','project baseline and source inventories link direction/accessibility map');
 req(pkg.scripts?.['verify:direction-accessibility']==='node scripts/verify-direction-accessibility.mjs','dedicated direction/accessibility checker is in root scripts');
 const rootScripts=source.components?.find(c=>c.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rootScripts?.fileCount===actual.length&&JSON.stringify(rootScripts.scripts.slice().sort())===JSON.stringify(actual)&&rootScripts.scripts.includes('verify-direction-accessibility.mjs'),'root source inventory tracks all validation script files');
 req(loc.nextSteps?.P?.includes('DONE')&&loc.nextSteps?.Q,'Package 3 records Step P done statically and Step Q next');
 const pure=[
  ['en-IN LTR',()=>assert.equal(resolveRideXTextDirection('en-IN'),'ltr')],
  ['hi-IN LTR',()=>assert.equal(resolveRideXTextDirection('hi-IN'),'ltr')],
  ['unsupported locale defaults LTR',()=>assert.equal(resolveRideXTextDirection('ur-PK'),'ltr')],
  ['supported English direction',()=>assert.equal(isRideXLocaleDirectionSupported('en-IN','ltr'),true)],
  ['supported Hindi direction',()=>assert.equal(isRideXLocaleDirectionSupported('hi-IN','ltr'),true)],
  ['unsupported RTL locale not enabled',()=>assert.equal(isRideXLocaleDirectionSupported('ar-IN','rtl'),false)],
  ['numeric identifier is isolated',()=>assert.equal(isolateRideXDirectionalValue(9122160691),`\u20669122160691\u2069`)],
  ['text identifier is isolated',()=>assert.equal(isolateRideXDirectionalValue('AB-12345'),`\u2066AB-12345\u2069`)],
  ['blank identifier safely rejected',()=>assert.equal(isolateRideXDirectionalValue('   '),'')],
  ['control characters safely rejected',()=>assert.equal(isolateRideXDirectionalValue('12\u00001'),'')],
  ['object values are not coerced to text',()=>assert.equal(isolateRideXDirectionalValue({id:'x'}),'')]
 ];
 for(const [name,fn] of pure){try{fn();pass(`direction helper: ${name}`)}catch(e){fail(`direction helper: ${name}: ${e.message}`)}}
}
if(errors.length){console.error(`DIRECTION/ACCESSIBILITY CHECK: FAIL (${errors.length} failures)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log(`DIRECTION/ACCESSIBILITY CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('Note: static guards and pure helper checks only. Screen reader, focus order, actual touch target dimensions, contrast and device tests remain NOT_RUN.');
