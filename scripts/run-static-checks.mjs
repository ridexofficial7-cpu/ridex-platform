#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'scripts');
const checks=fs.readdirSync(dir).filter(n=>/^verify-.*\.mjs$/.test(n)).sort();
if(!checks.length){console.error('No static verification scripts found.');process.exit(2)}
let failed=0;
for(const file of checks){
 console.log(`\n===== STATIC CHECK: ${file} =====`);
 const result=spawnSync(process.execPath,[path.join(dir,file)],{cwd:root,encoding:'utf8',stdio:'inherit'});
 if(result.error){console.error(`Unable to run ${file}: ${result.error.message}`);failed++}
 else if(result.status!==0){console.error(`${file} failed with status ${result.status}`);failed++}
}
console.log(`\nSTATIC CHECK SUMMARY: ${checks.length-failed}/${checks.length} passed; ${failed} failed.`);
process.exit(failed===0?0:1);
