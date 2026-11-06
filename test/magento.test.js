import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, validate, detectSource, parseProducts, EngineError } from '../index.js';
import { parseAttributes, parseCategories, parseVariations, parseDate, dateOrder } from '../src/sources/magento.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}.csv`, import.meta.url), 'utf8');
const MG = fx('magento-export');
const HEAD = MG.split('\n')[0];
const H = HEAD.split(',');
const row = (o) => H.map((k) => o[k] ?? '').map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
const file = (...rows) => [HEAD, ...rows.map(row)].join('\n') + '\n';
const P = (o = {}) => ({ sku: 'MUG', attribute_set_code: 'Default', product_type: 'simple', name: 'Mug', product_online: '1', visibility: 'Catalog, Search', price: '10', qty: '5', is_in_stock: '1', manage_stock: '1', ...o });
const find = (r, c) => r.issues.filter((i) => i.code === c);
const codes = (r) => r.issues.map((i) => i.code);

test('magento: cell parsers follow Magento\'s export and import code', () => {
  assert.deepEqual(parseVariations('sku=A,color=Red,size=M|sku=B,color=Blue,size=L'), [{ sku: 'A', color: 'Red', size: 'M' }, { sku: 'B', color: 'Blue', size: 'L' }]);
  assert.deepEqual(parseAttributes('material=Steel,note=red, blue,size=L'), { material: 'Steel', note: 'red, blue', size: 'L' });
  assert.deepEqual(parseAttributes('material="Steel, brushed",quote="say ""hi"""'), { material: 'Steel, brushed', quote: 'say "hi"' });
  assert.deepEqual(parseCategories('Default Category/Gear/Bags,Default Category/Sale,Default Category,Default Category/A\\/B'), ['Gear > Bags', 'Sale', 'A/B']);
  assert.equal(parseDate('6/23/16').date, Date.UTC(2016, 5, 23));
  assert.equal(parseDate('23/6/16').date, Date.UTC(2016, 5, 23));
  assert.equal(parseDate('5/6/16').ambiguous, true);
  assert.equal(parseDate('5/6/16', 'dmy').date, Date.UTC(2016, 5, 5));
  assert.equal(parseDate('2016-06-23').date, Date.UTC(2016, 5, 23));
  assert.equal(parseDate('soon'), null);
});

test('magento: fixture products, configurable children before the parent, prices, stock, status', () => {
  const { products } = parseProducts(MG, { sourceWeightUnit: 'kg' });
  const by = (t) => products.find((p) => p.title === t);
  assert.equal(products.length, 5, 'children and the store-view row are not products; the bundle is left out');
  const tee = by('Trail Tee');
  assert.deepEqual(tee.options, [{ name: 'Color', values: ['Blue', 'Red'] }, { name: 'Size', values: ['S', 'M'] }]);
  assert.deepEqual(tee.variants.map((v) => [v.sku, v.price, v.inventoryQty, v.weightGrams]), [['TEE-BLU-S', '25.00', 8, 400], ['TEE-BLU-M', '25.00', 0, 400], ['TEE-RED-S', '27.00', 4, 400]]);
  assert.equal(tee.parentSku, 'TEE');
  assert.deepEqual(tee.categories, ['Apparel > Tees', 'Sale']);
  assert.equal(tee.handle, 'trail-tee');
  assert.equal(tee.seoTitle, 'Trail Tee | Ridge Outfitters');
  assert.deepEqual(tee.images, [], 'relative image paths are left out');
  const bottle = by('Steel Bottle');
  assert.deepEqual([bottle.variants[0].price, bottle.variants[0].compareAtPrice], ['24.00', '30.00']);
  assert.deepEqual([by('Trail Map').variants[0].price, by('Trail Map').variants[0].compareAtPrice], ['12.00', null]);
  const hike = by('Guided Hike Booking');
  assert.deepEqual([hike.variants[0].requiresShipping, hike.variants[0].inventoryTracked, hike.variants[0].weightGrams], [false, false, null]);
  assert.equal(by('Old Cap').status, 'draft');
  assert.ok(!products.some((p) => p.title === 'Gourde en acier'));
});

