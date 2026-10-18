import test from "node:test";
import assert from "node:assert/strict";
import { auditRecordMatchesFilters, filterAuditRecords } from "../src/lib/auditFilters.mjs";

const events = [
  { actorId: "admin-12", actorName: "Ravi Admin", role: "STATE_ADMIN", targetType: "DRIVER", targetId: "d-100", result: "SUCCESS", timestamp: "2026-09-18T10:30:00+05:30" },
  { actorId: "admin-18", actorName: "Support Operator", role: "CITY_ADMIN", targetType: "OTP_PURPOSE", targetId: "CUSTOMER.AUTH.LOGIN", result: "FAILED", timestamp: "2026-09-19T23:40:00+05:30" },
  { actorId: "admin-12", role: "STATE_ADMIN", targetType: "PAYMENT", result: false, timestamp: "not-a-date" },
];

test("audit filters narrow only fields returned in the supplied list", () => {
  assert.equal(filterAuditRecords(events, { actor: "ravi", result: "success" }).length, 1);
  assert.equal(filterAuditRecords(events, { role: "city", target: "otp", result: "failed" }).length, 1);
  assert.equal(filterAuditRecords(events, { target: "payment" }).length, 1);
});

test("date filter includes requested calendar day and rejects unknown timestamps", () => {
  assert.equal(filterAuditRecords(events, { fromDate: "2026-09-18", toDate: "2026-09-18" }).length, 1);
  assert.equal(filterAuditRecords(events, { fromDate: "2026-09-19", toDate: "2026-09-19" }).length, 1);
  assert.equal(auditRecordMatchesFilters(events[2], { fromDate: "2026-09-18" }), false);
});

test("empty audit filters preserve input rows and non-array data returns an empty list", () => {
  assert.equal(filterAuditRecords(events, {}).length, 3);
  assert.deepEqual(filterAuditRecords(null, {}), []);
});
