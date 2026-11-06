import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, validate, detectSource, parseProducts } from '../index.js';
import { splitCategories } from '../src/sources/square.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}.csv`, import.meta.url), 'utf8');
const SQ = fx('square-export');
const HEAD = SQ.split('\n')[0];
const H = HEAD.split(',');
const row = (o) => H.map((k) => o[k] ?? '').map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
const file = (...rows) => [HEAD, ...rows.map(row)].join('\n') + '\n';
const R = (o = {}) => ({ Token: 'T', 'Item Name': 'Tee', 'Variation Name': 'Regular', 'Square Online Item Visibility': 'visible', Archived: 'N', Price: '10.00', ...o });
const codes = (r) => r.issues.map((i) => i.code);
const find = (r, c) => r.issues.filter((i) => i.code === c);

test('square: categories split on commas and ">", with backslash escapes', () => {
  assert.deepEqual(splitCategories('Kitchen > Mugs, Gifts'), ['Kitchen > Mugs', 'Gifts']);
  assert.deepEqual(splitCategories('Bits\\, Bobs > A\\>B'), ['Bits, Bobs > A>B']);
  assert.deepEqual(splitCategories(''), []);
});

test('square: items, variations, options, prices, stock, weight and status from the fixture', () => {
  const { products } = parseProducts(SQ, {});
  const by = (t) => products.find((p) => p.title === t);
  const mug = by('Speckled Mug');
  assert.deepEqual(mug.options, [{ name: 'Size', values: ['Small', 'Large'] }]);
  assert.deepEqual(mug.variants.map((v) => [v.sku, v.price, v.costPerItem, v.inventoryQty, Math.round(v.weightGrams)]), [['MUG-S', '24.00', '9.50', 12, 340], ['MUG-L', '28.00', '11.00', 5, 454]]);
  assert.equal(mug.variants[0].barcode, '0123456789012');
  assert.deepEqual(mug.categories, ['Kitchen > Mugs', 'Gifts']);
  assert.equal(mug.productType, 'Mugs');
  assert.equal(mug.seoTitle, 'Speckled Mug | Clay Corner');
  assert.match(mug.descriptionHtml, /<strong>stoneware<\/strong>/);
  const candle = by('Cedar Candle');
  assert.equal(candle.handle, 'cedar-candle');
  assert.deepEqual([candle.variants[0].price, candle.variants[0].compareAtPrice], ['15.00', '18.00']);
  assert.equal(candle.descriptionHtml, '<p>Soy wax candle.</p><p>Burns for about 40 hours.</p>');
  const tee = by('Logo Tee');
  assert.deepEqual(tee.options, [{ name: 'Variation', values: ['Small', 'Medium'] }]);
  assert.equal(tee.variants[0].inventoryTracked, false);
  assert.equal(by('Pottery Class').variants[0].price, null);
  assert.equal(by('Pottery Class').variants[0].requiresShipping, false);
  assert.equal(by('Old Bowl').status, 'draft');
});

test('square: everything not carried over is reported', () => {
  const r = convert(SQ, { to: 'shopify' });
  for (const c of ['SQUARE_NO_IMAGES', 'SQUARE_ONLINE_SALE_PRICE', 'SQUARE_VARIABLE_PRICE', 'SQUARE_ARCHIVED', 'SQUARE_MODIFIERS_NOT_MOVED', 'SQUARE_TAXES_NOT_MOVED', 'SQUARE_LOCATION_STOCK', 'SQUARE_LOCATION_PRICE', 'SQUARE_ITEM_TYPE', 'SQUARE_OPTION_NAMED', 'SQUARE_FIELDS_DROPPED', 'MISSING_PRICE']) assert.ok(codes(r).includes(c), c);
  assert.ok(!codes(r).includes('WEIGHT_UNIT_ASSUMED'), 'unit comes from the Weight (lb) header');
  assert.match(find(r, 'SQUARE_LOCATION_STOCK')[0].message, /Main Street Shop/);
});

test('square: both targets pass our own checkers with no errors and no warnings', () => {
  for (const to of ['shopify', 'woocommerce']) {
    const r = convert(SQ, { to });
    const v = validate(r.csv, { target: to });
    assert.equal(v.ok, true, `${to}: ${v.issues.filter((i) => i.severity === 'error').map((i) => i.code)}`);
    assert.deepEqual(v.issues.filter((i) => i.severity === 'warning').map((i) => i.code), [], to);
    assert.equal(r.writtenProducts, to === 'shopify' ? 4 : 5, 'the variable-priced class is left out of Shopify only');
  }
});

