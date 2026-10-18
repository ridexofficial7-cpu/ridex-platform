import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) =>
  fs.readFileSync(path.join(adminRoot, "src", relativePath), "utf8");

test("REST API requests use the selected environment URL", () => {
  const api = readSource("lib/api.ts");
  const selector = readSource("lib/environmentSelection.ts");

  assert.match(api, /getApiBaseUrl\(\)/);
  assert.match(api, /getSelectedEnvironment\(\)/);
  assert.match(api, /isEnvironmentAvailable\(activeEnvironment\)/);
  assert.match(selector, /ridex-admin-environment/);
  assert.match(selector, /export function setSelectedEnvironment/);
  assert.doesNotMatch(api, /fetch\(`\$\{API_BASE_URL\}\$\{path\}/);
});

test("realtime uses the same selected API base URL as REST", () => {
  const realtime = readSource("lib/realtime.ts");

  assert.match(realtime, /getApiBaseUrl\(\)/);
  assert.doesNotMatch(realtime, /fetch\(`\$\{API_BASE_URL\}/);
});

test("LIVE endpoint validation requires HTTPS and rejects URL credentials", () => {
  const selector = readSource("lib/environmentSelection.ts");

  assert.match(selector, /environment === "LIVE" && url\.protocol !== "https:"/);
  assert.match(selector, /url\.username \|\| url\.password \|\| url\.search \|\| url\.hash/);
  assert.match(selector, /url\.protocol === "http:" && !\(environment === "TEST" && loopback\)/);
  assert.match(selector, /VITE_RIDEX_LIVE_API_URL/);
  assert.match(selector, /LIVE API endpoint is not configured/);
});

test("environment switching clears the previous session before reloading", () => {
  const login = readSource("pages/LoginPage.tsx");
  const selector = readSource("lib/environmentSelection.ts");

  assert.match(login, /getAvailableEnvironments\(\)\.includes\(option\)/);
  assert.match(login, /disabled=\{!available\}/);
  assert.match(login, /storage\.token = ""/);
  assert.match(login, /setSelectedEnvironment\(option\)/);
  assert.match(login, /window\.location\.reload\(\)/);
  assert.match(selector, /sessionStorage\.setItem\(STORAGE_KEY, environment\)/);
});

test("backend environment mismatch remains a fail-closed guard", () => {
  const app = readSource("App.tsx");

  assert.match(app, /backendEnv !== getSelectedEnvironment\(\)/);
});

test("both environment-specific Vite endpoint variables are typed", () => {
  const types = readSource("vite-env.d.ts");

  assert.match(types, /VITE_RIDEX_TEST_API_URL\?: string/);
  assert.match(types, /VITE_RIDEX_LIVE_API_URL\?: string/);
});

test("language preference key follows the selected environment", () => {
  const preference = readSource("lib/languagePreference.ts");

  assert.match(preference, /import \{ getSelectedEnvironment \} from "\.\/environmentSelection"/);
  assert.match(preference, /ridex-admin-language:\$\{getSelectedEnvironment\(\)\.toLowerCase\(\)\}/);
});

test("missing translation diagnostics are guarded by selected TEST environment and debug flag", () => {
  const i18n = readSource("lib/i18n.tsx");

  assert.match(i18n, /getSelectedEnvironment\(\) === "TEST" && DEBUG_ENABLED/);
});