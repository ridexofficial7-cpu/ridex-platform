// RIDEX_AUTH_SESSION_RECOVERY_TESTS
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const api = source("src/lib/api.ts");
const app = source("src/App.tsx");
const login = source("src/pages/LoginPage.tsx");
const otp = source("src/pages/OtpVerificationPage.tsx");

test("password login never carries an old bearer token and its 401 is not a session-expiry event", () => {
  assert.match(api, /const isPasswordLoginRequest = path\.split\("\?"\)\[0\] === RIDEX_API\.auth\.passwordLogin;/);
  assert.match(api, /if \(isPasswordLoginRequest\) \{\s*\/\/ Password login is a fresh credential exchange; never attach a previous session token\.\s*headers\.delete\("Authorization"\);/s);
  assert.match(api, /if \(response\.status === 401 && !isPasswordLoginRequest && headers\.has\("Authorization"\)\)/);
});

test("fresh credential submission clears an old session notice but keeps environment mismatch warnings", () => {
  assert.match(login, /onLoginAttempt\(\);/);
  assert.match(app, /onLoginAttempt=\{clearTransientAuthMessage\}/);
  assert.match(app, /current\.startsWith\("Environment mismatch:"\) \? current : ""/);
});

test("OTP remains backend-challenge-driven and normal TEST login remains password-only", () => {
  assert.match(login, /if \(data\.requiresOtp\)\s*\{\s*if \(environment === "TEST"\) throw new Error\(t\("auth\.testOtpConfig"\)\);\s*applyOtpChallenge\(data\);/s);
  assert.match(login, /if \(!data\.token\) throw new Error\(t\("errors\.loginSessionMissing"\)\);/);
  assert.match(otp, /resendAfter > 0/);
  assert.match(otp, /attemptsRemaining === 0/);
});
