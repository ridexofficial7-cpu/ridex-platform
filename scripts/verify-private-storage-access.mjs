#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const passes = [];
const pass = (message) => passes.push(`PASS ${message}`);
const fail = (message) => errors.push(message);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let contract;
let baseline;
let requirements;
try {
  contract = JSON.parse(read('config/private-storage-access-contract.json'));
  baseline = JSON.parse(read('config/project-baseline.json'));
  requirements = JSON.parse(read('config/security-requirement-register.json'));
  pass('private storage contract, project baseline and requirement register parse');
} catch (error) {
  console.error(`FAIL private storage metadata: ${error.message}`);
  process.exit(1);
}

if (contract.status !== 'STATIC_PRIVATE_STORAGE_GUARDS_MAPPED_CLEANUP_IMPROVED_RUNTIME_ACCESS_TESTS_DEFERRED') fail('contract must remain static-only until physical storage tests run');
else pass('contract does not falsely claim runtime security tests passed');
if (contract.testStatus !== 'NOT_RUN_DEFERRED_UNTIL_ALL_FOUR_PACKAGE_IMPLEMENTATIONS_FINISH') fail('private storage runtime tests must remain deferred');
else pass('physical storage/access tests are deferred until all four packages are implemented');
if (contract.limits?.maxPrivateObjectBytes !== 10 * 1024 * 1024) fail('private upload size cap differs from current storage contract');
else pass('private file cap is recorded as 10 MiB');
if (contract.limits?.minSignedUrlTtlSeconds !== 60 || contract.limits?.maxSignedUrlTtlSeconds !== 900) fail('signed URL TTL policy must be bounded to 60–900 seconds');
else pass('signed URL TTL policy is bounded to 60–900 seconds');
if ((contract.controls || []).length !== 12) fail('expected 12 explicit storage controls');
else pass('12 storage controls are registered');
if (!contract.knownResidualsRequiringFinalReview?.some(x => /retention/i.test(x))) fail('data retention gap must remain explicit');
else pass('data retention and deletion-policy gap remains open');
if (!contract.finalRequiredTests?.length || contract.finalRequiredTests.length < 12) fail('final storage test matrix is incomplete');
else pass(`final storage/access test cases recorded (${contract.finalRequiredTests.length})`);

const storage = read('services/backend/src/integrations/storage.ts');
const customer = read('services/backend/src/routes/customer.ts');
const driver = read('services/backend/src/routes/driver.ts');
const driverService = read('services/backend/src/services/driverDocuments.service.ts');
const admin = read('services/backend/src/routes/admin.ts');
const baselineSection = baseline.privateStorageAccessContract;
if (baselineSection?.path !== 'config/private-storage-access-contract.json' || baselineSection?.validator !== 'scripts/verify-private-storage-access.mjs') fail('project baseline does not link the private storage contract and validator');
else pass('project baseline links private storage contract and validator');
if (baseline.privateStorageAccessContract?.status !== contract.status) fail('project baseline storage status disagrees with the contract');
else pass('project baseline storage status is consistent');

