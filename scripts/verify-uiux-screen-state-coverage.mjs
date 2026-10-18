import fs from 'node:fs';
import assert from 'node:assert/strict';
const inv = JSON.parse(fs.readFileSync('config/uiux-source-inventory.json', 'utf8'));
const coverage = JSON.parse(fs.readFileSync('config/uiux-screen-state-coverage.json', 'utf8'));
const required = ['loading', 'empty', 'offline', 'stale', 'denied', 'timeout', 'failure', 'recovery'];
assert.equal(coverage.screenCount, inv.screens.length, 'coverage screenCount must match inventory');
assert.equal(coverage.screens.length, inv.screens.length, 'coverage must include each inventory screen');
assert.deepEqual(new Set(coverage.screens.map(s => s.screenId)), new Set(inv.screens.map(s => s.screenId)), 'coverage IDs must match inventory IDs');
for (const screen of coverage.screens) {
  assert.ok(screen.surface && screen.screenName, `${screen.screenId} missing source metadata`);
  for (const state of required) assert.ok(['PENDING', 'IMPLEMENTED_UNVERIFIED', 'NOT_APPLICABLE'].includes(screen.stateImplementationStatus?.[state]), `${screen.screenId} missing valid ${state} status`);
}
assert.ok(coverage.screens.some(s => s.screenId === 'AW-04'), 'Admin Web Dashboard must be tracked');
assert.equal(coverage.testPolicy, 'SKIPPED_BY_USER — no tests executed');
console.log(`P4-H SCREEN STATE COVERAGE REGISTER: STRUCTURE VALID (${coverage.screens.length} screens; source implementation and runtime behavior not asserted)`);
