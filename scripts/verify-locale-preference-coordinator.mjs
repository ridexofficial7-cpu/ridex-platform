#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {createRideXLocaleSyncIntent,canApplyRideXAccountPreferenceRead,classifyRideXLocaleSyncResult} from '../packages/localization/src/localePreferenceCoordinator.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const errors=[];const checks=[];const pass=m=>checks.push(`PASS ${m}`);const fail=m=>errors.push(m);const req=(c,m)=>c?pass(m):fail(m);const load=r=>{try{return JSON.parse(fs.readFileSync(path.join(root,r),'utf8'))}catch(e){fail(`${r}: ${e.message}`);return null}};
const contract=load('config/locale-preference-precedence.json');const storage=load('config/locale-preference-persistence.json');const resolver=load('config/locale-first-launch-resolution.json');const baseline=load('config/project-baseline.json');const inv=load('config/source-inventory.json');const pkg=load('package.json');
req(Boolean(contract&&storage&&resolver&&baseline&&inv&&pkg),'precedence coordinator and linked contracts/manifests parse');
const cases=[];const add=(id,fn)=>{try{fn();cases.push(`PASS ${id}`)}catch(e){errors.push(`${id}: ${e.message}`)}};
if(contract&&storage&&resolver&&baseline&&inv&&pkg){
 req(contract.status==='PREFERENCE_PRECEDENCE_AND_STALE_RESPONSE_GUARD_IMPLEMENTED; API_AND_CLIENT_WIRING_PENDING','status leaves API/client integration pending');
 req(contract.serverContract==='NOT_DEFINED; this coordinator does not invent an endpoint, request envelope, response fields, or account identity','no unapproved API contract is invented');
 req(contract.selectionGeneration.scope==='in-memory client session only'&&contract.selectionGeneration.mustNotBeUsedAs.includes('security token'),'generation is non-security, per-session race metadata');
 req(contract.staleReadBehavior==='ignore result; keep current locale'&&contract.staleWriteBehavior.includes('never let older response')===false,'stale response policy is declared');
 req(baseline.localePreferencePrecedence?.path==='config/locale-preference-precedence.json'&&inv.localePreferencePrecedence?.path==='config/locale-preference-precedence.json','baseline/inventory link the precedence contract');
 req(pkg.scripts?.['verify:locale-preference-coordinator']==='node scripts/verify-locale-preference-coordinator.mjs','dedicated validator is registered');
 const rb=inv.components?.find(c=>c.id==='rootBuildScripts');const actual=fs.readdirSync(path.join(root,'scripts')).filter(n=>fs.statSync(path.join(root,'scripts',n)).isFile()).sort();req(rb?.scripts?.includes('verify-locale-preference-coordinator.mjs')&&rb.fileCount===actual.length&&JSON.stringify(rb.scripts.slice().sort())===JSON.stringify(actual),'root script inventory/count is current');
 add('authenticated supported selection creates sync intent',()=>assert.deepEqual(createRideXLocaleSyncIntent({locale:'hi-IN',selectionGeneration:3,authenticated:true}),{status:'READY',locale:'hi-IN',selectionGeneration:3}));
 add('unauthenticated selection does not create account sync intent',()=>assert.deepEqual(createRideXLocaleSyncIntent({locale:'hi-IN',selectionGeneration:3,authenticated:false}),{status:'NOT_AUTHENTICATED'}));
 add('unsupported locale is not echoed in sync intent',()=>assert.deepEqual(createRideXLocaleSyncIntent({locale:'bn-IN',selectionGeneration:3,authenticated:true}),{status:'UNSUPPORTED_LOCALE'}));
 add('invalid generation rejected',()=>assert.deepEqual(createRideXLocaleSyncIntent({locale:'en-IN',selectionGeneration:-1,authenticated:true}),{status:'INVALID_SELECTION_GENERATION'}));
 add('current account read can apply with same generation and no explicit choice',()=>assert.equal(canApplyRideXAccountPreferenceRead({requestGeneration:4,currentGeneration:4,hasCurrentSessionExplicitSelection:false,accountLocale:'hi-IN'}),true));
 add('stale account read ignored after newer selection',()=>assert.equal(canApplyRideXAccountPreferenceRead({requestGeneration:4,currentGeneration:5,hasCurrentSessionExplicitSelection:true,accountLocale:'hi-IN'}),false));
 add('explicit current-session choice blocks account-read overwrite',()=>assert.equal(canApplyRideXAccountPreferenceRead({requestGeneration:4,currentGeneration:4,hasCurrentSessionExplicitSelection:true,accountLocale:'en-IN'}),false));
 add('unsupported account locale cannot apply',()=>assert.equal(canApplyRideXAccountPreferenceRead({requestGeneration:4,currentGeneration:4,accountLocale:'bn-IN'}),false));
 add('invalid generation cannot apply read',()=>assert.equal(canApplyRideXAccountPreferenceRead({requestGeneration:NaN,currentGeneration:4,accountLocale:'en-IN'}),false));
 add('successful current write sync is acknowledged but locale retained',()=>assert.deepEqual(classifyRideXLocaleSyncResult({requestGeneration:2,currentGeneration:2,requestSucceeded:true}),{status:'SYNC_CONFIRMED_KEEP_CURRENT',shouldKeepCurrentLocale:true}));
 add('late successful write result is ignored',()=>assert.deepEqual(classifyRideXLocaleSyncResult({requestGeneration:2,currentGeneration:3,requestSucceeded:true}),{status:'STALE_SYNC_RESULT_IGNORED',shouldKeepCurrentLocale:true}));
 add('failed write keeps current locale',()=>assert.deepEqual(classifyRideXLocaleSyncResult({requestGeneration:2,currentGeneration:2,requestSucceeded:false}),{status:'SYNC_FAILED_KEEP_CURRENT',shouldKeepCurrentLocale:true}));
 add('invalid sync generation is safe',()=>assert.deepEqual(classifyRideXLocaleSyncResult({requestGeneration:2.5,currentGeneration:2,requestSucceeded:true}),{status:'INVALID_SELECTION_GENERATION',shouldKeepCurrentLocale:true}));
 req(cases.length===13,`${cases.length} deterministic precedence/race cases pass`);
 req(contract.testStatus.apiRaceNetworkAndAccountSwitchTests==='DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED','physical/API race tests remain deferred');
}
if(errors.length){console.error('LOCALE PREFERENCE COORDINATOR CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}console.log('LOCALE PREFERENCE COORDINATOR CHECK: PASS');for(const c of checks)console.log(c);for(const c of cases)console.log(c);console.log('Pure coordination tests only; no account API/network/client state test was run.');
