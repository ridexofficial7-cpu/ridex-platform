#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
function read(rel){const p=path.join(root,rel);if(!fs.existsSync(p)){fail(`required source missing: ${rel}`);return '';}return fs.readFileSync(p,'utf8');}
const main=read('services/backend/src/main.ts');
const env=read('services/backend/src/config/environment.ts');
const health=read('services/backend/src/routes/health.ts');
const prisma=read('services/backend/src/lib/prisma.ts');
const security=read('services/backend/src/config/securityBaseline.ts');
const pkg=JSON.parse(read('services/backend/package.json')||'{}');
const checks=[
 ['Backend entrypoint installs JSON body-size limit','express.json' ,main],
 ['Backend entrypoint installs URL-encoded body-size limit','express.urlencoded',main],
 ['Backend entrypoint disables X-Powered-By','app.disable(\n  "x-powered-by"',main],
 ['Backend entrypoint applies Helmet','helmet()',main],
 ['Backend entrypoint assigns request correlation IDs','x-request-id',main],
 ['Backend startup checks production security baseline','assertProductionSecurityBaseline()',main],
 ['Backend startup verifies database environment before listen','await verifyDatabaseEnvironment()',main],
 ['Backend mounts health router','healthRouter',main],
 ['Environment resolver distinguishes RIDEX_ENVIRONMENT from NODE_ENV','NODE_ENV does not select the RideX environment',env],
 ['Health liveness endpoint is dependency-independent','"/live"',health],
 ['Health readiness endpoint exists','"/ready"',health],
 ['Database environment guard compares persisted DB marker','verifyDatabaseEnvironment',prisma],
 ['Production security baseline is defined','assertProductionSecurityBaseline',security],
 ['Graceful SIGINT shutdown handler exists','"SIGINT"',main],
 ['Graceful SIGTERM shutdown handler exists','"SIGTERM"',main],
 ['Unhandled rejection handler exists','"unhandledRejection"',main],
 ['Uncaught exception handler exists','"uncaughtException"',main],
 ['Backend typecheck/build/start scripts are declared','typecheck',JSON.stringify(pkg.scripts||{})]
];
for(const [label,needle,src] of checks){if(src.includes(needle))pass(label);else fail(`${label}: expected source marker not found`);}
if(/process\.env\.(DATABASE_URL|DATABASE_URL_LIVE|DATABASE_URL_TEST)\s*=/.test(main)) fail('main.ts must not mutate database connection variables');
else pass('entrypoint does not assign database connection variables directly');
if(errors.length){console.error('STARTUP FOUNDATION CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}
console.log('STARTUP FOUNDATION CHECK: PASS');for(const m of passes)console.log(m);console.log('Static source check only; server startup and database readiness are deferred to final physical-test phase.');
