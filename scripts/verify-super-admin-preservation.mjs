#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
let passes = 0;

function check(condition, message) {
  if (condition) {
    passes += 1;
    console.log(`PASS ${message}`);
  } else {
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
}

const bootstrap = read("services/backend/scripts/bootstrap-admin.ts");
const adminRoutes = read("services/backend/src/routes/admin.ts");
const authRoutes = read("services/backend/src/routes/auth.ts");
const testData = read("services/backend/src/services/testData.ts");
const testAccounts = read("services/backend/scripts/bootstrap-test-accounts.ts");
const backendEnvExample = read("services/backend/.env.example");
const driverE2e = read("services/backend/scripts/prepare-driver-e2e.ts");
const fullRideE2e = read("services/backend/scripts/prepare-full-ride-e2e.ts");
const otpSeed = read("services/backend/scripts/seed-otp-configurations.ts");
const readOnlyDbCheck = read("services/backend/scripts/readonly-e2e-safety-check.mjs");
const testAccountBootstrap = read("services/backend/scripts/bootstrap-test-accounts.ts");
const e2eCredentialScripts = [
  read("services/backend/scripts/trip-complete-e2e.mjs"),
  read("services/backend/scripts/driver-trip-verification-start.mjs"),
  read("services/backend/scripts/driver-smoke.mjs"),
  read("services/backend/scripts/driver-accept-smoke.mjs"),
  read("services/backend/scripts/driver-accept-e2e.mjs"),
];

const environmentGuard = bootstrap.indexOf('getEnvironment() !== "TEST"');
const transactionStart = bootstrap.indexOf("prisma.$transaction(async (tx) =>");
const superAdminPreflight = bootstrap.indexOf("tx.adminUser.findFirst");
const mobilePreflight = bootstrap.indexOf("tx.user.findUnique");
const roleWrites = bootstrap.indexOf("tx.role.upsert");
check(
  environmentGuard >= 0 &&
    transactionStart > environmentGuard &&
    bootstrap.includes("RIDEX_TEST_MODE") &&
    bootstrap.includes("DATABASE_URL_LIVE"),
  "Super Admin bootstrap requires explicit TEST isolation before database writes",
);
check(
  superAdminPreflight > transactionStart &&
    mobilePreflight > superAdminPreflight &&
    roleWrites > mobilePreflight &&
    bootstrap.includes('isolationLevel: "Serializable"'),
  "bootstrap checks for any existing Super Admin and target identity before serialized writes",
);
check(
  bootstrap.includes("tx.user.create") &&
    bootstrap.includes("tx.adminUser.create") &&
    !bootstrap.includes("tx.user.update") &&
    !bootstrap.includes("tx.adminUser.upsert"),
  "bootstrap is create-only and cannot change an existing account password or status",
);

function routeBlock(marker) {
  const start = adminRoutes.indexOf(marker);
  if (start < 0) return "";
  const end = adminRoutes.indexOf("\nrouter.", start + marker.length);
  return adminRoutes.slice(start, end > start ? end : undefined);
}

for (const [label, marker] of [
  ["approve", '"/admins/:adminId/approve"'],
  ["reject", '"/admins/:adminId/reject"'],
  ["suspend", '"/admins/:adminId/suspend"'],
  ["reactivate", '"/admins/:adminId/reactivate"'],
]) {
  const block = routeBlock(marker);
  check(
    block.includes("isProtectedSuperAdminAccount(existing)") &&
      block.indexOf("isProtectedSuperAdminAccount(existing)") <
        block.indexOf("await prisma.adminUser.update"),
    `standard Admin ${label} workflow refuses to change Super Admin account status`,
  );
}
const rolePermissionRoute = routeBlock('"/roles/:roleId/permissions"');
check(
  rolePermissionRoute.includes("String(role.name).toUpperCase() === SUPER_ADMIN_ROLE") &&
    rolePermissionRoute.indexOf("SUPER_ADMIN_ROLE") <
      rolePermissionRoute.indexOf("tx.rolePermission.deleteMany"),
  "standard permission management refuses to downgrade the Super Admin role",
);

const mutationGuard = testData.match(
  /async function guardTestDataMutation\([\s\S]*?\): Promise<void> \{([\s\S]*?)\n\}/,
);
check(
  Boolean(mutationGuard?.[1].includes("throw new TestDataMutationBlockedError(")) &&
    Boolean(mutationGuard?.[1] && !/return|await|prisma\./.test(mutationGuard[1])),
  "test-data reset and seed modes remain blocked before database work",
);
check(
  /export async function resetRideXTestData\([\s\S]*?await guardTestDataMutation\([\s\S]*?resetFixtureData\(/.test(testData) &&
    /export async function seedRideXTestData\([\s\S]*?await guardTestDataMutation\([\s\S]*?resetFixtureData\(/.test(testData),
  "reset and seed entry points invoke the unconditional mutation guard first",
);
const fixtureResetStart = testData.indexOf("async function resetFixtureData(");
const fixtureAdminGuard = testData.indexOf("const fixtureAdmin =", fixtureResetStart);
const fixtureAdminDelete = testData.indexOf("tx.adminUser.deleteMany", fixtureResetStart);
const fixtureUserDelete = testData.indexOf("tx.user.deleteMany", fixtureResetStart);
check(
  fixtureAdminGuard > fixtureResetStart &&
    fixtureAdminGuard < fixtureAdminDelete &&
    fixtureAdminGuard < fixtureUserDelete &&
    testData.slice(fixtureAdminGuard, fixtureAdminDelete).includes(
      "Fixture reset is blocked while a fixture-linked Admin account or role exists",
    ),
  "underlying fixture cleanup refuses deletion when an Admin account or role is present",
);
check(
  !/functionalRole:\s*AdminFunctionalRole\.SUPER_ADMIN/.test(
    testAccounts.slice(testAccounts.indexOf("const TEST ="), testAccounts.indexOf("const ADMIN_ROLE_PERMISSIONS")),
  ),
  "test-account bootstrap does not create a Super Admin identity",
);
check(
  testAccounts.includes("existing.admin?.functionalRole === AdminFunctionalRole.SUPER_ADMIN") &&
    testAccounts.includes('existing.admin?.role?.name?.toUpperCase() === "SUPER_ADMIN"') &&
    testAccounts.indexOf("refusing to change its credentials or status") <
      testAccounts.indexOf("return prisma.user.upsert"),
  "test-account bootstrap refuses to replace or reset an existing Super Admin identity",
);
check(
  !/password:\s*["'`]/.test(testAccounts) &&
    !testData.includes("RideX-Test-Only-2026!") &&
    !testData.includes("ridex-test-only") &&
    !fullRideE2e.includes("RideX-Test-Only-2026!"),
  "test account passwords and fixture OTP signing use environment secrets, not source literals",
);
check(
  testAccountBootstrap.includes('process.env.RIDEX_ENVIRONMENT ?? "").trim().toUpperCase() !== "TEST"') &&
    testAccountBootstrap.includes("RIDEX_TEST_MODE") &&
    testAccountBootstrap.includes("DATABASE_URL_LIVE") &&
    e2eCredentialScripts.every((source) => !/password:\s*["'`]/.test(source)),
  "test-account seeding and E2E login scripts require explicit TEST secrets instead of bundled passwords",
);
check(
  [
    "RIDEX_TEST_FIXTURE_PASSWORD",
    "RIDEX_TEST_CUSTOMER_1_PASSWORD",
    "RIDEX_TEST_DRIVER_1_PASSWORD",
    "RIDEX_TEST_OPERATIONS_ADMIN_PASSWORD",
    "RIDEX_TEST_VERIFICATION_ADMIN_PASSWORD",
  ].every((name) => new RegExp(`^${name}=$`, "m").test(backendEnvExample)),
  "backend example provides blank placeholders for test-only credentials",
);
check(
  driverE2e.includes('process.env.RIDEX_ENVIRONMENT ?? "").trim().toUpperCase() !== "TEST"') &&
    driverE2e.includes('process.env.RIDEX_TEST_MODE ?? "").trim().toLowerCase() !== "true"') &&
    driverE2e.indexOf("assertTestTarget();") < driverE2e.indexOf("prisma.$transaction"),
  "legacy Driver E2E fixture writer is guarded by TEST/loopback checks before mutation",
);
check(
  otpSeed.includes('getEnvironment() !== "TEST"') &&
    otpSeed.indexOf('getEnvironment() !== "TEST"') < otpSeed.indexOf("prisma.otpConfiguration"),
  "OTP configuration seed is TEST-only before database writes",
);
check(
  readOnlyDbCheck.includes("DATABASE_URL_LIVE") &&
    readOnlyDbCheck.includes("RIDEX_TEST_MODE") &&
    readOnlyDbCheck.includes("testUrl.hostname.replace") &&
    readOnlyDbCheck.indexOf("new PrismaClient") > readOnlyDbCheck.indexOf("testUrl.hostname.replace"),
  "read-only E2E database check rejects non-loopback and LIVE targets before connecting",
);
const resetStart = authRoutes.indexOf('router.post("/password/reset/complete"');
const resetEnd = authRoutes.indexOf("\nrouter.", resetStart + 1);
const passwordResetRoute = authRoutes.slice(
  resetStart,
  resetEnd > resetStart ? resetEnd : undefined,
);
check(
  resetStart >= 0 &&
    passwordResetRoute.includes("CONTROLLED_SUPER_ADMIN_RECOVERY_REQUIRED") &&
    passwordResetRoute.includes("await writePasswordAudit") &&
    passwordResetRoute.indexOf("CONTROLLED_SUPER_ADMIN_RECOVERY_REQUIRED") <
      passwordResetRoute.indexOf("consumeOtpChallenge") &&
    passwordResetRoute.includes("separate controlled security process"),
  "routine OTP recovery refuses and audits Super Admin credential-reset attempts before consuming OTP",
);
const passwordResetOtpGate = authRoutes.indexOf(
  'purposeCode === "ADMIN.AUTH.PASSWORD_RESET"',
);
const otpPersist = authRoutes.indexOf("await saveNewOtpChallenge");
check(
  passwordResetOtpGate >= 0 &&
    passwordResetOtpGate < otpPersist &&
    authRoutes.includes("isSuperAdminAccount(user.admin)") &&
    authRoutes.includes('event: "OTP_REQUEST_REJECTED"'),
  "routine OTP issuance rejects and audits Super Admin password-recovery requests before persistence",
);
const passwordSetStart = authRoutes.indexOf('router.post("/password/set"');
const passwordSetEnd = authRoutes.indexOf("\nrouter.", passwordSetStart + 1);
const passwordSetRoute = authRoutes.slice(
  passwordSetStart,
  passwordSetEnd > passwordSetStart ? passwordSetEnd : undefined,
);
check(
  passwordSetStart >= 0 &&
    passwordSetRoute.includes("isSuperAdminAccount(user.admin)") &&
    passwordSetRoute.includes("CONTROLLED_SUPER_ADMIN_RECOVERY_REQUIRED") &&
    passwordSetRoute.indexOf("CONTROLLED_SUPER_ADMIN_RECOVERY_REQUIRED") <
      passwordSetRoute.indexOf("prisma.user.update"),
  "routine password initialization cannot reset Super Admin credentials",
);

assert.equal(failures.length, 0, failures.join("; "));
console.log(`SUPER ADMIN PRESERVATION CHECK: ${passes} passed, ${failures.length} failed`);
