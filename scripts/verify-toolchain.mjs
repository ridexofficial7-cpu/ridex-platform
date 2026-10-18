import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/toolchain-matrix.json'), 'utf8'));
const failures = [];
const passes = [];
const warnings = [];
const pass = m => passes.push(`PASS ${m}`);
const fail = m => failures.push(m);
const warn = m => warnings.push(m);

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch { fail(`Cannot read valid JSON manifest: ${rel}`); return null; }
}
function ver(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}
function cmp(a,b) {
  const aa = Array.isArray(a) ? a : ver(a); const bb = Array.isArray(b) ? b : ver(b);
  if (!aa || !bb) return null;
  for (let i=0;i<3;i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1;
  return 0;
}
function meetsMin(actual, minimum) { const c=cmp(actual, minimum); return c !== null && c >= 0; }
function lockedDependency(lock, name) {
  return lock?.packages?.[`node_modules/${name}`]?.version || null;
}
function specAllows(spec, actual) {
  if (!spec || !actual) return false;
  const a=ver(actual); if(!a) return false;
  const trim=String(spec).trim();
  const exact=ver(trim);
  if (exact && !trim.startsWith('^') && !trim.startsWith('~') && !trim.startsWith('>') && !trim.startsWith('<')) return cmp(a, exact) === 0;
  const range=trim.match(/^([~^])?(\d+)\.(\d+)\.(\d+)/);
  if (range) {
    const op=range[1]||''; const base=[Number(range[2]),Number(range[3]),Number(range[4])];
    if (cmp(a,base)<0) return false;
    if (op==='~') return a[0]===base[0] && a[1]===base[1];
    if (op==='^') return base[0]>0 ? a[0]===base[0] : (base[1]>0 ? a[0]===0 && a[1]===base[1] : a[0]===0 && a[1]===0 && a[2]===base[2]);
    return cmp(a,base)===0;
  }
  return trim === actual;
}
function checkManifest(name, rel, lockRel, expectedDeps) {
  const manifest = readJson(rel); const lock = readJson(lockRel);
  if (!manifest || !lock) return;
  const root = lock.packages?.[''];
  if (!root) { fail(`${name}: lockfile root package is missing.`); return; }
  if (manifest.name !== root.name || manifest.version !== root.version) fail(`${name}: manifest/lockfile package identity or version mismatch.`);
  else pass(`${name}: manifest and lock root identity match (${manifest.name}).`);
  if (lock.lockfileVersion !== matrix.runtime.npm.lockfileVersion) fail(`${name}: expected lockfile version ${matrix.runtime.npm.lockfileVersion}, found another lock format.`);
  else pass(`${name}: lockfile version ${lock.lockfileVersion}.`);
  const manifestDeps = { ...(manifest.dependencies||{}), ...(manifest.devDependencies||{}) };
  const rootDeps = { ...(root.dependencies||{}), ...(root.devDependencies||{}) };
  for (const [dep, spec] of Object.entries(manifestDeps)) {
    if (rootDeps[dep] !== spec) fail(`${name}: package-lock declared range differs from package.json for ${dep}.`);
  }
  for (const dep of Object.keys(rootDeps)) if (manifestDeps[dep] === undefined) fail(`${name}: package-lock has an undeclared root dependency ${dep}.`);
  if (!failures.some(x => x.startsWith(`${name}: package-lock`))) pass(`${name}: package.json and package-lock root dependency ranges agree.`);
  for (const [dep, exactExpected] of Object.entries(expectedDeps || {})) {
    const declared = manifestDeps[dep]; const locked = lockedDependency(lock, dep);
    if (!declared || !locked) { fail(`${name}: required dependency ${dep} is not declared/locked.`); continue; }
    if (!specAllows(declared, locked)) { fail(`${name}: locked ${dep} ${locked} falls outside declared spec ${declared}.`); continue; }
    if (exactExpected && locked !== exactExpected) { fail(`${name}: expected locked ${dep} ${exactExpected}, observed a different lock version.`); continue; }
    pass(`${name}: ${dep} declared range and locked version are consistent (${locked}).`);
  }
}

const nodeActual = process.versions.node;
const nodeRange = matrix.runtime.node.supportedRange;
if (!meetsMin(nodeActual, '22.13.0') || ver(nodeActual)?.[0] !== 22) fail(`Node.js ${nodeActual} is outside project range ${nodeRange}.`);
else pass(`Node.js ${nodeActual} satisfies common baseline ${nodeRange}.`);
const npmRes = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd --version'], { encoding: 'utf8', windowsHide: true })
  : spawnSync('npm', ['--version'], { encoding: 'utf8' });
const npmActual = (npmRes.stdout || '').trim();
if (npmRes.status !== 0 || !npmActual) fail('npm is not available on PATH.');
else if (ver(`${npmActual}.0`) === null) fail('Could not parse npm version.');
else if (Number(npmActual.split('.')[0]) !== matrix.runtime.npm.testedMajorBaseline || !meetsMin(`${npmActual}.0`, `${matrix.runtime.npm.minimumObservedBaseline}.0`)) {
  warn(`npm ${npmActual} differs from the lockfile qualification baseline ${matrix.runtime.npm.minimumObservedBaseline} (major ${matrix.runtime.npm.testedMajorBaseline}); review before changing lockfiles.`);
} else pass(`npm ${npmActual} meets the recorded compatibility baseline.`);
const javaRes = spawnSync('java', ['-version'], { encoding: 'utf8' });
const javaText = `${javaRes.stdout||''}\n${javaRes.stderr||''}`;
const javaMatch = javaText.match(/version\s+"?([0-9]+)(?:\.[0-9]+)?/i) || javaText.match(/openjdk\s+([0-9]+)/i);
if (javaRes.status !== 0 || !javaMatch) fail('Java runtime could not be identified.');
else if (Number(javaMatch[1]) < matrix.runtime.java.minimumMajor) fail(`Java major ${javaMatch[1]} is below required ${matrix.runtime.java.minimumMajor}.`);
else pass(`Java major ${javaMatch[1]} satisfies minimum ${matrix.runtime.java.minimumMajor}.`);

checkManifest('Backend', matrix.backend.manifest, matrix.backend.lockfile, {
  'typescript': matrix.backend.typescriptLocked,
  'prisma': matrix.backend.prismaLocked,
  '@prisma/client': matrix.backend.prismaClientLocked
});
checkManifest('Broadcaster Provider', matrix.broadcasterProvider.manifest, matrix.broadcasterProvider.lockfile, {
  'typescript': matrix.broadcasterProvider.typescriptLocked,
  'express': matrix.broadcasterProvider.expressLocked,
  'tsx': matrix.broadcasterProvider.tsxLocked
});
checkManifest('Admin Web', matrix.adminWeb.manifest, matrix.adminWeb.lockfile, {
  'typescript': matrix.adminWeb.typescriptLocked,
  'vite': matrix.adminWeb.viteLocked,
  'react': matrix.adminWeb.reactLocked,
  'react-dom': matrix.adminWeb.reactDomLocked
});
checkManifest('Unified Mobile TEST Reference', matrix.mobileExpo.referenceManifest, matrix.mobileExpo.referenceLockfile, {
  'expo': matrix.mobileExpo.expoLocked,
  'react-native': matrix.mobileExpo.reactNativeLocked,
  'react': matrix.mobileExpo.reactLocked,
  'typescript': matrix.mobileExpo.typescriptLocked
});
for (const target of matrix.mobileExpo.standaloneTargets) {
  const manifest=readJson(`${target}/package.json`); const lock=readJson(`${target}/package-lock.json`);
  if (!manifest || !lock) continue;
  const lockRoot=lock.packages?.[''];
  if (manifest.name!==lockRoot?.name || manifest.version!==lockRoot?.version) fail(`${target}: package/lock identity mismatch.`);
  else pass(`${target}: separate app identity matches its lockfile.`);
  for (const [dep, expected] of Object.entries({expo:matrix.mobileExpo.expoLocked,'react-native':matrix.mobileExpo.reactNativeLocked,react:matrix.mobileExpo.reactLocked,typescript:matrix.mobileExpo.typescriptLocked})) {
    const locked=lockedDependency(lock,dep); const declared={...(manifest.dependencies||{}),...(manifest.devDependencies||{})}[dep];
    if (!declared || locked!==expected || !specAllows(declared,locked)) fail(`${target}: ${dep} range/lock compatibility check failed.`);
  }
}
pass('Mobile SDK package family is consistent with its pinned Expo SDK 57 / React Native 0.86 / React 19.2.3 baseline.');

const gw=matrix.androidGateway;
const wrapperPath=path.join(ROOT,gw.projectRoot,'gradle/wrapper/gradle-wrapper.properties');
const rootBuildPath=path.join(ROOT,gw.projectRoot,'build.gradle.kts');
const appBuildPath=path.join(ROOT,gw.projectRoot,'app/build.gradle.kts');
const wrapperText=fs.readFileSync(wrapperPath,'utf8'); const rootBuild=fs.readFileSync(rootBuildPath,'utf8'); const appBuild=fs.readFileSync(appBuildPath,'utf8');
const gradleMatch=wrapperText.match(/gradle-([0-9.]+)-bin\.zip/); const agpMatch=rootBuild.match(/com\.android\.application"\) version "([0-9.]+)"/); const kotlinMatch=rootBuild.match(/org\.jetbrains\.kotlin\.plugin\.compose"\) version "([0-9.]+)"/); const sdkMatch=appBuild.match(/compileSdk\s*=\s*(\d+)/);
if (gradleMatch?.[1]!==gw.gradleWrapper) fail('Gateway Gradle wrapper does not match toolchain matrix.');
else if (cmp(gradleMatch[1],gw.minimumGradleForAgp)<0) fail('Gateway Gradle wrapper is older than the AGP minimum.');
else pass(`Gateway Gradle ${gradleMatch[1]} satisfies AGP minimum ${gw.minimumGradleForAgp}.`);
if (agpMatch?.[1]!==gw.androidGradlePlugin) fail('Gateway Android Gradle Plugin version differs from toolchain matrix.'); else pass(`Gateway Android Gradle Plugin ${agpMatch[1]} matches matrix.`);
if (kotlinMatch?.[1]!==gw.kotlinComposePlugin) fail('Gateway Kotlin Compose plugin version differs from toolchain matrix.'); else pass(`Gateway Kotlin Compose plugin ${kotlinMatch[1]} matches matrix.`);
if (Number(sdkMatch?.[1])!==gw.compileSdk || Number(sdkMatch?.[1])>gw.agpMaximumSupportedApi) fail('Gateway compileSdk exceeds/mismatches the verified AGP support baseline.'); else pass(`Gateway compileSdk ${sdkMatch[1]} is within AGP support maximum ${gw.agpMaximumSupportedApi}.`);
const sdkRoot=process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdkRoot || !fs.existsSync(path.join(sdkRoot,`platforms/android-${gw.compileSdk}/android.jar`))) warn(`Android SDK Platform ${gw.compileSdk} was not found in the current runtime; Gateway native build must be verified on the target machine.`);
else pass(`Android SDK Platform ${gw.compileSdk} is present.`);

if (matrix.dependencyInstallAttempt?.status === 'BLOCKED_BY_REGISTRY_DNS') warn('Dependency installation evidence is BLOCKED: npm registry returned EAI_AGAIN; static lockfile checks are not install proof.');

console.log('TOOLCHAIN COMPATIBILITY CHECK: ' + (failures.length ? 'FAIL' : 'PASS'));
for (const p of passes) console.log(p);
for (const w of warnings) console.log(`WARN ${w}`);
if (failures.length) { for (const f of failures) console.error(`FAIL ${f}`); process.exitCode=1; }
else console.log(`Warnings: ${warnings.length}; failures: ${failures.length}.`);
console.log('This checks declared compatibility and tool presence; it does not replace npm ci, typecheck, Expo prebuild or Gradle builds.');
