#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [], passes = [];
const pass = message => passes.push(`PASS ${message}`);
const fail = message => errors.push(message);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

let contract, register;
try { contract = JSON.parse(read('config/public-website-integration-contract.json')); pass('public website contract parses'); }
catch (error) { console.error(`FAIL public website contract: ${error.message}`); process.exit(1); }
try { register = JSON.parse(read('config/connection-register.json')); pass('canonical connection register parses'); }
catch (error) { console.error(`FAIL connection register: ${error.message}`); process.exit(1); }

const html = read('apps/public-website/index.html');
const js = read('apps/public-website/script.js');
const css = read('apps/public-website/style.css');
const pkg = JSON.parse(read('package.json'));

if (contract.schemaVersion !== 1 || contract.canonicalConnectionId !== 'CX-025') fail('contract schema/canonical connection ID invalid');
else pass('contract maps to canonical CX-025');
if (contract.clientAuthority !== 'NONE') fail('public website must have no business or privileged authority');
else pass('website has no business/privileged authority');
if (contract.status !== 'STATIC_MARKETING_SURFACE_EXTERNAL_DESTINATIONS_UNCONFIGURED') fail('website status must reflect unconfigured outbound destinations');
else pass('website status explicitly keeps outbound destinations unconfigured');
if (!html.includes('<main>') || !html.includes('<footer id="contact"')) fail('main content or contact footer missing');
else pass('main content and contact section present');
for (const id of contract.expectedStaticSections || []) {
  if (!new RegExp(`\\bid=["']${id}["']`).test(html)) fail(`required website section/id missing: ${id}`);
}
if ((contract.expectedStaticSections || []).every(id => new RegExp(`\\bid=["']${id}["']`).test(html))) pass('required static sections are present');

const idSet = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/g)) {
  const wholeTag = html.slice(Math.max(0, html.lastIndexOf('<a', match.index)), html.indexOf('>', match.index) + 1);
  if (/data-ridex-link=/.test(wholeTag)) continue;
  if (!idSet.has(match[1])) fail(`broken internal anchor target: #${match[1]}`);
}
pass('internal anchor links validated (configured external-link placeholders excluded)');

if (!/new URL\(value\.trim\(\)\)/.test(js) || /new URL\(value\.trim\(\),\s*window\.location\.href\)/.test(js)) fail('outbound URL validator must require absolute URLs without inheriting current origin');
else pass('outbound URL validation requires an absolute URL');
if (!/parsed\.protocol !== "https:"/.test(js) || !/parsed\.hostname/.test(js) || !/parsed\.username \|\| parsed\.password/.test(js)) fail('outbound URLs must require HTTPS, hostname, and reject embedded credentials');
else pass('outbound links require HTTPS hostname and reject embedded credentials');
for (const key of ['adminUrl', 'androidUrl', 'iosUrl']) {
  if (!new RegExp(`\\b${key}:\\s*""`).test(js)) fail(`${key} must default to unconfigured`);
  if (!new RegExp(`data-ridex-link="${key}"`).test(html)) fail(`${key} is not connected to a website link`);
}
pass('Admin, Android and iOS destinations are wired but default to unconfigured');

if (/\bfetch\s*\(|XMLHttpRequest|axios\s*\(|new\s+WebSocket|new\s+EventSource/.test(js)) fail('direct network/API call found in public website JavaScript');
else pass('no direct business API/network calls in website JavaScript');
if (/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i.test(html + js + css)) fail('loopback endpoint found in website assets');
else pass('no localhost/loopback endpoint in website assets');
if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|PRIVATE KEY-----|sk_live_|rzp_live_|Authorization:\s*Bearer/i.test(html + js + css)) fail('possible private key or provider credential found in website assets');
else pass('no obvious private key/provider credential in website assets');
if (!html.includes('ridexWarning') || !html.includes('ridexWarningContinue') || !js.includes('ACK_TTL_MS')) fail('test-period safety notice acknowledgement flow missing');
else pass('test-period safety notice and acknowledgement flow present');
if (!/focus-visible/.test(css) || !/min-height:\s*44px/.test(css)) fail('keyboard focus or minimum target sizing missing');
else pass('keyboard focus and target-size styles present');
if (!pkg.scripts?.['verify:public-website-contract']?.includes('verify-public-website-contract.mjs')) fail('root npm script does not expose public website verifier');
else pass('root npm script exposes public website verifier');

const edge = (register.connections || []).find(connection => connection.id === 'CX-025');
if (!edge || edge.from !== 'Public Website' || edge.status !== 'SOURCE_PRESENT_DESTINATIONS_PENDING' || edge.priority !== 'P1') fail('CX-025 must remain P1 with unverified destinations pending');
else pass('CX-025 remains pending until destinations are approved');
if (!edge.sourceEvidence?.includes('config/public-website-integration-contract.json') || !edge.sourceEvidence?.includes('scripts/verify-public-website-contract.mjs')) fail('CX-025 source evidence missing new contract/verifier');
else pass('CX-025 links the website contract and verifier');
if (!Array.isArray(contract.requiredBeforePublishing) || contract.requiredBeforePublishing.length < 5) fail('publication blocker checklist incomplete');
else pass(`publication blockers documented: ${contract.requiredBeforePublishing.length}`);
if (!String(contract.runtimeVerification || '').includes('pending')) fail('browser/production verification limitation not documented');
else pass('browser/production verification remains explicitly pending');

if (errors.length) {
  console.error('\nPUBLIC WEBSITE CONTRACT: FAIL');
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
console.log('\nPUBLIC WEBSITE CONTRACT: PASS');
for (const item of passes) console.log(item);
console.log('Static source contract only; browser, production URL and real store destination tests remain pending.');
