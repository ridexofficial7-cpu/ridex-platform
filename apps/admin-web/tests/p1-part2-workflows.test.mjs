import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("audit filtering is explicitly local-only and hides unverified old/new audit payloads", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  const helper = read("src/lib/auditFilters.mjs");
  assert.match(workspace, /CURRENT RESPONSE ONLY/);
  assert.match(workspace, /auditValuePayload/);
  assert.match(workspace, /oldValue\|newValue\|before\|after/);
  assert.match(workspace, /Nested audit payload hidden pending verified audit-detail permissions/);
  assert.match(helper, /currently returned audit rows only/);
  assert.match(workspace, /Audit export remains unavailable until the backend supplies a verified/);
});

test("OTP history result is rendered with redaction and destructive purpose deletion is confirmed", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(workspace, /setResultData\(response\)/);
  assert.match(workspace, /safeDisplayJson\(resultData\)/);
  assert.match(workspace, /Permanently Delete OTP Purpose/);
  assert.match(workspace, /confirmationOnly: true/);
  assert.match(workspace, /This action cannot be restored/);
  assert.match(workspace, /[Ff]ifth-failure alert delivery/);
});

test("support workflow has accountable reason, controlled states and bounded note/message fields", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(workspace, /Reason for update/);
  assert.match(workspace, /value:\"REOPENED\"/);
  assert.match(workspace, /maxLength:2000/);
  assert.match(workspace, /the backend must validate the current state, scope and allowed transition/i);
});

test("customer detail masks contact and shows related records only when backend returned them", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  const masks = read("src/lib/privacyDisplay.mjs");
  assert.match(workspace, /maskPhone\(row\.mobile\)/);
  assert.match(workspace, /CustomerRelatedContext/);
  assert.match(workspace, /No recent rides were included in this customer response/);
  assert.match(workspace, /row\.mobile \? maskPhone\(row\.mobile\) : undefined/);
  assert.match(workspace, /const customerTitle = screen === "customers"/);
  assert.match(masks, /export function maskEmail/);
  assert.match(masks, /export function maskCustomerField/);
});

test("report run/export remains disabled rather than inventing report API success", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(workspace, /Run report unavailable/);
  assert.match(workspace, /These values are not sent anywhere/);
  assert.match(workspace, /Report catalog, job state, timezone\/scope query and export schema have not been verified/);
});

test("request status banner is based on request signals, not synthetic platform health", () => {
  const status = read("src/components/SystemStatus.tsx");
  const api = read("src/lib/api.ts");
  assert.match(status, /This is not a full platform-health check/);
  assert.match(status, /Previously loaded records, if present, may be stale/);
  assert.match(api, /ridex-admin-api-signal/);
});

test("security release controls include a deployed-header checker and SBOM artifact", () => {
  const script = read("scripts/check-security-headers.mjs");
  const workflow = read(".github/workflows/admin-web-ci.yml");
  const pkg = JSON.parse(read("package.json"));
  assert.match(script, /strict-transport-security/);
  assert.match(script, /content-security-policy/);
  assert.match(script, /camera=\\\(\\\)/);
  assert.match(script, /microphone=\\\(\\\)/);
  assert.match(script, /payment=\\\(\\\)/);
  assert.equal(pkg.scripts["security:headers"], "node scripts/check-security-headers.mjs");
  assert.match(workflow, /npm sbom --sbom-format cyclonedx/);
  assert.match(workflow, /npm audit --audit-level=high/);
});


test("unverified backend contracts block all administrative mutations in the shared API client", () => {
  const api = read("src/lib/api.ts");
  const policy = read("src/lib/requestPolicy.mjs");
  assert.match(api, /shouldBlockUnverifiedAdminMutation\(path, method, API_CONTRACT_STATUS\)/);
  assert.match(policy, /if \(isSafeReadMethod\(method\)\) return false/);
  assert.match(policy, /VERIFIED_AGAINST_BACKEND_SOURCE/);
  assert.ok(policy.includes("support\\/admin"));
});
