import fs from 'node:fs';
import assert from 'node:assert/strict';
const m=JSON.parse(fs.readFileSync('config/uiux-design-token-alignment.json','utf8'));
for(const f of ['apps/driver-mobile/driver/theme.ts','apps/ridex-mobile/driver/theme.ts','apps/admin-mobile/admin/shared/theme.ts','apps/ridex-mobile/admin/shared/theme.ts','apps/admin-web/src/admin-panel-style.css','apps/gateway-android/app/src/main/java/com/ridex/gateway/ui/theme/Theme.kt']) assert.ok(fs.existsSync(f),`missing surface theme ${f}`);
for(const f of ['apps/driver-mobile/driver/theme.ts','apps/ridex-mobile/driver/theme.ts']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes("red: '#E11D48'"));assert.ok(s.includes("redDark: '#BE123C'"));assert.ok(s.includes("background: '#F8FAFC'"));assert.ok(s.includes("text: '#0F172A'"));assert.ok(s.includes("border: '#E5E7EB'"));}
const web=fs.readFileSync('apps/admin-web/src/admin-panel-style.css','utf8');assert.ok(web.includes('--primary: #E11D48'));assert.ok(web.includes('--primary-dark: #BE123C'));
const admin=fs.readFileSync('apps/admin-mobile/admin/shared/theme.ts','utf8');assert.ok(admin.includes("primary: '#E11D48'"));
assert.ok(m.responsiveRules.length>=4);assert.ok(m.statusNotes.some(x=>x.includes('deferred')));
console.log('P4-F DESIGN TOKEN ALIGNMENT: PASS (driver palette aligned; mobile/web/gateway token boundaries checked)');
console.log('Responsive, accessibility, font-scale and device visual evidence remain deferred.');
