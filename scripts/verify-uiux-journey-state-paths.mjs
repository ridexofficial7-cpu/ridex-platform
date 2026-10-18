import fs from 'node:fs';
import assert from 'node:assert/strict';
const m=JSON.parse(fs.readFileSync('config/uiux-journey-state-paths.json','utf8'));
const inv=JSON.parse(fs.readFileSync('config/uiux-source-inventory.json','utf8'));
const required=['success','denial','timeout','reconnect','cancellation','retry','unknownOutcome'];
assert.equal(m.journeyCount,m.journeys.length);
assert.ok(m.journeys.length>=8);
const ids=new Set(inv.screens.map(s=>s.screenId));
for(const j of m.journeys){assert.ok(j.journeyId&&j.name);assert.ok(j.screenIds.length>0,`${j.journeyId} missing screens`);for(const id of j.screenIds)assert.ok(ids.has(id),`${j.journeyId} references unknown screen ${id}`);for(const k of required)assert.ok(typeof j[k]==='string'&&j[k].trim().length>15,`${j.journeyId} missing ${k}`);}
assert.ok(m.journeys.some(j=>j.journeyId==='J-PAYMENT'&&j.unknownOutcome.toLowerCase().includes('ledger')));
assert.ok(m.journeys.some(j=>j.journeyId==='J-TRIP'&&j.unknownOutcome.toLowerCase().includes('gps')));
assert.ok(m.journeys.some(j=>j.journeyId==='J-ADMIN'&&j.denial.toLowerCase().includes('scope')));
console.log(`P4-E JOURNEY STATE PATHS: PASS (${m.journeys.length} journeys; all 7 paths mapped)`);
console.log('Static journey mapping only; runtime state coverage and acceptance tests remain deferred.');
