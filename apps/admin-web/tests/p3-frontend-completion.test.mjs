import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeApiPath } from "../src/lib/requestPolicy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Admin API path validation accepts relative contract paths and blocks path confusion", () => {
  for (const value of ["/admin/drivers", "/auth/password/login", "/admin/availability?pickupLat=25.1&pickupLng=87.5", "/notifications"]) {
    assert.equal(isSafeApiPath(value), true, `Expected safe path: ${value}`);
  }
  for (const value of ["https://attacker.example/admin", "//attacker.example/admin", "/admin/../auth/logout", "/%2e%2e/admin", "/admin/%2Fprivate", "/admin/%5cprivate", "/admin/logout#fragment", "/admin\\logout", "", null, 12]) {
    assert.equal(isSafeApiPath(value), false, `Expected blocked path: ${value}`);
  }
});

test("Dashboard uses unknown values before first successful snapshot and labels retained data stale on error", () => {
  const dashboard = read("src/pages/DashboardPage.tsx");
  const app = read("src/App.tsx");
  assert.match(dashboard, /value === null \|\| value === undefined \|\| !Number\.isFinite\(value\)[\s\S]*?"—"/);
  assert.match(dashboard, /No successful dashboard snapshot is available/);
  assert.match(dashboard, /last successful dashboard response, which may be stale/);
  assert.match(app, /useState<DashboardMetrics \| null>\(null\)/);
  assert.doesNotMatch(app, /const EMPTY: DashboardMetrics/);
});

test("Workspace request sequencing ignores late responses from a prior screen request", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(workspace, /const requestSequence = useRef\(0\)/);
  assert.match(workspace, /if \(sequence !== requestSequence\.current\) return/);
  assert.match(workspace, /requestSequence\.current \+= 1/);
});

test("Workspace boards distinguish an initial load error from an authoritative empty result", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(workspace, /data === null && error \? <EmptyState title=\{`\$\{cfg\.title\} unavailable`\}/);
  assert.match(workspace, /The initial backend request failed/);
  assert.match(workspace, /last successful response from/);
});

test("Location raw response is sanitized and location writes stay disabled until verified", () => {
  const page = read("src/pages/LocationRoutePage.tsx");
  assert.match(page, /safeDisplayJson\(data\)/);
  assert.doesNotMatch(page, /JSON\.stringify\(data, null, 2\)/);
  assert.match(page, /LOCATION_MUTATIONS_ENABLED = String\(API_CONTRACT_STATUS\) === "VERIFIED_AGAINST_BACKEND_SOURCE"/);
  assert.match(page, /disabled=\{savingLocation \|\| !LOCATION_MUTATIONS_ENABLED\}/);
  assert.match(page, /data === null && error \? <EmptyState title=\{`\$\{cfg\.title\} unavailable`\}/);
});

test("Route builder differentiates failed initial load and disables unverified writes", () => {
  const page = read("src/pages/RouteBuilderPage.tsx");
  assert.match(page, /ROUTE_MUTATIONS_ENABLED = String\(API_CONTRACT_STATUS\) === "VERIFIED_AGAINST_BACKEND_SOURCE"/);
  assert.match(page, /disabled=\{loading\|\|saving\|\|!ROUTE_MUTATIONS_ENABLED\}/);
  assert.match(page, /Route data unavailable|Location data unavailable/);
  assert.match(page, /loadError && hasLoaded/);
});

test("Asset upload and rollback controls are disabled when the mutation contract is unverified", () => {
  const page = read("src/components/AssetManager.tsx");
  assert.match(page, /ASSET_MUTATIONS_ENABLED = String\(API_CONTRACT_STATUS\) === "VERIFIED_AGAINST_BACKEND_SOURCE"/);
  assert.match(page, /disabled=\{!ASSET_MUTATIONS_ENABLED \|\| busy \|\| selectedAsset\.currentVersion <= 1\}/);
  assert.match(page, /disabled=\{!ASSET_MUTATIONS_ENABLED \|\| !selectedSlot \|\| !file \|\| busy\}/);
  assert.match(page, /Asset catalogue unavailable/);
});

test("Event create/publish/unpublish/delete are visibly blocked pending contract verification", () => {
  const panel = read("src/AdminBlueprintPanels.tsx");
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(panel, /mutationsEnabled = false/);
  assert.match(panel, /if \(!mutationsEnabled\).*Creating an event is disabled/);
  assert.match(panel, /Read-only contract gate/);
  assert.match(panel, /disabled=\{loading \|\| !mutationsEnabled\}/);
  assert.match(panel, /disabled=\{!mutationsEnabled\}/);
  assert.match(workspace, /mutationsEnabled=\{API_CONTRACTS_VERIFIED\}/);
});

test("Raw workspace details go through shared privacy redaction and report/export stays disabled", () => {
  const location = read("src/pages/LocationRoutePage.tsx");
  const dashboard = read("src/pages/DashboardPage.tsx");
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(location, /safeDisplayJson\(data\)/);
  assert.match(dashboard, /safeDisplayJson\(metrics\.raw\)/);
  assert.match(workspace, /Run report unavailable/);
  assert.match(workspace, /Audit export remains unavailable/);
});

test("Full Ride, Connection Ride, and Share Ride mapping remains explicit in availability UI", () => {
  const page = read("src/pages/AvailabilityPage.tsx");
  assert.match(page, /Full Ride → City Ride/);
  assert.match(page, /Connection Ride → InterCity Ride/);
  assert.match(page, /Share Ride → Sharing Ride/);
});
