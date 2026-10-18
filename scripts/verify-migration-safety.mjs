#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_MIGRATION_COUNT = 11;
const MIGRATION_DIR = 'services/backend/prisma/migrations/';
const BASELINE_MIGRATION = `${MIGRATION_DIR}20261001_ridex_canonical_baseline/migration.sql`;
const FRESH_BASELINE = 'services/backend/prisma/fresh_baseline/migration.sql';
const GRANT_MIGRATION = `${MIGRATION_DIR}20261012_protected_action_otp_grant/migration.sql`;
const GRANT_MODEL = 'ProtectedActionOtpGrant';
const REQUIRED_CONTROL_STATUS = 'NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGES_IMPLEMENTED';
const MIGRATION_CONTRACT_PATH = 'config/migration-safety-contract.json';
const MIGRATION_VALIDATOR_PATH = 'scripts/verify-migration-safety.mjs';

const errors = [];
const passes = [];
const pass = (message) => passes.push(`PASS ${message}`);
const fail = (message) => errors.push(message);

function absolutePath(relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return resolved;
}

function exists(relativePath) {
  try {
    return fs.existsSync(absolutePath(relativePath));
  } catch {
    return false;
  }
}

function readBytes(relativePath) {
  return fs.readFileSync(absolutePath(relativePath));
}

function readText(relativePath) {
  return readBytes(relativePath).toString('utf8');
}

function readChecked(relativePath, label = relativePath) {
  try {
    return readText(relativePath);
  } catch (error) {
    fail(`${label} missing or unreadable: ${error.message}`);
    return null;
  }
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(relativePath) {
  return sha256Bytes(readBytes(relativePath));
}

function loadJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function extractBlock(source, kind, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`^${kind}\\s+${escapedName}\\s*\\{([\\s\\S]*?)^\\}`, 'm');
  return source.match(expression)?.[1] ?? null;
}

function schemaField(modelBody, fieldName) {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`^\\s*${escapedName}\\s+([A-Za-z][A-Za-z0-9_]*)(\\?)?(?:\\s+|$)(.*)$`, 'm');
  const match = modelBody.match(expression);
  if (!match) return null;
  return {
    type: match[1],
    optional: Boolean(match[2]),
    attributes: match[3] ?? '',
  };
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function compactWithoutWhitespace(value) {
  return value.replace(/\s+/g, '');
}

let contract;
let baseline;
let sourceInventory;
let databaseIntegrity;
let securityRequirements;
let securityControlMap;
try {
  contract = loadJson(MIGRATION_CONTRACT_PATH);
  baseline = loadJson('config/project-baseline.json');
  sourceInventory = loadJson('config/source-inventory.json');
  databaseIntegrity = loadJson('config/database-integrity-contract.json');
  securityRequirements = loadJson('config/security-requirement-register.json');
  securityControlMap = loadJson('config/security-control-test-map.json');
  pass('migration contract and linked registers parse');
} catch (error) {
  console.error(`FAIL migration safety metadata: ${error.message}`);
  process.exit(1);
}

// Contract identity and test-status honesty.
if (contract.project !== 'RideX-Super_Admin_Controle') fail('wrong project identity');
else pass('canonical project identity recorded');

if (contract.status !== 'STATIC_ELEVEN_MIGRATION_CANDIDATE_CHAIN_INVENTORIED_CANONICALITY_AND_ROLLBACK_DECISIONS_OPEN_PHYSICAL_DB_TESTS_DEFERRED') {
  fail('migration status must distinguish static inventory from approval and physical DB verification');
} else {
  pass('status distinguishes static migration analysis from physical DB verification');
}
if (contract.canonicalPrismaDeployPath !== MIGRATION_DIR) fail('canonical Prisma deployment path missing');
else pass('only active Prisma migrations directory is the deployment path');
if (contract.migrationOrderValidation !== 'PRISMA_LEXICOGRAPHIC_DIRECTORY_ORDER_MUST_MATCH_RECORDED_ACTIVE_CHAIN') {
  fail('migration order validation policy missing from contract');
} else {
  pass('contract explicitly requires Prisma lexicographic deployment-order validation');
}

