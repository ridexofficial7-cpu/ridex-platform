#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail(){ echo "REPRODUCIBILITY: FAIL: $*" >&2; exit 1; }
[[ -f "$ROOT/settings.gradle.kts" ]] || fail "settings missing"
[[ -f "$ROOT/gradle.properties" ]] || fail "gradle.properties missing"
[[ -f "$ROOT/app/build.gradle.kts" ]] || fail "app build file missing"

EXPECTED_JAVA='17'
grep -q 'sourceCompatibility = JavaVersion.VERSION_17' "$ROOT/app/build.gradle.kts" || fail "Java source level drift"
grep -q 'targetCompatibility = JavaVersion.VERSION_17' "$ROOT/app/build.gradle.kts" || fail "Java target level drift"
grep -Eq 'jvmTarget\.set\([^)]*JvmTarget\.JVM_17\)' "$ROOT/app/build.gradle.kts" || fail "Kotlin JVM target drift"

grep -q 'compileSdk = 37' "$ROOT/app/build.gradle.kts" || fail "compileSdk drift"
grep -q 'minSdk = 31' "$ROOT/app/build.gradle.kts" || fail "minSdk drift"
grep -q 'targetSdk = 34' "$ROOT/app/build.gradle.kts" || fail "targetSdk drift"

grep -q 'providerBaseUrl' "$ROOT/app/build.gradle.kts" || fail "providerBaseUrl build input missing"

echo "REPRODUCIBILITY: PASS: toolchain/build invariants"
if [[ -x "$ROOT/gradlew" ]]; then
  echo "REPRODUCIBILITY: wrapper present"
else
  echo "REPRODUCIBILITY: wrapper missing; external Gradle wrapper restoration is required before release build"
fi
