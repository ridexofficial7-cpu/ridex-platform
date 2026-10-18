#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

grep -R "http://" app/src/main --include='*.kt' >/tmp/ridex-http.txt && {
  echo "FAIL: cleartext URL found in source"; cat /tmp/ridex-http.txt; exit 1;
} || true

grep -R "PROVIDER_BASE_URL.*http://" app build.gradle.kts settings.gradle.kts gradle.properties --exclude-dir=.gradle >/tmp/ridex-provider-http.txt && {
  echo "FAIL: cleartext provider configuration found"; cat /tmp/ridex-provider-http.txt; exit 1;
} || true

if grep -R 'const val .*TOKEN\|const val .*SECRET\|const val .*PASSWORD' app/src/main --include='*.kt' >/tmp/ridex-secrets.txt; then
  echo "FAIL: possible embedded secret constant found"; cat /tmp/ridex-secrets.txt; exit 1
fi

echo "Source security checks: PASS"
