#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};const req=(x,m)=>x?pass(m):fail(m);
const map=load('config/language-selector-placement-map.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const registry=load('config/locale-registry.json');const pkg=load('package.json');
req(Boolean(map&&baseline&&source&&registry&&pkg),'selector placement map and linked contracts parse');
if(map&&baseline&&source&&registry&&pkg){
 req(map.status==='PLACEMENT_TO_SCREEN_AND_SOURCE_MAP_COMPLETE; IMPLEMENTATION_GAPS_AND_RUNTIME_TESTS_REMAIN','map status is explicit about remaining implementation');
 req(map.screenInventory.count===92&&map.screenInventory.uniqueIds===92&&map.screenInventory.screens.length===92,'all 92 original UI/UX Screen IDs are preserved uniquely');
 req(map.sourceProvenance.originalPlacementCount===12&&map.placements.length===12&&new Set(map.placements.map(p=>p.placementId)).size===12,'all 12 language placement IDs are mapped uniquely');
 const ids=new Set(map.screenInventory.screens.map(s=>s.id));
 req(map.placements.every(p=>p.mappedScreenIds.every(id=>ids.has(id))),'all mapped Screen IDs exist in the 92-screen inventory');
 req(map.placements.every(p=>Array.isArray(p.sourcePaths)&&p.sourcePaths.every(rel=>fs.existsSync(path.join(root,rel)))),'all listed route/component source paths exist');
 const byId=new Map(map.placements.map(p=>[p.placementId,p]));
 req(JSON.stringify(byId.get('LANG-002')?.mappedScreenIds)===JSON.stringify(['C-03','C-04']),'Customer login/OTP placement maps to C-03/C-04');
 req(JSON.stringify(byId.get('LANG-004')?.mappedScreenIds)===JSON.stringify(['D-02','D-03']),'Driver login/OTP placement maps to D-02/D-03');
 req(byId.get('LANG-008')?.mappedScreenIds.includes('AW-01')&&byId.get('LANG-009')?.mappedScreenIds.includes('AW-20'),'Admin Web login and authenticated surfaces are mapped');
 req(byId.get('LANG-009')?.mappedScreenIds.length===18,'authenticated Web placement covers AW-03 through AW-20 (18 screens) plus AW-03 shell once');
 req(byId.get('LANG-011')?.mappedScreenIds.length===0&&byId.get('LANG-011')?.mappingStatus==='CONDITIONAL_NO_UI_IN_CURRENT_SOURCE','Provider operator UI remains conditional rather than invented');
 req(byId.get('LANG-010')?.mappedScreenIds.length===5&&byId.get('LANG-012')?.mappedScreenIds.length===5,'website and Gateway screen groups are mapped');
 const login=fs.readFileSync(path.join(root,'apps/admin-web/src/pages/LoginPage.tsx'),'utf8');const layout=fs.readFileSync(path.join(root,'apps/admin-web/src/layouts/AdminLayout.tsx'),'utf8');
 req(login.includes('LanguageSelector')&&layout.includes('LanguageSelector'),'Admin Web language selector use is confirmed in both login and authenticated layout source');
 const customer=fs.readFileSync(path.join(root,'apps/customer-mobile/customer/App.tsx'),'utf8');const top=(customer.match(/function\s+TopLanguage\s*\(\)\s*\{([\s\S]*?)\n\}/)||[])[1]||'';
 req(top.includes('English')&&(/<Pressable|onPress/.test(top)||top.includes('toggleLocale')),'Customer language selector is interactive and wired to the local locale toggle');
 req(map.qaStatus==='NOT_RUN'&&map.placements.every(p=>p.runtimeExecution==='NOT_RUN'),'UI selector and LQA tests remain NOT_RUN');
 req(baseline.languageSelectorPlacementMap?.path==='config/language-selector-placement-map.json'&&source.languageSelectorPlacementMap?.path==='config/language-selector-placement-map.json','baseline and inventory point to placement map');
 req(pkg.scripts?.['verify:language-selector-placement-map']==='node scripts/verify-language-selector-placement-map.mjs','placement verifier is registered');
 const rb=source.components.find(c=>c.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(rb.scripts.includes('verify-language-selector-placement-map.mjs')&&rb.fileCount===actual.length&&JSON.stringify(rb.scripts.slice().sort())===JSON.stringify(actual),'root script inventory is current');
}
if(errors.length){console.error('LANGUAGE SELECTOR PLACEMENT MAP CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log('LANGUAGE SELECTOR PLACEMENT MAP CHECK: PASS');for(const c of checks)console.log(c);console.log('Source mapping only; mobile/site/Gateway UI integration and all UX/LQA tests remain NOT_RUN.');

