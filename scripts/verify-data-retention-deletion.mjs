import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const parse = (relative) => JSON.parse(read(relative));
const contract = parse("config/data-retention-deletion-contract.json");
const baseline = parse("config/project-baseline.json");
const requirements = parse("config/security-requirement-register.json");
const inventory = parse("config/source-inventory.json");
const backend = read("services/backend/src/routes/configuration.ts");
const protectedActionGrants = read("services/backend/src/services/protectedActionGrants.ts");
const customer = read("services/backend/src/routes/customer.ts");
const support = read("services/backend/src/routes/support.ts");
const admin = read("services/backend/src/routes/admin.ts");
const safety = read("services/backend/src/routes/safety.ts");
const notifications = read("services/backend/src/routes/notifications.ts");
const apiContract = read("apps/admin-web/src/lib/apiContract.ts");
const privateStorage = read("services/backend/src/integrations/storage.ts");
const packageJson = parse("package.json");
const failures = [];
let passes = 0;
function check(ok, label) { if (ok) { passes++; console.log(`PASS ${label}`); } else { failures.push(label); console.error(`FAIL ${label}`); } }

check(contract.status === "STATIC_RETENTION_DELETION_INVENTORY_CREATED_SCHEDULES_UNAPPROVED_PHYSICAL_TESTS_DEFERRED", "retention contract accurately leaves schedules unapproved and tests deferred");
check(contract.dataClasses.length >= 14, "retention map covers fourteen or more data classes");
const grantRetention = contract.dataClasses.find((x) => x.id === "PROTECTED_ACTION_OTP_GRANTS");
check(Boolean(grantRetention && grantRetention.retentionStatus.includes("ROW_CLEANUP_RETENTION_POLICY_PENDING") && grantRetention.decisionIds.includes("RX-DEC-045") && protectedActionGrants.includes("const GRANT_TTL_MS = 120_000") && protectedActionGrants.includes("expiresAt: { gt: now }") && protectedActionGrants.includes("take: 100") && protectedActionGrants.includes("export async function revokeExpiredProtectedActionGrants")), "protected-action grant expiry and bounded opportunistic cleanup are inventoried while durable retention policy remains pending");
check(contract.deletionRoutes.length === 13, "13 observed DELETE routes are registered");
check(contract.finalPhysicalTests.length >= 12 && contract.testStatus.includes("NOT_RUN"), "retention and deletion physical tests explicitly deferred");
check(contract.policy.retentionDuration.includes("NOT_APPROVED") && contract.policy.retentionDuration.includes("do not invent TTLs"), "no unapproved retention duration is invented");
check(contract.openDecisions.some((d) => d.id === "RX-DEC-041" && d.status === "VERIFY"), "private data retention decision RX-DEC-041 remains open");
check(contract.openDecisions.some((d) => d.id === "RX-DEC-045" && d.status === "VERIFY"), "global retention/legal hold decision RX-DEC-045 remains open");
check(contract.openDecisions.some((d) => d.id === "RX-DEC-046" && d.status === "VERIFY"), "support attachment delete/orphan cleanup decision RX-DEC-046 remains open");
check(contract.openDecisions.some((d) => d.id === "RX-DEC-047" && d.status === "VERIFY"), "duplicate OTP API/persistence decision RX-DEC-047 remains open");
check(baseline.dataRetentionDeletionContract?.path === "config/data-retention-deletion-contract.json", "project baseline links retention/deletion contract");
check(baseline.decisions.some((d) => d.id === "RX-DEC-045" && d.status === "VERIFY"), "RX-DEC-045 is in the project decision register");
check(baseline.decisions.some((d) => d.id === "RX-DEC-046" && d.status === "VERIFY"), "RX-DEC-046 is in the project decision register");
check(baseline.decisions.some((d) => d.id === "RX-DEC-047" && d.status === "VERIFY"), "RX-DEC-047 is in the project decision register");
check(requirements.dataRetentionDeletionContract?.path === "config/data-retention-deletion-contract.json", "security requirement register links retention/deletion contract");
check(packageJson.scripts?.["verify:data-retention-deletion"] === "node scripts/verify-data-retention-deletion.mjs", "dedicated npm validator command exists");
check(inventory.dataRetentionDeletionContract?.path === "config/data-retention-deletion-contract.json", "source inventory links retention/deletion contract");

const galleryRouteAt = customer.indexOf('router.delete("/:customerId/gallery/:photoId"');
const galleryRouteEnd = customer.indexOf("router.delete(", galleryRouteAt + 10);
const galleryBlock = customer.slice(galleryRouteAt, galleryRouteEnd > galleryRouteAt ? galleryRouteEnd : customer.length);
check(galleryRouteAt >= 0 && galleryBlock.indexOf("await deletePrivateObject(") >= 0 && galleryBlock.indexOf("await prisma.$transaction") > galleryBlock.indexOf("await deletePrivateObject("), "Customer Gallery deletes private object before database pointer");
check(galleryBlock.includes("databaseRecordRetainedForRetry: true") && galleryBlock.includes("503, \"Unable to delete gallery photo file; please retry\""), "gallery storage delete failure preserves row for retry");
check(privateStorage.includes("export async function deletePrivateObject") || privateStorage.includes("export function deletePrivateObject"), "private object deletion adapter exists");

