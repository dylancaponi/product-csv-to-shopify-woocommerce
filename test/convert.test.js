import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, detectSource, parseProducts, writeProducts, parseCSV } from '../index.js';
import { PAIRS, FIXTURES } from '../test-support/pairs.mjs';
import { CURRENT } from '../src/shopify-columns.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}.csv`, import.meta.url), 'utf8');
const gold = (n) => readFileSync(new URL(`../golden/${n}`, import.meta.url), 'utf8');
const codes = (issues) => issues.map((i) => i.code);
const rowsOf = (csv) => { const rows = parseCSV(csv); const h = rows[0]; return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };

const EXPECT_SOURCE = { 'etsy-listings': 'etsy', 'shopify-export': 'shopify', 'shopify-legacy': 'shopify', 'woocommerce-export': 'woocommerce', 'squarespace-export': 'squarespace', 'wix-classic': 'wix', 'wix-v3': 'wix-v3' };

for (const f of FIXTURES) {
  test(`detect: ${f} -> ${EXPECT_SOURCE[f]}`, () => {
    const d = detectSource(fx(f));
    assert.equal(d.sourceId, EXPECT_SOURCE[f]);
    assert.ok(d.confidence >= 0.75, `confidence ${d.confidence}`);
  });
}

test('detect: unknown CSV and non-CSV inputs give a plain reason', () => {
  assert.equal(detectSource('Date,Amount\n2024-01-01,5\n').sourceId, null);
  assert.match(detectSource('PK\u0003\u0004xxxx').reason, /Excel/);
  assert.match(detectSource('').reason, /empty/);
});

for (const { fixture, to } of PAIRS) {
  test(`golden: ${fixture} -> ${to}`, () => {
    const r = convert(fx(fixture), { to });
    assert.equal(r.csv, gold(`${fixture}.to-${to}.csv`));
    assert.deepEqual(r.issues.map((i) => `${i.severity} ${i.code}`), JSON.parse(gold(`${fixture}.to-${to}.issues.json`)));
    for (const i of r.issues) {
      assert.ok(['error', 'warning', 'info'].includes(i.severity));
      assert.ok(i.message && !i.message.includes('\u2014'), 'messages are plain text with no em dashes');
    }
    if (to === 'shopify') {
      assert.equal(r.check.summary.error, 0, JSON.stringify(r.check.issues.filter((i) => i.severity === 'error')));
      assert.ok(r.csv.startsWith(CURRENT.join(',') + '\n'), 'Shopify header is the official template header');
      assert.ok(!r.csv.startsWith('﻿'), 'no BOM for Shopify');
    } else {
      assert.ok(r.csv.startsWith('﻿ID,Type,SKU,Name,'), 'WooCommerce file has a BOM and exporter labels');
    }
  });
}

test('etsy: variations become every combination, with the limitation stated', () => {
  const { products, issues } = parseProducts(fx('etsy-listings'));
  const tee = products.find((p) => p.title === 'Linen Tee');
  assert.deepEqual(tee.options, [{ name: 'Size', values: ['S', 'M', 'L'] }, { name: 'Color', values: ['Sand / Ivory', 'Black'] }]);
  assert.equal(tee.variants.length, 6);
  assert.ok(tee.variants.every((v) => v.price === '38.50' && v.sku === '' && v.inventoryQty === null));
  const w = issues.find((i) => i.code === 'ETSY_VARIATIONS_NO_DETAIL' && i.message.includes('Linen Tee'));
  assert.match(w.message, /one price, one quantity and one SKU per listing/);
  assert.match(w.message, /TEE-BASE/);
  assert.equal(w.rule.id, 'etsy.variations');
  // Option name falls back to VARIATION TYPE when NAME is blank.
  assert.equal(products.find((p) => p.title.includes('Matcha')).options[0].name, 'Color');
});

test('etsy: plain-text description becomes safe HTML; non-ASCII kept; handles unique', () => {
  const { products } = parseProducts(fx('etsy-listings'));
  assert.equal(products[0].descriptionHtml, '<p>Hand-thrown stoneware mug.<br>Glazed in &quot;Sand&quot; &amp; dishwasher safe, microwave safe.</p><p>Each mug is unique, so colour may vary.</p>');
  assert.equal(products[0].handle, 'creme-brulee-ceramic-mug-12-oz');
  assert.equal(products[3].handle, 'creme-brulee-ceramic-mug-12-oz-2');
  assert.equal(products[2].title, '日本茶 Matcha Bowl');
  assert.equal(products[2].handle, 'matcha-bowl');
  assert.equal(products[0].images.length, 3);
});

