import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const parse = (relative) => JSON.parse(read(relative));
const contract = parse("config/privileged-configuration-contract.json");
const baseline = parse("config/project-baseline.json");
const requirements = parse("config/security-requirement-register.json");
const backend = read("services/backend/src/routes/configuration.ts");
const adminRoutes = read("services/backend/src/routes/admin.ts");
const adminApiContract = read("apps/admin-web/src/lib/apiContract.ts");
const nav = read("apps/admin-web/src/config/navigation.tsx");
const packageJson = parse("package.json");
const inventory = parse("config/source-inventory.json");
const failures = [];
let passes = 0;
function check(ok, label) { if (ok) { passes++; console.log(`PASS ${label}`); } else { failures.push(label); console.error(`FAIL ${label}`); } }

check(contract.status === "STATIC_PRIVILEGED_CONFIGURATION_POLICY_MAPPED_RUNTIME_TESTS_DEFERRED", "privileged configuration contract status correctly defers runtime evidence");
check(contract.routes.filter((r) => r.kind === "MUTATION").length === 4, "four privileged OTP mutation routes declared");
check(contract.routes.filter((r) => r.kind === "READ").length >= 3, "read-only OTP history/list route boundaries declared");
check(contract.openDecisions.some((d) => d.id === "RX-DEC-044" && d.status === "VERIFY"), "bulk mutation atomicity remains explicit pending decision");
check(contract.openDecisions.some((d) => d.id === "RX-DEC-047" && d.status === "VERIFY"), "canonical OTP API/persistence decision remains open");
check(contract.legacyOtpConfigurationSurface?.basePath === "/api/v1/admin/security/otp-configurations", "legacy Admin OTP API surface is explicitly mapped");
check(contract.legacyOtpConfigurationSurface?.mutations.length === 5, "five legacy Admin OTP mutation routes documented");
check(contract.finalPhysicalTests.length >= 8 && contract.testStatus.includes("NOT_RUN"), "privileged config physical tests deferred");
check(baseline.privilegedConfigurationContract?.path === "config/privileged-configuration-contract.json", "project baseline links privileged config contract");
check(baseline.decisions.some((d) => d.id === "RX-DEC-044" && d.status === "VERIFY"), "RX-DEC-044 appears in project decision register");
check(requirements.privilegedConfigurationContract?.path === "config/privileged-configuration-contract.json", "security requirement register links contract");
check(packageJson.scripts?.["verify:privileged-configuration"] === "node scripts/verify-privileged-configuration.mjs", "dedicated npm validator command exists");
check(inventory.privilegedConfigurationContract?.path === "config/privileged-configuration-contract.json", "source inventory links privileged config contract");

const start = backend.indexOf("async function requireOtpPurposeMutationAdmin(");
const end = backend.indexOf("/* =========================================================\n   AUDIT", start);
const helper = start >= 0 && end > start ? backend.slice(start,end) : "";
check(helper.includes('"system-configuration:CONFIGURE"') && helper.includes('"system_configuration:CONFIGURE"') && helper.includes('"security:CONFIGURE"') && helper.includes('"security:MANAGE_SECURITY"'), "Backend allow-list is explicit System Configuration/Security permission only");
check(helper.includes("!admin.isSuperAdmin && !hasExplicitPermission"), "Super Admin is allowed while other Admins require explicit privilege");
check(helper.includes("OTP_PURPOSE_SECURITY_PERMISSION_REQUIRED") && helper.includes("success: false"), "denied OTP mutation is security-audited");
for (const route of [
  'router.put("/otp/purposes/bulk"',
  'router.put("/otp/purposes/:purposeCode"',
  'router.post("/otp/rollback"',
  'router.delete("/otp/purposes/:purposeCode"'
]) {
  const at = backend.indexOf(route);
  const block = at >= 0 ? backend.slice(at, at + 700) : "";
  check(block.includes("requireOtpPurposeMutationAdmin(req, res)"), `${route} enforces explicit OTP purpose mutation guard`);
}
check(!/id: "otp"[^\n]*superOnly:\s*true/.test(nav), "OTP Configuration navigation is not Super Admin-only by hard-coded flag");
check(nav.includes("hasExplicitOtpConfigurationPermission") && nav.includes('item.id === "otp"'), "Admin Web exposes OTP nav only under explicit permission or Super Admin visibility path");
check(nav.includes('permission.module.has("security")') && nav.includes('permission.module.has("system") && permission.module.has("configuration")') && nav.includes('permission.action.has("manage")'), "Admin Web permission matching recognizes Security/System Configuration permission");
check(/withSystemConfigLock\(OTP_STATE_KEY/.test(backend), "OTP configuration writes use shared transactional lock");
check(adminRoutes.includes('function requireOtpSecurityPermission(') && adminRoutes.includes('permissionKey("security", PermissionAction.MANAGE_SECURITY)') && adminRoutes.includes('admin.permissions.has("system-configuration:CONFIGURE")') && adminRoutes.includes('admin.permissions.has("system_configuration:CONFIGURE")') && adminRoutes.includes('PermissionAction.MANAGE_SECURITY'), "legacy Admin OTP API accepts explicit System Configuration/Security permission");
check(adminRoutes.includes('reason: "OTP_PURPOSE_SECURITY_PERMISSION_REQUIRED"') && adminRoutes.includes('entityType: "Authorization"'), "legacy Admin OTP API audits denied privileged mutation");
check(
  adminApiContract.includes('otpConfigurations: "/admin/configuration/otp/purposes"') &&
    !adminApiContract.includes('otpConfigurations: "/admin/security/otp-configurations"'),
  "Admin Web targets the canonical OTP API while the legacy surface is documented separately",
);
check(contract.legacyOtpConfigurationSurface.persistence.includes("OtpConfigurationHistory"), "legacy OTP persistence/history path recorded separately");
check(/changeType:\s*"BULK_UPDATE"/.test(backend) && backend.includes("OTP bulk configuration partially applied; failed items were not changed") && backend.includes("OTP purpose configuration bulk update applied successfully") && /failedChanges:\s*result\.failedChanges/.test(backend) && backend.includes("partialSuccess"), "bulk partial/full success messages and failedChanges reporting are documented");
check(backend.includes('changeType: "ROLLBACK"') && backend.includes("sourceVersion,\n            targetVersion"), "rollback preserves source/target version provenance");
check(backend.includes("tx.otpConfigurationHistory.deleteMany") && backend.includes("tx.auditLog.deleteMany"), "approved purpose deletion exception is represented in source");
check(requirements.requirements.some((r) => r.id === "REQ-SEC-006" && r.implementationStatus === "UNVERIFIED"), "privileged Admin requirement stays UNVERIFIED pending physical tests");

console.log(`\nPRIVILEGED CONFIGURATION CHECK: ${failures.length ? "FAIL" : "PASS"}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`Passed checks: ${passes}; failed checks: ${failures.length}`);
console.log("Static source checks only; permission denial, versioning, audit and bulk atomicity tests are deferred.");
if (failures.length) process.exitCode = 1;