for (const [condition, message] of [
  [/function assertCurrentEnvironmentBucket/.test(storage), 'storage bucket is validated against the current environment'],
  [/function assertStorageKey/.test(storage) && /segment === "\.\."/.test(storage) && /STORAGE_PATH_TRAVERSAL/.test(storage), 'object keys and local paths have traversal guards'],
  [/const MAX_FILE_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/.test(storage), 'storage layer enforces 10 MiB object limit'],
  [/function validatePrivateFile/.test(storage) && /FILE_SIGNATURE_MISMATCH/.test(storage) && /FILE_EXTENSION_MISMATCH/.test(storage), 'file validation checks allowlist, extension and content signature'],
  [/case "image\/webp":\s*return \["\.webp"\]/.test(storage), 'WebP extension is explicitly mapped'],
  [/case "image\/webp":\s*return\s*\([\s\S]*?RIFF[\s\S]*?WEBP/.test(storage), 'WebP uploads use RIFF/WEBP signature validation'],
  [/const MAX_SIGNED_URL_TTL_SECONDS\s*=\s*15\s*\*\s*60/.test(storage) && /Math\.min\([\s\S]*?MAX_SIGNED_URL_TTL_SECONDS/.test(storage), 'generic provider signed URLs are capped at 15 minutes'],
  [/if \(getEnvironment\(\) ===\s*"PRODUCTION"\)[\s\S]{0,180}STORAGE_NOT_CONFIGURED/.test(storage), 'production does not silently fall back to local private storage'],
  [/return \{\s*bucket,\s*key,\s*mimeType,\s*size:/.test(storage), 'upload metadata reports storage locator and checksum to trusted caller only'],
]) {
  if (condition) pass(message); else fail(message);
}

if (!/deletePrivateObject,/.test(customer)) fail('Customer route does not import private object delete adapter');
else pass('Customer gallery can call the private object delete adapter');
const deleteStart = customer.indexOf('router.delete("/:customerId/gallery/:photoId"');
const downloadStart = customer.indexOf('router.get("/:customerId/gallery/:photoId/download"', deleteStart);
const deleteRoute = customer.slice(deleteStart, downloadStart);
const deleteObjectPos = deleteRoute.indexOf('await deletePrivateObject(');
const deleteRecordPos = deleteRoute.indexOf('tx.customerGalleryPhoto.delete(');
if (deleteStart < 0 || downloadStart < 0 || deleteObjectPos < 0 || deleteRecordPos < 0 || deleteObjectPos > deleteRecordPos) fail('gallery storage object must be deleted before its database pointer');
else pass('Customer Gallery deletes storage object before removing database pointer');
if (!deleteRoute.includes('GALLERY_STORAGE_DELETE_FAILED') || !deleteRoute.includes('databaseRecordRetainedForRetry: true')) fail('failed gallery storage deletion must be audited and keep the DB row for retry');
else pass('gallery object-delete failure is audited and preserves the retry pointer');
if (!deleteRoute.includes('rawStorageKeyExcluded: true') || deleteRoute.includes('storageDeletionApiUnavailableInCurrentStorageContract')) fail('obsolete storage deletion claim or raw storage-key audit must not remain');
else pass('gallery delete audit excludes raw key and removes obsolete unavailable-delete marker');

const downloadRoute = customer.slice(downloadStart, customer.indexOf('/* =========================================================\n   CUSTOMER WALLET', downloadStart));
for (const [condition, message] of [
  [/expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\)/.test(downloadRoute), 'Customer signed-link expiry rejects the exact expiry second'],
  [/timingSafeEqual/.test(downloadRoute) && /gallerySignature\(customerId, photoId, expiresAt\)/.test(downloadRoute), 'Customer gallery signed-link uses HMAC and timing-safe comparison'],
  [/where: \{ id: photoId \}, select: \{ customerId: true, storageBucket: true, storageKey: true/.test(downloadRoute) && /photo\.customerId !== customerId/.test(downloadRoute), 'Customer gallery download rechecks DB ownership'],
  [/purposeCode: "CUSTOMER\.GALLERY\.DOWNLOAD"/.test(downloadRoute) && /action: AuditAction\.EXPORT/.test(downloadRoute), 'successful Customer Gallery downloads are audit logged'],
  [/Cache-Control", "private, no-store"/.test(downloadRoute) && /X-Content-Type-Options", "nosniff"/.test(downloadRoute), 'signed content uses private no-store and nosniff response headers'],
  [/GALLERY_ALLOWED_MIME_TYPES\.includes\(mimeType\)/.test(downloadRoute), 'stored gallery MIME type is revalidated before sending'],
  [/buffer\.length > MAX_GALLERY_PHOTO_BYTES/.test(downloadRoute), 'stored gallery download size is bounded before response'],
]) {
  if (condition) pass(message); else fail(message);
}

if (!/verifyRouteDriverIdentity\(req, res, req\.params\.driverId\)/.test(driver) || !/where:\s*\{\s*id: documentId,\s*driverId,?\s*\}/.test(driver)) fail('Driver KYC routes do not show actor/object scope markers');
else pass('Driver KYC route source contains actor identity and document ownership markers');
if (!/getLatestDocumentVersion/.test(driverService) || !/latest\.id !== document\.id/.test(driverService)) fail('driver document download must only use the latest document version');
else pass('Driver document service rejects non-current document versions');
if (!/requirePermission\(req,\s*res,\s*'drivers',\s*PermissionAction\.VIEW\)/.test(admin) || !/where:\s*\{\s*id:documentId,driverId\s*\}/.test(admin)) fail('Admin KYC signed URL route is missing permission/object-scope markers');
else pass('Admin KYC download is permission-gated and scoped to driver + document');

const reqs = new Map((requirements.requirements || []).map(r => [r.id, r]));
for (const id of ['REQ-SEC-011', 'REQ-DATA-003', 'REQ-DATA-004']) {
  if (!reqs.has(id)) fail(`related security/data requirement missing: ${id}`);
  else if (!(reqs.get(id).sourceEvidence || []).includes('config/private-storage-access-contract.json')) fail(`${id} does not link private storage contract`);
  else pass(`${id} references private storage contract and stays traceable`);
}
for (const id of ['REQ-SEC-011', 'REQ-DATA-004']) {
  if (reqs.get(id)?.implementationStatus !== 'UNVERIFIED') fail(`${id} must remain UNVERIFIED until runtime tests pass`);
}
if (['REQ-SEC-011','REQ-DATA-004'].every(id => reqs.get(id)?.implementationStatus === 'UNVERIFIED')) pass('storage requirements are not falsely marked PASS');

if (errors.length) {
  console.error('\nPRIVATE STORAGE ACCESS CONTRACT: FAIL');
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
console.log('\nPRIVATE STORAGE ACCESS CONTRACT: PASS');
for (const item of passes) console.log(item);
console.log('Static source/contract checks only; no storage provider, database, cross-owner or signed URL runtime tests were run.');