test('magento: everything not carried over is reported', () => {
  const r = convert(MG, { to: 'shopify' });
  for (const c of ['WEIGHT_UNIT_ASSUMED', 'MAGENTO_STORE_VIEW_ROWS', 'MAGENTO_TYPE_NOT_MOVED', 'MAGENTO_IMAGES_RELATIVE', 'MAGENTO_SALE_NOT_ACTIVE', 'MAGENTO_LINKS_NOT_MOVED', 'MAGENTO_ATTRIBUTES_DROPPED', 'MAGENTO_FIELDS_DROPPED', 'MAGENTO_NOT_IN_EXPORT']) assert.ok(codes(r).includes(c), c);
  assert.match(find(r, 'MAGENTO_STORE_VIEW_ROWS')[0].message, /^1 store-view row/);
  assert.match(find(r, 'MAGENTO_TYPE_NOT_MOVED')[0].message, /1 bundle product.*"Hiking Kit"/);
  assert.ok(!codes(convert(MG, { to: 'shopify', sourceWeightUnit: 'kg' })).includes('WEIGHT_UNIT_ASSUMED'));
});

test('magento: both targets pass our own checkers with no errors and no warnings', () => {
  for (const to of ['shopify', 'woocommerce']) for (const unit of [undefined, 'kg']) {
    const r = convert(MG, { to, sourceWeightUnit: unit });
    const v = validate(r.csv, { target: to });
    assert.equal(v.ok, true, `${to}: ${v.issues.filter((i) => i.severity === 'error').map((i) => i.code)}`);
    assert.deepEqual(v.issues.filter((i) => i.severity === 'warning').map((i) => i.code), [], to);
    assert.equal(r.writtenProducts, 5);
  }
});

test('magento: store-view rows never become products; a sku only on store-view rows is warned', () => {
  const r = parseProducts(file(P(), P({ store_view_code: 'de', name: 'Becher' }), P({ store_view_code: 'fr', name: 'Tasse' }), P({ sku: 'X', store_view_code: 'fr', name: 'Seul' })), {});
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].title, 'Mug');
  assert.match(find(r, 'MAGENTO_STORE_VIEW_ROWS')[0].message, /^3 store-view rows/);
  assert.match(find(r, 'MAGENTO_STORE_VIEW_ONLY')[0].message, /"X"/);
});

test('magento: special price date windows', () => {
  const at = (o) => parseProducts(file(P({ special_price: '8', ...o })), { today: '2026-11-06' });
  const v = (r) => [r.products[0].variants[0].price, r.products[0].variants[0].compareAtPrice];
  assert.deepEqual(v(at({})), ['8.00', '10.00']);
  assert.deepEqual(v(at({ special_price_from_date: '12/31/26' })), ['10.00', null]);
  assert.ok(find(at({ special_price_from_date: '12/31/26' }), 'MAGENTO_SALE_NOT_ACTIVE').length);
  assert.deepEqual(v(at({ special_price_to_date: '2026-11-06' })), ['8.00', '10.00'], 'the end day itself is still in the sale');
  assert.ok(find(at({ special_price_to_date: '11/30/26' }), 'MAGENTO_SALE_END_DATE').length);
  assert.deepEqual(v(at({ special_price_to_date: '2026-11-05' })), ['10.00', null]);
  const bad = at({ special_price_from_date: 'next week' });
  assert.deepEqual(v(bad), ['10.00', null]);
  assert.ok(find(bad, 'MAGENTO_SALE_DATE_UNREADABLE').length);
  const hi = at({ special_price: '12' });
  assert.deepEqual(v(hi), ['10.00', null]);
  assert.ok(find(hi, 'SALE_NOT_LOWER').length);
});

test('magento: stock rules: manage_stock 0, is_in_stock 0, fractions', () => {
  const s = (o) => parseProducts(file(P(o)), {});
  const q = (r) => [r.products[0].variants[0].inventoryTracked, r.products[0].variants[0].inventoryQty];
  assert.deepEqual(q(s({ manage_stock: '0' })), [false, null]);
  const out = s({ is_in_stock: '0', qty: '7' });
  assert.deepEqual(q(out), [true, 0]);
  assert.match(find(out, 'MAGENTO_OUT_OF_STOCK')[0].message, /qty 7/);
  const frac = s({ qty: '2.5000' });
  assert.deepEqual(q(frac), [true, 2]);
  assert.ok(find(frac, 'MAGENTO_STOCK_ROUNDED').length);
  assert.deepEqual(q(s({ qty: '100.0000' })), [true, 100]);
  assert.equal(find(s({ qty: '100.0000' }), 'MAGENTO_STOCK_ROUNDED').length, 0);
});

test('magento: visibility and product_online', () => {
  const st = (o) => parseProducts(file(P(o)), {});
  assert.equal(st({ product_online: '2' }).products[0].status, 'draft');
  assert.equal(st({ product_online: '' }).products[0].status, 'draft');
  assert.ok(find(st({ product_online: '' }), 'VISIBILITY_UNCLEAR').length);
  const lone = st({ visibility: 'Not Visible Individually' });
  assert.equal(lone.products[0].status, 'draft');
  assert.ok(find(lone, 'MAGENTO_NOT_VISIBLE').length);
});

