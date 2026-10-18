import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const p = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(p) : [p];
});
function resolveLocalImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...[".ts", ".tsx", ".js", ".jsx", ".json", ".css"].map((ext) => base + ext), ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((file) => path.join(base, file))];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

test("all relative source imports resolve inside the assembled project", () => {
  const files = walk(src).filter((p) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(p));
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const patterns = [/(?:from\s*|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g, /import\s*["'](\.{1,2}\/[^"']+)["']/g];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (!resolveLocalImport(file, match[1])) missing.push(`${path.relative(root, file)} -> ${match[1]}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [], `Unresolved local imports:\n${[...new Set(missing)].join("\n")}`);
});

test("English and Hindi locale dictionaries have the same keys and placeholders", () => {
  const en = JSON.parse(read("src/locales/en-IN.json"));
  const hi = JSON.parse(read("src/locales/hi-IN.json"));
  assert.deepEqual(Object.keys(hi).sort(), Object.keys(en).sort(), "en-IN and hi-IN key sets must match");
  const placeholders = (value) => [...String(value).matchAll(/\{([A-Za-z][\w]*)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(en)) {
    assert.deepEqual(placeholders(hi[key]), placeholders(en[key]), `Placeholder mismatch for locale key: ${key}`);
  }
  for (const key of ["auth.signIn", "auth.adminOtp", "auth.attemptsRemaining", "shell.realtimeConnected", "nav.dashboard", "errors.invalidCredentials", "errors.otpInvalid", "errors.requestFailed"]) {
    assert.ok(en[key] && hi[key], `Required language key missing: ${key}`);
  }
});

test("Vite entry, TypeScript source include and root runtime config agree", () => {
  assert.match(read("index.html"), /src="\/src\/main\.tsx"/);
  assert.match(read("tsconfig.json"), /"include"\s*:\s*\[\s*"src"\s*\]/);
  const envExample = read(".env.example");
  const config = read("src/lib/runtimeConfig.ts");
  for (const key of ["VITE_RIDEX_ENVIRONMENT", "VITE_RIDEX_API_URL", "VITE_RIDEX_APP_NAME", "VITE_ENABLE_DEBUG"]) {
    assert.ok(envExample.includes(`${key}=`), `.env.example missing ${key}`);
    assert.ok(config.includes(key), `runtime config does not read ${key}`);
  }
  assert.doesNotMatch(envExample, /VITE_APP_ENV=|VITE_API_BASE_URL=|VITE_RIDEX_APP_VERSION=/);
  assert.match(config, /import packageManifest from "\.\.\/\.\.\/package\.json"/);
  assert.match(config, /RUNTIME_CONFIG_VALID/);
});

test("REST client only retries safe reads and creates a fresh controller per attempt", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /isSafeReadMethod\(method\)/);
  assert.match(api, /waitWithAbort\(retryDelay, callerSignal\)/);
  assert.match(api, /const maxAttempts = safeRead \? 3 : 1/);
  assert.match(api, /for \(let attempt = 1; attempt <= maxAttempts; attempt \+= 1\)\s*\{\s*const controller = new AbortController\(\)/);
  assert.match(api, /callerSignal\?\.aborted\) throw error/);
});

test("Admin authorization rejects invalid scope and unknown roles by default", () => {
  const api = read("src/lib/api.ts");
  const nav = read("src/config/navigation.tsx");
  assert.match(api, /Access was denied until the backend context is corrected/);
  assert.match(api, /STATE Admin has no assigned state/);
  assert.match(api, /CITY Admin must have both state and city assignments/);
  assert.match(nav, /new Set<Screen>\(\)\)/);
  assert.match(nav, /if \(!scopeValid/);
});

test("diagnostic response rendering is TEST-only, debug-enabled and Super Admin-only", () => {
  const dashboard = read("src/pages/DashboardPage.tsx");
  assert.match(dashboard, /environment === "TEST" && DEBUG_ENABLED && context\.isSuperAdmin/);
  assert.match(dashboard, /safeDisplayJson\(metrics\.raw\)/);
  const display = read("src/lib/displayData.ts");
  assert.match(display, /password\|token\|secret\|otp/);
  assert.match(display, /Bearer \[REDACTED\]/);
});

test("record lists implement bounded display pages and support timeline does not invent server data", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  assert.match(workspace, /DISPLAY_PAGE_SIZE = 25/);
  assert.match(workspace, /function RecordPager/);
  assert.match(workspace, /No case timeline was returned by the backend/);
  assert.match(workspace, /detailEntries\(selected, screen\)/);
  assert.match(workspace, /screen === "reports" \? <Notice tone="info"/);
});

test("dependency scripts include typecheck, build and static contract tests", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts.build, "vite build");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});


test("API endpoint literals are centralized in the shared contract", () => {
  const files = walk(src).filter((p) => /\.(?:ts|tsx|js|jsx)$/.test(p) && !p.endsWith("apiContract.ts"));
  const directRoute = /["'`]\/(?:admin|auth|meta|support|notifications|realtime|health)(?:\/|\?|["'`])/g;
  const matches = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const match of content.matchAll(directRoute)) matches.push(`${path.relative(root, file)}: ${match[0]}`);
  }
  assert.deepEqual(matches, [], `Move API route strings to src/lib/apiContract.ts:\n${matches.join("\n")}`);
  const contract = read("src/lib/apiContract.ts");
  assert.match(contract, /export function resourcePath/);
  assert.match(contract, /encodeURIComponent\(String\(segment\)\)/);
  assert.match(contract, /new URLSearchParams\(\)/);
});

test("application version header is derived from the configured package version", () => {
  const runtime = read("src/lib/runtimeConfig.ts");
  const api = read("src/lib/api.ts");
  const realtime = read("src/lib/realtime.ts");
  assert.match(runtime, /APP_VERSION_HEADER = `ridex-admin-web\/\$\{APP_VERSION\}`/);
  assert.match(api, /APP_VERSION_HEADER/);
  assert.match(realtime, /APP_VERSION_HEADER/);
  assert.doesNotMatch(api + realtime, /ridex-admin-web\/1\.0\.0/);
});

test("P1 workspace language, status and report/support states are present", () => {
  const workspace = read("src/pages/WorkspacePage.tsx");
  const en = JSON.parse(read("src/locales/en-IN.json"));
  const hi = JSON.parse(read("src/locales/hi-IN.json"));
  for (const key of ["common.sortRecords", "common.showingRecords", "common.pageOf", "common.customerRestrictedNote", "workspace.reports.description", "workspace.support.description"]) {
    assert.ok(en[key] && hi[key], `Missing locale key ${key}`);
  }
  assert.match(workspace, /selected\.isRestricted === true/);
  assert.match(workspace, /No backend records match/);
  assert.match(workspace, /report\/export contract is supplied and verified/);
});


test("static translation calls resolve in both locales and preserve placeholders", () => {
  const en = JSON.parse(read("src/locales/en-IN.json"));
  const hi = JSON.parse(read("src/locales/hi-IN.json"));
  const files = walk(src).filter((p) => /\.(?:ts|tsx)$/.test(p));
  const keys = new Set();
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const match of content.matchAll(/\bt\(\s*["']([^"']+)["']/g)) keys.add(match[1]);
  }
  const missing = [...keys].filter((key) => !(key in en) || !(key in hi));
  assert.deepEqual(missing, [], `Static translation calls missing locale entries: ${missing.join(", ")}`);
  const placeholders = (value) => [...String(value).matchAll(/\{([A-Za-z][\w]*)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(en)) assert.deepEqual(placeholders(hi[key]), placeholders(en[key]), `Placeholder mismatch: ${key}`);
});

test("runtime configuration fails closed on explicitly invalid or legacy environment settings", () => {
  const runtime = read("src/lib/runtimeConfig.ts");
  const api = read("src/lib/api.ts");
  assert.match(runtime, /strictEnvironment\(configuredEnvironment\)/);
  assert.match(runtime, /return value === "TEST" \|\| value === "LIVE" \? value : null/);
  assert.match(runtime, /VITE_RIDEX_ENVIRONMENT is required/);
  assert.match(runtime, /VITE_APP_ENV is no longer supported/);
  assert.match(runtime, /VITE_API_BASE_URL is no longer supported/);
  assert.match(runtime, /RUNTIME_CONFIG_VALID = !envIssue && !apiIssue/);
  assert.match(api, /if \(!RUNTIME_CONFIG_VALID\)/);
  assert.match(runtime, /packageManifest\.version/);
  assert.doesNotMatch(runtime, /VITE_RIDEX_APP_VERSION/);
});

test("language selection persists synchronously per TEST/LIVE environment", () => {
  const i18n = read("src/lib/i18n.tsx");
  const preference = read("src/lib/languagePreference.ts");
  const login = read("src/pages/LoginPage.tsx");
  const layout = read("src/layouts/AdminLayout.tsx");
  assert.match(i18n, /localStorage\.setItem\(LANGUAGE_STORAGE_KEY, next\)/);
  assert.match(i18n, /document\.documentElement\.lang = language/);
  assert.match(i18n, /return humanizeMissingKey\(key\)/);
  assert.match(preference, /import \{ APP_ENVIRONMENT \} from ".\/runtimeConfig"/);
  assert.match(preference, /ridex-admin-language:\$\{APP_ENVIRONMENT\.toLowerCase\(\)\}/);
  assert.match(login, /<LanguageSelector/);
  assert.match(layout, /<LanguageSelector compact/);
});

test("API contract inventory explicitly avoids claiming unverified backend routes", () => {
  const contract = read("src/lib/apiContract.ts");
  assert.match(contract, /API_CONTRACT_STATUS/);
  assert.match(contract, /NOT_VERIFIED_AGAINST_BACKEND_SOURCE/);
  assert.match(contract, /method, request schema, response schema, permission and geographic scope/);
});

test("package and lockfile versions agree and release scripts run tests, typecheck, and build", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.version, lock.packages[""].version);
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts.build, "vite build");
  const ci = read(".github/workflows/admin-web-ci.yml");
  assert.match(ci, /npm ci/);
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm run build/);
});

