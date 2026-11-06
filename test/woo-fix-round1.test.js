import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, convert } from '../index.js';
import { phpIntval } from '../src/validate-woocommerce.js';

const W = (text, o = {}) => validate(text, { target: 'woocommerce', ...o });
const has = (r, code, line) => r.issues.find((i) => i.code === code && (line === undefined || i.line === line));
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

test('finding 1: a blank Published cell is flagged as a draft; no column is fine', () => {
  const r = W('Type,SKU,Name,Published\nsimple,A,Mug,\nvariation,B,Var,\n');
  assert.match(has(r, 'PUBLISHED_BLANK', 2).message, /draft/);
  assert.ok(has(r, 'PUBLISHED_BLANK', 3));
  assert.ok(!has(W('Type,SKU,Name\nsimple,A,Mug\n'), 'PUBLISHED_BLANK'));
});

test('finding 2: a variation above its parent row is flagged with both lines', () => {
  const r = W('Type,SKU,Name,Parent,Attribute 1 name,Attribute 1 value(s)\nvariation,T-S,T S,T,Size,S\nvariable,T,T,,Size,"S, M"\nvariation,T-M,T M,T,Size,M\n');
  assert.match(has(r, 'VARIATION_BEFORE_PARENT', 2).message, /line 3/);
  assert.ok(!has(r, 'VARIATION_BEFORE_PARENT', 4));
});

test('finding 3: a WooCommerce export re-saved with semicolons is WRONG_DELIMITER even with commas in the GTIN header', () => {
  const r = W('ID;Type;SKU;GTIN, UPC, EAN, or ISBN;Name;Regular price\n1;simple;A;;Mug;12,50\n');
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].code, 'WRONG_DELIMITER');
  const out = convert(fx('shopify-export.csv'), { to: 'woocommerce' }).csv;
  const semi = out.split(/\r?\n/).map((l) => l.replace(/,/g, ';')).join('\n');
  assert.equal(W(semi).issues[0].code, 'WRONG_DELIMITER');
  assert.ok(!has(W('Name,SKU\n"a;b;c;d",X\n'), 'WRONG_DELIMITER'));
});

test('finding 4: duplicated header warns and the last column is the one checked', () => {
  const r = W('ID,Type,SKU,Name,SKU,In stock?\n1,simple,A,One,X,1\n2,simple,A,Two,Y,1\n');
  assert.ok(has(r, 'HEADER_DUPLICATE', 1));
  assert.ok(!has(r, 'SKU_DUPLICATE'));
  assert.ok(has(W('Type,SKU,Name,SKU\nsimple,A,One,X\nsimple,B,Two,X\n'), 'SKU_DUPLICATE', 3));
});

test('finding 5: duplicate SKU and ID messages depend on Update existing products', () => {
  const r = W('ID,Type,SKU,Name\n5,simple,A,One\n5,simple,A,Two\n');
  for (const c of ['SKU_DUPLICATE', 'ID_DUPLICATE']) assert.match(has(r, c, 3).message, /new-products import.*Update existing products/);
});

test('finding 6: SKUs differing only by letter case are duplicates', () => {
  assert.match(has(W('Type,SKU,Name\nsimple,ABC,One\nsimple,abc,Two\n'), 'SKU_DUPLICATE', 3).message, /usually ignore letter case/);
});

test('finding 7: upload messages are the ones an uploader sees', () => {
  assert.match(has(W('Name\nMug\n', { fileName: 'p.xlsx' }), 'FILE_TYPE').message, /Sorry, you are not allowed to upload this file type\./);
  assert.match(has(W(''), 'EMPTY_FILE').message, /File is empty\. Please upload something more substantial\./);
  assert.match(has(W('Name,SKU\n'), 'NO_ROWS').message, /The file is empty or using a different encoding than UTF-8/);
});

test('finding 8: missing parent says the placeholder is deleted; id:N placeholder named by number', () => {
  const r = W('Type,SKU,Name,Parent\nvariation,A,A,id:42\nvariation,B,B,GHOST\n');
  assert.match(has(r, 'VARIATION_PARENT_NOT_IN_FILE', 2).message, /"Import placeholder for 42".*deletes both/);
  assert.ok(!/never shows/.test(has(r, 'VARIATION_PARENT_NOT_IN_FILE', 3).message));
});

test('finding 9: plugin types are a warning; only the first type part is judged', () => {
  const r = W('Type,SKU,Name\nsubscription,A,Sub\n"simple, foo",B,Odd\n');
  assert.equal(has(r, 'TYPE_INVALID', 2).severity, 'warning');
  assert.ok(!has(r, 'TYPE_INVALID', 3));
  assert.equal(r.ok, true);
});

test('finding 10: non-CSV bytes say what the file is', () => {
  assert.match(has(W('PK\u0003\u0004xl/workbook.xml'), 'NOT_CSV').message, /Excel/);
  assert.match(has(W('<!doctype html><html></html>'), 'NOT_CSV').message, /web page/);
  assert.ok(!has(W('<!doctype html>'), 'NO_ROWS'));
});

