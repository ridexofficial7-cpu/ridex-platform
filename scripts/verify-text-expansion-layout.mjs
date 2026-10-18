#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors=[]; const checks=[];
const pass=m=>checks.push(`PASS ${m}`); const fail=m=>errors.push(m); const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel} parse/read failed: ${e.message}`);return null;}};
const layout=load('config/text-expansion-layout.json');
const screenMap=load('config/screen-to-key-map.json');
const baseline=load('config/project-baseline.json');
const source=load('config/source-inventory.json');
const loc=load('config/localization-source-inventory.json');
const pkg=load('package.json');
function read(rel){try{return fs.readFileSync(path.join(root,rel),'utf8');}catch(e){fail(`${rel} cannot be read: ${e.message}`);return '';}}
req(Boolean(layout&&screenMap&&baseline&&source&&loc&&pkg),'layout, screen map, baseline, source inventory, localization inventory and package manifest parse');
if(layout&&screenMap&&baseline&&source&&loc&&pkg){
 const screens=layout.screenMatrix||[]; const ids=screens.map(s=>s.screenId); const sourceIds=(screenMap.screens||[]).map(s=>s.screenId);
 req(screens.length===92 && layout.sourceProvenance?.screenCount===92 && screenMap.screens?.length===92,'layout matrix preserves all 92 original screen records');
 req(new Set(ids).size===92 && JSON.stringify(ids.slice().sort())===JSON.stringify(sourceIds.slice().sort()),'screen IDs are unique and match the canonical screen map');
 const derivedCounts=screens.reduce((a,s)=>(a[s.appSurface]=(a[s.appSurface]||0)+1,a),{});
 req(Object.keys(derivedCounts).length===Object.keys(layout.surfaceCounts||{}).length&&Object.entries(derivedCounts).every(([k,v])=>layout.surfaceCounts[k]===v),'surface totals are derived from the 92-screen matrix');
 req(Object.values(layout.profiles||{}).every(p=>Array.isArray(p.checks)&&p.checks.length>=5),'each responsive profile has a concrete check list');
 req(layout.profiles?.mobile?.widthDp?.includes(320)&&layout.profiles?.mobile?.fontScale?.includes(2.0),'mobile layout matrix includes small viewport and 200% font-scale target');
 req(layout.profiles?.['web-admin']?.browserZoomPercent?.includes(200)&&layout.profiles?.['public-web']?.browserZoomPercent?.includes(200),'web layout matrices include 200% browser zoom');
 req(layout.profiles?.['gateway-android']?.fontScale?.includes(2.0),'Gateway matrix includes large native font scale');
 req(screens.every(s=>Array.isArray(s.sourcePaths)&&s.sourcePaths.length>0&&s.existingSourcePaths.length>0&&s.missingSourcePaths.length===0),'every screen has existing source evidence; missing source paths remain a hard failure');
 req(screens.every(s=>layout.profiles[s.layoutProfile]&&Array.isArray(s.requiredChecks)&&s.requiredChecks.length>0),'every screen links to a valid responsive profile and required checks');
 req(screens.every(s=>s.physicalVisualTestStatus==='NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGES_FINISH'),'per-screen visual test status is honestly deferred');
 req(layout.testExecution?.browserViewportTests==='NOT_RUN'&&layout.testExecution?.nativeDeviceFontScaleTests==='NOT_RUN'&&layout.testExecution?.accessibilityTests==='NOT_RUN','browser/native/accessibility tests are not falsely reported as executed');
 req(layout.sourceGuardrails?.knownReviewCandidates?.length>=3,'remaining clipping/Compose candidates are explicitly queued for visual review');
 const adminCss=read('apps/admin-web/src/styles.css');
 const webCss=read('apps/public-website/style.css');
 req(adminCss.includes('Step O — locale/text expansion guardrails')&&adminCss.includes('.rx-page-head {')&&/\.rx-page-head\s*\{[^}]*flex-wrap:\s*wrap/s.test(adminCss),'Admin Web has page-heading/min-width/text wrapping guardrails');
 req(/\.rx-endpoint,[\s\S]{0,650}white-space:\s*normal;[\s\S]{0,200}overflow-wrap:\s*anywhere/s.test(adminCss),'long Web endpoint/record values can wrap rather than being silently ellipsized');
 req(adminCss.includes(':lang(hi-IN)')&&adminCss.includes('letter-spacing: normal'),'Admin Web Hindi headings remove tight Latin tracking');
 req(webCss.includes('Step O — responsive/text-expansion guardrails')&&webCss.includes('Additional Step O guard: navigation')&&/\.admin-btn,[\s\S]{0,150}white-space:\s*normal/s.test(webCss),'public website layout guards allow translated nav and action labels to wrap');
 req(webCss.includes(':lang(hi-IN)')&&webCss.includes('line-height: 1.15'),'public website has Hindi heading typography guardrails');
 const rnRoots=layout.sourceGuardrails?.activeMobileTargets||[];
 const rnTexts=rnRoots.map(rel=>({rel,txt:read(`${rel}/App.tsx`)}));
 req(rnTexts.length===4&&rnTexts.every(x=>x.txt.length>0),'all four independent React Native targets are included in font-scaling audit');
 req(rnTexts.every(x=>!/allowFontScaling\s*=\s*\{\s*false\s*\}/.test(x.txt)),'active mobile app entrypoints do not disable system font scaling');
 const customer=read('apps/customer-mobile/customer/App.tsx'); const admin=read('apps/admin-mobile/admin/App.tsx'); const event=read('apps/customer-mobile/customer/EventSessionScreen.tsx');
 req(/<Pressable[^>]*accessibilityLabel=\{currentLocationLabel\}[\s\S]{0,800}<Text[^>]*numberOfLines=\{1\}/.test(customer),'compact current-location pill exposes full current value to accessibility');
 req(/<Text[^>]*numberOfLines=\{1\}[^>]*accessibilityLabel=\{currentMeta\.title\}/.test(admin),'Admin header clamp exposes full title through accessibilityLabel');
 req(!/styles\.eventDesc[\s\S]{0,130}numberOfLines/.test(event)&&!/styles\.stopAddress[\s\S]{0,150}numberOfLines/.test(event),'Customer event descriptions and stop addresses are not hard-clamped to a fixed line count');
 req(!/numberOfLines\s*=\s*\{\s*3\s*\}/.test(event),'Customer event description three-line clamp is removed');
 req(baseline.textExpansionLayout?.path==='config/text-expansion-layout.json'&&source.textExpansionLayout?.path==='config/text-expansion-layout.json'&&loc.textExpansionLayout?.path==='config/text-expansion-layout.json','project baseline and both source inventories link the layout matrix');
 req(pkg.scripts?.['verify:text-expansion-layout']==='node scripts/verify-text-expansion-layout.mjs','dedicated layout validator is registered in root npm scripts');
 const rootScripts=source.components?.find(c=>c.id==='rootBuildScripts');
 const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rootScripts?.fileCount===actual.length&&JSON.stringify(rootScripts.scripts.slice().sort())===JSON.stringify(actual)&&rootScripts.scripts.includes('verify-text-expansion-layout.mjs'),'root source inventory exactly tracks validator file count and names');
 req(loc.nextSteps?.O?.includes('DONE')&&loc.nextSteps?.P,'Package 3 A-Z register has Step O complete and Step P queued');
}
if(errors.length){console.error(`TEXT EXPANSION/LAYOUT CHECK: FAIL (${errors.length} failures)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log(`TEXT EXPANSION/LAYOUT CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('Note: static source/layout guardrails only. Browser viewport, native font-scale, keyboard, device accessibility and all physical LQA tests remain NOT_RUN.');
