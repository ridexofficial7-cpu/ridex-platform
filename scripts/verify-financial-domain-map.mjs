#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/financial-domain-map.json'));pass('financial domain map JSON parses')}catch(e){console.error(`FAIL financial domain map: ${e.message}`);process.exit(1)}
const schema=read('services/backend/prisma/schema.prisma');
const modelBody=(name)=>schema.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1]||'';
const enumBody=(name)=>schema.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]+)\\}`))?.[1]||'';
for(const [name,detail] of Object.entries(cfg.models)){const body=modelBody(name);if(!body){fail(`financial model missing: ${name}`);continue;}pass(`model ${name} exists`);if(detail.amountType==='Decimal(12,2)'&&!/Decimal[^\n]*@db\.Decimal\(12,\s*2\)/.test(body))fail(`${name} expected Decimal(12,2) amount field missing`);if(detail.stateEnum&&!new RegExp(`\\bstatus\\s+${detail.stateEnum}\\b`).test(body))fail(`${name} state enum ${detail.stateEnum} not assigned to status`);if(detail.idempotencyKeyUnique&&!/idempotencyKey\s+String[^\n]*@unique/.test(body))fail(`${name} unique idempotency key missing`);if(detail.currencyField&&!new RegExp(`\\b${detail.currencyField}\\s+String`).test(body))fail(`${name} currency field missing`);}
for(const [name,values] of Object.entries(cfg.enums)){const body=enumBody(name);if(!body){fail(`enum missing: ${name}`);continue;}const observed=body.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^[A-Z][A-Z0-9_]*$/.test(s));for(const v of values)if(!observed.includes(v))fail(`${name} missing value ${v}`);pass(`${name} contains required values (${values.length})`);}
if(!cfg.invariantsToApproveAndVerify?.length)fail('financial invariants review list missing');
if(cfg.status!=='STATIC_FINANCIAL_DOMAIN_MAP_CREATED_BUSINESS_RULE_APPROVAL_PENDING')fail('financial policy must remain clearly unapproved');
if(errors.length){console.error('\nFINANCIAL DOMAIN MAP CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nFINANCIAL DOMAIN MAP CHECK: PASS');for(const p of passes)console.log(p);console.log(`Financial models mapped: ${Object.keys(cfg.models).length}; enums mapped: ${Object.keys(cfg.enums).length}; invariants awaiting finance approval: ${cfg.invariantsToApproveAndVerify.length}. No financial formula was altered.`);