const activeChain = Array.isArray(contract.activeChain) ? contract.activeChain : [];
if (!Array.isArray(contract.activeChain)) fail('active migration chain must be an array');
if (activeChain.length !== EXPECTED_MIGRATION_COUNT) {
  fail(`expected exactly ${EXPECTED_MIGRATION_COUNT} inventoried active migrations, found ${activeChain.length}`);
} else {
  pass(`exactly ${EXPECTED_MIGRATION_COUNT} migration candidates are inventoried`);
}

let migrationDirectories = [];
try {
  migrationDirectories = fs.readdirSync(absolutePath(MIGRATION_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
} catch (error) {
  fail(`cannot enumerate canonical Prisma migration directory: ${error.message}`);
}

const inventoriedIds = activeChain.map((item) => item?.migrationId);
const sortedInventoriedIds = inventoriedIds.slice().sort();
if (JSON.stringify(migrationDirectories) !== JSON.stringify(sortedInventoriedIds) ||
    migrationDirectories.length !== activeChain.length) {
  fail('active migration directory list differs from the inventoried candidate chain');
} else {
  pass(`${migrationDirectories.length} active migration directories match the recorded candidate chain`);
}

const sortedByOrder = activeChain.slice().sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
if (sortedByOrder.some((item, index) => item?.order !== index + 1)) {
  fail('migration chain order values must be unique, contiguous, and start at 1');
} else {
  pass('migration order is unique, explicit, and contiguous');
}
if (JSON.stringify(migrationDirectories) !== JSON.stringify(sortedByOrder.map((item) => item?.migrationId))) {
  fail('recorded migration order differs from Prisma lexicographic directory order');
} else {
  pass('recorded migration order matches Prisma lexicographic directory ordering');
}
if (new Set(inventoriedIds).size !== inventoriedIds.length) fail('migration IDs must be unique');
else pass('migration IDs are unique');

for (const migration of activeChain) {
  const migrationId = migration?.migrationId;
  if (typeof migrationId !== 'string' || !/^\d{8}_[a-z0-9_]+$/.test(migrationId)) {
    fail(`invalid migration ID: ${String(migrationId)}`);
    continue;
  }

  const expectedFile = `${MIGRATION_DIR}${migrationId}/migration.sql`;
  if (migration.file !== expectedFile) {
    fail(`${migrationId} file path must be exactly ${expectedFile}`);
    continue;
  }
  if (typeof migration.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(migration.sha256)) {
    fail(`${migrationId} inventory SHA-256 must be a 64-character lowercase hexadecimal digest`);
    continue;
  }

  try {
    const actual = sha256File(migration.file);
    if (actual !== migration.sha256) fail(`${migrationId} file hash changed; review migration drift`);
    else pass(`${migrationId} SHA-256 matches inventory`);
  } catch (error) {
    fail(`migration file missing or unreadable: ${migration.file} (${error.message})`);
  }
}

// Fresh baseline is a reference copy only, never another Prisma deploy chain.
if (contract.freshBaselineReference?.file !== FRESH_BASELINE) {
  fail(`fresh baseline reference path must be exactly ${FRESH_BASELINE}`);
} else if (contract.freshBaselineReference?.byteIdenticalTo !== BASELINE_MIGRATION) {
  fail('fresh baseline contract must name the first active migration as its byte-identical source');
} else if (contract.freshBaselineReference?.includedInPrismaDeployChain !== false) {
  fail('fresh_baseline must not be marked as a second Prisma deploy chain');
} else if (!exists(FRESH_BASELINE)) {
  fail('fresh baseline reference is missing');
} else if (!exists(BASELINE_MIGRATION)) {
  fail('first active baseline migration is missing');
} else {
  try {
    const referenceBytes = readBytes(FRESH_BASELINE);
    const activeBaselineBytes = readBytes(BASELINE_MIGRATION);
    if (!referenceBytes.equals(activeBaselineBytes)) {
      fail('fresh_baseline reference must remain byte-identical to the first active migration until RX-DEC-053');
    } else if (sha256Bytes(referenceBytes) !== contract.freshBaselineReference?.sha256) {
      fail('fresh_baseline SHA-256 differs from its recorded reference hash');
    } else {
      pass('fresh_baseline is byte-identical, hash-verified, and outside the deploy chain');
    }
  } catch (error) {
    fail(`fresh baseline comparison failed: ${error.message}`);
  }
}

if (exists('services/backend/prisma/migrations_legacy_20261001')) {
  fail('legacy migration archive must not be present in the clean source project');
} else {
  pass('legacy migration archive is excluded from the current source project');
}

// Check the OTP-grant SQL as a table definition and check constraints, not loose substrings.
const grantSql = readChecked(GRANT_MIGRATION, 'protected-action OTP grant migration');
const schema = readChecked('services/backend/prisma/schema.prisma', 'Prisma schema');
if (grantSql !== null && schema !== null) {
  const sqlWithoutComments = grantSql
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const createTableMatch = sqlWithoutComments.match(/CREATE\s+TABLE\s+"ProtectedActionOtpGrant"\s*\(([\s\S]*?)\)\s*;/i);
  const tableBody = createTableMatch?.[1] ?? null;
  if (!tableBody) {
    fail('grant migration must contain a complete CREATE TABLE ProtectedActionOtpGrant definition');
  } else {
    pass('grant migration contains a complete ProtectedActionOtpGrant table definition');
  }

  const modelBody = extractBlock(schema, 'model', GRANT_MODEL);
  if (!modelBody) {
    fail('Prisma schema is missing model ProtectedActionOtpGrant');
  } else {
    pass('Prisma grant model exists');
  }

  if (tableBody && modelBody) {
    const columnSpecs = [
      { name: 'id', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i, requiredAttribute: /@id\b/ },
      { name: 'tokenHash', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i, requiredAttribute: /@unique\b/ },
      { name: 'actorType', schemaType: 'UserType', nullable: false, sqlType: /^"UserType"(?:\s|$)/i },
      { name: 'actorId', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i },
      { name: 'userId', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i },
      { name: 'sessionId', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i },
      { name: 'purposeCode', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i },
      { name: 'resourceId', schemaType: 'String', nullable: false, sqlType: /^TEXT\b/i },
      { name: 'expiresAt', schemaType: 'DateTime', nullable: false, sqlType: /^TIMESTAMP\(3\)(?:\s|$)/i },
      { name: 'consumedAt', schemaType: 'DateTime', nullable: true, sqlType: /^TIMESTAMP\(3\)(?:\s|$)/i },
      { name: 'createdAt', schemaType: 'DateTime', nullable: false, sqlType: /^TIMESTAMP\(3\)(?:\s|$)/i },
    ];

    for (const column of columnSpecs) {
      const field = schemaField(modelBody, column.name);
      if (!field) {
        fail(`Prisma grant schema is missing field ${column.name}`);
        continue;
      }
      if (field.type !== column.schemaType) {
        fail(`Prisma grant field ${column.name} must have type ${column.schemaType}, found ${field.type}`);
      }
      if (field.optional !== column.nullable) {
        fail(`Prisma grant field ${column.name} nullability does not match required policy`);
      }
      if (column.requiredAttribute && !column.requiredAttribute.test(field.attributes)) {
        fail(`Prisma grant field ${column.name} is missing required attribute ${column.requiredAttribute}`);
      }

      const escapedColumn = column.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sqlLineMatch = tableBody.match(new RegExp(`^\\s*"${escapedColumn}"\\s+([^,\\r\\n]+)`, 'mi'));
      if (!sqlLineMatch) {
        fail(`grant migration is missing SQL column ${column.name}`);
        continue;
      }
      const sqlDefinition = sqlLineMatch[1].trim();
      if (!column.sqlType.test(sqlDefinition)) {
        fail(`SQL column ${column.name} has an unexpected type definition: ${sqlDefinition}`);
      }
      const sqlNullable = !/\bNOT\s+NULL\b/i.test(sqlDefinition);
      if (sqlNullable !== column.nullable) {
        fail(`SQL column ${column.name} nullability does not match the Prisma model`);
      }
    }

    const compactModel = compactWithoutWhitespace(modelBody);
    const schemaPolicies = [
      { expression: /userUser@relation\(fields:\[userId\],references:\[id\],onDelete:Cascade,onUpdate:Cascade\)/, label: 'owning-user relation with delete/update cascade' },
      { expression: /@@index\(\[actorType,actorId,purposeCode,expiresAt\]\)/, label: 'actor/purpose/expiry index' },
      { expression: /@@index\(\[userId,sessionId,expiresAt\]\)/, label: 'user/session/expiry index' },
      { expression: /@@index\(\[expiresAt,consumedAt\]\)/, label: 'expiry/consumption index' },
    ];
    for (const policy of schemaPolicies) {
      if (!policy.expression.test(compactModel)) fail(`Prisma grant schema missing ${policy.label}`);
      else pass(`Prisma grant schema includes ${policy.label}`);
    }

    const compactSql = compactWhitespace(sqlWithoutComments);
    const sqlPolicies = [
      { expression: /CONSTRAINT\s+"ProtectedActionOtpGrant_pkey"\s+PRIMARY\s+KEY\s*\(\s*"id"\s*\)/i, label: 'primary key on id' },
      { expression: /FOREIGN\s+KEY\s*\(\s*"userId"\s*\)\s+REFERENCES\s+"User"\s*\(\s*"id"\s*\)\s+ON\s+DELETE\s+CASCADE\s+ON\s+UPDATE\s+CASCADE/i, label: 'owning-user foreign key with delete/update cascade' },
      { expression: /CREATE\s+UNIQUE\s+INDEX\s+"ProtectedActionOtpGrant_tokenHash_key"\s+ON\s+"ProtectedActionOtpGrant"\s*\(\s*"tokenHash"\s*\)/i, label: 'unique token-hash index' },
      { expression: /CREATE\s+INDEX\s+"ProtectedActionOtpGrant_actorType_actorId_purposeCode_expiresAt_idx"\s+ON\s+"ProtectedActionOtpGrant"\s*\(\s*"actorType"\s*,\s*"actorId"\s*,\s*"purposeCode"\s*,\s*"expiresAt"\s*\)/i, label: 'actor/purpose/expiry index' },
      { expression: /CREATE\s+INDEX\s+"ProtectedActionOtpGrant_userId_sessionId_expiresAt_idx"\s+ON\s+"ProtectedActionOtpGrant"\s*\(\s*"userId"\s*,\s*"sessionId"\s*,\s*"expiresAt"\s*\)/i, label: 'user/session/expiry index' },
      { expression: /CREATE\s+INDEX\s+"ProtectedActionOtpGrant_expiresAt_consumedAt_idx"\s+ON\s+"ProtectedActionOtpGrant"\s*\(\s*"expiresAt"\s*,\s*"consumedAt"\s*\)/i, label: 'expiry/consumption index' },
      { expression: /CONSTRAINT\s+"ProtectedActionOtpGrant_tokenHash_format_check"\s+CHECK\s*\(\s*"tokenHash"\s*~\s*'\^\[0-9a-f\]\{64\}\$'\s*\)/i, label: '64-character lowercase SHA-256 token hash check' },
      { expression: /CONSTRAINT\s+"ProtectedActionOtpGrant_purposeCode_nonempty_check"\s+CHECK\s*\(\s*length\s*\(\s*trim\s*\(\s*"purposeCode"\s*\)\s*\)\s*>\s*0\s*\)/i, label: 'non-empty purpose-code check' },
      { expression: /CONSTRAINT\s+"ProtectedActionOtpGrant_resourceId_nonempty_check"\s+CHECK\s*\(\s*length\s*\(\s*trim\s*\(\s*"resourceId"\s*\)\s*\)\s*>\s*0\s*\)/i, label: 'non-empty resource-id check' },
      { expression: /CONSTRAINT\s+"ProtectedActionOtpGrant_expiry_after_creation_check"\s+CHECK\s*\(\s*"expiresAt"\s*>\s*"createdAt"\s*\)/i, label: 'expiry-after-creation check' },
    ];
    for (const policy of sqlPolicies) {
      if (!policy.expression.test(compactSql)) fail(`grant migration missing or changes ${policy.label}`);
      else pass(`grant migration includes ${policy.label}`);
    }

    if (!/"createdAt"\s+TIMESTAMP\(3\)\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i.test(tableBody)) {
      fail('SQL createdAt column must be NOT NULL with DEFAULT CURRENT_TIMESTAMP');
    } else {
      pass('SQL createdAt default matches Prisma @default(now()) intent');
    }
  }
}

// Validate the TEST-only deploy wrapper's actual guard branches, ordering, and logging surface.
const wrapper = readChecked('services/backend/scripts/prisma-migrate-deploy.cjs', 'Prisma migration wrapper');
const runnerPolicy = contract.migrationRunnerPolicy;
if (!runnerPolicy || runnerPolicy.productionOrLiveAllowed !== false || runnerPolicy.allowedEnvironment !== 'TEST') {
  fail('contract must forbid LIVE/PRODUCTION migration execution and permit TEST only');
} else {
  pass('contract forbids LIVE/PRODUCTION migration execution');
}
if (runnerPolicy?.requiredDatabaseUrl !== 'DATABASE_URL_TEST' || runnerPolicy?.liveDatabaseUrlMustBeBlank !== true || runnerPolicy?.noSecretValuesLogged !== true) {
  fail('contract must require TEST URL, blank LIVE URL, and redacted logging');
} else {
  pass('contract records TEST URL, blank LIVE URL, and no-secret logging requirements');
}
const allowedHosts = ['localhost', '127.0.0.1', '::1'];
if (JSON.stringify(runnerPolicy?.allowedDatabaseHosts) !== JSON.stringify(allowedHosts)) {
  fail('contract allowedDatabaseHosts must exactly match the approved loopback host set');
} else {
  pass('contract restricts database hosts to the exact loopback allowlist');
}
if (wrapper !== null) {
  const allowlistMatch = wrapper.match(/const\s+ALLOWED_TEST_DATABASE_HOSTS\s*=\s*\[([^\]]*)\]\s*;/);
  const wrapperAllowedHosts = allowlistMatch
    ? [...allowlistMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
    : null;
  if (!wrapperAllowedHosts) {
    fail('migration wrapper must declare an explicit parseable TEST database host allowlist');
  } else if (JSON.stringify(wrapperAllowedHosts) !== JSON.stringify(allowedHosts)) {
    fail('migration wrapper host allowlist must exactly match the approved loopback host set');
  } else if (JSON.stringify(wrapperAllowedHosts) !== JSON.stringify(runnerPolicy?.allowedDatabaseHosts)) {
    fail('migration wrapper host allowlist differs from the migration-safety contract');
  } else {
    pass('migration wrapper source allowlist exactly matches the contract-approved loopback hosts');
  }
}
if (runnerPolicy?.requiredExpectedDatabaseName !== 'RIDEX_EXPECTED_DATABASE_NAME must exactly match the database name encoded in DATABASE_URL_TEST') {
  fail('explicit expected database-name policy missing');
} else {
  pass('explicit expected database identity precondition recorded');
}

if (wrapper !== null) {
  const wrapperChecks = [
    [/function selectValidatedTestDatabase\(environmentVariables\)/, 'migration wrapper defines a testable database-selection policy'],
    [/selectedUrl\s*=\s*selectValidatedTestDatabase\(process\.env\)/, 'migration wrapper invokes the validated policy before selecting DATABASE_URL'],
    [/if\s*\(require\.main === module\)\s*main\(\);/, 'importing the wrapper does not execute migration deployment'],
    [/spawnSync\(process\.execPath,\s*\[prismaCli,\s*'migrate',\s*'deploy'\]/, 'migration wrapper invokes Prisma migrate deploy only in its CLI entry point'],
  ];
  for (const [expression, label] of wrapperChecks) {
    if (expression.test(wrapper)) pass(label);
    else fail(label);
  }

  const dotenvLoadIndex = wrapper.indexOf("require('dotenv/config')");
  const mainIndex = wrapper.indexOf('function main()');
  if (dotenvLoadIndex < 0 || mainIndex < 0 || dotenvLoadIndex < mainIndex) {
    fail('dotenv and environment loading must occur only inside the actual CLI entry point');
  } else {
    pass('importing policy for tests does not load .env or start CLI work');
  }

  const policySelectionIndex = wrapper.indexOf('selectedUrl = selectValidatedTestDatabase(process.env)');
  const databaseAssignmentIndex = wrapper.indexOf('process.env.DATABASE_URL = selectedUrl;');
  if (policySelectionIndex < 0 || databaseAssignmentIndex < 0 || databaseAssignmentIndex < policySelectionIndex) {
    fail('DATABASE_URL must be assigned only after the validated TEST selection returns');
  } else {
    pass('DATABASE_URL assignment occurs only after behavior-validated selection');
  }

  const unsafeOutputLines = wrapper.split(/\r?\n/).filter((line) =>
    /\b(?:console\.(?:log|info|warn|error|debug|dir)|process\.(?:stdout|stderr)\.write)\s*\(/.test(line) &&
    /\b(?:selectedUrl|liveUrl|expectedDatabaseName|parsed\.href|process\.env\.DATABASE_URL)\b/.test(line));
  if (unsafeOutputLines.length > 0) fail('migration wrapper contains an output statement that may disclose database URL/identity values');
  else pass('migration wrapper does not log selected URL or database identity values');
}

// Execute the actual pure policy function with safe synthetic values. These tests
// reject dangerous targets before Prisma can be spawned or any DB can be contacted.
let migrationPolicy;
try {
  const requireFromValidator = createRequire(import.meta.url);
  migrationPolicy = requireFromValidator(absolutePath('services/backend/scripts/prisma-migrate-deploy.cjs'));
} catch (error) {
  fail(`migration wrapper policy cannot be imported without side effects: ${error.message}`);
}

const selectValidatedTestDatabase = migrationPolicy?.selectValidatedTestDatabase;
if (typeof selectValidatedTestDatabase !== 'function') {
  fail('migration wrapper does not export its pure database-selection policy for behavior tests');
} else {
  const validDatabaseName = 'ridex_test';
  const makeUrl = (host, databaseName = validDatabaseName) => {
    const urlHost = host === '::1' ? '[::1]' : host;
    return `postgresql://ridex_test:synthetic-placeholder@${urlHost}:5432/${databaseName}`;
  };
  const baseEnvironment = {
    RIDEX_ENVIRONMENT: 'TEST',
    DATABASE_URL_TEST: makeUrl('127.0.0.1'),
    DATABASE_URL_LIVE: '',
    RIDEX_EXPECTED_DATABASE_NAME: validDatabaseName,
  };

  function expectPolicyRejects(name, overrides, expectedMessage) {
    const candidate = { ...baseEnvironment, ...overrides };
    const before = JSON.stringify(candidate);
    let rejected = false;
    try {
      selectValidatedTestDatabase(candidate);
    } catch (error) {
      rejected = true;
      if (!String(error.message).includes(expectedMessage)) {
        fail(`${name} rejected with an unexpected policy reason`);
      }
      if (/synthetic-placeholder|private-sentinel/i.test(String(error.message))) {
        fail(`${name} rejection leaked a synthetic credential sentinel`);
      }
    }
    if (!rejected) fail(`${name} was incorrectly accepted by the migration policy`);
    if (JSON.stringify(candidate) !== before) fail(`${name} mutated the caller environment object`);
    if (rejected && JSON.stringify(candidate) === before) pass(`migration policy behavior rejects ${name} without leaking or mutating values`);
  }

  for (const host of ['localhost', '127.0.0.1', '::1']) {
    const env = { ...baseEnvironment, DATABASE_URL_TEST: makeUrl(host) };
    try {
      const selected = selectValidatedTestDatabase(env);
      if (selected !== env.DATABASE_URL_TEST) fail(`loopback host ${host} returned a different TEST URL`);
      else pass(`migration policy behavior accepts approved loopback host ${host}`);
      if (JSON.stringify(env) !== JSON.stringify({ ...baseEnvironment, DATABASE_URL_TEST: makeUrl(host) })) {
        fail(`loopback host ${host} policy test mutated input variables`);
      }
    } catch {
      fail(`migration policy incorrectly rejected approved loopback host ${host}`);
    }
  }

  expectPolicyRejects('LIVE/PRODUCTION environment', { RIDEX_ENVIRONMENT: 'PRODUCTION' }, 'local TEST only');
  expectPolicyRejects('missing TEST URL', { DATABASE_URL_TEST: '' }, 'Missing DATABASE_URL_TEST');
  expectPolicyRejects('nonblank LIVE URL', { DATABASE_URL_LIVE: makeUrl('localhost') }, 'DATABASE_URL_LIVE must remain blank');
  expectPolicyRejects('missing expected database name', { RIDEX_EXPECTED_DATABASE_NAME: '' }, 'RIDEX_EXPECTED_DATABASE_NAME');
  expectPolicyRejects('invalid URL', { DATABASE_URL_TEST: 'not-a-url' }, 'valid PostgreSQL URL');
  expectPolicyRejects('non-PostgreSQL protocol', { DATABASE_URL_TEST: 'https://localhost:5432/ridex_test' }, 'PostgreSQL protocol');
  expectPolicyRejects('remote database host', { DATABASE_URL_TEST: 'postgresql://ridex_test:synthetic-placeholder@remote.invalid:5432/ridex_test' }, 'loopback hosts only');
  expectPolicyRejects('host injected beyond the approved loopback set', { DATABASE_URL_TEST: 'postgresql://ridex_test:synthetic-placeholder@example.invalid:5432/ridex_test' }, 'loopback hosts only');
  expectPolicyRejects('invalid database-name encoding', { DATABASE_URL_TEST: 'postgresql://ridex_test:synthetic-placeholder@127.0.0.1:5432/bad%ZZ' }, 'invalid database name encoding');
  expectPolicyRejects('multiple database path segments', { DATABASE_URL_TEST: 'postgresql://ridex_test:synthetic-placeholder@127.0.0.1:5432/ridex_test%2Fother' }, 'exactly one database name');
  expectPolicyRejects('database-name mismatch', { DATABASE_URL_TEST: makeUrl('127.0.0.1', 'another_db') }, 'database name does not match');
}

// All cross-register links and the control map are validated, not merely parsed.
for (const [label, ref] of [
  ['project baseline', baseline.migrationSafetyContract],
  ['source inventory', sourceInventory.migrationSafetyContract],
  ['database integrity contract', databaseIntegrity.migrationSafetyContract],
  ['security requirement register', securityRequirements.migrationSafetyContract],
]) {
  if (!ref || ref.path !== MIGRATION_CONTRACT_PATH) fail(`${label} link to migration safety contract missing or incorrect`);
  else pass(`${label} links the migration safety contract`);
}
if (baseline.migrationSafetyContract?.validator !== MIGRATION_VALIDATOR_PATH) {
  fail('project baseline points to an incorrect migration validator path');
}
if (databaseIntegrity.migrationReview?.activeMigrationCount !== EXPECTED_MIGRATION_COUNT) {
  fail(`database integrity register must record ${EXPECTED_MIGRATION_COUNT} active migrations`);
}
if (JSON.stringify(databaseIntegrity.migrationReview?.activeMigrationDirectories) !== JSON.stringify(migrationDirectories)) {
  fail('database integrity register migration directory list differs from the on-disk chain');
} else {
  pass('database integrity register matches the active migration directory list');
}
if (databaseIntegrity.migrationReview?.canonicalChainApproved !== false || databaseIntegrity.migrationReview?.migrationsExecuted !== false) {
  fail('database integrity register must keep chain unapproved and migrations unexecuted');
} else {
  pass('database integrity register keeps migration approval/execution pending');
}
if (databaseIntegrity.migrationReview?.freshBaselineOutsideDeploymentDirectory !== true ||
    databaseIntegrity.migrationReview?.duplicateFreshBaselineSqlPresent !== true) {
  fail('database integrity register must identify the duplicate baseline as outside the deployment chain');
} else {
  pass('database integrity register classifies fresh baseline as a reference copy');
}

for (const id of ['RX-DEC-053', 'RX-DEC-054']) {
  const decision = (baseline.decisions || []).find((item) => item.id === id);
  if (!decision || decision.status !== 'VERIFY') fail(`${id} must remain VERIFY in project baseline`);
  else pass(`${id} remains VERIFY in baseline`);
}

for (const id of ['REQ-DATA-001', 'REQ-DATA-002']) {
  const requirement = (securityRequirements.requirements || []).find((item) => item.id === id);
  if (!requirement) {
    fail(`${id} missing`);
  } else {
    if (!(requirement.sourceEvidence || []).includes(MIGRATION_CONTRACT_PATH)) fail(`${id} does not link migration contract in source evidence`);
    if (requirement.implementationStatus !== 'UNVERIFIED') fail(`${id} must remain UNVERIFIED pending physical DB evidence`);
    else pass(`${id} remains UNVERIFIED pending physical database evidence`);
  }
}

const controlMapContract = securityControlMap.migrationSafetyContract;
if (!controlMapContract || controlMapContract.path !== MIGRATION_CONTRACT_PATH || controlMapContract.validator !== MIGRATION_VALIDATOR_PATH) {
  fail('security control test map does not correctly link the migration-safety contract and validator');
} else {
  pass('security control test map links the migration-safety contract and validator');
}
if (!/STATIC_ONLY/.test(controlMapContract?.status || '') || !/DEFERRED/.test(controlMapContract?.status || '')) {
  fail('security control map must keep migration tests static-only and deferred');
}
if (securityControlMap.summary?.controlsExecuted !== 0 || !Array.isArray(securityControlMap.controls)) {
  fail('security control map must report zero executed controls and include the control inventory');
}
for (const requirementId of ['REQ-DATA-001', 'REQ-DATA-002']) {
  const controls = (securityControlMap.controls || []).filter((item) => item.requirementId === requirementId);
  if (controls.length < 2) {
    fail(`${requirementId} must have at least two migration-related security control scenarios`);
    continue;
  }
  for (const control of controls) {
    if (!(control.sourceEvidence || []).includes(MIGRATION_CONTRACT_PATH)) fail(`${control.controlId} does not link migration safety contract`);
    if (control.status !== REQUIRED_CONTROL_STATUS) fail(`${control.controlId} must remain deferred and not executed`);
  }
  if (controls.every((control) => control.status === REQUIRED_CONTROL_STATUS && (control.sourceEvidence || []).includes(MIGRATION_CONTRACT_PATH))) {
    pass(`${requirementId} controls link migration contract and remain deferred`);
  }
}

if (contract.testStatus !== 'NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH' ||
    contract.noMigrationExecuted !== true || contract.runtimeDatabaseAccessPerformed !== false) {
  fail('physical migration/database test status must remain deferred, with no migration or database access claimed');
} else {
  pass('no migration or database test is claimed as executed');
}

try {
  const packageManifest = loadJson('package.json');
  if (packageManifest.scripts?.['verify:migration-safety'] !== 'node scripts/verify-migration-safety.mjs') {
    fail('npm verify:migration-safety command missing or incorrect');
  } else {
    pass('dedicated migration-safety validator command exists');
  }
} catch (error) {
  fail(`root package manifest missing or invalid: ${error.message}`);
}

if (errors.length > 0) {
  console.error('\nMIGRATION SAFETY CHECK: FAIL');
  for (const error of errors) console.error(`FAIL ${error}`);
  console.error(`\n${passes.length} checks passed; ${errors.length} checks failed.`);
  process.exit(1);
}

console.log('\nMIGRATION SAFETY CHECK: PASS');
for (const message of passes) console.log(message);
console.log(`\n${passes.length} checks passed; 0 checks failed.`);
console.log(`Active migrations inventoried: ${EXPECTED_MIGRATION_COUNT}; migrations executed: 0; database access performed: no; physical database tests deferred.`);
