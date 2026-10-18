#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let cfg,baseline;
try{cfg=JSON.parse(read('config/database-integrity-contract.json'));baseline=JSON.parse(read('config/project-baseline.json'));pass('database integrity contract and baseline parse');}catch(e){console.error(`FAIL database integrity contract: ${e.message}`);process.exit(1);}
if(cfg.status!=='STATIC_SCHEMA_INTEGRITY_MAPPED_MIGRATION_AND_DATABASE_TESTS_DEFERRED')fail('database integrity status must not imply physical validation');else pass('database contract is explicitly static-only');
if(cfg.physicalTests!=='DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH')fail('physical DB tests must remain deferred per owner workflow');else pass('physical database tests remain deferred');
const schema=read(cfg.sourceSchema);
const models=[...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m=>m[1]);
const enums=[...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map(m=>m[1]);
if(models.length!==cfg.observedSchemaCounts?.models)fail(`model catalogue mismatch: ${models.length}`);else pass(`Prisma model count ${models.length}`);
if(enums.length!==cfg.observedSchemaCounts?.enums)fail(`enum catalogue mismatch: ${enums.length}`);else pass(`Prisma enum count ${enums.length}`);
const getModel=name=>{const re=new RegExp('^model\\s+'+name+'\\s*\\{([\\s\\S]*?)^\\}','m');return schema.match(re)?.[1]||'';};
for(const chk of cfg.criticalUniquenessChecks||[]){const body=getModel(chk.model);let exists=false;if(chk.model==='Payment')exists=/\bbookingId\s+String\s+@unique/.test(body);else if(chk.model==='Refund')exists=/\bidempotencyKey\s+String\?\s+@unique/.test(body);else if(chk.model==='WalletTransaction')exists=/\breferenceId\s+String\?\s+@unique/.test(body);else if(chk.model==='PaymentWebhookEvent')exists=/@@unique\(\[provider,\s*eventId\]\)/.test(body);else if(chk.model==='AdminSession')exists=/\btokenHash\s+String\s+@unique/.test(body);else if(chk.model==='IdempotencyKey')exists=/@unique|@@unique/.test(body);else if(chk.model==='ProtectedActionOtpGrant')exists=/\btokenHash\s+String\s+@unique/.test(body);if(!exists||!chk.present)fail(`critical unique constraint missing/mismatched for ${chk.model}`);else pass(`critical uniqueness declaration present: ${chk.model}`);}
for(const model of ['Payment','PaymentAttempt','PaymentTransaction','Refund','WalletTransaction','LedgerEntry','DriverSettlement','CashCollection']){const body=getModel(model);if(!body)fail(`required financial model missing: ${model}`);else if(/\bamount\s+Decimal\s+@db\.Decimal\(12,\s*2\)/.test(body)||model==='DriverSettlement'&&/\bamount\s+Decimal\s+@db\.Decimal\(12,\s*2\)/.test(body))pass(`fixed-precision amount field present: ${model}`);else fail(`expected fixed-precision amount declaration not found for ${model}`);}
const expectedTx=cfg.observedTransactionCallCountByFile||{};
for(const rel of ['services/backend/src/routes/bookings.ts','services/backend/src/routes/payments.ts','services/backend/src/routes/trips.ts','services/backend/src/routes/payouts.ts']){const src=read(rel);const n=[...src.matchAll(/prisma\.\$transaction\s*\(/g)].length;const recorded=expectedTx[rel];if(!Number.isInteger(recorded)||n!==recorded)fail(`${rel} transaction call-site inventory differs: recorded ${recorded}, found ${n}`);else pass(`${rel} has ${n} inventoried transaction call sites (static count only)`);}
const migRoot=path.join(root,'services/backend/prisma/migrations');const mig=fs.readdirSync(migRoot,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();
if(JSON.stringify(mig)!==JSON.stringify(cfg.migrationReview?.activeMigrationDirectories))fail('active migrations do not match recorded migration-review inventory');else pass(`active migration directories inventoried (${mig.length})`);
if(cfg.migrationReview?.canonicalChainApproved!==false||cfg.migrationReview?.migrationsExecuted!==false)fail('ambiguous migration chain must not be auto-approved or executed');else pass('migration chain remains blocked pending final review');
if(!fs.existsSync(path.join(root,'services/backend/prisma/fresh_baseline/migration.sql')))fail('duplicate fresh-baseline SQL missing; refresh migration review');else pass('duplicate fresh-baseline SQL exists and blocks automatic migration approval');
if(fs.existsSync(path.join(root,'services/backend/prisma/migrations_legacy_20261001')))fail('legacy migration archive must not be silently copied into clean run-source ZIP');else if(cfg.migrationReview?.historicalLegacyArchiveObservedInOriginalSourceZip!==true||cfg.migrationReview?.legacyArchiveIncludedInCleanProject!==false)fail('historical legacy archive exclusion is not recorded');else pass('legacy archive from original ZIP is documented as excluded from clean source');
if(baseline.databaseIntegrityContract?.path!=='config/database-integrity-contract.json')fail('baseline must reference database integrity contract');else pass('project baseline references database integrity contract');
if(!(cfg.requiredFinalTests||[]).length||cfg.requiredFinalTests.length<6)fail('required final database/financial test gate is incomplete');else pass(`final DB/financial test cases recorded (${cfg.requiredFinalTests.length})`);
if(errors.length){console.error('\nDATABASE INTEGRITY CONTRACT: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nDATABASE INTEGRITY CONTRACT: PASS');for(const p of passes)console.log(p);console.log('Static schema mapping only; migration/runtime database checks not run.');
