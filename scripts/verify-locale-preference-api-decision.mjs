#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(v,m)=>v?pass(m):fail(m);
const load=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}catch(e){fail(`${rel}: ${e.message}`);return null;}};
const c=load('config/locale-preference-api-decision.json');const baseline=load('config/project-baseline.json');const source=load('config/source-inventory.json');const loc=load('config/localization-source-inventory.json');const pkg=load('package.json');
const schema=fs.readFileSync(path.join(root,'services/backend/prisma/schema.prisma'),'utf8');
const routeRoot=path.join(root,'services/backend/src/routes');const routes=fs.readdirSync(routeRoot).filter(n=>n.endsWith('.ts')).map(n=>({name:n,text:fs.readFileSync(path.join(routeRoot,n),'utf8')}));
req(Boolean(c&&baseline&&source&&loc&&pkg),'locale API decision and linked manifests parse');
if(c&&baseline&&source&&loc&&pkg){
 req(c.status==='SKIPPED_FINAL_API_OWNER_DECISION; NO_ENDPOINT_OR_SCHEMA_INVENTED','Step Q is explicitly skipped for API-owner decision');
 req(c.notYetApproved.endpointPath==='NOT_DEFINED'&&c.notYetApproved.persistentField==='NOT_DEFINED','no speculative route or persisted field is defined');
 req(c.requiredOwnerDecisions.length>=7&&c.prohibitions.length>=3,'missing API, schema, auth, conflict and notification decisions are enumerated');
 req(!/\bpreferredLanguage\b|\bpreferredLocale\b|\blanguagePreference\b/.test(schema),'Backend schema has no speculative locale-preference field');
 req(!routes.some(r=>/language[-_/]?preference|locale[-_/]?preference/i.test(r.name)||/\/language-preference|\/locale-preference/i.test(r.text)),'Backend routes have no speculative locale-preference endpoint');
 req(c.currentBehavior.includes('Only local')&&c.currentBehavior.includes('no account API'),'local preference behavior is distinct from account synchronization');
 req(baseline.localePreferenceApiDecision?.path==='config/locale-preference-api-decision.json'&&source.localePreferenceApiDecision?.path==='config/locale-preference-api-decision.json'&&loc.localePreferenceApiDecision?.path==='config/locale-preference-api-decision.json','baseline and localization inventories link the API decision record');
 req(pkg.scripts?.['verify:locale-preference-api-decision']==='node scripts/verify-locale-preference-api-decision.mjs','decision validator is registered in root scripts');
 const roots=source.components.find(x=>x.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();
 req(roots.fileCount===actual.length&&JSON.stringify(roots.scripts.slice().sort())===JSON.stringify(actual),'root source inventory lists every static validator');
 req(loc.nextSteps?.Q?.includes('SKIPPED')&&loc.nextSteps?.R?.includes('SKIPPED')&&loc.nextSteps?.S?.includes('SKIPPED')&&loc.nextSteps?.T?.includes('SKIPPED'),'Q/R/S/T are accurately marked skipped with dependencies rather than leaving dependent work falsely pending');
 req(c.dependentSteps?.R?.status?.includes('SKIPPED')&&c.dependentSteps?.S?.status?.includes('SKIPPED')&&c.dependentSteps?.T?.status?.includes('SKIPPED'),'dependent locale persistence, synchronization and notification steps have explicit skip reasons');
}
if(errors.length){console.error(`LOCALE PREFERENCE API DECISION CHECK: FAIL (${errors.length})`);for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log(`LOCALE PREFERENCE API DECISION CHECK: PASS (${checks.length} assertions)`);for(const c of checks)console.log(c);console.log('No endpoint/schema was invented. Account-level preference sync remains disabled pending owner approval.');