test('shopify writer: first row carries product fields, then variants, then one row per extra image', () => {
  const rows = rowsOf(convert(fx('shopify-export'), { to: 'shopify' }).csv);
  const tee = rows.filter((r) => r['URL handle'] === 'garment-dyed-tee');
  assert.equal(tee.length, 6);
  assert.equal(tee[0].Title, 'Garment Dyed Tee');
  assert.ok(tee.slice(1).every((r) => r.Title === '' && r.Description === '' && r.Vendor === '' && r.Tags === ''));
  assert.deepEqual(tee.slice(4).map((r) => [r['Product image URL'], r['Image position'], r.SKU, r.Price]), [
    ['https://cdn.example.com/tee-white.jpg', '2', '', ''], ['https://cdn.example.com/tee-detail.jpg', '3', '', '']]);
  assert.equal(tee[0]['Option1 name'], 'Size');
  assert.equal(tee[1]['Option1 name'], '');
  assert.equal(tee[1]['Continue selling when out of stock'], 'CONTINUE');
  const wrap = rows.find((r) => r['URL handle'] === 'gift-wrap');
  assert.deepEqual([wrap['Option1 name'], wrap['Option1 value'], wrap.Status, wrap['Published on online store'], wrap['Charge tax']], ['Title', 'Default Title', 'draft', 'FALSE', 'FALSE']);
});

test('shopify legacy headers are read and written in the current layout', () => {
  const { products } = parseProducts(fx('shopify-legacy'));
  assert.equal(products[0].variants.length, 2);
  assert.equal(products[0].variants[0].barcode, '012345678905');
  assert.equal(products[0].descriptionHtml, '<p>Merino wool.</p>');
  const rows = rowsOf(convert(fx('shopify-legacy'), { to: 'shopify' }).csv);
  assert.equal(rows[0]['Variant Barcodes'], '012345678905');
  assert.equal(rows[1]['Option1 value'], 'Navy');
});

test('round trip: Shopify -> model -> Shopify is stable', () => {
  const once = convert(fx('shopify-export'), { to: 'shopify' }).csv;
  const twice = convert(once, { to: 'shopify' }).csv;
  assert.equal(twice, once);
});

test('round trip: WooCommerce output parses back to the same products', () => {
  const a = parseProducts(fx('shopify-export'));
  const woo = writeProducts(a.products, 'woocommerce').csv;
  const b = parseProducts(woo, { source: 'woocommerce' });
  assert.equal(b.products.length, a.products.length);
  const strip = (p) => ({ title: p.title, options: p.options, desc: p.descriptionHtml, variants: p.variants.map((v) => [v.optionValues, v.sku, v.price, v.compareAtPrice, v.inventoryQty, Math.round(v.weightGrams ?? -1)]) });
  assert.deepEqual(b.products.map(strip), a.products.map(strip));
});

test('woocommerce source: variations by SKU and id:N, sale prices, escaped commas, literal \\n, weights in lbs', () => {
  const { products, issues } = parseProducts(fx('woocommerce-export'));
  assert.deepEqual(products.map((p) => p.title), ['Soy Candle "Fig & Cedar"', 'Café Hoodie', 'Candle Duplicate SKU']);
  const candle = products[0];
  assert.deepEqual(candle.tags, ['candle', 'soy, natural']);
  assert.equal(candle.descriptionHtml, '<p>Burns 40 hours.</p>\n<p>Cotton wick, 8 oz.</p>');
  assert.equal(Math.round(candle.variants[0].weightGrams), 340);
  const hoodie = products[1];
  assert.equal(hoodie.variants.length, 3);
  assert.deepEqual(hoodie.variants[0].optionValues, ['Red', 'S']);
  assert.equal(hoodie.variants[0].price, '45.00');
  assert.equal(hoodie.variants[0].compareAtPrice, '55.00');
  assert.equal(hoodie.variants[1].continueSellingOutOfStock, true);
  assert.deepEqual(hoodie.variants[2].optionValues, ['Blue', 'S'], 'Parent id:200 resolves');
  assert.equal(products[2].variants[0].price, '1234.50', 'European price string');
  assert.ok(codes(issues).includes('UNSUPPORTED_TYPE'));
  assert.ok(codes(issues).includes('VARIATION_ORPHAN'));
});

test('woocommerce writer: duplicate SKUs cleared, parent SKU added, commas escaped', () => {
  const r = convert(fx('woocommerce-export'), { to: 'woocommerce' });
  assert.ok(codes(r.issues).includes('DUPLICATE_SKU_CLEARED'));
  const rows = rowsOf(r.csv.slice(1));
  const skus = rows.map((x) => x.SKU).filter(Boolean);
  assert.equal(new Set(skus).size, skus.length);
  assert.equal(rows[0].Tags, 'candle, soy\\, natural');
  const s = convert(fx('etsy-listings'), { to: 'woocommerce' });
  const srows = rowsOf(s.csv.slice(1));
  const vars = srows.filter((x) => x.Type === 'variation' && x.Parent === 'linen-tee');
  assert.equal(vars.length, 6);
  assert.equal(srows.find((x) => x.SKU === 'linen-tee').Type, 'variable');
  assert.equal(vars[0]['Attribute 2 value(s)'], 'Sand / Ivory');
});

