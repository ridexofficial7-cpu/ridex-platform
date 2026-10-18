import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

test('dedicated AW page entry files exist and are routed', () => {
  const mapping = {
    LiveOperationsPage: 'live', BookingDetailPage: 'rides', DriverManagementPage: 'drivers', KycReviewPage: 'kyc',
    CustomerManagementPage: 'customers', ServiceConfigurationPage: 'services', PricingRulesPage: 'pricing',
    AdminScopeAssignmentPage: 'scopeAssignments', OtpConfigurationPage: 'otp', AuditHistoryPage: 'audit',
    DeliveryHealthPage: 'deliveryHealth', ReportsPage: 'reports', SystemHealthRecoveryPage: 'backup',
    SupportCasesPage: 'support', PublicLinksSettingsPage: 'publicLinks',
  };
  const router = read('src/pages/AdminModulePage.tsx');
  for (const [file, screen] of Object.entries(mapping)) {
    assert.ok(exists(`src/pages/${file}.tsx`), `${file}.tsx missing`);
    assert.match(router, new RegExp(`case \\\"${screen}\\\"`), `${screen} not routed`);
  }
  assert.ok(exists('src/pages/AdminAccessManagementPage.tsx'));
  for (const screen of ['admins', 'roles', 'sessions']) assert.match(router, new RegExp(`\\\"${screen}\\\"`));
});

test('OTP UI is a dedicated component and login delegates to it', () => {
  const login = read('src/pages/LoginPage.tsx');
  const otp = read('src/pages/OtpVerificationPage.tsx');
  assert.match(login, /<OtpVerificationPage/);
  assert.match(otp, /autoComplete=\"one-time-code\"/);
  assert.match(otp, /attemptsRemaining === 0/);
  assert.match(otp, /resendAfter > 0/);
});

test('previous typecheck issue is fixed by importing Environment type', () => {
  assert.match(read('src/pages/WorkspacePage.tsx'), /import type \{ AdminContext, Environment, Screen, WorkspaceConfig \}/);
});

test('support components fail closed or preserve explicit operator confirmation', () => {
  assert.match(read('src/components/ConfirmDialog.tsx'), /role=\"alertdialog\"/);
  assert.match(read('src/components/PermissionGate.tsx'), /if \(allowed\)/);
  assert.match(read('src/components/PermissionGate.tsx'), /Server-side authorization remains mandatory/);
  assert.match(read('src/components/ScopeBadge.tsx'), /Admin geographic scope/);
  assert.match(read('src/components/EnvironmentBadge.tsx'), /Current configured environment/);
  assert.ok(exists('src/components/LoadingState.tsx'));
  assert.ok(exists('src/components/ErrorState.tsx'));
});

test('App routes every non-dashboard workspace through AdminModulePage', () => {
  const app = read('src/App.tsx');
  assert.match(app, /import\("\.\/pages\/AdminModulePage"\)/);
  assert.match(app, /<AdminModulePage screen=\{screen\}/);
});