test('magento: configurable edge cases: missing child, child visible on its own, labels from codes, full image links kept', () => {
  const c1 = P({ sku: 'C-1', name: 'C one', visibility: 'Catalog, Search', base_image: 'https://cdn.example.com/c1.jpg' });
  const parent = P({ sku: 'C', name: 'Cup', product_type: 'configurable', price: '', configurable_variations: 'sku=C-1,cup_size=Small|sku=C-2,cup_size=Large' });
  const r = parseProducts(file(parent, c1), {});
  assert.equal(r.products.length, 1);
  assert.deepEqual(r.products[0].options, [{ name: 'Cup size', values: ['Small'] }]);
  assert.equal(r.products[0].variants[0].imageUrl, 'https://cdn.example.com/c1.jpg');
  for (const c of ['MAGENTO_CHILD_MISSING', 'MAGENTO_CHILD_ALSO_VISIBLE', 'MAGENTO_OPTION_NAMED']) assert.ok(find(r, c).length, c);
  const none = parseProducts(file(parent, P({ sku: 'Z' })), {});
  assert.match(find(none, 'MAGENTO_TYPE_NOT_MOVED')[0].message, /none of the child products listed/);
});

test('magento: grouped, downloadable, gift card and custom options are named and counted', () => {
  // custom_options is in current Magento headers (Export/Product.php), not in the 2017 file our fixture copies.
  const H2 = [...H, 'custom_options'];
  const file2 = (...rows) => [H2.join(','), ...rows.map((o) => H2.map((k) => o[k] ?? '').map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))].join('\n') + '\n';
  const r = parseProducts(file2(P(), P({ sku: 'G', name: 'Set', product_type: 'grouped' }), P({ sku: 'D', name: 'Ebook', product_type: 'downloadable' }), P({ sku: 'GC', name: 'Card', product_type: 'giftcard' }), P({ sku: 'O', name: 'Engraved', custom_options: 'name=Text,type=field,required=0,price=5.0000,price_type=fixed,sku=' })), {});
  const t = find(r, 'MAGENTO_TYPE_NOT_MOVED').map((i) => i.message).join(' ');
  for (const w of ['1 grouped', '1 downloadable', '1 giftcard']) assert.ok(t.includes(w), w);
  assert.match(find(r, 'MAGENTO_CUSTOM_OPTIONS')[0].message, /"Engraved"/);
});

test('magento: Magento 1 exports are refused by name', () => {
  const m1 = 'sku,_store,_attribute_set,_type,_category,_root_category,_product_websites,name,price\nA,,Default,simple,Gear,Default Category,base,Mug,10\n';
  assert.equal(detectSource(m1).sourceId, null);
  assert.match(detectSource(m1).reason, /Magento 1/);
  assert.throws(() => convert(m1, { to: 'shopify', from: 'magento' }), (e) => e instanceof EngineError && e.code === 'UNSUPPORTED_LAYOUT');
});

test('magento: detection does not fire on the other sources, and they do not fire on it', () => {
  for (const f of ['etsy-listings', 'shopify-export', 'shopify-legacy', 'woocommerce-export', 'squarespace-export', 'wix-classic', 'wix-v3', 'bigcommerce-export', 'square-export']) {
    const d = detectSource(fx(f));
    assert.notEqual(d.sourceId, 'magento', f);
    assert.equal((d.candidates.find((c) => c.id === 'magento') || { score: 0 }).score, 0, f);
  }
  assert.equal(detectSource(MG).sourceId, 'magento');
  assert.ok(detectSource(MG).candidates.filter((c) => c.id !== 'magento').every((c) => c.score < 0.5));
});

// Review fixes.
test('review 1: out of stock with a blank qty is tracked at 0 and counted', () => {
  const r = parseProducts(file(P({ is_in_stock: '0', qty: '' })), {});
  assert.deepEqual([r.products[0].variants[0].inventoryTracked, r.products[0].variants[0].inventoryQty], [true, 0]);
  assert.match(find(r, 'MAGENTO_OUT_OF_STOCK')[0].message, /qty blank/);
});