test('square: two items sharing a name are not merged; a repeated variation name starts a new product', () => {
  const r = parseProducts(file(R({ Token: 'A', 'Item Name': 'Bowl' }), R({ Token: 'B', 'Item Name': 'Bowl' })), {});
  assert.equal(r.products.length, 2);
  assert.ok(find(r, 'SQUARE_SAME_NAME_ITEMS').length);
  const ok = parseProducts(file(R({ 'Variation Name': 'S' }), R({ 'Variation Name': 'M' })), {});
  assert.equal(ok.products.length, 1);
  assert.equal(find(ok, 'SQUARE_SAME_NAME_ITEMS').length, 0, 'no warning on an ordinary item');
});

test('square: online sale price at or above the price is not used silently', () => {
  const hi = parseProducts(file(R({ 'Online Sale Price': '12.00' })), {});
  assert.match(find(hi, 'SALE_NOT_LOWER')[0].message, /carries 10\.00/);
  assert.equal(hi.products[0].variants[0].price, '10.00');
  const none = parseProducts(file(R()), {});
  assert.equal(find(none, 'SQUARE_ONLINE_SALE_PRICE').length + find(none, 'SALE_NOT_LOWER').length, 0);
});

test('square: visibility: visible publishes, hidden is a draft, unavailable and odd values are drafts with a warning', () => {
  const st = (v) => parseProducts(file(R({ 'Square Online Item Visibility': v })), {});
  assert.equal(st('visible').products[0].status, 'active');
  assert.equal(st('hidden').products[0].status, 'draft');
  assert.equal(find(st('hidden'), 'VISIBILITY_UNCLEAR').length, 0);
  assert.ok(find(st('unavailable'), 'SQUARE_UNAVAILABLE').length);
  for (const v of ['', 'maybe']) { assert.equal(st(v).products[0].status, 'draft'); assert.equal(find(st(v), 'VISIBILITY_UNCLEAR').length, 1, v); }
});

test('square: an untouched single-location file raises no location or same-name warning', () => {
  const t = 'Token,Item Name,Variation Name,SKU,Description,Category,Price,Sellable,Stockable,Option Name 1,Option Value 1,Current Quantity Corner,New Quantity Corner,Stock Alert Enabled Corner,Stock Alert Count Corner\nA,Latte,Small,LAT-S,,Coffee,3.00,Y,Y,Size,Small,10,,N,\nB,Latte,Large,LAT-L,,Coffee,4.00,Y,Y,Size,Large,8,,N,\n';
  assert.equal(detectSource(t).sourceId, 'square');
  const r = parseProducts(t, {});
  assert.deepEqual(r.products[0].variants.map((v) => v.inventoryQty), [10, 8]);
  for (const c of ['SQUARE_LOCATION_STOCK', 'SQUARE_SAME_NAME_ITEMS', 'SQUARE_NEW_QUANTITY_IGNORED', 'SQUARE_LOCATION_DISABLED', 'VISIBILITY_UNCLEAR']) assert.equal(find(r, c).length, 0, c);
  assert.ok(find(r, 'WEIGHT_UNIT_ASSUMED').length === 0, 'no weight, no unit warning');
  assert.equal(r.products[0].status, 'active', 'no visibility column: active');
});

test('square: detection does not fire on the other sources, and they do not fire on it', () => {
  for (const f of ['etsy-listings', 'shopify-export', 'shopify-legacy', 'woocommerce-export', 'squarespace-export', 'wix-classic', 'wix-v3', 'bigcommerce-export']) {
    const d = detectSource(fx(f));
    assert.notEqual(d.sourceId, 'square', f);
    assert.equal((d.candidates.find((c) => c.id === 'square') || { score: 0 }).score, 0, f);
  }
  assert.equal(detectSource(SQ).sourceId, 'square');
  assert.ok(detectSource(SQ).candidates.filter((c) => c.id !== 'square').every((c) => c.score < 0.5));
  assert.equal(detectSource(SQ.replace(/^[^\n]*/, (h) => h.toLowerCase())).sourceId, 'square');
});

