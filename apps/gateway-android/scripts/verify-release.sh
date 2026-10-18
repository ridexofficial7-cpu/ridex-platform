#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail(){ echo "RELEASE VERIFY: FAIL: $*" >&2; exit 1; }
pass(){ echo "RELEASE VERIFY: PASS: $*"; }

[[ -f "$ROOT/settings.gradle.kts" ]] || fail "settings.gradle.kts missing"
[[ -f "$ROOT/build.gradle.kts" ]] || fail "build.gradle.kts missing"
[[ -f "$ROOT/app/build.gradle.kts" ]] || fail "app/build.gradle.kts missing"
[[ -f "$ROOT/app/src/main/AndroidManifest.xml" ]] || fail "AndroidManifest.xml missing"
[[ -f "$ROOT/scripts/verify-source.sh" ]] || fail "verify-source.sh missing"

if [[ -x "$ROOT/gradlew" && -f "$ROOT/gradle/wrapper/gradle-wrapper.properties" ]]; then
  pass "Gradle wrapper present"
else
  echo "RELEASE VERIFY: WARN: Gradle wrapper is not present in this source snapshot."
  echo "RELEASE VERIFY: ACTION: add/restore gradle-wrapper before reproducible build release."
fi

if grep -RInE 'https?://[^"'"'"' ]+' "$ROOT/app/src/main" | grep -vE 'localhost|127\.0\.0\.1|example\.invalid|schemas\.android\.com' >/dev/null; then
  fail "literal HTTP(S) provider/network URL found in main source"
fi

if grep -RInE '(password|passwd|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["'"'"'][^"'"'"']+["'"'"']' "$ROOT/app/src/main" >/dev/null; then
  fail "possible embedded credential found in main source"
fi

if ! grep -q 'PROVIDER_BASE_URL' "$ROOT/app/build.gradle.kts"; then
  fail "Provider base URL is not deployment-configured"
fi

if ! grep -q 'isMinifyEnabled = true' "$ROOT/app/build.gradle.kts"; then
  fail "release minification is not enabled"
fi

pass "release source structure"
pass "provider URL deployment binding"
pass "release minification"
pass "credential source scan"
echo "RELEASE VERIFY: COMPLETE (build/device execution remains an environment gate)"
