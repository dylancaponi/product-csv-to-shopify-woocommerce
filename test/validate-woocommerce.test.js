import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, convert, RULES } from '../index.js';
import { wooDecimal } from '../src/validate-woocommerce.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const W = (text, o = {}) => validate(text, { target: 'woocommerce', ...o });
const find = (r, code, line) => r.issues.find((i) => i.code === code && (line === undefined || i.line === line));

test('woo checker: every row rule fires on the bad fixture, on the right line, with a sourced rule', () => {
  const r = W(fx('woocommerce-bad.csv'));
  assert.equal(r.ok, false);
  const expect = [
    ['HEADER_UNIT_UNKNOWN', 1], ['HEADER_UNMAPPED', 1],
    ['SKU_DUPLICATE', 3], ['PUBLISHED_INVALID', 3], ['VISIBILITY_INVALID', 3], ['TAX_STATUS_INVALID', 3],
    ['IN_STOCK_INVALID', 3], ['STOCK_NOT_WHOLE_NUMBER', 3], ['BACKORDERS_INVALID', 3], ['PRICE_COMMA', 3],
    ['PRICE_EXTRA_CHARACTERS', 3], ['IMAGE_NOT_URL', 3], ['TYPE_INVALID', 4],
    ['VARIATION_MULTIPLE_VALUES', 7], ['VARIATION_VALUE_NOT_ON_PARENT', 7], ['VARIATION_ATTRIBUTE_NOT_ON_PARENT', 8],
    ['VARIATION_NO_PARENT', 9], ['VARIATION_PARENT_IS_VARIATION', 10], ['VARIATION_PARENT_NOT_IN_FILE', 11],
    ['VARIATION_PARENT_NOT_VARIABLE', 12], ['ID_DUPLICATE', 13], ['IN_STOCK_BLANK', 13], ['PRICE_NOT_NUMBER', 13],
    ['APOSTROPHE_KEPT', 14], ['ROW_CELL_COUNT', 15],
  ];
  for (const [code, line] of expect) assert.ok(find(r, code, line), `${code} on line ${line}`);
  assert.match(find(r, 'PRICE_COMMA', 3).message, /reads 1250/);
  assert.match(find(r, 'PUBLISHED_INVALID', 3).message, /private/);
  assert.match(find(r, 'STOCK_NOT_WHOLE_NUMBER', 3).message, /reads it as 0/);
  assert.match(find(r, 'SKU_DUPLICATE', 3).message, /A product with this SKU already exists\./);
  assert.match(find(r, 'TYPE_INVALID', 4).message, /Invalid product type\./);
  assert.match(find(r, 'VARIATION_NO_PARENT', 9).message, /Missing parent ID or parent does not exist yet\./);
  assert.ok(r.issues.some((i) => i.code === 'HEADER_UNMAPPED' && /Did you mean "Attribute 2 value\(s\)"/.test(i.message)));
  assert.ok(r.issues.some((i) => i.code === 'HEADER_UNMAPPED' && i.column === 'Notes'));
  // No apostrophe/number false alarm on good rows; S is a parent value.
  assert.ok(!find(r, 'VARIATION_VALUE_NOT_ON_PARENT', 6));
  for (const i of r.issues) {
    assert.ok(i.rule, `${i.code} has a rule`);
    assert.ok(RULES[i.rule.id], `rule ${i.rule.id} exists`);
    assert.match(i.rule.source, /^https:\/\//);
    assert.equal(typeof i.rule.verified, 'boolean');
  }
  const lines = r.issues.map((i) => i.line ?? 0);
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
  assert.deepEqual(r.stats, { rows: 14, products: 6, variations: 7, images: 3 });
});

test('woo checker: file-level problems', () => {
  assert.equal(W('').issues[0].code, 'EMPTY_FILE');
  assert.match(W('').issues[0].message, /File is empty\. Please upload something more substantial\./);
  assert.equal(W('Name,SKU\n').issues[0].code, 'NO_ROWS');
  assert.equal(W('Name;SKU\nMug;M1\n').issues[0].code, 'WRONG_DELIMITER');
  assert.equal(W('Name,SKU\n"Mug,M1\n').issues[0].code, 'ILLEGAL_QUOTING');
  assert.ok(find(W('Name,SKU\nMug�,M1\n'), 'NOT_UTF8', 2));
  assert.ok(find(W('Name,SKU\nCafÃ©,M1\n'), 'MOJIBAKE'));
  const ft = find(W('Name,SKU\nMug,M1\n', { fileName: 'products.xlsx' }), 'FILE_TYPE');
  assert.match(ft.message, /Invalid file type\. The importer supports CSV and TXT file formats\./);
  assert.ok(!find(W('Name,SKU\nMug,M1\n', { fileName: 'products.TXT' }), 'FILE_TYPE'));
  assert.ok(find(W('Name,SKU\nMug,M1\n', { byteLength: 3 * 1024 * 1024 }), 'FILE_SIZE'));
  assert.ok(find(W('Name,GTIN, UPC, EAN, or ISBN\nMug,1\n'.replace('GTIN, UPC, EAN, or ISBN', '"GTIN, UPC, EAN, or ISBN"')), 'GTIN_NOT_AUTO_MAPPED'));
  assert.ok(find(W('Name,Weight (lbs)\nMug,1\n'), 'HEADER_UNIT'));
  assert.ok(find(W(',Name\nx,Mug\n'), 'HEADER_BLANK'));
  assert.ok(find(W('Name,Attribute 1 value(s)\nMug,S\n'), 'ATTRIBUTE_NAME_COLUMN_MISSING', 1));
});

test('woo checker: header matching is case-insensitive, raw keys and special columns pass', () => {
  const r = W('﻿name,REGULAR PRICE,sku,meta:foo,Meta: bar,Download 1 URL,global_unique_id,Attribute 1 name,Attribute 1 value(s)\nMug,1.00,M1,x,y,https://a.example.com/f.pdf,123,Size,S\n');
  assert.deepEqual(r.issues.map((i) => i.code), []);
  assert.equal(r.ok, true);
});

test('woo checker: accepted values raise nothing', () => {
  const h = 'Type,SKU,Name,Published,Visibility in catalog,Tax status,In stock?,Stock,Backorders allowed?,Regular price,Images\n';
  const ok = [
    'simple,A,Ok,-1,hidden,none,0,,notify,0.99,"https://x.example.com/a.jpg, https://x.example.com/b.jpg"',
    '"simple, virtual",B,Ok2,2,Search,TRUE,backorder,,1,10,',
    'external,C,Ok3,true,catalog,shipping,,,,,',
    'simple,D,Ok4,1,visible,taxable,1,\'-3,0,5,',
  ];
  const r = W(h + ok.join('\n') + '\n');
  assert.deepEqual(r.issues.map((i) => i.code), []);
});

test('woo checker: wooDecimal mirrors wc_format_decimal with a dot separator', () => {
  assert.equal(wooDecimal('$1,299.00'), '1299.00');
  assert.equal(wooDecimal('12,50'), '1250');
  assert.equal(wooDecimal('1.299,00'), '1.29900');
  assert.equal(wooDecimal('1.000.50'), '1000.50');
  const r = W('Name,Regular price\nMug,$12.00\n');
  assert.ok(find(r, 'PRICE_EXTRA_CHARACTERS', 2));
});

test('woo checker: our own WooCommerce output passes with no errors or warnings, every source', () => {
  for (const f of ['etsy-listings.csv', 'wix-classic.csv', 'wix-v3.csv', 'squarespace-export.csv', 'shopify-export.csv', 'shopify-legacy.csv', 'woocommerce-export.csv']) {
    const c = convert(fx(f), { to: 'woocommerce', sourceWeightUnit: 'lb' });
    const v = W(c.csv);
    const bad = v.issues.filter((i) => i.severity !== 'info');
    assert.deepEqual(bad, [], `${f}: ${bad.map((i) => i.code).join(', ')}`);
    assert.ok(v.stats.products > 0);
  }
});

test('woo checker: validate() still defaults to Shopify', () => {
  assert.equal(validate('Title,URL handle,Price\nMug,mug,1.00\n').ok, true);
  assert.throws(() => validate('a', { target: 'etsy' }), /shopify and woocommerce/);
});
