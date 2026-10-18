#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/ride-service-taxonomy.json'));pass('ride/service taxonomy JSON parses')}catch(e){console.error(`FAIL taxonomy JSON: ${e.message}`);process.exit(1)}
const schema=read('services/backend/prisma/schema.prisma');
const mobile=read('apps/ridex-mobile/shared/vehicleCatalog.ts');
const bookings=read('services/backend/src/routes/bookings.ts');
const events=read('services/backend/src/routes/events.ts');
const matchingConfig=read('services/backend/src/services/matchingConfiguration.ts');
const matching=read('services/backend/src/services/matching.ts');
const prismaMigration=read('services/backend/prisma/migrations/20261012_event_service_toggle/migration.sql');
const adminWorkspace=read('apps/admin-web/src/pages/ServiceConfigurationPage.tsx');
const adminRoutes=read('services/backend/src/routes/admin.ts');
const availabilityService=read('services/backend/src/services/bookingAvailability.ts');
const enumValues=(name)=>{const re=new RegExp(`enum\\s+${name}\\s*\\{([^}]+)\\}`,'m');const m=schema.match(re);return m?m[1].split(/\r?\n/).map(x=>x.trim()).filter(x=>/^[A-Z][A-Z0-9_]*$/.test(x)):[]};
const requireValues=(name, expected)=>{const observed=enumValues(name);for(const val of expected){if(!observed.includes(val))fail(`${name} enum missing ${val}`)}pass(`${name} enum carries ${expected.join(', ')}`)};
if(cfg.project!=='RideX-Super_Admin_Controle')fail('project identity mismatch');
requireValues('BookingType',cfg.bookingTypes);
requireValues('RideType',cfg.passengerRideTypes.map(x=>x.code));
if(cfg.passengerRideTypes.length!==3)fail('expected three passenger ride types');
if(cfg.passengerRideTypes.find(x=>x.code==='CITY_RIDE')?.passengerCountRequired!==false)fail('Full Ride must not require passenger-count collection');
for(const code of ['SHARING_RIDE','INTERCITY_RIDE']) if(cfg.passengerRideTypes.find(x=>x.code===code)?.passengerCountRequired!==true)fail(`${code} must require passenger count`);
for(const category of cfg.vehicleCatalog.passengerCategoryCodes){if(!mobile.includes(category))fail(`mobile catalog helper missing passenger category ${category}`);}
if(!mobile.includes(cfg.vehicleCatalog.cargoCategoryCode))fail('mobile catalog helper missing cargo category');
for(const token of [...cfg.parcel.serviceSubtypes,'CARGO_DELIVERY','EVENT_RIDE'])if(!bookings.includes(token)&&!events.includes(token))fail(`Backend handlers do not mention expected token ${token}`);
if(!events.includes('serviceType: "EVENT"')||!events.includes('rideType: "EVENT_RIDE"'))fail('event availability service/ride mapping not found');
if(!events.includes('rideType: RideType.CITY_RIDE')||!events.includes('serviceSubtype: "EVENT_RIDE"'))fail('persisted Event Booking mapping not found');
if(cfg.eventRide.passengerCountRequired!==true)fail('Event Ride must require passenger count under the current baseline');
if(JSON.stringify(cfg.eventRide.vehicleCategoryCodes)!==JSON.stringify(cfg.vehicleCatalog.passengerCategoryCodes))fail('Event Ride category eligibility differs from passenger vehicle categories');
if(cfg.goods.sizeOptions.join(',')!=='SMALL,MEDIUM,LARGE')fail('Goods size options must be SMALL/MEDIUM/LARGE');
if(!cfg.vehicleCatalog.backendIsAuthoritativeForEligibility||!cfg.vehicleCatalog.clientFilteringIsAdvisoryOnly)fail('Backend vehicle eligibility authority must be explicit');
if(!cfg.pendingEndToEndChecks?.length)fail('pending E2E validation record is required');
if(!/eventEnabled\s+Boolean\s+@default\(true\)/.test(schema))fail('MatchingConfiguration must include independent eventEnabled defaulting true');else pass('Prisma schema includes independent Event toggle defaulting enabled');
if(!/eventEnabled:\s*true/.test(matchingConfig)||!/eventEnabled:\s*requiredBoolean\(row\.eventEnabled,\s*\"eventEnabled\"\)/.test(matchingConfig))fail('matching configuration defaults/output must map eventEnabled');else pass('matching configuration persists and returns eventEnabled');
if(!/serviceSubtype\) === \"EVENT_RIDE\"/.test(matching)||!/return config\.eventEnabled/.test(matching))fail('matching must use eventEnabled for EVENT_RIDE bookings independently of passengerEnabled');else pass('matching independently enforces eventEnabled for EVENT_RIDE');
if(!/if \(!matchingConfiguration\.eventEnabled\)/.test(events)||!events.includes('SERVICE_DISABLED'))fail('event discovery/booking handlers must block disabled Event service');else pass('Event discovery and booking are blocked when Event service is disabled');
if(!/serviceType === \"EVENT\"/.test(availabilityService)||!availabilityService.includes('matchingConfiguration.eventEnabled'))fail('common booking availability resolver must honor eventEnabled');else pass('common customer/admin availability resolver honors the independent Event toggle');
if(!/eventEnabled/.test(adminWorkspace)||!adminWorkspace.includes('Event'))fail('Admin Web matching configuration must expose the independent Event toggle');else pass('Admin Web exposes an independent Event service toggle');
const authorityReview=cfg.serviceEnablementPolicy?.mutationAuthorityReview;if(!authorityReview||authorityReview.status!=='CONSERVATIVE_SOURCE_GUARD_IMPLEMENTED_OWNER_APPROVAL_AND_RUNTIME_TEST_PENDING'||!authorityReview.runtimeAuthorizationTest||authorityReview.runtimeAuthorizationTest!=='NOT_RUN_PER_USER_CODE_ONLY_INSTRUCTION')fail('service-toggle mutation authority must remain an explicit owner-review blocker');else pass('service-toggle mutation authority is explicitly recorded as pending owner confirmation');if(!/router\.put\("\/matching\/configuration"/.test(adminRoutes)||!/requireOperationalConfiguration\(req, res, true\)/.test(adminRoutes))fail('observed matching configuration write guard changed; review service-toggle authority evidence');else pass('matching configuration writes currently use the operational-configuration permission gate; no narrowing is claimed');
if(!/ADD COLUMN \"eventEnabled\" BOOLEAN NOT NULL DEFAULT true/.test(prismaMigration))fail('additive migration must add eventEnabled default true');else pass('additive migration adds eventEnabled default true; execution remains deferred');
if(errors.length){console.error('\nRIDE SERVICE TAXONOMY CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nRIDE SERVICE TAXONOMY CHECK: PASS');for(const p of passes)console.log(p);console.log(`Passenger ride types: ${cfg.passengerRideTypes.length}; parcel variants: ${cfg.parcel.serviceSubtypes.length}; Event mapping recorded with runtime validation explicitly deferred.`);
