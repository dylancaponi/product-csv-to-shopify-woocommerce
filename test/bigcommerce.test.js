import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, validate, detectSource, parseProducts, parseCSV, EngineError } from '../index.js';
import { parseOptions } from '../src/sources/bigcommerce.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}.csv`, import.meta.url), 'utf8');
const BC = fx('bigcommerce-export');
const HEAD = BC.split('\n')[0];
const codes = (r) => r.issues.map((i) => i.code);
const row = (o) => HEAD.split(',').map((k) => k.replace(/^"|"$/g, '')).map((k) => (o[k] ?? '')).map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');

test('bigcommerce: options cell parses back-to-back and line-separated options, swatch colours stripped', () => {
  assert.deepEqual(parseOptions('Type=Rectangle|Name=Size|Value=XSType=Swatch|Name=Color|Value=Silver[#cccccc]').map((o) => [o.name, o.value]), [['Size', 'XS'], ['Color', 'Silver']]);
  assert.deepEqual(parseOptions('Type=Swatch|Name=Color|Value=Red-Blue[#FF5500;#C73C0F]\nType=Radio|Name=Size|Value=M').map((o) => [o.name, o.value]), [['Color', 'Red-Blue'], ['Size', 'M']]);
  assert.deepEqual(parseOptions(''), []);
});

test('bigcommerce: products, variants, prices, stock, images and status from the fixture', () => {
  const { products } = parseProducts(BC, { sourceWeightUnit: 'kg' });
  const by = (t) => products.find((p) => p.title === t);
  const towel = by('[Sample] Fog Linen Chambray Towel - Beige Stripe');
  assert.deepEqual(towel.options.map((o) => o.name), ['Size', 'Color']);
  assert.equal(towel.variants.length, 4);
  assert.equal(towel.variants[0].price, '49.00');
  assert.equal(towel.variants[0].inventoryTracked, false);
  assert.ok(towel.images[0].url.includes('/266/'), 'thumbnail image first');
  const jar = by('[Sample] 1 L Le Parfait Jar');
  assert.equal(jar.variants[0].price, '7.00');
  assert.equal(jar.variants[0].compareAtPrice, '9.95');
  assert.equal(jar.variants[0].costPerItem, '8.00');
  const beanie = by('Wool Beanie');
  assert.deepEqual(beanie.variants.map((v) => [v.sku, v.price, v.inventoryQty, v.weightGrams]), [['BEANIE-GRY', '24.00', 12, 250], ['BEANIE-RED', '26.00', 3, 300]]);
  assert.equal(beanie.variants[0].imageUrl, 'https://cdn.example.com/beanie-grey.jpg');
  assert.equal(beanie.images[0].url, 'https://cdn.example.com/beanie.jpg');
  assert.equal(beanie.images[0].alt, 'Grey beanie');
  assert.equal(beanie.seoTitle, 'Wool Beanie | Shop');
  assert.match(beanie.descriptionHtml, /<strong>merino<\/strong>/);
  assert.equal(by('Winter Mug (coming soon)').status, 'draft');
  assert.equal(by('Winter Mug (coming soon)').variants[0].inventoryQty, 40);
  assert.equal(by('Shop Gift Guide (PDF)').variants[0].requiresShipping, false);
});

test('bigcommerce: everything not carried over is reported', () => {
  const r = convert(BC, { to: 'shopify' });
  for (const c of ['WEIGHT_UNIT_ASSUMED', 'CATEGORIES_NOT_MOVED', 'BRAND_NOT_MOVED', 'CUSTOM_FIELDS_NOT_MOVED', 'VIDEO_NOT_MOVED', 'DOWNLOAD_FILES_NOT_MOVED', 'BIGCOMMERCE_FIELDS_DROPPED']) assert.ok(codes(r).includes(c), c);
  assert.ok(!codes(convert(BC, { to: 'shopify', sourceWeightUnit: 'kg' })).includes('WEIGHT_UNIT_ASSUMED'));
});

test('bigcommerce: both targets pass our own checkers with no errors', () => {
  for (const to of ['shopify', 'woocommerce']) {
    for (const unit of [undefined, 'kg', 'oz']) {
      const r = convert(BC, { to, sourceWeightUnit: unit });
      const v = validate(r.csv, { target: to });
      assert.equal(v.ok, true, `${to} ${unit}: ${v.issues.filter((i) => i.severity === 'error').map((i) => i.code)}`);
      assert.deepEqual(v.issues.filter((i) => i.severity === 'warning').map((i) => i.code), [], `${to} ${unit}`);
      assert.equal(r.writtenProducts, 5);
    }
  }
});

test('bigcommerce: product-level stock on a product with variants is not split, with a warning', () => {
  const t = [HEAD, row({ Item: 'Product', Name: 'Cap', Type: 'physical', 'Inventory Tracking': 'product', 'Current Stock': '9', Price: '10.00', 'Is Visible': 'TRUE' }),
    row({ Item: 'Variant', SKU: 'C-S', Options: 'Type=Radio|Name=Size|Value=S' }), row({ Item: 'Variant', SKU: 'C-M', Options: 'Type=Radio|Name=Size|Value=M' })].join('\n');
  const r = parseProducts(t, {});
  assert.ok(codes(r).includes('STOCK_NOT_SPLIT'));
  assert.ok(r.products[0].variants.every((v) => v.inventoryTracked === false));
  const bad = parseProducts([HEAD, row({ Item: 'Product', Name: 'Cap', Price: '10.00' }), row({ Item: 'Variant', SKU: 'X', Options: 'garbage' }), row({ Item: 'Rule', SKU: 'Y' })].join('\n'), {});
  assert.ok(codes(bad).includes('VARIANT_OPTIONS_UNREADABLE'));
  assert.ok(codes(bad).includes('SOURCE_ROW_SKIPPED'));
});

test('bigcommerce: the legacy Bulk Edit export is refused with a message naming it', () => {
  const legacy = 'Item Type,Product ID,Product Name,Product Type,Product Code/SKU,Brand Name,Option Set,Price,Product Visible?,Track Inventory,Current Stock Level,Category\nProduct,,Shirt,P,SH1,,,10.00,Y,none,0,Shop/Shirts\n';
  const d = detectSource(legacy);
  assert.equal(d.sourceId, null);
  assert.match(d.reason, /Bulk Edit/);
  assert.throws(() => convert(legacy, { to: 'shopify' }), (e) => e instanceof EngineError && e.code === 'UNSUPPORTED_LAYOUT' && /Item Type/.test(e.message));
  assert.throws(() => convert(legacy, { to: 'shopify', from: 'bigcommerce' }), (e) => e.code === 'UNSUPPORTED_LAYOUT');
});

test('bigcommerce: detection does not fire on the other sources, and they do not fire on it', () => {
  for (const f of ['etsy-listings', 'shopify-export', 'shopify-legacy', 'woocommerce-export', 'squarespace-export', 'wix-classic', 'wix-v3']) {
    const d = detectSource(fx(f));
    assert.notEqual(d.sourceId, 'bigcommerce', f);
    assert.ok((d.candidates.find((c) => c.id === 'bigcommerce') || { score: 0 }).score === 0, f);
  }
  assert.equal(detectSource(BC).sourceId, 'bigcommerce');
  assert.ok(detectSource(BC).candidates.filter((c) => c.id !== 'bigcommerce').every((c) => c.score <= 0.5));
  assert.equal(parseCSV(BC)[0][0], 'Item');
});
