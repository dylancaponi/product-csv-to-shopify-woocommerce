import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, parseProducts, detectSource, validate, EngineError } from '../index.js';
import { LEGACY_MESSAGE } from '../src/sources/bigcommerce.js';

const BC = readFileSync(new URL('../fixtures/bigcommerce-export.csv', import.meta.url), 'utf8');
const HEAD = BC.split('\n')[0];
const H = HEAD.split(',').map((k) => k.replace(/^"|"$/g, ''));
const row = (o) => H.map((k) => o[k] ?? '').map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
const file = (...rows) => [HEAD, ...rows.map(row)].join('\n') + '\n';
const P = (o = {}) => ({ Item: 'Product', Name: 'Tee', Type: 'physical', SKU: 'TEE', 'Inventory Tracking': 'none', Price: '10.00', 'Sale Price': '0.00', 'Is Visible': 'TRUE', ...o });
const V = (o = {}) => ({ Item: 'Variant', ...o });
const find = (r, code) => r.issues.filter((i) => i.code === code);

test('finding 1: a variant with its own price under a product sale is warned, naming both prices and what was written', () => {
  const r = parseProducts(file(P({ 'Sale Price': '8.00' }), V({ SKU: 'TEE-S', Options: 'Type=Radio|Name=Size|Value=S', Price: '12.00' }), V({ SKU: 'TEE-M', Options: 'Type=Radio|Name=Size|Value=M' })), {});
  const w = find(r, 'VARIANT_SALE_UNCLEAR');
  assert.ok(w.some((i) => /TEE-S/.test(i.message) && /12\.00/.test(i.message) && /8\.00/.test(i.message) && /carries 12\.00 with no sale/.test(i.message)));
  assert.ok(w.some((i) => /one variant has no price of their own|no price of their own/.test(i.message) && /sale price 8\.00/.test(i.message)), 'inherited sale is reported too');
  assert.equal(r.products[0].variants[0].price, '12.00');
  assert.ok(find(parseProducts(file(P({ 'Sale Price': '0.00' }), V({ SKU: 'TEE-S', Options: 'Type=Radio|Name=Size|Value=S', Price: '12.00' })), {}), 'VARIANT_SALE_UNCLEAR').length === 0);
});

test('finding 2: a sale price above the price is warned with what BigCommerce showed and what was written', () => {
  const r = parseProducts(file(P({ 'Sale Price': '15.00' })), {});
  assert.match(find(r, 'SALE_NOT_LOWER')[0].message, /saw 15\.00; the file carries 10\.00/);
  assert.equal(find(parseProducts(file(P({ 'Sale Price': '10.00' })), {}), 'SALE_NOT_LOWER').length, 0);
  const v = parseProducts(file(P(), V({ SKU: 'TEE-S', Options: 'Type=Radio|Name=Size|Value=S', Price: '12.00', 'Sale Price': '14.00' })), {});
  assert.ok(find(v, 'SALE_NOT_LOWER').length);
});

test('finding 3: signs of a re-sorted file are warned', () => {
  const swapped = parseProducts(file(P({ Name: 'One', SKU: 'ONE' }), P({ Name: 'Two', SKU: 'TWO' }), V({ ID: '1', SKU: 'ONE-S', Options: 'Type=Radio|Name=Size|Value=S' })), {});
  assert.match(find(swapped, 'FILE_MAY_BE_RESORTED')[0].message, /belongs to "One"/);
  const first = parseProducts(file(V({ SKU: 'X', Options: 'Type=Radio|Name=Size|Value=S' }), P()), {});
  assert.ok(find(first, 'FILE_MAY_BE_RESORTED').length);
  assert.equal(find(parseProducts(BC, {}), 'FILE_MAY_BE_RESORTED').length, 0, 'the real-layout fixture is not flagged');
});

test('finding 4: Is Visible reads TRUE/FALSE, yes/no, 1/0; anything else stays a draft with a warning', () => {
  const st = (v) => parseProducts(file(P({ 'Is Visible': v })), {});
  for (const v of ['TRUE', 'true', 'Yes', '1']) assert.equal(st(v).products[0].status, 'active', v);
  for (const v of ['FALSE', 'no', '0']) { assert.equal(st(v).products[0].status, 'draft', v); assert.equal(find(st(v), 'VISIBILITY_UNCLEAR').length, 0); }
  for (const v of ['', 'maybe']) { assert.equal(st(v).products[0].status, 'draft', v); assert.equal(find(st(v), 'VISIBILITY_UNCLEAR').length, 1, v); }
});

