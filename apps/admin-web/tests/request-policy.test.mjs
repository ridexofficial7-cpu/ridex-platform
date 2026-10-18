import test from "node:test";
import assert from "node:assert/strict";
import { isSafeReadMethod, isRetryableStatus, retryDelayMs, shouldBlockUnverifiedAdminMutation, waitWithAbort } from "../src/lib/requestPolicy.mjs";

test("only GET and HEAD are safe-read methods", () => {
  assert.equal(isSafeReadMethod("GET"), true);
  assert.equal(isSafeReadMethod("head"), true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT"]) {
    assert.equal(isSafeReadMethod(method), false, `${method} must not be automatically retried`);
  }
});

test("only the declared transient HTTP statuses are retryable", () => {
  for (const status of [408, 429, 502, 503, 504]) assert.equal(isRetryableStatus(status), true);
  for (const status of [200, 400, 401, 403, 404, 409, 422, 500]) assert.equal(isRetryableStatus(status), false);
});

test("Retry-After seconds and dates are bounded to ten seconds", () => {
  assert.equal(retryDelayMs("2", 1, 0), 2000);
  assert.equal(retryDelayMs("120", 1, 0), 10000);
  assert.equal(retryDelayMs("not-a-date", 2, 0), 1200);
  assert.equal(retryDelayMs(new Date(5000).toUTCString(), 1, 0), 5000);
  assert.equal(retryDelayMs(new Date(-5000).toUTCString(), 1, 0), 0);
});

test("backoff wait resolves and caller abort interrupts it", async () => {
  await waitWithAbort(0);
  const controller = new AbortController();
  const wait = waitWithAbort(10_000, controller.signal);
  controller.abort();
  await assert.rejects(wait, (error) => error?.name === "AbortError");
});

test("unverified administrative mutations are blocked while auth and safe reads remain available", () => {
  const pending = "NOT_VERIFIED_AGAINST_BACKEND_SOURCE";
  assert.equal(shouldBlockUnverifiedAdminMutation("/admin/customers", "GET", pending), false);
  assert.equal(shouldBlockUnverifiedAdminMutation("/admin/customers/1", "PATCH", pending), true);
  assert.equal(shouldBlockUnverifiedAdminMutation("/api/v1/admin/security/otp-configurations", "DELETE", pending), true);
  assert.equal(shouldBlockUnverifiedAdminMutation("/support/admin/cases/123/messages", "POST", pending), true);
  assert.equal(shouldBlockUnverifiedAdminMutation("/support/admin/cases/123", "PATCH", pending), false);
  assert.equal(shouldBlockUnverifiedAdminMutation("/auth/password/login", "POST", pending), false);
  assert.equal(shouldBlockUnverifiedAdminMutation("/auth/logout", "POST", pending), false);
  assert.equal(shouldBlockUnverifiedAdminMutation("/admin/customers/1", "PATCH", "VERIFIED_AGAINST_BACKEND_SOURCE"), false);
});
