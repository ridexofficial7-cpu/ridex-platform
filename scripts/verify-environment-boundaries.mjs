import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/environment-policy.json'), 'utf8'));
const failures = [];
const observations = [];

function fail(message) { failures.push(message); }
function observe(message) { observations.push(message); }
function parseEnv(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Required environment sample/config file is missing: ${relativePath}`);
    return new Map();
  }
  const values = new Map();
  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}
function isLoopback(host) {
  const normalized = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  return policy.database.allowedTestHosts.includes(normalized);
}
function isPrivateIpv4(host) {
  const parts = String(host || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254);
}
function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}
function classifyApiEndpoint(value, relativePath, key) {
  if (!value) return;
  const parsed = parseUrl(value);
  if (!parsed) {
    fail(`${relativePath}: ${key} must be a valid absolute URL when populated.`);
    return;
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isAllowed = policy.apiEndpoints.allowLoopbackHosts.includes(host) ||
    host === policy.apiEndpoints.allowAndroidEmulatorHost ||
    (policy.apiEndpoints.allowPrivateLanOverrides && isPrivateIpv4(host));
  if (!isAllowed) fail(`${relativePath}: ${key} points outside the approved local development hosts.`);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`${relativePath}: ${key} must use HTTP(S) in the local development profile.`);
  }
}
function classifyCorsOrigin(value, relativePath, key) {
  if (!value) return;
  const origins = value.split(',').map(v => v.trim()).filter(Boolean);
  for (const origin of origins) {
    const parsed = parseUrl(origin);
    if (!parsed) { fail(`${relativePath}: ${key} contains an invalid origin.`); continue; }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!policy.apiEndpoints.allowLoopbackHosts.includes(host) && host !== policy.apiEndpoints.allowAndroidEmulatorHost) {
      fail(`${relativePath}: ${key} contains a non-local origin in the foundation package.`);
    }
  }
}
function classifyDatabaseUrl(value, relativePath, key, mustBeEmpty = false) {
  if (!value) return;
  if (mustBeEmpty) {
    fail(`${relativePath}: ${key} must remain blank in the local foundation package.`);
    return;
  }
  const parsed = parseUrl(value);
  if (!parsed) {
    fail(`${relativePath}: ${key} must be a valid PostgreSQL URL when populated.`);
    return;
  }
  const allowedProtocols = ['postgres:', 'postgresql:'];
  if (policy.database.requirePostgresProtocol && !allowedProtocols.includes(parsed.protocol)) {
    fail(`${relativePath}: ${key} must use a PostgreSQL URL scheme.`);
  }
  if (!isLoopback(parsed.hostname)) {
    fail(`${relativePath}: ${key} must target loopback only; remote database endpoints are prohibited during foundation.`);
  }
}
function hasSecretValue(key, value) {
  const upper = key.toUpperCase();
  if (/_TTL_SECONDS$/.test(upper) || /_KEY_ID$/.test(upper)) return false;
  return policy.secretKeyPatterns.some(pattern => upper.includes(pattern)) && Boolean(value.trim());
}

// Validate only the files explicitly present in the project manifest. Values are never printed.
const envMaps = new Map();
for (const relativePath of policy.environmentFiles) {
  const env = parseEnv(relativePath);
  envMaps.set(relativePath, env);
  for (const [key, value] of env.entries()) {
    if (key === 'DATABASE_URL') fail(`${relativePath}: generic DATABASE_URL fallback is prohibited; use explicit TEST/LIVE variables.`);
    if (hasSecretValue(key, value)) fail(`${relativePath}: secret-like variable ${key} must not contain a value in the project source ZIP.`);
    if (key === 'DATABASE_URL_TEST') classifyDatabaseUrl(value, relativePath, key);
    if (key === 'DATABASE_URL_LIVE') classifyDatabaseUrl(value, relativePath, key, true);
    if (['EXPO_PUBLIC_API_URL', 'VITE_RIDEX_API_URL', 'RIDEX_BACKEND_RESULT_URL'].includes(key)) {
      classifyApiEndpoint(value, relativePath, key);
    }
    if (key === 'CORS_ORIGIN') classifyCorsOrigin(value, relativePath, key);
    if (['RIDEX_ENVIRONMENT', 'PROVIDER_ENVIRONMENT', 'VITE_RIDEX_ENVIRONMENT'].includes(key) && value) {
      const normalized = value.trim().toUpperCase();
      if (!['TEST', 'DEVELOPMENT'].includes(normalized)) {
        fail(`${relativePath}: ${key} must be TEST/DEVELOPMENT in this local foundation package.`);
      }
    }
  }
}

const backendEnv = envMaps.get('services/backend/.env.example');
if (backendEnv?.get('RIDEX_ENVIRONMENT')?.toUpperCase() !== 'TEST') fail('Backend environment example must explicitly select TEST.');
if (!['1', 'TRUE', 'YES', 'ON'].includes((backendEnv?.get('RIDEX_REQUIRE_EXPLICIT_ENVIRONMENT') || '').toUpperCase())) {
  fail('Backend environment example must require explicit environment selection.');
}
if (!backendEnv?.get('DATABASE_URL_TEST')) fail('Backend example must include a local TEST database URL placeholder.');
if ((backendEnv?.get('DATABASE_URL_LIVE') || '').trim()) fail('Backend example must leave DATABASE_URL_LIVE blank.');

const mobileEnv = envMaps.get('apps/ridex-mobile/.env.example');
if (!['1', 'TRUE', 'YES', 'ON', 'TEST'].includes((mobileEnv?.get('EXPO_PUBLIC_RIDEX_TEST_MODE') || '').toUpperCase())) {
  fail('Unified reference mobile .env.example must explicitly keep TEST mode enabled.');
}
if (!mobileEnv?.get('EXPO_PUBLIC_API_URL')) fail('Unified reference mobile .env.example must declare its local API endpoint placeholder.');

const adminWebEnv = envMaps.get('apps/admin-web/.env.test');
if (adminWebEnv?.get('VITE_RIDEX_ENVIRONMENT')?.toUpperCase() !== 'TEST') fail('Admin Web .env.test must explicitly select TEST.');

const providerEnv = envMaps.get('services/broadcaster-provider/.env');
if (providerEnv?.get('PROVIDER_ENVIRONMENT')?.toUpperCase() !== policy.provider.requiredEnvironment) {
  fail('Provider local environment must use TEST.');
}
if (providerEnv?.get('PROVIDER_STORAGE_DRIVER')?.toLowerCase() !== policy.provider.requiredLocalStorageDriver) {
  fail('Provider local storage must use the approved local SQLite profile for this foundation.');
}
const sqlitePath = (providerEnv?.get('PROVIDER_SQLITE_PATH') || '').replace(/\\/g, '/');
if (!sqlitePath.startsWith(policy.provider.sqlitePathPrefix) || path.isAbsolute(sqlitePath)) {
  fail('Provider SQLite state path must remain a relative path under the local data/ directory.');
}

// Self-tests ensure the policy itself rejects remote hosts and populated LIVE/secret fields.
assert.equal(isLoopback('127.0.0.1'), true);
assert.equal(isLoopback('remote.example'), false);
assert.equal(isPrivateIpv4('192.168.1.5'), true);
assert.equal(isPrivateIpv4('8.8.8.8'), false);
assert.equal(hasSecretValue('DATA_ENCRYPTION_KEY', 'sample'), true);
assert.equal(hasSecretValue('GATEWAY_ACCESS_TOKEN_TTL_SECONDS', '900'), false);
assert.equal(parseUrl('http://localhost:4000')?.hostname, 'localhost');
observe(`Reviewed ${policy.environmentFiles.length} declared environment files without emitting environment values.`);
observe('Local API endpoints, local TEST database URL, blank LIVE DB URL, active TEST modes, Provider local SQLite path and secret-value absence were checked.');
observe('This is a static policy check only; it does not connect to PostgreSQL or verify the developer Windows host.');

if (failures.length) {
  console.error('Environment boundary verification: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Environment boundary verification: PASS');
  for (const item of observations) console.log(`- ${item}`);
  console.log('No environment values or credentials were emitted.');
}