// Review fixes.
const F = { 'Shipping Enabled': 'Y', 'Self-serve Ordering Enabled': 'N', 'Delivery Enabled': 'N', 'Pickup Enabled': 'Y', 'Contains Alcohol': 'N' };
const S1 = 'Main Street Shop', S2 = 'Market Stall';

test('review 1 and 11: a second same-name item (its first row has the item switches filled) is its own product, named in a warning', () => {
  const r = parseProducts(file(R({ ...F, 'Item Name': 'Latte', 'Variation Name': 'Small', Description: 'Hot latte' }), R({ 'Item Name': 'Latte', 'Variation Name': 'Large' }),
    R({ ...F, 'Item Name': 'Latte', 'Variation Name': 'Iced', Description: 'Cold latte', 'Square Online Item Visibility': 'hidden' })), {});
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.products[0].options[0].values, ['Small', 'Large']);
  assert.equal(r.products[1].status, 'draft');
  assert.match(r.products[1].descriptionHtml, /Cold latte/);
  assert.match(find(r, 'SQUARE_SAME_NAME_ITEMS')[0].message, /"Latte"/);
  // The real-export shape (file A, "Side Sauce"): later variation rows leave the switches blank, so one product.
  const one = parseProducts(file(R({ ...F, 'Item Name': 'Side Sauce', 'Variation Name': 'Tzatziki', Description: 'Sauces' }), R({ 'Item Name': 'Side Sauce', 'Variation Name': 'Tahini' }), R({ 'Item Name': 'Side Sauce', 'Variation Name': 'House' })), {});
  assert.equal(one.products.length, 1);
  assert.equal(find(one, 'SQUARE_SAME_NAME_ITEMS').length, 0);
  assert.equal(find(parseProducts(SQ, {}), 'SQUARE_SAME_NAME_ITEMS').length, 0, 'the fixture is not flagged');
});

test('review 1: a file without the item switch columns says it joined same-name rows, by count and name', () => {
  const t = 'Token,Item Name,Variation Name,SKU,Description,Category,Price,Option Name 1,Option Value 1,Current Quantity Corner\nA,Latte,Small,L-S,,Coffee,3.00,,,1\nB,Latte,Large,L-L,,Coffee,4.00,,,2\nC,Tea,Regular,T,,Coffee,2.00,,,3\n';
  const w = find(parseProducts(t, {}), 'SQUARE_ITEM_BOUNDARY_UNKNOWN');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /1 product, "Latte"/);
  assert.equal(find(parseProducts(SQ, {}), 'SQUARE_ITEM_BOUNDARY_UNKNOWN').length, 0);
});

test('review 5: variation names differing only by case stay in one product', () => {
  const r = parseProducts(file(R({ ...F, 'Item Name': 'Soap', 'Variation Name': 'Lavender' }), R({ 'Item Name': 'Soap', 'Variation Name': 'Rose' }), R({ 'Item Name': 'Soap', 'Variation Name': 'lavender' })), {});
  assert.equal(r.products.length, 1);
});

test('review 4: two variations with the same option value fall back to the variation names and are kept', () => {
  const r = convert(file(R({ ...F, 'Item Name': 'Jar', 'Variation Name': 'M glass', 'Option Name 1': 'Size', 'Option Value 1': 'M' }), R({ 'Item Name': 'Jar', 'Variation Name': 'M plastic', 'Option Name 1': 'Size', 'Option Value 1': 'M' })), { to: 'shopify' });
  assert.equal(r.writtenProducts, 1);
  assert.ok(r.issues.some((i) => i.code === 'SQUARE_OPTIONS_INCOMPLETE' && /same option values/.test(i.message)));
  assert.equal(validate(r.csv, { target: 'shopify' }).ok, true);
});

test('review 6: a fractional stock count is rounded down, stays tracked, and is counted', () => {
  const r = parseProducts(file(R({ ...F, SKU: 'DEC', [`Current Quantity ${S1}`]: '2.5' })), {});
  assert.deepEqual([r.products[0].variants[0].inventoryQty, r.products[0].variants[0].inventoryTracked], [2, true]);
  assert.match(find(r, 'SQUARE_STOCK_ROUNDED')[0].message, /1 variation/);
  assert.equal(find(parseProducts(SQ, {}), 'SQUARE_STOCK_ROUNDED').length, 0);
});

