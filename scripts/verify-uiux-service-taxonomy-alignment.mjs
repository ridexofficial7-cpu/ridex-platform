import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(p, 'utf8');
const taxonomy = JSON.parse(read('config/ride-service-taxonomy.json'));
const apps = ['customer-mobile','driver-mobile','admin-mobile','ridex-mobile'];
const sources = apps.map(app => read(`apps/${app}/shared/vehicleCatalog.ts`));
for (const [i, source] of sources.entries()) {
  assert.ok(source.includes('RIDEX_SERVICE_TAXONOMY'), `${apps[i]} missing canonical service taxonomy`);
  assert.ok(source.includes('passengerCountRequired'), `${apps[i]} missing passenger-count policy`);
  assert.ok(source.includes('requiredVehicleAttributes'), `${apps[i]} missing vehicle-attribute policy`);
  assert.ok(source.includes('serviceVehicleCategories'), `${apps[i]} missing vehicle category policy`);
}
assert.ok(sources.every(s => s.includes('"PASSENGER_E_RICKSHAW", "PASSENGER_ELECTRIC_AUTO"')));
assert.ok(sources.every(s => s.includes('"CITY_LOGISTIC_PARCEL", "QUICK_LOGISTIC_PARCEL"')));
assert.ok(sources.every(s => s.includes('availabilityRideType: "EVENT_RIDE"')));
assert.ok(sources.every(s => s.includes('persistedRideType: "CITY_RIDE"')));
assert.ok(sources.every(s => s.includes('serviceSubtype: "EVENT_RIDE"')));
assert.deepEqual(taxonomy.passengerRideTypes.map(x => x.code), ['CITY_RIDE','SHARING_RIDE','INTERCITY_RIDE']);
assert.equal(taxonomy.eventRide.availabilityRideType,'EVENT_RIDE');
assert.equal(taxonomy.eventRide.persistedRideType,'CITY_RIDE');
assert.equal(taxonomy.eventRide.persistedServiceSubtype,'EVENT_RIDE');
assert.deepEqual(taxonomy.parcel.serviceSubtypes,['CITY_LOGISTIC_PARCEL','QUICK_LOGISTIC_PARCEL']);
assert.deepEqual(taxonomy.goods.sizeOptions,['SMALL','MEDIUM','LARGE']);
assert.deepEqual(taxonomy.serviceEnablementPolicy.independentServices.map(x=>x.serviceType).sort(),['EVENT','GOODS','PARCEL','PASSENGER']);
console.log('P4-D SERVICE TAXONOMY ALIGNMENT: PASS (4 mobile catalog contracts + canonical taxonomy)');
console.log('Static/client contract alignment only; backend/Admin Web call-site and database eligibility confirmation remain pending.');
