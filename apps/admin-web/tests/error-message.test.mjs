import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { localizedErrorMessage } from "../src/lib/errorMessages.mjs";

const t = (key) => key;

test("recognized API error codes map to local translation keys", () => {
  assert.equal(localizedErrorMessage({ status: 401, details: { error: { code: "INVALID_CREDENTIALS", message: "English prose should not be shown" } } }, t), "errors.invalidCredentials");
  assert.equal(localizedErrorMessage({ status: 400, details: { error: { code: "OTP_EXPIRED" } } }, t), "errors.otpExpired");
  assert.equal(localizedErrorMessage({ status: 403, details: { error: { code: "PERMISSION_DENIED" } } }, t), "errors.permissionDenied");
});

test("unknown API prose is replaced by localized status fallback", () => {
  assert.equal(localizedErrorMessage({ status: 422, message: "raw English backend prose" }, t), "errors.requestFailed");
  assert.equal(localizedErrorMessage({ status: 503, message: "raw English backend prose" }, t), "errors.serviceUnavailable");
  assert.equal(localizedErrorMessage(new TypeError("fetch failed"), t), "errors.networkUnavailable");
});

test("client-authored errors can retain their already-localized message", () => {
  assert.equal(localizedErrorMessage(new Error("The local validation message"), t), "The local validation message");
});


test("every error translation key used by the mapper exists in English and Hindi", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.join(root, "src/lib/errorMessages.mjs"), "utf8");
  const en = JSON.parse(fs.readFileSync(path.join(root, "src/locales/en-IN.json"), "utf8"));
  const hi = JSON.parse(fs.readFileSync(path.join(root, "src/locales/hi-IN.json"), "utf8"));
  const keys = new Set([...source.matchAll(/["'](errors\.[A-Za-z0-9_.]+)["']/g)].map((match) => match[1]));
  for (const key of keys) {
    assert.ok(en[key], `English translation missing: ${key}`);
    assert.ok(hi[key], `Hindi translation missing: ${key}`);
  }
});
