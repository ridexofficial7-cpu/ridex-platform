#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/pricing-quote-contract.json'));pass('pricing/quote contract JSON parses')}catch(e){console.error(`FAIL pricing contract JSON: ${e.message}`);process.exit(1)}
const schema=read('services/backend/prisma/schema.prisma');const pricing=read('services/backend/src/services/pricing.ts');const smartPricing=read('services/backend/src/services/smartPricing.ts');const routing=read('services/backend/src/services/routing.ts');const bookings=read('services/backend/src/routes/bookings.ts');const mobile=read('apps/ridex-mobile/customer/App.tsx');
const model=(name)=>{const m=schema.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));return m?.[1]||''};
for(const name of ['PricingRule','Booking','Payment'])if(!model(name))fail(`Prisma model ${name} missing`);else pass(`Prisma model ${name} present`);
for(const field of cfg.pricingRuleFieldsPresent){if(!new RegExp(`^\\s*${field}\\s+`, 'm').test(model('PricingRule')))fail(`PricingRule field missing: ${field}`)}pass(`PricingRule schema fields present (${cfg.pricingRuleFieldsPresent.length})`);
for(const field of ['estimatedFare','finalFare','pricingVersion'])if(!new RegExp(`^\\s*${field}\\s+`, 'm').test(model('Booking')))fail(`Booking pricing field missing: ${field}`);else pass(`Booking.${field} present`);
for(const fn of cfg.observedBackend.fareFunctions)if(!pricing.includes(`function ${fn}(`))fail(`pricing function missing: ${fn}`);
if(!smartPricing.includes('function applySmartPricing')||!pricing.includes('function roundMoney'))fail('smart pricing or money rounding helper missing');else pass('pricing helpers include smart pricing and roundMoney');
if(!routing.includes('roadRoute')&&!bookings.includes('roadRoute'))fail('Backend routing reference missing');else pass('Backend routing source referenced');
if(!bookings.includes('validateCoupon')||!bookings.includes('applySmartPricing'))fail('booking route is missing coupon or smart-pricing integration');else pass('booking route includes coupon and smart-pricing integration');
if(!mobile.includes('fareIsAuthoritative')||!mobile.includes('Backend calculated'))fail('mobile does not expose authoritative Backend fare presentation marker');else pass('mobile presents Backend fare as authoritative/display-only');
for(const t of cfg.requiredFareComponentsByService?Object.keys(cfg.requiredFareComponentsByService):[])if(!['PASSENGER','EVENT','PARCEL','GOODS'].includes(t))fail(`unknown service fare contract section ${t}`);
if(!cfg.financialRulesNotInvented?.length||!cfg.finalTestVectorsRequired?.length)fail('financial decisions/test vectors must remain explicitly tracked');
if(cfg.status!=='STATIC_PRICING_CONTRACT_MAPPED_FINANCIAL_APPROVAL_AND_RUNTIME_VALIDATION_PENDING')fail('pricing contract status must distinguish static mapping from financial approval');
if(errors.length){console.error('\nPRICING/QUOTE CONTRACT CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nPRICING/QUOTE CONTRACT CHECK: PASS');for(const p of passes)console.log(p);console.log(`Service fare sections: ${Object.keys(cfg.requiredFareComponentsByService).join(', ')}; explicit pending finance decisions: ${cfg.financialRulesNotInvented.length}; test-vector categories: ${cfg.finalTestVectorsRequired.length}. No fare amount was changed or newly approved.`);