check(support.includes("if (expiresAt <= Math.floor(Date.now() / 1000))"), "support signed attachment link expires at the exact expiry second");
check(support.includes("attachmentFileName: true") && support.includes("validatePrivateFile({"), "support attachment file is revalidated at download time");
check(support.includes('action: AuditAction.EXPORT') && support.includes('entityType: "SupportAttachment"') && support.includes('accessType: "SIGNED_LINK"'), "support attachment download emits redacted EXPORT audit metadata");
check(support.includes('Cache-Control", "private, no-store') && support.includes('X-Content-Type-Options", "nosniff'), "support attachment response is private/no-store and nosniff");
check(!/signature\s*[:,] ?signature[,}]?/.test(support.slice(support.indexOf('entityType: "SupportAttachment"'), support.indexOf('entityType: "SupportAttachment"') + 500)), "support attachment audit does not include signed-link signature");

const otpDeleteAt = backend.indexOf('router.delete("/otp/purposes/:purposeCode"');
const otpDeleteEnd = backend.indexOf("\nrouter.", otpDeleteAt + 1);
const otpDeleteBlock = otpDeleteAt >= 0
  ? backend.slice(otpDeleteAt, otpDeleteEnd > otpDeleteAt ? otpDeleteEnd : undefined)
  : "";
check(
  otpDeleteBlock.includes("`${OTP_TOMBSTONE_PREFIX}${purposeCode}`") &&
    otpDeleteBlock.includes("tx.otpConfigurationHistory.deleteMany") &&
    otpDeleteBlock.includes("await tx.auditLog.deleteMany({\n        where: { purposeCode },\n      });") &&
    otpDeleteBlock.indexOf("tx.auditLog.deleteMany") < otpDeleteBlock.indexOf("await writeAuditTx(tx, req, {"),
  "canonical OTP deletion removes only purpose-owned audit rows and records its own deletion audit",
);
check(admin.includes('router.get("/security/otp-configurations"') && backend.includes('router.get("/otp/purposes"'), "two existing OTP configuration API surfaces are detected");
check(apiContract.includes('otpConfigurations: "/admin/configuration/otp/purposes"'), "Admin Web targets the canonical System Configuration OTP purposes API");
check(contract.duplicateOtpConfigurationSurfaces?.decisionId === "RX-DEC-047", "duplicate OTP surface risk is linked to RX-DEC-047");

check(admin.includes('router.delete("/test-data"') && admin.includes('if (!requireTestMode(res)) return;') && admin.includes('requiresConfirmation(req, "DELETE RIDEX V3.5 TEST DATA")'), "bulk test-data deletion remains TEST-only and confirmation-gated");
check(admin.includes('router.delete("/test-data/:entity/:id"') && admin.includes('id.startsWith("v35-test-")'), "individual test-data deletion is restricted to test-fixture identifiers");
check(safety.includes('router.delete("/incidents/:incidentId"') && safety.includes('router.delete("/emergency-contacts/:contactId"') && safety.includes('router.delete("/driver/emergency-contacts/:contactId"'), "sensitive safety/contact delete paths are inventoried");
check(notifications.includes('router.delete("/:notificationId"'), "notification deletion route is inventoried");

for (const route of contract.deletionRoutes) {
  const source = read(route.source);
  const localPath = route.path.split("/api/v1").pop();
  const lastSegments = localPath.split("/").filter(Boolean).slice(-2).join("/");
  const routeSpecific = route.status.includes("PRIVATE_OBJECT") ? source.includes('router.delete("/:customerId/gallery/:photoId"')
    : route.path === "/api/v1/notifications/:notificationId" ? source.includes('router.delete("/:notificationId"')
    : route.status.includes("TEST_ONLY_EXACT") ? source.includes('router.delete("/test-data"')
    : route.status.includes("TEST_ONLY_FIXTURE") ? source.includes('router.delete("/test-data/:entity/:id"')
    : source.includes(lastSegments) || source.includes(localPath);
  check(routeSpecific, `delete route maps to source: ${route.path}`);
}

for (const id of ["REQ-DATA-003","REQ-DATA-004","REQ-SEC-014"]) {
  const req = requirements.requirements.find((r) => r.id === id);
  check(Boolean(req && req.implementationStatus === "UNVERIFIED" && req.sourceEvidence.includes("config/data-retention-deletion-contract.json")), `${id} links contract and stays UNVERIFIED`);
}

console.log(`\nDATA RETENTION/DELETION CHECK: ${failures.length ? "FAIL" : "PASS"}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`Passed checks: ${passes}; failed checks: ${failures.length}`);
console.log("Static source checks only; no private-storage, database-delete, legal-hold, test-data purge or runtime access test was run.");
if (failures.length) process.exitCode = 1;
