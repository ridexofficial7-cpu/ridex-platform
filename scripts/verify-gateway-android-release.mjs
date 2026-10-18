#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'apps/gateway-android/scripts/verify-release.sh';
const targetPath = path.join(root, ...target.split('/'));
if (!existsSync(targetPath)) {
  console.error(`GATEWAY ANDROID RELEASE CHECK: FAIL: missing ${target}`);
  process.exit(2);
}

function findBash() {
  const candidates = process.platform === 'win32'
    ? [
        'bash.exe', 'bash',
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
      ]
    : ['bash'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore', windowsHide: true });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

const bash = findBash();
if (!bash) {
  console.error('GATEWAY ANDROID RELEASE CHECK: FAIL: Bash/Git Bash was not found.');
  process.exit(2);
}
console.log(`GATEWAY ANDROID RELEASE CHECK: running ${target}`);
const result = spawnSync(bash, [target], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error(`GATEWAY ANDROID RELEASE CHECK: FAIL: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 1);