test('dedicated workspace loading, event failures and Public Links backend fields stay aligned', () => {
  const workspace = read('src/pages/WorkspacePage.tsx');
  const panels = read('src/components/AdminCoveragePanels.tsx');
  assert.match(workspace, /const\s+load\s*=\s*useCallback\(async\(\)\s*=>\s*\{\s*if\s*\(\["vehicleCatalog",\s*"gateway",\s*"availability",\s*"routeBuilder"\]\.includes\(screen\)\)\s*return;\s*const sequence/s);
  assert.match(workspace, /envelope\?\.success === false[\s\S]*throw new ApiError/);
  assert.match(panels, /initialCustomer = getLinkValue\(firstRow, \["customerUrl"/);
  assert.match(panels, /initialDriver = getLinkValue\(firstRow, \["driverUrl"/);
  assert.match(panels, /Customer App URL/);
  assert.match(panels, /Driver App URL/);
  assert.doesNotMatch(panels, /Android download URL|iOS download URL/);
});
test("Admin Web uses coordinate-only maps and no rendered img tags", () => {
  const files = [
    "src/components/GeoMap.tsx",
    "src/pages/RouteBuilderPage.tsx",
    "src/components/AssetManager.tsx",
  ];
  for (const relative of files) {
    const source = read(relative);
    assert.doesNotMatch(source, /<img\b/i, `${relative} must not render img elements`);
    assert.doesNotMatch(source, /tile\.openstreetmap\.org\/[^`"']*\.png/i, `${relative} must not request PNG map tiles`);
  }
  const styles = walk(src).filter((p) => p.endsWith(".css")).map((p) => fs.readFileSync(p, "utf8")).join("\n");
  assert.doesNotMatch(styles, /\.rx-map-tile\s*\{|\.rx-asset-delivery-preview img\s*\{/i);
});