test('finding 5: the BigCommerce product SKU is the WooCommerce parent SKU unless it collides', () => {
  const r = convert(file(P(), V({ SKU: 'TEE-S', Options: 'Type=Radio|Name=Size|Value=S' }), V({ SKU: 'TEE-M', Options: 'Type=Radio|Name=Size|Value=M' })), { to: 'woocommerce' });
  assert.match(r.csv, /\n,variable,TEE,Tee,/);
  assert.ok(!r.issues.some((i) => i.code === 'PARENT_SKU_ADDED'));
  assert.ok(r.csv.split('\n').some((l) => /,variation,TEE-S,/.test(l) && l.includes(',TEE,')));
  const clash = convert(file(P({ SKU: 'TEE-S' }), V({ SKU: 'TEE-S', Options: 'Type=Radio|Name=Size|Value=S' }), V({ SKU: 'TEE-M', Options: 'Type=Radio|Name=Size|Value=M' })), { to: 'woocommerce' });
  assert.ok(clash.issues.some((i) => i.code === 'PARENT_SKU_ADDED'));
  assert.ok(!clash.issues.some((i) => i.code === 'DUPLICATE_SKU_CLEARED'));
  assert.equal(validate(r.csv, { target: 'woocommerce' }).ok, true);
});

test('finding 6: the retail price dropped beside a sale is reported', () => {
  assert.match(find(parseProducts(file(P({ 'Sale Price': '7.00', 'Retail Price': '12.00' })), {}), 'RETAIL_PRICE_DROPPED')[0].message, /12\.00/);
});

test('finding 7: the legacy message no longer mentions a default export template', () => {
  assert.ok(!/template/.test(LEGACY_MESSAGE));
});

test('finding 8: a lower-case product row is read', () => {
  const r = parseProducts(file(P({ Item: 'product' }), V({ Item: 'variant', SKU: 'TEE-S', Options: 'Type=Radio|Name=Size|Value=S' })), {});
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].variants[0].sku, 'TEE-S');
});

test('finding 9: a lower-case BigCommerce header is detected as BigCommerce and read', () => {
  const lower = BC.replace(/^[^\n]*/, (h) => h.toLowerCase());
  assert.equal(detectSource(lower).sourceId, 'bigcommerce');
  const a = convert(lower, { to: 'shopify' }); const b = convert(BC, { to: 'shopify' });
  assert.equal(a.csv, b.csv);
});

test('R2-1: variant IDs out of creation order raise no warning; sorted files are still flagged', () => {
  const b09 = file(P({ Name: 'One', SKU: 'ONE' }), V({ ID: '1', SKU: 'ONE-S', Options: 'Type=Radio|Name=Size|Value=S' }), V({ ID: '2', SKU: 'ONE-M', Options: 'Type=Radio|Name=Size|Value=M' }), V({ ID: '200', SKU: 'ONE-L', Options: 'Type=Radio|Name=Size|Value=L' }), { Item: 'Image', 'Image URL (Import)': 'https://cdn.example.com/one.jpg' },
    P({ Name: 'Two', SKU: 'TWO' }), V({ ID: '3', SKU: 'TWO-S', Options: 'Type=Radio|Name=Size|Value=S' }), V({ ID: '4', SKU: 'TWO-M', Options: 'Type=Radio|Name=Size|Value=M' }), { Item: 'Image', 'Image URL (Import)': 'https://cdn.example.com/two.jpg' });
  assert.equal(find(parseProducts(b09, {}), 'FILE_MAY_BE_RESORTED').length, 0);
  const rows = b09.trim().split('\n');
  const head = rows[0], body = rows.slice(1);
  const col = (n) => H.indexOf(n);
  const cells = (l) => l.split(',');
  const by = (n, desc = false) => [head, ...[...body].sort((a, b) => (cells(a)[col(n)] < cells(b)[col(n)] ? -1 : cells(a)[col(n)] > cells(b)[col(n)] ? 1 : 0) * (desc ? -1 : 1))].join('\n') + '\n';
  for (const [n, d] of [['SKU', false], ['Item', false], ['Item', true], ['Name', false], ['Name', true]]) {
    assert.ok(find(parseProducts(by(n, d), {}), 'FILE_MAY_BE_RESORTED').length, `sorted by ${n}${d ? ' desc' : ''}`);
  }
  for (const i of parseProducts(by('SKU'), {}).issues.filter((x) => x.code === 'FILE_MAY_BE_RESORTED')) assert.ok(!/ID/.test(i.message), i.message);
});

test('R2-2: the real parent SKU is not kept when another product uses it in any case', () => {
  const r = convert(file(P({ Name: 'Towel', SKU: 'TW' }), V({ SKU: 'TW-S', Options: 'Type=Radio|Name=Size|Value=S' }), V({ SKU: 'TW-M', Options: 'Type=Radio|Name=Size|Value=M' }), P({ Name: 'Other', SKU: 'tw' })), { to: 'woocommerce' });
  assert.ok(!r.issues.some((i) => i.code === 'DUPLICATE_SKU_CLEARED'), r.issues.map((i) => i.code).join());
  assert.ok(r.issues.some((i) => i.code === 'PARENT_SKU_ADDED'));
  assert.ok(r.csv.split('\n').some((l) => /,simple,tw,Other,/.test(l)));
});
