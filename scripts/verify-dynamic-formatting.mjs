#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  RIDEX_FORMAT_UNAVAILABLE, formatRideXNumber, formatRideXCurrency, formatRideXDate, formatRideXDateTime,
  getRideXPluralCategory, interpolateRideXText, formatRideXMessage, resolveRideXPluralTranslation, translateRideXPlural
} from '../packages/localization/src/dynamicFormatting.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = []; const checks = [];
const pass = m => checks.push(`PASS ${m}`); const fail = m => errors.push(m); const req = (c,m) => c ? pass(m) : fail(m);
const load = rel => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch (e) { fail(`${rel}: ${e.message}`); return null; } };
const contract = load('config/dynamic-text-formatting.json');
const baseline = load('config/project-baseline.json');
const inventory = load('config/source-inventory.json');
const pkg = load('package.json');
const i18n = load('config/localization-interface.json');
const cases = []; const test = (name, fn) => { try { fn(); cases.push(`PASS ${name}`); } catch (e) { errors.push(`${name}: ${e.message}`); } };
const dictionaries = {
  'en-IN': {
    count: { one: 'One booking for {name}', other: '{count} bookings for {name}' },
    fallbackCount: { one: 'One item', other: '{count} items' },
    message: 'Hello, {name}. You have {count} updates.',
    double: 'Selected {{locale}}'
  },
  'hi-IN': {
    count: { other: '{name} के {count} बुकिंग' },
    fallbackCount: { other: '{count} आइटम' },
    message: 'नमस्ते, {name}। आपके {count} अपडेट हैं।'
  }
};
req(Boolean(contract && baseline && inventory && pkg && i18n), 'formatting config and source manifests parse');
if (contract && baseline && inventory && pkg && i18n) {
  req(contract.status.includes('DYNAMIC_FORMATTING_HELPERS') && contract.status.includes('SCREEN_USAGE_AND_LQA_PENDING'), 'formatting status distinguishes helper implementation from app wiring/LQA');
  req(contract.supportedLocales.join(',') === 'en-IN,hi-IN', 'formatting uses only approved selectable locales');
  req(contract.currencyFormatting.currencyCode.includes('REQUIRED') && contract.currencyFormatting.currencyOrRoundingDecision.includes('NOT_DEFINED'), 'currency and monetary rules are never guessed by formatter');
  req(contract.dateFormatting.defaultTimezone.includes('PLATFORM_LOCAL') && contract.dateFormatting.businessTimezonePolicy.includes('NOT_DEFINED'), 'presentation timezone does not invent business timezone policy');
  req(contract.pluralization.runtime === 'Intl.PluralRules' && contract.pluralization.fallbackOrder.length === 5, 'plural selection uses runtime locale rules with explicit fallback order');
  req(contract.surfaceWiring.physicalAndLqaTests === 'DEFERRED_UNTIL_ALL_FOUR_PACKAGES_FINISH', 'physical UI/LQA remains deferred');
  req(baseline.dynamicTextFormatting?.path === 'config/dynamic-text-formatting.json' && inventory.dynamicTextFormatting?.path === 'config/dynamic-text-formatting.json', 'baseline and source inventory link formatting contract');
  req(pkg.scripts?.['verify:dynamic-formatting'] === 'node scripts/verify-dynamic-formatting.mjs', 'dedicated verifier command is registered');
  req(i18n.contract.placeholdersAndFormatting.includes('dynamicFormatting.mjs'), 'shared localization interface links dynamic formatting module');
  const rootScripts = inventory.components?.find(c => c.id === 'rootBuildScripts');
  const actualScripts = fs.readdirSync(path.join(root, 'scripts')).filter(n => fs.statSync(path.join(root, 'scripts', n)).isFile()).sort();
  req(rootScripts?.scripts?.includes('verify-dynamic-formatting.mjs') && rootScripts.fileCount === actualScripts.length && JSON.stringify(rootScripts.scripts.slice().sort()) === JSON.stringify(actualScripts), 'source inventory tracks current root validation scripts');
  const mobileProvider = fs.readFileSync(path.join(root, 'packages/localization/src/RideXMobileLocaleProvider.tsx'), 'utf8');
  const webProvider = fs.readFileSync(path.join(root, 'apps/admin-web/src/lib/i18n.tsx'), 'utf8');
  req(mobileProvider.includes('interpolateRideXText') && mobileProvider.includes('formatRideXNumber') && mobileProvider.includes('formatRideXCurrency') && mobileProvider.includes('formatRideXDateTime') && mobileProvider.includes('translateRideXPlural'), 'mobile locale context exposes shared interpolation/plural/number/date/currency helpers');
  req(webProvider.includes('interpolateRideXText') && webProvider.includes('formatRideXNumber') && webProvider.includes('formatRideXCurrency') && webProvider.includes('formatRideXDateTime') && webProvider.includes('translateRideXPlural'), 'Admin Web language context exposes shared interpolation/plural/number/date/currency helpers');
  req(contract.surfaceWiring.adminWeb.includes('EXPOSED') && contract.surfaceWiring.mobile.includes('EXPOSED') && contract.surfaceWiring.publicWebsite.includes('NOT_WIRED'), 'surface status distinguishes exposed context helpers from website and screen-use gaps');

  test('en-IN number formatting agrees with Intl.NumberFormat', () => assert.equal(formatRideXNumber(1234567.89,{locale:'en-IN'}), new Intl.NumberFormat('en-IN',{useGrouping:true}).format(1234567.89)));
  test('hi-IN number formatting agrees with Intl.NumberFormat', () => assert.equal(formatRideXNumber(1234567.89,{locale:'hi-IN'}), new Intl.NumberFormat('hi-IN',{useGrouping:true}).format(1234567.89)));
  test('unsupported locale falls back to en-IN formatting', () => assert.equal(formatRideXNumber(1234567,{locale:'bn-IN'}), formatRideXNumber(1234567,{locale:'en-IN'})));
  test('non-finite and non-number input use safe fallback', () => { assert.equal(formatRideXNumber(NaN),RIDEX_FORMAT_UNAVAILABLE); assert.equal(formatRideXNumber(Infinity),RIDEX_FORMAT_UNAVAILABLE); assert.equal(formatRideXNumber('12'),RIDEX_FORMAT_UNAVAILABLE); });
  test('invalid number formatting options do not throw', () => assert.equal(formatRideXNumber(12,{maximumFractionDigits:40}),RIDEX_FORMAT_UNAVAILABLE));
  test('minimum and maximum fraction options pass through', () => assert.equal(formatRideXNumber(12.5,{locale:'en-IN',minimumFractionDigits:2,maximumFractionDigits:2}),new Intl.NumberFormat('en-IN',{useGrouping:true,minimumFractionDigits:2,maximumFractionDigits:2}).format(12.5)));
  test('currency code is required', () => assert.equal(formatRideXCurrency(100,{locale:'en-IN'}),RIDEX_FORMAT_UNAVAILABLE));
  test('currency amount uses explicit caller-supplied code', () => assert.equal(formatRideXCurrency(1234.5,{locale:'en-IN',currency:'INR'}),new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',useGrouping:true,currencyDisplay:'symbol',currencySign:'standard'}).format(1234.5)));
  test('currency output follows selected Hindi locale', () => assert.equal(formatRideXCurrency(1234.5,{locale:'hi-IN',currency:'INR'}),new Intl.NumberFormat('hi-IN',{style:'currency',currency:'INR',useGrouping:true,currencyDisplay:'symbol',currencySign:'standard'}).format(1234.5)));
  test('invalid currency code is rejected safely', () => { assert.equal(formatRideXCurrency(10,{currency:'US'}),RIDEX_FORMAT_UNAVAILABLE); assert.equal(formatRideXCurrency(10,{currency:'<script>'}),RIDEX_FORMAT_UNAVAILABLE); });
  test('invalid currency display does not throw', () => assert.equal(formatRideXCurrency(10,{currency:'INR',currencyDisplay:'html'}),RIDEX_FORMAT_UNAVAILABLE));
  test('currency fraction presentation can be caller-specified', () => assert.equal(formatRideXCurrency(10,{currency:'INR',minimumFractionDigits:0,maximumFractionDigits:0}),new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',useGrouping:true,currencyDisplay:'symbol',currencySign:'standard',minimumFractionDigits:0,maximumFractionDigits:0}).format(10)));
  test('date formatting matches Intl for en-IN', () => { const d='2026-10-12T12:30:00Z'; assert.equal(formatRideXDate(d,{locale:'en-IN',timeZone:'UTC'}),new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(d))); });
  test('date formatting matches Intl for hi-IN', () => { const d='2026-10-12T12:30:00Z'; assert.equal(formatRideXDate(d,{locale:'hi-IN',timeZone:'UTC'}),new Intl.DateTimeFormat('hi-IN',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(d))); });
  test('datetime formatting honors explicit timezone', () => { const d='2026-10-12T12:30:00Z'; assert.equal(formatRideXDateTime(d,{locale:'en-IN',timeZone:'UTC'}),new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(d))); });
  test('date accepts a valid Date object', () => { const d=new Date('2026-01-05T00:00:00Z'); assert.equal(formatRideXDate(d,{timeZone:'UTC'}),new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'UTC'}).format(d)); });
  test('invalid date values use safe fallback', () => { assert.equal(formatRideXDate(''),RIDEX_FORMAT_UNAVAILABLE); assert.equal(formatRideXDate('not-date'),RIDEX_FORMAT_UNAVAILABLE); assert.equal(formatRideXDate(new Date(NaN)),RIDEX_FORMAT_UNAVAILABLE); });
  test('invalid timezone uses safe fallback', () => assert.equal(formatRideXDateTime('2026-10-12T12:30:00Z',{timeZone:'No/Such_Zone'}),RIDEX_FORMAT_UNAVAILABLE));
  test('time-only granular options do not conflict with dateStyle defaults', () => assert.equal(formatRideXDateTime('2026-10-12T12:30:00Z',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}),new Intl.DateTimeFormat('en-IN',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date('2026-10-12T12:30:00Z'))));
  test('plural category matches runtime Intl.PluralRules', () => assert.equal(getRideXPluralCategory(2,{locale:'en-IN'}),new Intl.PluralRules('en-IN').select(2)));
  test('Hindi plural category uses Hindi locale rules', () => assert.equal(getRideXPluralCategory(1,{locale:'hi-IN'}),new Intl.PluralRules('hi-IN').select(1)));
  test('invalid plural inputs return undefined', () => { assert.equal(getRideXPluralCategory(Infinity),undefined); assert.equal(getRideXPluralCategory(1,{type:'range'}),undefined); });
  test('single-brace interpolation works', () => assert.equal(interpolateRideXText('Hello, {name}',{name:'Ravi'}),'Hello, Ravi'));
  test('double-brace interpolation works', () => assert.equal(interpolateRideXText('Selected {{locale}}',{locale:'hi-IN'}),'Selected hi-IN'));
  test('interpolation replaces repeated placeholders', () => assert.equal(interpolateRideXText('{count} + {count}',{count:2}),'2 + 2'));
  test('missing placeholder gets safe fallback', () => assert.equal(interpolateRideXText('Hello {name}',{}),'Hello —'));
  test('objects are never serialized into UI text', () => assert.equal(interpolateRideXText('Value {secret}',{secret:{token:'do-not-show'}}),'Value —'));
  test('null and undefined values get safe fallback', () => assert.equal(interpolateRideXText('{a}/{b}',{a:null,b:undefined}),'—/—'));
  test('invalid template returns safe fallback', () => assert.equal(interpolateRideXText('  '),RIDEX_FORMAT_UNAVAILABLE));
  test('message formatter resolves locale and interpolates', () => assert.equal(formatRideXMessage({locale:'hi-IN',key:'message',dictionaries,values:{name:'Ravi',count:3}}).text,'नमस्ते, Ravi। आपके 3 अपडेट हैं।'));
  test('message formatter uses English fallback catalog', () => assert.equal(formatRideXMessage({locale:'hi-IN',key:'double',dictionaries,values:{locale:'hi-IN'}}).text,'Selected hi-IN'));
  test('plural translation resolves the locale-specific other form before English category', () => assert.equal(translateRideXPlural({locale:'hi-IN',key:'count',count:1,dictionaries,values:{name:'Ravi'}}), 'Ravi के 1 बुकिंग'));
  test('plural translation resolves English category if local category and other are absent', () => assert.equal(translateRideXPlural({locale:'hi-IN',key:'fallbackCount',count:1,dictionaries}), '1 आइटम'));
  test('plural count is formatted in the selected locale', () => { const r=resolveRideXPluralTranslation({locale:'en-IN',key:'count',count:1234,dictionaries,values:{name:'Ravi'}}); assert.equal(r.text,`${formatRideXNumber(1234,{locale:'en-IN'})} bookings for Ravi`); });
  test('plural key never falls back by rendering the raw internal key', () => { const r=resolveRideXPluralTranslation({locale:'en-IN',key:'internal.private.key',count:2,dictionaries:{'en-IN':{}}}); assert.equal(r.text,RIDEX_FORMAT_UNAVAILABLE); assert.equal(r.translationFound,false); assert.equal(r.text.includes('internal.private.key'),false); });
  test('plural result is immutable and reports selected category', () => { const r=resolveRideXPluralTranslation({locale:'en-IN',key:'count',count:2,dictionaries}); assert.equal(Object.isFrozen(r),true); assert.equal(r.pluralCategory,new Intl.PluralRules('en-IN').select(2)); });
}
if (errors.length) { console.error('DYNAMIC FORMATTING CHECK: FAIL'); for (const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
console.log('DYNAMIC FORMATTING CHECK: PASS'); for (const c of checks) console.log(c); for (const c of cases) console.log(c); console.log('Pure format/interpolation/plural cases only; app wiring, physical UI/LQA and financial/business rules remain pending.');