test('review 7: stock comes from the first location where the variation is switched on, named in the note', () => {
  const r = parseProducts(file(R({ ...F, SKU: 'X', [`Enabled ${S1}`]: 'N', [`Current Quantity ${S1}`]: '0', [`Enabled ${S2}`]: 'Y', [`Current Quantity ${S2}`]: '25' })), {});
  assert.equal(r.products[0].variants[0].inventoryQty, 25);
  assert.match(find(r, 'SQUARE_LOCATION_STOCK')[0].message, /"Market Stall" for 1 variation/);
});

test('review 3: a variable price with a location price says the location price was not used', () => {
  const r = parseProducts(file(R({ ...F, Price: '', [`Price ${S1}`]: '22.00' })), {});
  assert.match(find(r, 'SQUARE_VARIABLE_PRICE')[0].message, /price at a location/);
});

test('review 9 and 10: a header-only file says there are no items; the no-images note is information', () => {
  assert.throws(() => convert(HEAD + '\n', { to: 'shopify' }), (e) => e.code === 'NO_PRODUCTS' && !/images/.test(e.message));
  const n = find(convert(SQ, { to: 'shopify' }), 'SQUARE_NO_IMAGES');
  assert.equal(n.length, 1);
  assert.equal(n[0].severity, 'info');
});

// Round 2, "Round 2").
test('R2-1: switches filled on every row of an item (fill-down) do not split it; the file says grouping fell back', () => {
  const r = parseProducts(file(R({ ...F, 'Item Name': 'Tee', 'Variation Name': 'S', 'Option Name 1': 'Size', 'Option Value 1': 'S' }), R({ ...F, 'Item Name': 'Tee', 'Variation Name': 'M', 'Option Name 1': 'Size', 'Option Value 1': 'M' }),
    R({ ...F, 'Item Name': 'Cap', 'Variation Name': 'Regular' })), {});
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.products[0].options, [{ name: 'Size', values: ['S', 'M'] }]);
  assert.match(find(r, 'SQUARE_ITEM_BOUNDARY_UNKNOWN')[0].message, /also filled on later variation rows/);
  assert.equal(find(r, 'SQUARE_SAME_NAME_ITEMS').length, 0);
  // Two real same-name items (no shared option name) still split.
  const two = parseProducts(file(R({ ...F, 'Item Name': 'Latte', 'Variation Name': 'Small' }), R({ ...F, 'Item Name': 'Latte', 'Variation Name': 'Iced' })), {});
  assert.equal(two.products.length, 2);
  assert.equal(find(two, 'SQUARE_ITEM_BOUNDARY_UNKNOWN').length, 0);
});

test('R2-2: the stock-rounding note names the item and variation; negative fractions round toward zero', () => {
  const r = parseProducts(file(R({ ...F, 'Item Name': 'Flour', 'Variation Name': 'Regular', [`Current Quantity ${S1}`]: '2.9' }), R({ ...F, 'Item Name': 'Rice', 'Variation Name': 'Regular', [`Current Quantity ${S1}`]: '-0.5' })), {});
  assert.deepEqual(r.products.map((p) => p.variants[0].inventoryQty), [2, 0]);
  assert.match(find(r, 'SQUARE_STOCK_ROUNDED')[0].message, /"Flour \(Regular\)", "Rice \(Regular\)"/);
});

test('R2-3: variation names differing only by case are numbered and kept in the WooCommerce file', () => {
  const t = file(R({ ...F, 'Item Name': 'Soap', 'Variation Name': 'Lavender' }), R({ 'Item Name': 'Soap', 'Variation Name': 'Rose' }), R({ 'Item Name': 'Soap', 'Variation Name': 'lavender' }));
  const r = convert(t, { to: 'woocommerce' });
  assert.equal(r.writtenProducts, 1);
  assert.ok(r.issues.some((i) => i.code === 'SQUARE_VARIATION_RENAMED' && /"lavender \(2\)"/.test(i.message)));
  assert.equal(validate(r.csv, { target: 'woocommerce' }).ok, true);
  assert.equal(convert(t, { to: 'shopify' }).writtenProducts, 1);
});
