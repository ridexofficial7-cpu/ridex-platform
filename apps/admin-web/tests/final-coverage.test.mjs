import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const targetScreens = ['dashboard','live','rides','drivers','kyc','customers','services','vehicleCatalog','pricing','scopeAssignments','otp','audit','deliveryHealth','reports','monitoring','backup','support','publicLinks','admins','sessions','roles'];

test('all current screens are typed, navigable and configured as a workspace or dashboard', () => {
  const types = read('src/types.ts');
  const nav = read('src/config/navigation.tsx');
  const api = read('src/lib/api.ts');
  for (const screen of targetScreens) {
    assert.match(types, new RegExp(`\\| \\\"${screen}\\\"`), `${screen} missing from Screen type`);
    assert.match(nav, new RegExp(`id: \\\"${screen}\\\"`), `${screen} missing from navigation`);
    if (screen !== 'dashboard') assert.match(api, new RegExp(`^  ${screen}: \\{ title:`, 'm'), `${screen} missing from workspace registry`);
  }
});

test('missing AW-12, AW-15 and AW-19 workspaces have a dedicated review panel and no unverified mutation', () => {
  const page = read('src/pages/WorkspacePage.tsx');
  const panels = read('src/components/AdminCoveragePanels.tsx');
  assert.match(page, /screen === "scopeAssignments" \? <PermissionGate[\s\S]*?<ScopeAssignmentPanel/);
  assert.match(page, /screen === "deliveryHealth" \? <DeliveryHealthPanel/);
  assert.match(page, /screen === "publicLinks" \? <PublicLinksPanel/);
  assert.match(panels, /Save assignment unavailable/);
  assert.match(panels, /Saving is disabled until the actual API request schema/);
  assert.match(panels, /Retry\/replay\/resolve controls are omitted until/);
});

test('Admin scope assignment preview fails closed on missing STATE/CITY identifiers and explains server authority', () => {
  const panels = read('src/components/AdminCoveragePanels.tsx');
  assert.match(panels, /STATE assignment is missing its state ID/);
  assert.match(panels, /CITY assignment is missing a state or city ID/);
  assert.match(panels, /backend must reject inconsistent assignments/);
  assert.match(panels, /Save assignment unavailable/);
});

test('delivery health reports observed realtime state without equating it to recipient delivery', () => {
  const panels = read('src/components/AdminCoveragePanels.tsx');
  assert.match(panels, /Stream connected/);
  assert.match(panels, /A connected realtime stream does not prove push or SMS delivery to a recipient/);
  assert.match(panels, /Not returned/);
});

test('public download URL preview allows HTTP(S) only and never submits unverified settings', () => {
  const panels = read('src/components/AdminCoveragePanels.tsx');
  assert.match(panels, /\["https:", "http:"\]/);
  assert.match(panels, /!url\.username && !url\.password/);
  assert.match(panels, /Save unavailable/);
  assert.match(panels, /values remain in this page state and are not sent/);
});

test('Admin type selector is informational and is not added to the authentication request', () => {
  const login = read('src/pages/LoginPage.tsx');
  const api = read('src/lib/api.ts');
  assert.match(login, /rx-admin-type-selector/);
  assert.match(login, /backend determines your actual role, permissions and scope/i);
  assert.match(api, /passwordLogin = \(identifier: string, password: string\)/);
  assert.doesNotMatch(api, /passwordLogin = \(identifier: string, password: string, adminType/);
});

test('global workspace search uses only currently authorized navigation items', () => {
  const layout = read('src/layouts/AdminLayout.tsx');
  assert.match(layout, /const groups = getVisibleGroups\(context\)/);
  assert.match(layout, /const allVisibleItems = groups\.flatMap/);
  assert.match(layout, /rx-global-search-results/);
  assert.match(layout, /onNavigate\(screen\)/);
});

test('new visible navigation labels and workspace descriptions exist in English and Hindi', () => {
  const en = JSON.parse(read('src/locales/en-IN.json'));
  const hi = JSON.parse(read('src/locales/hi-IN.json'));
  for (const key of ['nav.deliveryHealth','nav.publicLinks','nav.scopeAssignments','shell.globalSearch','auth.adminTypeNote']) {
    assert.equal(typeof en[key], 'string', `English missing ${key}`);
    assert.equal(typeof hi[key], 'string', `Hindi missing ${key}`);
  }
  assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort());
});
