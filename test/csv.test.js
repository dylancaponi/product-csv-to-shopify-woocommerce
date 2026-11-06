import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, writeCSV, toRecords } from '../src/csv.js';
import { parsePrice } from '../src/money.js';
import { parseWeight, toGrams } from '../src/units.js';
import { slugify } from '../src/model.js';

test('csv: BOM, CRLF, quoted commas, quotes and embedded newlines', () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\r\nline2",\r\n';
  const rows = parseCSV(text);
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'line1\nline2', '']]);
  assert.equal(rows[2].line, 3);
});

test('csv: blank lines skipped, no trailing newline, semicolon sniffed', () => {
  assert.deepEqual(parseCSV('a;b\n\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('csv: unterminated quote is a clear error', () => {
  assert.throws(() => parseCSV('a,b\n1,"oops\n'), /never closed/);
});

test('csv: round trip keeps non-ASCII and HTML intact', () => {
  const rows = [['Title', 'Body'], ['Crème brûlée 日本', '<p class="x">a, b\nc</p>']];
  const out = writeCSV(rows);
  assert.equal(out, 'Title,Body\nCrème brûlée 日本,"<p class=""x"">a, b\nc</p>"\n');
  assert.deepEqual(parseCSV(out), rows);
  assert.ok(writeCSV(rows, { bom: true }).startsWith('﻿'));
});

test('csv: toRecords maps by header and reports duplicate headers', () => {
  const { records, duplicates } = toRecords(parseCSV('A,B,A\n1,2,3\n4'));
  assert.deepEqual(records[0], { A: '1', B: '2' });
  assert.deepEqual(records[1], { A: '4', B: '' });
  assert.deepEqual(duplicates, ['A']);
});

test('money: currency symbols, thousands separators, decimal commas', () => {
  const cases = {
    '12': '12.00', '$12.5': '12.50', '$1,234.56': '1234.56', '1.234,56 €': '1234.56',
    'USD 9.99': '9.99', '12,50': '12.50', '£0.99': '0.99', '1,234,567': '1234567.00',
    '9.999': '10.00', '0.125': '0.13', 'CA$ 20': '20.00',
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(parsePrice(k).value, v, k);
  assert.match(parsePrice('1,234').note, /Read the price "1,234" as 1234/);
  // Review F04: a dot and three digits is a decimal (3-decimal currencies), never thousands.
  assert.equal(parsePrice('1.250').value, '1.25');
  assert.equal(parsePrice('4.500').value, '4.50');
  // Review R2-M1: a dot and three digits always says how it was read.
  assert.match(parsePrice('4.500').note, /as 4.50 \(a decimal\)/);
  assert.equal(parsePrice('€1.250').value, '1250.00');
  assert.match(parsePrice('¥1.250').note, /currency symbol/);
  assert.match(parsePrice('1.299').note, /as 1.30 \(a decimal, rounded to cents\)/);
  assert.equal(parsePrice('free').value, null);
  assert.equal(parsePrice('').value, null);
});

test('units: weights to grams', () => {
  assert.equal(toGrams(1, 'lb'), 453.59237);
  assert.equal(toGrams(2, 'oz'), 56.69904625);
  assert.deepEqual(parseWeight('1,5 kg'), { value: 1.5, unit: 'kg' });
  assert.deepEqual(parseWeight('3', 'lb'), { value: 3, unit: 'lb' });
  assert.ok(parseWeight('heavy').bad);
});

test('slugify: accents folded, symbols dropped, fallback for non-Latin', () => {
  assert.equal(slugify('Crème Brûlée Mug (12 oz)'), 'creme-brulee-mug-12-oz');
  assert.equal(slugify('Salt & Pepper'), 'salt-and-pepper');
  assert.equal(slugify('日本茶', 'product-3'), 'product-3');
});
