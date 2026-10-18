#!/usr/bin/env node
/** Check the deployed web response. Hosting-specific headers cannot be proven by frontend source alone. */
const rawUrl = process.env.RIDEX_ADMIN_DEPLOYMENT_URL || process.argv[2] || "";
if (!rawUrl) {
  console.error("Set RIDEX_ADMIN_DEPLOYMENT_URL to the deployed Admin Web HTTPS URL.");
  process.exit(2);
}
let url;
try { url = new URL(rawUrl); } catch { console.error("RIDEX_ADMIN_DEPLOYMENT_URL is not a valid URL."); process.exit(2); }
if (url.protocol !== "https:") {
  console.error("Security-header check requires an HTTPS deployment URL.");
  process.exit(2);
}
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10000);
try {
  const response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "Accept": "text/html" } });
  if (new URL(response.url).protocol !== "https:") throw new Error("Final response redirected away from HTTPS.");
  const headers = response.headers;
  const failures = [];
  const required = (name, expected) => {
    const value = headers.get(name) || "";
    if (!value) failures.push(`${name} header is missing`);
    else if (expected && !expected(value)) failures.push(`${name} header does not satisfy the minimum policy`);
    return value;
  };
  required("strict-transport-security", v => /max-age=\d+/i.test(v));
  required("x-content-type-options", v => /nosniff/i.test(v));
  required("referrer-policy", v => /strict-origin-when-cross-origin|no-referrer|same-origin/i.test(v));
  const csp = required("content-security-policy", v => /default-src\s+'self'/i.test(v) && /object-src\s+'none'/i.test(v) && /base-uri\s+'self'/i.test(v) && /form-action\s+'self'/i.test(v) && /frame-ancestors\s+'none'/i.test(v));
  const frameOptions = headers.get("x-frame-options") || "";
  if (!/deny|sameorigin/i.test(frameOptions) && !/frame-ancestors\s+'none'/i.test(csp)) failures.push("Set X-Frame-Options DENY/SAMEORIGIN or CSP frame-ancestors 'none'");
  const permissions = required("permissions-policy", v => /camera=\(\)/i.test(v) && /microphone=\(\)/i.test(v) && /payment=\(\)/i.test(v));
  if (response.status >= 500) failures.push(`Deployment responded with HTTP ${response.status}`);
  console.log(`Security header check URL: ${url.origin}`);
  console.log(`HTTP status: ${response.status}`);
  for (const name of ["strict-transport-security", "x-content-type-options", "referrer-policy", "content-security-policy", "permissions-policy", "x-frame-options"]) {
    console.log(`${name}: ${headers.get(name) || "MISSING"}`);
  }
  if (failures.length) {
    console.error("Security header check FAILED:\n- " + failures.join("\n- "));
    process.exitCode = 1;
  } else {
    console.log("Minimum security-header checks passed. Manually verify the exact CSP host allowlist and CORS origins against the deployment inventory.");
  }
} catch (error) {
  console.error(`Security header check could not complete: ${error instanceof Error ? error.message : "network failure"}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
