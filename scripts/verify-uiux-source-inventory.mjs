#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);const load=r=>{try{return JSON.parse(fs.readFileSync(path.join(root,r),'utf8'));}catch(e){fail(`${r}: ${e.message}`);return null;}};
const inv=load('config/uiux-source-inventory.json');const screenMap=load('config/screen-to-key-map.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const pkg=load('package.json');
req(Boolean(inv&&screenMap&&baseline&&source&&pkg),'UI/UX source inventory and linked manifests parse');
if(inv&&screenMap&&baseline&&source&&pkg){
 req(inv.screenCount===92&&inv.screens.length===92&&new Set(inv.screens.map(s=>s.screenId)).size===92,'exactly 92 unique Screen IDs are represented');
 req(JSON.stringify(inv.screens.map(s=>s.screenId).sort())===JSON.stringify(screenMap.screens.map(s=>s.screenId).sort()),'screen inventory preserves exact original Screen ID set');
 const expected={'Customer App':27,'Driver App':20,'Admin Web':20,'Admin Mobile':8,'Super Admin Mobile / Private Control':7,'Public Website / Landing Page':5,'Android Gateway / Broadcaster Companion':5};
 req(JSON.stringify(Object.fromEntries(Object.entries(inv.surfaceCounts).sort()))===JSON.stringify(Object.fromEntries(Object.entries(expected).sort())),'seven surface counts match the baseline 27/20/20/8/7/5/5 split');
 req(inv.priorityCounts.P0===75&&inv.priorityCounts.P1===16&&inv.priorityCounts.P2===1,'priority counts match the 75/16/1 baseline split');
 req(inv.policy.sourcePresenceIsNotImplementationProof&&inv.policy.testShellIsNotOperationalSuperAdminControl&&inv.policy.candidateTranslationKeysAreNotApprovedCopy,'inventory explicitly prevents overclaiming source/test-shell/candidate-copy presence');
 req(inv.screens.every(s=>s.routeApiPermissionMapStatus==='NOT_COMPLETED'&&s.physicalUiStateTests==='NOT_RUN'),'route/API/permission map and physical UI tests are not falsely marked complete');
 const missing=inv.screens.flatMap(s=>s.sourcePaths.filter(p=>!p.exists));
 req(missing.length===0,`all ${inv.screens.reduce((n,s)=>n+s.sourcePaths.length,0)} listed source path references resolve (${missing.length} missing)`);
 const superShell=inv.screens.filter(s=>s.appSurface==='Super Admin Mobile / Private Control');
 req(superShell.length===7&&superShell.every(s=>s.implementationClassification==='STRUCTURAL_TEST_SHELL_ONLY_PRIVILEGED_FUNCTIONALITY_NOT_IMPLEMENTED'),'all seven Super Admin screens remain accurately classified as structural shells');
 req(baseline.uiuxSourceInventory?.path==='config/uiux-source-inventory.json'&&source.uiuxSourceInventory?.path==='config/uiux-source-inventory.json','baseline and source inventory link the UI/UX inventory');
 req(pkg.scripts?.['verify:uiux-source-inventory']==='node scripts/verify-uiux-source-inventory.mjs','UI/UX inventory validator is exposed as root command');
 const roots=source.components.find(x=>x.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(roots.fileCount===actual.length&&JSON.stringify(roots.scripts.slice().sort())===JSON.stringify(actual),'root source inventory script list/count matches disk');
}
if(errors.length){console.error(`UI/UX SOURCE INVENTORY CHECK: FAIL (${errors.length} errors, ${checks.length} checks)`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}console.log(`UI/UX SOURCE INVENTORY CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('Source inventory only; actual navigation/API mapping and physical UI tests are deferred.');
