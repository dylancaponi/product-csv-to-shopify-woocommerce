import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, RULES } from '../index.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}.csv`, import.meta.url), 'utf8');
const find = (r, code, line) => r.issues.find((i) => i.code === code && (line === undefined || i.line === line));

test('validator: official-shaped export passes with no errors', () => {
  const r = validate(fx('shopify-export'));
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual(r.stats, { rows: 7, products: 2, variants: 5, images: 3 });
});

test('validator: legacy headers pass', () => {
  assert.equal(validate(fx('shopify-legacy')).ok, true);
});

test('validator: every rule fires on the bad fixture, on the right line, with its source', () => {
  const r = validate(fx('shopify-bad'));
  assert.equal(r.ok, false);
  const expect = [
    ['HEADER_CASE', 1], ['HANDLE_SPACES', 3], ['STATUS_INVALID', 3], ['IMAGE_URL_INVALID', 3], ['PRICE_FORMAT', 3],
    ['QTY_BLANK', 3], ['POLICY_INVALID', 3], ['WEIGHT_INVALID', 3], ['WEIGHT_UNIT_INVALID', 3], ['DUPLICATE_SKU', 3],
    ['DUPLICATE_OPTIONS', 4], ['PRICE_BLANK', 4], ['QTY_NOT_NUMBER', 4], ['FULFILLMENT_BLANK', 4],
    ['HANDLE_NOT_CONTIGUOUS', 5], ['NO_PRODUCT_DATA', 6], ['STATUS_BLANK', 7], ['IMAGE_URL_HTTP', 7],
  ];
  for (const [code, line] of expect) assert.ok(find(r, code, line), `${code} on line ${line}`);
  assert.match(find(r, 'PRICE_FORMAT', 3).message, /Write it as 1299\.00/);
  for (const i of r.issues) {
    if (i.rule) {
      assert.ok(RULES[i.rule.id], `rule ${i.rule.id} exists`);
      assert.match(i.rule.source, /^https:\/\/|third-party/);
    }
  }
  // Sorted by line.
  const lines = r.issues.map((i) => i.line ?? 0);
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
});

test('validator: file-level problems', () => {
  assert.equal(validate('').issues[0].code, 'EMPTY_FILE');
  assert.equal(validate('Title,URL handle\n"Mug,mug\n').issues[0].code, 'ILLEGAL_QUOTING');
  assert.equal(validate('Title;URL handle\nMug;mug\n').issues[0].code, 'WRONG_DELIMITER');
  assert.ok(find(validate('Title,URL handle,Price\nMug�,mug,1.00\n'), 'NOT_UTF8'));
  assert.ok(find(validate('Title ,URL handle,Price\nMug,mug,1.00\n'), 'HEADER_WHITESPACE'));
  assert.ok(find(validate('URL handle,Price\nmug,1.00\n'), 'MISSING_TITLE_COLUMN'));
  assert.ok(find(validate('Title,URL handle,Barcode,Variant Barcodes,Price\nMug,mug,1,1,1.00\n'), 'BARCODE_BOTH'));
  assert.ok(find(validate('Title,URL handle,Price\nMug,mug,1.00\n', { byteLength: 16 * 1024 * 1024 }), 'FILE_TOO_LARGE'));
  assert.ok(find(validate('Title,URL handle,Price,Weird\nMug,mug,1.00,x\n'), 'HEADER_UNKNOWN'));
  assert.ok(!find(validate('Title,URL handle,Price,Price / International,product.metafields.custom.x\nMug,mug,1.00,2.00,x\n'), 'HEADER_UNKNOWN'));
});

test('validator: options, variant and image limits', () => {
  const head = 'Title,URL handle,Option1 name,Option1 value,Price,Product image URL\n';
  let body = 'Big,big,Size,0,1.00,\n';
  for (let i = 1; i < 2049; i++) body += `,big,,${i},1.00,\n`;
  assert.ok(find(validate(head + body), 'TOO_MANY_VARIANTS'));
  let imgs = 'Pics,pics,Title,Default Title,1.00,https://cdn.example.com/0.jpg\n';
  for (let i = 1; i < 251; i++) imgs += `,pics,,,,https://cdn.example.com/${i}.jpg\n`;
  assert.ok(find(validate(head + imgs), 'TOO_MANY_IMAGES'));
  assert.ok(find(validate(head + 'Two,two,,,1.00,\n,two,,,2.00,\n'), 'VARIANTS_WITHOUT_OPTIONS'));
  assert.ok(find(validate(head + 'Opt,opt,Size,S,1.00,\n,opt,,,2.00,\n'), 'OPTION_VALUE_MISSING'));
  const r = validate(head + 'Ok,ok,Size,S,1.00,https://cdn.example.com/a.jpg\n,ok,,M,1.00,\n,ok,,,,https://cdn.example.com/b.jpg\n');
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(r.stats.variants, 2);
  assert.equal(r.stats.images, 2);
});

test('validator: packed dimensions all or none; booleans', () => {
  const r = validate('Title,URL handle,Price,Packed product length,Packed product width,Packed product height,Packed product dimension unit,Charge tax\nBox,box,1.00,10,,,cm,yes\n');
  assert.ok(find(r, 'PACKED_DIMENSIONS_PARTIAL'));
  assert.ok(find(r, 'BOOLEAN_INVALID'));
});

test('validator: a fourth option column is an error', () => {
  const r = validate('Title,URL handle,Option1 name,Option1 value,Option4 name,Option4 value,Price\nShoe,shoe,Size,9,Sole,Gum,1.00\n');
  const i = r.issues.find((x) => x.code === 'TOO_MANY_OPTIONS');
  assert.ok(i);
  assert.equal(i.rule.id, 'shopify.options-max');
});
