#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],passes=[];const pass=m=>passes.push(`PASS ${m}`);const fail=m=>errors.push(m);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let cfg;try{cfg=JSON.parse(read('config/run-recovery-baseline.json'));pass('run/recovery baseline JSON parses')}catch(e){console.error(`FAIL run/recovery baseline: ${e.message}`);process.exit(1)}
const rootPkg=JSON.parse(read('package.json'));const backendPkg=JSON.parse(read('services/backend/package.json'));const sourceInv=JSON.parse(read('config/source-inventory.json'));
for(const [command,rel] of [['verify:all-static','scripts/run-static-checks.mjs'],['verify:run-recovery','scripts/verify-run-recovery-baseline.mjs'],['db:backup-local','services/backend/scripts/backup-db.sh'],['db:restore-local','services/backend/scripts/restore-db.sh'],['db:restore-drill-local','services/backend/scripts/backup-restore-drill.sh']]){
 if(!rootPkg.scripts[command])fail(`root command missing ${command}`);else pass(`root command declared ${command}`);
 if(!fs.existsSync(path.join(root,rel)))fail(`command target missing ${rel}`);
}
for(const [name,command] of [['db:backup:local','bash scripts/backup-db.sh'],['db:restore:local','bash scripts/restore-db.sh'],['db:restore-drill:local','bash scripts/backup-restore-drill.sh']])if(backendPkg.scripts[name]!==command)fail(`Backend script ${name} does not match guarded script`);else pass(`Backend command maps to guarded ${name}`);
const guard=read('services/backend/scripts/local-db-guard.sh');
if(!guard.includes('localhost|127.0.0.1|::1')||!guard.includes('postgres:')||!guard.includes('postgresql:'))fail('local DB guard must allow only loopback PostgreSQL URLs');else pass('shared database guard allows PostgreSQL loopback hosts only');
for(const file of ['services/backend/scripts/backup-db.sh','services/backend/scripts/restore-db.sh','services/backend/scripts/backup-restore-drill.sh']){
 const s=read(file);if(!s.includes('source "$SCRIPT_DIR/local-db-guard.sh"')||!s.includes('assert_local_database_url'))fail(`${file} does not use local-only DB guard`);else pass(`${file} enforces local-only DB URL policy`);
}
for(const file of ['services/backend/scripts/restore-db.sh','services/backend/scripts/backup-restore-drill.sh']){const s=read(file);if(!s.includes('RIDEX_ALLOW_DESTRUCTIVE_LOCAL_RESTORE')||!s.includes('!= "YES"'))fail(`${file} lacks explicit destructive restore opt-in`);else pass(`${file} requires explicit destructive restore opt-in`)}
if(!read('services/backend/scripts/backup-db.sh').includes('pg_dump --format=custom')||!read('services/backend/scripts/backup-db.sh').includes('sha256sum'))fail('backup must create custom-format dump and checksum');else pass('backup creates custom-format dump and checksum');
if(!read('services/backend/scripts/restore-db.sh').includes('pg_restore --exit-on-error --clean --if-exists'))fail('restore cleanup behavior not explicitly present for guard review');else pass('destructive pg_restore behavior is explicit in review contract');
if(!cfg.localFirst||cfg.localFirst.hostedDeployment!=='OUT_OF_SCOPE_UNTIL_EXPLICIT_APPROVAL')fail('local-only/hosted deployment boundary missing');
if(cfg.databaseRestore?.destructive!==true||!cfg.databaseRestore?.warning||!cfg.databaseRestore?.preconditions?.length)fail('restore destructive warnings/preconditions missing');
if(!String(cfg.recoveryTargets?.RPO||'').includes('PENDING_APPROVED_PRODUCT/OPERATIONS_TARGET')||!String(cfg.recoveryTargets?.RTO||'').includes('PENDING_APPROVED_PRODUCT/OPERATIONS_TARGET'))fail('unapproved RPO/RTO must remain explicitly pending');
if(!cfg.openItems?.some(x=>x.includes('npm registry EAI_AGAIN'))||!cfg.openItems?.some(x=>x.includes('Android SDK Platform 37')))fail('toolchain installation/native SDK blockers missing from open items');
if(!sourceInv.components.some(c=>c.id==='backend'&&c.scripts?.includes('local-db-guard.sh')))fail('source inventory missing backend local-db-guard script');
const backupScript=read('services/backend/scripts/backup-db.sh');
const restoreScript=read('services/backend/scripts/restore-db.sh');
const drillScript=read('services/backend/scripts/backup-restore-drill.sh');
if(!guard.includes('assert_database_name_matches_url')||!guard.includes('expected project database name'))fail('local DB guard must require explicit database-name identity checks');else pass('shared DB guard supports explicit project database-name identity');
if(!backupScript.includes('assert_database_name_matches_url "$DATABASE_URL" "$EXPECTED_DB_NAME"')||!backupScript.includes('RIDEX_BACKUP_ENVIRONMENT:-TEST'))fail('backup must require explicit project DB name and default to TEST');else pass('backup requires explicit expected DB identity and defaults to TEST');
if(/PRODUCTION\|LIVE/.test(backupScript)||!/\*\) echo "Refusing backup: this command supports local TEST databases only\./.test(backupScript))fail('backup must reject non-TEST environment labels');else pass('backup rejects LIVE/PRODUCTION environment labels');
if(!backupScript.includes('TMP_FILE=')||!backupScript.includes('pg_restore --list "$TMP_FILE"')||!backupScript.includes('mv -- "$TMP_FILE" "$FILE"'))fail('backup must validate a temporary dump before publishing');else pass('backup validates temporary dump before publishing');
if(!backupScript.includes('printf \'%s  %s\\n\' "$CHECKSUM" "$BASE"')||!backupScript.includes('Automatic backup deletion is intentionally disabled'))fail('backup checksum or purge-disabled rule missing');else pass('backup publishes a checksum sidecar and disables automatic purge pending policy');
if(/find\s+"\$OUT_DIR"[^\n]*-delete/.test(backupScript))fail('backup must not auto-delete old backups before retention/legal-hold approval');else pass('backup does not perform unapproved automatic purge');
if(!restoreScript.includes('assert_database_name_matches_url "$DATABASE_URL" "$EXPECTED_DB_NAME"')||!restoreScript.includes('RIDEX_RESTORE_ENVIRONMENT:-TEST'))fail('restore must require explicit expected DB identity and TEST-only environment');else pass('restore requires explicit expected DB identity and defaults to TEST');
if(!restoreScript.includes('Required backup checksum sidecar is missing')||!restoreScript.includes('sha256sum -c "$BACKUP_BASE.sha256"'))fail('restore must require and verify the backup checksum sidecar from its containing directory');else pass('restore requires and verifies checksum sidecar from backup directory');
if(!restoreScript.includes('! -L "$BACKUP_FILE"'))fail('restore must reject a symlinked backup file');else pass('restore rejects symlinked backup input');
if(!drillScript.includes('RIDEX_EXPECTED_BACKUP_DATABASE_NAME')||!drillScript.includes('RIDEX_EXPECTED_RESTORE_DATABASE_NAME')||!drillScript.includes('SOURCE_DB_NAME" != "$TARGET_DB_NAME'))fail('restore drill must name and separate source and disposable target databases');else pass('restore drill requires explicit, distinct source and target DB names');
if(cfg.databaseBackup?.defaultRetentionDays!==null||cfg.databaseBackup?.automaticPurge!=='DISABLED_UNTIL_RX-DEC-045_APPROVED')fail('automatic backup purge must remain disabled until RX-DEC-045 retention policy is approved');else pass('unapproved retention cleanup is disabled (RX-DEC-045)');
for(const id of ['RX-DEC-045','RX-DEC-050','RX-DEC-051']){const d=(JSON.parse(read('config/project-baseline.json')).decisions||[]).find(x=>x.id===id);if(!d||d.status!=='VERIFY')fail(`${id} must remain VERIFY until owner approval`);else pass(`${id} remains VERIFY in project baseline`)}
if(cfg.recoveryTargets?.RPO!=='PENDING_APPROVED_PRODUCT/OPERATIONS_TARGET_RX-DEC-050'||cfg.recoveryTargets?.RTO!=='PENDING_APPROVED_PRODUCT/OPERATIONS_TARGET_RX-DEC-050')fail('RPO/RTO must remain pending RX-DEC-050');else pass('RPO/RTO targets remain pending approval without invented values');
if(errors.length){console.error('\nRUN/RECOVERY BASELINE CHECK: FAIL');for(const e of errors)console.error(`FAIL ${e}`);process.exit(1)}
console.log('\nRUN/RECOVERY BASELINE CHECK: PASS');for(const p of passes)console.log(p);console.log('Backup/restore commands were not executed; database access and destructive restore tests are deferred.');