test('woocommerce writer: weight unit option changes header and values', () => {
  const { products } = parseProducts(fx('shopify-export'));
  const csv = writeProducts(products, 'woocommerce', { wooWeightUnit: 'lb' }).csv;
  assert.ok(csv.includes('Weight (lbs)'));
  const rows = rowsOf(csv.slice(1));
  assert.equal(rows[1]['Weight (lbs)'], '0.399');
});

test('squarespace: variant rows grouped, sale price, Unlimited stock, over-limit options rejected for Shopify only', () => {
  const { products } = parseProducts(fx('squarespace-export'));
  const tote = products[0];
  assert.equal(tote.variants.length, 3);
  assert.equal(tote.variants[0].price, '24.00');
  assert.equal(tote.variants[0].compareAtPrice, '30.00');
  assert.equal(tote.variants[1].inventoryTracked, false);
  assert.equal(tote.variants[2].price, '32.00', '$32.00 cleaned');
  assert.equal(tote.images.length, 2);
  assert.equal(tote.categories[0], 'bags > totes');
  const sh = convert(fx('squarespace-export'), { to: 'shopify' });
  const err = sh.issues.find((i) => i.code === 'TOO_MANY_OPTIONS');
  assert.match(err.message, /4 options/);
  assert.equal(err.rule.id, 'shopify.options-max');
  assert.ok(!sh.csv.includes('custom-sneaker'));
  const woo = convert(fx('squarespace-export'), { to: 'woocommerce' });
  assert.ok(woo.csv.includes('Attribute 4 name'));
  assert.ok(!codes(woo.issues).includes('TOO_MANY_OPTIONS'));
});

test('squarespace: weight unit is assumed with a warning unless given', () => {
  const a = parseProducts(fx('squarespace-export'));
  assert.ok(codes(a.issues).includes('WEIGHT_UNIT_ASSUMED'));
  assert.equal(Math.round(a.products[0].variants[0].weightGrams), 680);
  const b = parseProducts(fx('squarespace-export'), { sourceWeightUnit: 'kg' });
  assert.ok(!codes(b.issues).includes('WEIGHT_UNIT_ASSUMED'));
  assert.equal(b.products[0].variants[0].weightGrams, 1500);
});

test('wix classic: surcharge, percent discount, colour choices, media IDs to URLs', () => {
  const { products, issues } = parseProducts(fx('wix-classic'), { sourceWeightUnit: 'kg' });
  const b = products[0];
  assert.deepEqual(b.options, [{ name: 'Color', values: ['Black', 'White'] }, { name: 'Size', values: ['Kids', 'Adult'] }]);
  assert.deepEqual(b.variants.map((v) => [v.sku, v.price, v.compareAtPrice]), [
    ['BEA-BLK-K', '18.00', '20.00'], ['BEA-BLK-A', '20.25', '22.50'], ['BEA-WHT-K', '18.00', '20.00'], ['BEA-WHT-A', '20.25', '22.50']]);
  assert.equal(b.images[0].url, 'https://static.wixstatic.com/media/abc123_0001~mv2.jpg');
  assert.deepEqual(b.categories, ['Hats']);
  assert.equal(products[1].status, 'draft');
  assert.ok(codes(issues).includes('WIX_MEDIA_URLS'));
});

test('wix new catalog: VARIANT rows with own prices, MEDIA rows as images in order', () => {
  const { products } = parseProducts(fx('wix-v3'), { sourceWeightUnit: 'kg' });
  const n = products[0];
  assert.deepEqual(n.options, [{ name: 'Color', values: ['Grey', 'White'] }]);
  assert.deepEqual(n.variants.map((v) => [v.sku, v.price, v.compareAtPrice, v.inventoryQty]), [['NAP-GRY', '32.00', '40.00', 6], ['NAP-WHT', '32.00', null, 0]]);
  assert.deepEqual(n.images.map((i) => i.alt), ['Grey napkins', '']);
  assert.equal(products[1].variants[0].price, '14.00');
});

test('shopify writer: limits and rejections', () => {
  const base = parseProducts(fx('shopify-export')).products[1];
  const many = { ...base, handle: 'many', options: [{ name: 'N', values: [] }], variants: [] };
  for (let i = 0; i < 2049; i++) { many.options[0].values.push(String(i)); many.variants.push({ ...base.variants[0], optionValues: [String(i)], sku: '' }); }
  const dup = { ...base, handle: 'dup', options: [{ name: 'Size', values: ['S'] }], variants: [{ ...base.variants[0], optionValues: ['S'] }, { ...base.variants[0], optionValues: ['S'] }] };
  const noPrice = { ...base, handle: 'np', variants: [{ ...base.variants[0], price: null }] };
  const tags = { ...base, handle: 'tags', tags: Array.from({ length: 260 }, (_, i) => `t${i}`) };
  const r = writeProducts([many, dup, noPrice, tags], 'shopify');
  assert.deepEqual(codes(r.issues), ['TOO_MANY_VARIANTS', 'DUPLICATE_OPTIONS', 'MISSING_PRICE', 'TAGS_TRUNCATED']);
  assert.equal(r.writtenProducts, 1);
});