test('review 2: a disabled child is left out and named; all children disabled makes a draft', () => {
  const parent = P({ sku: 'T', name: 'Tee', product_type: 'configurable', price: '', configurable_variations: 'sku=T-S,size=S|sku=T-M,size=M' });
  const r = parseProducts(file(P({ sku: 'T-S', visibility: 'Not Visible Individually' }), P({ sku: 'T-M', product_online: '2', visibility: 'Not Visible Individually' }), parent), {});
  assert.deepEqual(r.products[0].variants.map((v) => v.sku), ['T-S']);
  assert.equal(r.products[0].status, 'active');
  assert.match(find(r, 'MAGENTO_CHILD_DISABLED')[0].message, /Tee: T-M/);
  const off = parseProducts(file(P({ sku: 'T-S', product_online: '2' }), P({ sku: 'T-M', product_online: '2' }), parent), {});
  assert.equal(off.products[0].status, 'draft');
  assert.ok(find(off, 'MAGENTO_ALL_CHILDREN_DISABLED').length);
});

test('review 3: one date order per file from its unambiguous dates; no evidence means no sale, warned', () => {
  assert.equal(dateOrder(['10/11/2026', '20/11/2026']), 'dmy');
  assert.equal(dateOrder(['10/11/2026', '11/30/2026']), 'mdy');
  assert.equal(dateOrder(['10/11/2026', '12/11/2026']), null);
  assert.equal(dateOrder(['13/1/26', '1/13/26']), 'conflict');
  const at = (...o) => parseProducts(file(...o.map((x, i) => P({ sku: `S${i}`, name: `S${i}`, price: '20', special_price: '15', ...x }))), { today: '2026-11-06' });
  const v = (r, i = 0) => [r.products[i].variants[0].price, r.products[i].variants[0].compareAtPrice];
  // en_GB: 10 to 20 November, not started yet on 6 November.
  assert.deepEqual(v(at({ special_price_from_date: '10/11/2026', special_price_to_date: '20/11/2026' })), ['20.00', null]);
  // en_GB running sale 5 Nov to 6 Dec.
  assert.deepEqual(v(at({ special_price_from_date: '05/11/2026', special_price_to_date: '06/12/2026' }, { special_price_from_date: '25/12/2026' })), ['15.00', '20.00']);
  // de_DE with dots, decided by a day over 12 elsewhere in the file.
  assert.deepEqual(v(at({ special_price_from_date: '05.11.26', special_price_to_date: '06.12.26' }, { special_price_to_date: '31.12.26' })), ['15.00', '20.00']);
  // No unambiguous date anywhere: no sale, a warning naming it.
  const amb = at({ special_price_from_date: '10/11/2026', special_price_to_date: '12/11/2026' });
  assert.deepEqual(v(amb), ['20.00', null]);
  const w = find(amb, 'MAGENTO_SALE_DATE_UNREADABLE')[0];
  assert.equal(w.severity, 'warning');
  assert.match(w.message, /1 product has a special price whose dates could not be read.*day or the month.*Set the sale in the new store/);
  assert.equal(find(amb, 'MAGENTO_SALE_DATES_READ').length, 0);
});

test('review 4: an option value with a comma in configurable_variations is kept whole', () => {
  assert.deepEqual(parseVariations('sku=A,color=Red, dark,size=M|sku=B,color=Blue, light,size=M'), [{ sku: 'A', color: 'Red, dark', size: 'M' }, { sku: 'B', color: 'Blue, light', size: 'M' }]);
  const r = convert(file(P({ sku: 'A' }), P({ sku: 'B' }), P({ sku: 'T', name: 'Tee', product_type: 'configurable', price: '', configurable_variations: 'sku=A,color=Red, dark|sku=B,color=Red, light' })), { to: 'woocommerce' });
  assert.equal(r.writtenProducts, 1);
  assert.equal(validate(r.csv, { target: 'woocommerce' }).ok, true);
});

test('review 5 and 6: a child sold on its own says its page does not move; child skus match without case', () => {
  const r = parseProducts(file(P({ sku: 'TEE-S' }), P({ sku: 'T', name: 'Tee', product_type: 'configurable', price: '', configurable_variations: 'sku=tee-s,size=S' })), {});
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].variants[0].sku, 'tee-s');
  assert.match(find(r, 'MAGENTO_CHILD_ALSO_VISIBLE')[0].message, /own product page, URL key and description do not move/);
});

test('review 8 and 10: meta keywords are listed; a childless configurable message reads plainly', () => {
  assert.match(find(parseProducts(file(P({ meta_keywords: 'mug' })), {}), 'MAGENTO_FIELDS_DROPPED')[0].message, /meta keywords/);
  const r = parseProducts(file(P(), P({ sku: 'C', name: 'Cup', product_type: 'configurable', configurable_variations: 'sku=NONE,size=S' })), {});
  assert.match(find(r, 'MAGENTO_TYPE_NOT_MOVED')[0].message, /^1 configurable product was not converted, because none/);
});