test('finding 11: "Backorder" with a capital B is read as in stock', () => {
  assert.ok(has(W('Type,SKU,Name,In stock?\nsimple,A,One,Backorder\n'), 'IN_STOCK_INVALID', 2));
  assert.ok(!has(W('Type,SKU,Name,In stock?\nsimple,A,One,backorder\n'), 'IN_STOCK_INVALID'));
});

test('finding 12: IDs compare as numbers (leading zeros), also for Parent id:N', () => {
  assert.ok(has(W('ID,Type,SKU,Name\n007,simple,A,One\n7,simple,B,Two\n'), 'ID_DUPLICATE', 3));
  assert.ok(!has(W('ID,Type,SKU,Name,Parent\n010,variable,P,P,\n11,variation,V,V,id:10\n'), 'VARIATION_PARENT_NOT_IN_FILE'));
});

test('finding 13: Stock "1e3" reads as 1000 and "+5" is a whole number', () => {
  assert.equal(phpIntval('1e3'), 1000);
  assert.equal(phpIntval('12.7'), 12);
  assert.equal(phpIntval('1,200'), 1);
  assert.equal(phpIntval('ten'), 0);
  assert.match(has(W('Type,SKU,Name,Stock\nsimple,A,One,1e3\n'), 'STOCK_NOT_WHOLE_NUMBER').message, /reads it as 1000/);
  assert.ok(!has(W('Type,SKU,Name,Stock\nsimple,A,One,+5\n'), 'STOCK_NOT_WHOLE_NUMBER'));
});

test('finding 14: WordPress post_* headers are recognised', () => {
  assert.deepEqual(W('post_title,post_content,post_excerpt,post_id,post_parent\nMug,Text,Short,1,\n').issues.map((i) => i.code), []);
});

test('finding 15: unmapped wording and a warning when nothing maps', () => {
  const r = W('Typ,Artikelnummer,Regulärer Preis\nsimple,A,"12,50"\n');
  assert.match(has(r, 'HEADER_UNMAPPED').message, /English column names/);
  assert.ok(has(r, 'NOTHING_MAPPED', 1));
});

test('finding 16: "12.5.0" is a warning, "1,299.00" is only a note', () => {
  const r = W('Type,SKU,Name,Regular price\nsimple,A,One,12.5.0\nsimple,B,Two,"1,299.00"\nsimple,C,Three,"12,50"\n');
  assert.equal(has(r, 'PRICE_DOTS', 2).severity, 'warning');
  assert.equal(has(r, 'PRICE_COMMA', 3).severity, 'info');
  assert.equal(has(r, 'PRICE_COMMA', 4).severity, 'warning');
});

test('finding 17: a leading apostrophe in SKU or Parent is flagged', () => {
  assert.ok(has(W("Type,SKU,Name\nsimple,'-F4,One\n"), 'APOSTROPHE_KEPT', 2));
  assert.ok(has(W("Type,SKU,Name,Parent\nvariation,V,V,'-P\n"), 'APOSTROPHE_KEPT', 2));
});

test('R2-1: a CSV whose header starts with PK or <html> text is not called zip or a web page; real ones still are', async () => {
  const { detectSource } = await import('../index.js');
  assert.ok(!has(W('PKG,Name,SKU\n1,Mug,M1\n'), 'NOT_CSV'));
  assert.ok(!has(W('<html>,Name\nx,Mug\n'), 'NOT_CSV'));
  assert.match(has(W('PK\u0003\u0004xl/workbook.xml'), 'NOT_CSV').message, /Excel/);
  assert.match(has(W('<html><head><title>x</title></head><body></body></html>'), 'NOT_CSV').message, /web page/);
  assert.match(has(W('<!DOCTYPE html>\n<html>'), 'NOT_CSV').message, /web page/);
  assert.match(has(W('%PDF-1.7 xx'), 'NOT_CSV').message, /PDF/);
  assert.ok(!/Excel|web page/.test(detectSource('PKG,Title,URL handle\n1,Mug,mug\n').reason || ''));
  assert.match(detectSource('PK\u0003\u0004xxxx').reason, /Excel/);
});

test('R2-2: Parent id:abc is a SKU, placeholder keeps the full value', () => {
  const m = has(W('Type,SKU,Name,Parent\nvariation,A,A,id:abc\n'), 'VARIATION_PARENT_NOT_IN_FILE').message;
  assert.match(m, /has that SKU/);
  assert.match(m, /"Import placeholder for id:abc"/);
});

test('R2-3: repeated SKU column with short rows reads the earlier column, as WooCommerce does', () => {
  const r = W('Type,SKU,Name,SKU\nsimple,A,One\nsimple,A,Two\n');
  assert.ok(has(r, 'SKU_DUPLICATE', 3));
  assert.ok(!has(W('Type,SKU,Name,SKU\nsimple,A,One,X\nsimple,A,Two,Y\n'), 'SKU_DUPLICATE'));
});

test('R2-4: a Published cell of only spaces is private, not draft', () => {
  assert.match(has(W('Type,SKU,Name,Published\nsimple,A,Mug, \n'), 'PUBLISHED_BLANK').message, /private/);
  assert.match(has(W('Type,SKU,Name,Published\nsimple,A,Mug,\n'), 'PUBLISHED_BLANK').message, /draft/);
});
