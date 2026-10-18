#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[];const passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let cfg,inventory;
try{cfg=JSON.parse(read('config/secret-hygiene-contract.json'));inventory=JSON.parse(read('config/source-inventory.json'));pass('secret hygiene contract and source inventory parse');}catch(e){console.error(`FAIL secret hygiene parse: ${e.message}`);process.exit(1);}
if(cfg.rules?.neverLogOrPrintSecretValuesDuringAudit!==true||cfg.rules?.distributedPrivateKeysAllowed!==false)fail('secret redaction/private-key policy missing');else pass('secret-value redaction and no embedded private-key policies present');
if(cfg.rules?.databaseLiveUrlMustBeBlankInExample!==true||cfg.rules?.localFoundationAllowsOnlyLocalDatabaseEndpoint!==true)fail('local/live environment boundary missing');else pass('local-only DB and blank LIVE example requirements explicit');
const envFiles=cfg.lastEnvironmentAudit?.filesReviewed||[];
for(const rel of envFiles){if(!fs.existsSync(path.join(root,rel)))fail(`environment audit path missing: ${rel}`);else pass(`environment file reviewed: ${rel}`);}
if(fs.existsSync(path.join(root,'apps/ridex-mobile/.env')))fail('machine-specific unified-mobile active .env must not be in clean source ZIP');else pass('machine-specific unified-mobile active .env removed');
if(!fs.existsSync(path.join(root,'apps/ridex-mobile/.env.example')))fail('canonical unified-mobile .env.example missing');else pass('canonical unified-mobile example remains present');
const excludedDirectories=new Set(['node_modules','.git','dist','build','.gradle','.expo','.cxx','coverage']);
const walkEnvFiles=dir=>{const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);if(ent.isDirectory()){if(!excludedDirectories.has(ent.name))out.push(...walkEnvFiles(full));}else if(ent.name==='.env'||ent.name.startsWith('.env.'))out.push(path.relative(root,full).replaceAll(path.sep,'/'));}return out;};
const allEnv=walkEnvFiles(root);
const localEnvFiles=allEnv.filter(rel=>path.basename(rel)!=='.env.example');
const ignoreText=read('.gitignore');
if(localEnvFiles.length&&(!ignoreText.includes('**/.env')||!ignoreText.includes('**/.env.*')||!ignoreText.includes('!**/.env.example')))fail('local environment-file ignore rules are incomplete');
else pass(`local environment filenames classified without reading contents (${localEnvFiles.length} local files)`);
for(const rel of localEnvFiles)console.log(`LOCAL ENV FILE (contents not inspected): ${rel}`);
pass(`environment templates and local-only files classified (${allEnv.length} paths; no local env values read)`);
const secretKey=/PASSWORD|PASSWD|SECRET|PRIVATE_KEY|SIGNING_KEY|ACCESS_TOKEN|REFRESH_TOKEN|API_KEY|ENCRYPTION_KEY|CLIENT_SECRET|DATABASE_URL_LIVE/i;
const nonSecretNumericSetting=/(?:_TTL_SECONDS|_TIMEOUT_MS|_RETRY_COUNT|_RETRY_INTERVAL_SECONDS|_PORT)$/i;
for(const rel of allEnv.filter(p=>path.basename(p)==='.env.example')){
 const full=path.join(root,rel);let text;try{text=read(rel);}catch{continue;}
 for(const [n,line] of text.split(/\r?\n/).entries()){
  const s=line.trim();if(!s||s.startsWith('#')||!s.includes('='))continue;
  const k=s.slice(0,s.indexOf('=')).trim();const v=s.slice(s.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'');
  if(secretKey.test(k)&&!nonSecretNumericSetting.test(k)&&v){const isPlaceholder=/^(|<[^>]+>|your[_ -]?.*|change[_ -]?me.*|example.*|placeholder.*|none|null)$/i.test(v);if(!isPlaceholder)fail(`credential-like setting appears populated in ${rel} (value withheld)`);}
 }
}
// Fail on actual key/certificate formats, and ensure inventory scanner also bans them.
const forbiddenExt=new Set(['.p12','.pfx','.jks','.keystore','.key','.pem']);
const sourceRoots=['apps','config','packages','scripts','services'];
const isLocalDebugKey=rel=>rel==='apps/driver-mobile/android/app/debug.keystore';
const excluded=[];const walkFiles=dir=>{for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);const rel=path.relative(root,full).replaceAll(path.sep,'/');if(ent.isDirectory()){if(!excludedDirectories.has(ent.name))walkFiles(full);}else{if((ent.name.startsWith('.env')&&ent.name!=='.env.example')||/\.(?:bak|backup)(?:[-.]|$)/i.test(ent.name)||/\.(?:before-|prepatch-)/i.test(ent.name)||ent.name==='local.properties'||ent.name.toLowerCase().endsWith('.zip')||rel==='apps/admin-web/docs/API_CONTRACT_VERIFICATION.md'||isLocalDebugKey(rel))continue;if(forbiddenExt.has(path.extname(ent.name).toLowerCase()))excluded.push(rel);if(['.crt','.cer','.der'].includes(path.extname(ent.name).toLowerCase())&&rel!=='services/broadcaster-provider/certs/supabase-root.crt')excluded.push(rel);if(['.png','.jpg','.jpeg','.webp','.gif','.svg','.bmp','.ico'].includes(path.extname(ent.name).toLowerCase())&&!rel.startsWith('apps/driver-mobile/android/app/src/main/res/'))excluded.push(rel);}}};
for(const rel of sourceRoots){const full=path.join(root,rel);if(fs.existsSync(full))walkFiles(full);}
if(excluded.length)for(const item of excluded)fail(`bundled private-key/certificate or non-approved asset: ${item}`);else pass('canonical source roots contain no private-key material or non-approved assets; generated outputs and local workspace artifacts are excluded');
if(fs.existsSync(path.join(root,'apps/driver-mobile/android/app/debug.keystore'))){if(!read('.gitignore').includes('**/debug.keystore'))fail('local Android debug signing file is not ignored');else console.log('LOCAL DEBUG SIGNING FILE (contents not inspected): apps/driver-mobile/android/app/debug.keystore');}
const highConfidenceSecretPatterns=[
  ['private-key PEM marker',/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/i],
  ['AWS access key ID',/\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub personal token',/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['Slack token',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Razorpay live key prefix',/\brzp_live_[A-Za-z0-9]{16,}\b/],
  ['generic live secret prefix',/\bsk_live_[A-Za-z0-9]{20,}\b/]
];
const textExtensions=new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.kt','.kts','.gradle','.properties','.xml','.html','.css','.sh','.yml','.yaml','.toml','.env','.example']);
const scanText=dir=>{for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);const rel=path.relative(root,full).replaceAll(path.sep,'/');if(ent.isDirectory()){if(!excludedDirectories.has(ent.name))scanText(full);}else{if((ent.name.startsWith('.env')&&ent.name!=='.env.example')||/\.(?:bak|backup)(?:[-.]|$)/i.test(ent.name)||/\.(?:before-|prepatch-)/i.test(ent.name)||ent.name==='local.properties'||ent.name.toLowerCase().endsWith('.zip')||rel==='apps/admin-web/docs/API_CONTRACT_VERIFICATION.md'||isLocalDebugKey(rel))continue;if(!textExtensions.has(path.extname(ent.name).toLowerCase())&&!ent.name.startsWith('.env'))continue;let content;try{content=fs.readFileSync(full,'utf8');}catch{continue;}for(const [,pattern] of highConfidenceSecretPatterns){if(content.split(/\r?\n/).some(line=>pattern.test(line)))fail(`possible embedded credential pattern in ${rel} (value withheld)`);}}}};
for(const rel of sourceRoots){const full=path.join(root,rel);if(fs.existsSync(full))scanText(full);}
if(!errors.some(e=>e.startsWith('possible embedded credential pattern')))pass('no high-confidence embedded credential patterns detected in canonical source roots (values withheld)');
if(!cfg.requiredAtFinalReview||cfg.requiredAtFinalReview.length<4)fail('final secret/rotation review items missing');else pass(`${cfg.requiredAtFinalReview.length} final credential/secret review items retained`);
if(errors.length){console.error('\nSECRET HYGIENE CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1);}console.log('SECRET HYGIENE CHECK: PASS');for(const p of passes)console.log(p);console.log('No secret values were emitted. Static scan is not an external provider credential/rotation test.');
