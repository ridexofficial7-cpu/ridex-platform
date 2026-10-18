import test from "node:test";
import assert from "node:assert/strict";
import { maskCustomerField, maskEmail, maskPhone } from "../src/lib/privacyDisplay.mjs";

test("phone masking keeps only the last two digits visible", () => {
  assert.equal(maskPhone("+91 98765 43210"), "+••••••10");
  assert.equal(maskPhone("123"), "[MASKED]");
});

test("email masking preserves domain but hides the rest of the local part", () => {
  assert.equal(maskEmail("ravi.jha@example.com"), "r•••@example.com");
  assert.equal(maskEmail("not-an-email"), "[MASKED]");
});

test("customer contact and precise location fields are masked", () => {
  assert.equal(maskCustomerField("mobile", "+919876543210"), "+••••••10");
  assert.equal(maskCustomerField("email", "ravi@example.com"), "r•••@example.com");
  assert.equal(maskCustomerField("address", "Full private address"), "[MASKED]");
});
