// Regression tests. One test per fixed bug.
import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, parseProducts, validate, parseCSV } from '../index.js';
import { parsePrice } from '../src/money.js';
import { CURRENT } from '../src/shopify-columns.js';

// Shopify file in the current template layout from row objects.
const shopifyCsv = (rows) => {
  const q = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  return [CURRENT.join(','), ...rows.map((r) => CURRENT.map((h) => q(r[h] ?? '')).join(','))].join('\n') + '\n';
};
const base = (o) => ({ Status: 'active', 'Published on online store': 'TRUE', 'Option1 name': 'Title', 'Option1 value': 'Default Title', Price: '10.00', 'Inventory tracker': 'shopify', 'Inventory quantity': '3', 'Continue selling when out of stock': 'DENY', 'Fulfillment service': 'manual', 'Requires shipping': 'TRUE', 'Charge tax': 'TRUE', 'Gift card': 'FALSE', ...o });
const table = (csv) => { const rows = parseCSV(csv.replace(/^﻿/, '')); return rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h, r[i]]))); };
const WOO_H = 'ID,Type,SKU,Name,Published,"Is featured?","Visibility in catalog","Short description",Description,"Date sale price starts","Date sale price ends","Tax status","In stock?",Stock,"Backorders allowed?","Weight (kg)","Sale price","Regular price",Categories,Tags,Images,Parent,Position,"Attribute 1 name","Attribute 1 value(s)","Attribute 1 visible","Attribute 1 global"';
const wooRow = (o) => {
  const cols = WOO_H.match(/("[^"]*"|[^,]+)/g).map((h) => h.replace(/"/g, ''));
  const q = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  return cols.map((h) => q(o[h] ?? '')).join(',');
};
const woo = (...rows) => [WOO_H, ...rows.map(wooRow)].join('\n') + '\n';
const wooBase = (o) => ({ Type: 'simple', Published: '1', 'Visibility in catalog': 'visible', 'Tax status': 'taxable', 'In stock?': '1', 'Regular price': '10', ...o });

test('F01: an active product hidden from the online store stays unpublished (Shopify to Shopify)', () => {
  const csv = shopifyCsv([base({ Title: 'Perfume', 'URL handle': 'perfume', 'Published on online store': 'FALSE' })]);
  const out = convert(csv, { to: 'shopify' });
  assert.equal(table(out.csv)[0]['Published on online store'], 'FALSE');
  assert.equal(table(out.csv)[0].Status, 'active');
});

test('F02: Shopify-only template columns survive Shopify to Shopify and are reported for WooCommerce', () => {
  const csv = shopifyCsv([base({ Title: 'Album', 'URL handle': 'album', 'Fulfillment service': 'music-man-fulfillment', 'Packed product length': '30', 'Packed product width': '20', 'Packed product height': '5', 'Packed product dimension unit': 'cm', 'Unit price total measure': '500.00', 'Unit price total measure unit': 'ml', 'Tax code': 'P0000000', 'Option1 Linked To': '' })]);
  const row = table(convert(csv, { to: 'shopify' }).csv)[0];
  assert.equal(row['Fulfillment service'], 'music-man-fulfillment');
  assert.equal(row['Packed product length'], '30');
  assert.equal(row['Unit price total measure'], '500.00');
  assert.equal(row['Tax code'], 'P0000000');
  const w = convert(csv, { to: 'woocommerce' });
  const info = w.issues.find((i) => i.code === 'SHOPIFY_FIELDS_DROPPED');
  assert.ok(info && /Fulfillment service/.test(info.message) && /Packed dimensions/.test(info.message) && /Unit prices/.test(info.message));
});

test('F03: the WooCommerce exporter apostrophe is removed from every cell', () => {
  const csv = woo(wooBase({ SKU: "'-SKU1", Name: "'-20% Off Bundle", Description: "'=Not a formula", Tags: "'@home, gift", Categories: "'+Plus Size" }));
  const p = parseProducts(csv).products[0];
  assert.equal(p.title, '-20% Off Bundle');
  assert.equal(p.descriptionHtml, '=Not a formula');
  assert.deepEqual(p.tags, ['@home', 'gift']);
  assert.equal(p.productType, '+Plus Size');
  assert.equal(p.variants[0].sku, '-SKU1');
});

test('F04: three-decimal prices are decimals, never thousands', () => {
  assert.equal(parsePrice('1.250').value, '1.25');
  const csv = woo(wooBase({ Name: 'Dates', 'Regular price': '4.500', 'Sale price': '3.750' }));
  const row = table(convert(csv, { to: 'shopify' }).csv)[0];
  assert.equal(row.Price, '3.75');
  assert.equal(row['Compare-at price'], '4.50');
  // The validator no longer suggests a thousands reading of 1,299.
  const v = validate(shopifyCsv([base({ Title: 'T', 'URL handle': 't', Price: '1,299' })]));
  const msg = v.issues.find((i) => i.code === 'PRICE_FORMAT').message;
  assert.doesNotMatch(msg, /Write it as 1299/);
});

test('F05: formula-like cells are escaped where WooCommerce unescapes them, and warned about elsewhere', () => {
  const csv = shopifyCsv([base({ Title: '=HYPERLINK("http://evil.example","x")', 'URL handle': 'evil', Tags: '@SUM(1+1)', SKU: '+cmd' })]);
  const s = convert(csv, { to: 'shopify' });
  assert.ok(s.issues.some((i) => i.code === 'FORMULA_CELLS'));
  assert.equal(table(s.csv)[0].SKU, '+cmd', 'Shopify file is not altered');
  const w = convert(csv, { to: 'woocommerce' });
  const r = table(w.csv)[0];
  assert.equal(r.SKU, "'+cmd");
  assert.equal(r.Tags, "'@SUM(1+1)");
  assert.ok(w.issues.some((i) => i.code === 'FORMULA_CELLS' && /Name/.test(i.message)));
  assert.ok(validate(csv).issues.some((i) => i.code === 'FORMULA_CELLS' && i.severity === 'warning'), 'the checker warns too');
  // And WooCommerce's own unescape (our parser) gets the original back.
  assert.equal(parseProducts(w.csv).products[0].variants[0].sku, '+cmd');
});

test('F06 / R2-B1: unreadable characters in the source stop the conversion, naming the line', () => {
  const csv = shopifyCsv([base({ Title: 'Mug', 'URL handle': 'mug' }), base({ Title: 'Caf\ufffd cr\ufffdme mug', 'URL handle': 'cafe' })]);
  assert.throws(() => convert(csv, { to: 'shopify' }), (e) => e.code === 'SOURCE_UNREADABLE_CHARACTERS' && /^Line 3 /.test(e.message) && /CSV UTF-8/.test(e.message));
});

test('F07: a product the checker would reject is left out, so the Shopify file always passes its own check', () => {
  const csv = shopifyCsv([
    base({ Title: 'Tee', 'URL handle': 'tee', 'Option1 name': 'Size', 'Option1 value': 'S', 'Option2 name': 'Color', 'Option2 value': 'Red' }),
    base({ 'URL handle': 'tee', 'Option1 name': '', 'Option1 value': 'M', 'Option2 value': '' }),
    base({ Title: 'Mug', 'URL handle': 'mug' }),
  ]);
  const out = convert(csv, { to: 'shopify' });
  assert.equal(out.check.ok, true);
  assert.equal(out.writtenProducts, 1);
  assert.ok(out.issues.some((i) => i.severity === 'error' && i.handle === 'tee' && /left out of the Shopify file/.test(i.message)));
});

test('F08: two products sharing a handle stay separate', () => {
  const csv = shopifyCsv([base({ Title: 'Blue Mug', 'URL handle': 'mug', Price: '12.00' }), base({ Title: 'Red Kettle', 'URL handle': 'mug', Price: '45.00' })]);
  const w = convert(csv, { to: 'woocommerce' });
  assert.equal(w.writtenProducts, 2);
  assert.ok(w.issues.some((i) => i.code === 'HANDLE_SHARED'));
  const s = convert(csv, { to: 'shopify' });
  assert.deepEqual(table(s.csv).map((r) => r['URL handle']), ['mug', 'mug-2']);
});

test('F08: the WooCommerce writer leaves out products with repeated option combinations', () => {
  const p = parseProducts(shopifyCsv([base({ Title: 'Cap', 'URL handle': 'cap', 'Option1 name': 'Size', 'Option1 value': 'One' }), base({ 'URL handle': 'cap', 'Option1 value': 'One', Price: '11.00' })])).products;
  assert.equal(p[0].variants.length, 2);
  const w = convert(shopifyCsv([base({ Title: 'Cap', 'URL handle': 'cap', 'Option1 name': 'Size', 'Option1 value': 'One' }), base({ 'URL handle': 'cap', 'Option1 value': 'One', Price: '11.00' })]), { to: 'woocommerce' });
  assert.equal(w.writtenProducts, 0);
  assert.ok(w.issues.some((i) => i.code === 'DUPLICATE_OPTIONS'));
});

test('F09: Image position decides the main image', () => {
  const csv = shopifyCsv([base({ Title: 'Lamp', 'URL handle': 'lamp', 'Product image URL': 'https://cdn.example.com/b.jpg', 'Image position': '2' }), { 'URL handle': 'lamp', 'Product image URL': 'https://cdn.example.com/a.jpg', 'Image position': '1' }]);
  assert.equal(parseProducts(csv).products[0].images[0].url, 'https://cdn.example.com/a.jpg');
});

test('F10: a chosen platform that does not match the file is refused; zero products is an error', () => {
  const csv = shopifyCsv([base({ Title: 'Lamp', 'URL handle': 'lamp' })]);
  assert.throws(() => convert(csv, { from: 'etsy', to: 'shopify' }), (e) => e.code === 'SOURCE_MISMATCH' && /Shopify/.test(e.message));
  assert.throws(() => convert(csv, { from: 'squarespace', to: 'woocommerce' }), (e) => e.code === 'SOURCE_MISMATCH');
  // A file of only gift cards says why nothing was converted.
  assert.throws(() => convert(shopifyCsv([base({ Title: 'Gift', 'URL handle': 'g', 'Gift card': 'TRUE' })]), { to: 'shopify' }), (e) => e.code === 'NO_PRODUCTS' && /gift card/.test(e.message));
  assert.throws(() => convert(CURRENT.join(',') + '\n', { to: 'woocommerce' }), (e) => e.code === 'NO_PRODUCTS' || e.code === 'NOT_CSV');
});

test('F11: negative prices are refused with a plain reason', () => {
  const csv = woo(wooBase({ Name: 'Refund', 'Regular price': '-5.00' }));
  const out = convert(csv, { to: 'shopify' });
  assert.ok(out.issues.some((i) => i.code === 'NEGATIVE_PRICE'));
  assert.equal(out.writtenProducts, 0);
  const v = validate(shopifyCsv([base({ Title: 'T', 'URL handle': 't', Price: '-5.00' })]));
  assert.match(v.issues.find((i) => i.code === 'PRICE_FORMAT').message, /negative/);
});

test('F12: Etsy variations stay buyable (untracked) instead of sold out', () => {
  const csv = 'TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,QUANTITY,TAGS,MATERIALS,IMAGE1,VARIATION 1 TYPE,VARIATION 1 NAME,VARIATION 1 VALUES,SKU\nTee,Soft,20.00,USD,444,tee,,https://i.etsystatic.com/a.jpg,Size,Size,"S,M",\n';
  const w = table(convert(csv, { to: 'woocommerce' }).csv).filter((r) => r.Type === 'variation');
  assert.ok(w.every((r) => r['In stock?'] === '1' && r.Stock === ''));
  const s = table(convert(csv, { to: 'shopify' }).csv);
  assert.ok(s.every((r) => r['Inventory tracker'] === ''));
});

test('F14: Shopify output over 15 MB is also split into parts with products kept whole', () => {
  const rows = [];
  const body = 'x'.repeat(4000);
  for (let i = 0; i < 4200; i++) rows.push(base({ Title: `Item ${i}`, 'URL handle': `item-${i}`, Description: body }));
  const out = convert(shopifyCsv(rows), { to: 'shopify' });
  assert.ok(out.parts && out.parts.length >= 2);
  const enc = new TextEncoder();
  for (const p of out.parts) assert.ok(enc.encode(p.csv).length <= 15 * 1024 * 1024);
  assert.equal(out.parts.reduce((n, p) => n + table(p.csv).length, 0), table(out.csv).length);
  assert.ok(out.issues.some((i) => i.code === 'FILE_SPLIT'));
  assert.equal(out.check.ok, true);
});

test('F15: a scheduled WooCommerce sale outside its dates uses the regular price, with a warning', () => {
  const csv = woo(wooBase({ Name: 'Kettle', 'Regular price': '100', 'Sale price': '60', 'Date sale price starts': '2999-01-01' }));
  const out = convert(csv, { to: 'shopify' });
  assert.equal(table(out.csv)[0].Price, '100.00');
  assert.ok(out.issues.some((i) => i.code === 'SALE_SCHEDULED'));
  const live = convert(woo(wooBase({ Name: 'Kettle', 'Regular price': '100', 'Sale price': '60', 'Date sale price starts': '2000-01-01', 'Date sale price ends': '2999-01-01' })), { to: 'shopify' });
  assert.equal(table(live.csv)[0].Price, '60.00');
});

test('F16: decimal grams and a compare-at price below the price get warnings', () => {
  const v = validate(shopifyCsv([base({ Title: 'T', 'URL handle': 't', 'Weight value (grams)': '150.5', 'Compare-at price': '5.00' })]));
  assert.ok(v.issues.some((i) => i.code === 'WEIGHT_DECIMAL' && i.severity === 'warning'));
  assert.ok(v.issues.some((i) => i.code === 'COMPARE_AT_LOW'));
});

test('F17: a hidden Wix variant is flagged', () => {
  const h = 'handleId,fieldType,name,description,productImageUrl,collection,sku,ribbon,price,surcharge,visible,discountMode,discountValue,inventory,weight,cost,productOptionName1,productOptionType1,productOptionDescription1';
  const csv = `${h}\nshoe,Product,Shoe,,,,,,100,,true,,,InStock,,,Size,DROP_DOWN,5;7\nshoe,Variant,,,,,s5,,,,true,,,3,,,,,5\nshoe,Variant,,,,,s7,,,,false,,,0,,,,,7\n`;
  const out = convert(csv, { to: 'shopify', sourceWeightUnit: 'kg' });
  assert.ok(out.issues.some((i) => i.code === 'WIX_HIDDEN_VARIANT'));
});

test('F23: a WooCommerce product hidden from the catalog is not published', () => {
  const csv = woo(wooBase({ Name: 'Hoodie with Pocket', 'Visibility in catalog': 'hidden' }));
  assert.equal(table(convert(csv, { to: 'shopify' }).csv)[0]['Published on online store'], 'FALSE');
  assert.equal(table(convert(csv, { to: 'woocommerce' }).csv)[0]['Visibility in catalog'], 'hidden');
  const cat = convert(woo(wooBase({ Name: 'Cap', 'Visibility in catalog': 'search' })), { to: 'shopify' });
  assert.ok(cat.issues.some((i) => i.code === 'VISIBILITY_NOT_KEPT'));
});

test('F24: image paths that are not full links are dropped with a warning, so the product still imports', () => {
  const out = convert(woo(wooBase({ Name: 'Cup', Images: '/wp-content/uploads/a.jpg, https://shop.example.com/b.jpg' })), { to: 'shopify' });
  assert.equal(out.writtenProducts, 1);
  assert.equal(out.check.ok, true);
  assert.equal(table(out.csv)[0]['Product image URL'], 'https://shop.example.com/b.jpg');
  assert.ok(out.issues.some((i) => i.code === 'IMAGE_NOT_LINK'));
});

test('F25: Shopify gift cards are left out of both outputs with a warning', () => {
  const csv = shopifyCsv([base({ Title: '$25 Gift Card', 'URL handle': 'gift', 'Gift card': 'TRUE' }), base({ Title: 'Mug', 'URL handle': 'mug' })]);
  for (const to of ['shopify', 'woocommerce']) {
    const out = convert(csv, { to });
    assert.equal(out.writtenProducts, 1, to);
    assert.ok(out.issues.some((i) => i.code === 'GIFT_CARD_SKIPPED'), to);
  }
});

test('F26: tracked stock with no quantity is warned about for WooCommerce', () => {
  const csv = shopifyCsv([base({ Title: 'Mug', 'URL handle': 'mug', 'Inventory quantity': '' })]);
  assert.ok(convert(csv, { to: 'woocommerce' }).issues.some((i) => i.code === 'STOCK_MISSING'));
});

test('F27: Matrixify-style Body HTML and Variant Weight are read', () => {
  const csv = 'Handle,Title,Body HTML,Variant Price,Variant Weight,Variant Weight Unit,Image Src,Option1 Name,Option1 Value\nmug,Mug,<p>Big</p>,10.00,2,kg,https://cdn.example.com/m.jpg,Title,Default Title\n';
  const p = parseProducts(csv).products[0];
  assert.equal(p.descriptionHtml, '<p>Big</p>');
  assert.equal(p.variants[0].weightGrams, 2000);
});

test('F28: WooCommerce virtual and downloadable products do not require shipping', () => {
  const out = convert(woo(wooBase({ Type: 'simple, downloadable, virtual', Name: 'Album' })), { to: 'shopify' });
  assert.equal(table(out.csv)[0]['Requires shipping'], 'FALSE');
  assert.ok(out.issues.some((i) => i.code === 'DOWNLOAD_FILES_NOT_MOVED'));
});

test('F29: Wix colour choices written as name:Label keep only the label', () => {
  const h = 'handleId,fieldType,name,description,productImageUrl,collection,sku,ribbon,price,surcharge,visible,discountMode,discountValue,inventory,weight,cost,productOptionName1,productOptionType1,productOptionDescription1,productOptionName2,productOptionType2,productOptionDescription2';
  const csv = `${h}\ntop,Product,U Cut Top,,,,,,50,,true,,,InStock,,,Color,COLOR,"black:Black;rgb(239,0,126):Pink",Size,DROP_DOWN,Note:Long\n`;
  const p = parseProducts(csv, { sourceWeightUnit: 'kg' }).products[0];
  assert.deepEqual(p.options[0].values, ['Black', 'Pink']);
  assert.deepEqual(p.options[1].values, ['Note:Long'], 'non-colour choices keep their text');
});

test('F30: a generated parent SKU never takes a real SKU used later in the file', () => {
  const csv = shopifyCsv([
    base({ Title: 'Mug', 'URL handle': 'mug', 'Option1 name': 'Color', 'Option1 value': 'Red', SKU: '' }),
    base({ 'URL handle': 'mug', 'Option1 value': 'Blue', SKU: '' }),
    base({ Title: 'Mug Classic', 'URL handle': 'mug-classic', SKU: 'mug' }),
  ]);
  const rows = table(convert(csv, { to: 'woocommerce' }).csv);
  assert.equal(rows.find((r) => r.Name === 'Mug Classic').SKU, 'mug');
  assert.notEqual(rows.find((r) => r.Type === 'variable').SKU, 'mug');
});

// ---- Batch 2 ----

test('R2-M1: a currency symbol with a dot and three digits reads as thousands; every such reading is reported', () => {
  assert.equal(parsePrice('€1.250').value, '1250.00');
  assert.equal(parsePrice('¥1.250').value, '1250.00');
  assert.ok(parsePrice('€1.250').note);
  assert.equal(parsePrice('1.250').value, '1.25');
  assert.ok(parsePrice('1.250').note && parsePrice('19.990').note);
  const out = convert(woo(wooBase({ Name: 'Tea', 'Regular price': '¥1.250' })), { to: 'shopify' });
  assert.equal(table(out.csv)[0].Price, '1250.00');
  assert.ok(out.issues.some((i) => i.code === 'PRICE_GUESSED'));
});

test('R2-M2: a later row with a slightly different title stays in the same product', () => {
  const csv = shopifyCsv([
    base({ Title: 'Linen Shirt', 'URL handle': 'shirt', 'Option1 name': 'Size', 'Option1 value': 'S' }),
    { 'URL handle': 'shirt', Title: 'Linen shirt', 'Option1 value': 'M', Price: '10.00', 'Fulfillment service': 'manual' },
    { 'URL handle': 'shirt', Title: 'Shirt - L', 'Option1 value': 'L', Price: '10.00', 'Fulfillment service': 'manual' },
  ]);
  const ps = parseProducts(csv).products;
  assert.equal(ps.length, 1);
  assert.deepEqual(ps[0].options[0], { name: 'Size', values: ['S', 'M', 'L'] });
  assert.ok(parseProducts(csv).issues.some((i) => i.code === 'TITLE_ON_VARIANT_ROW'));
});

test('R2-M3: WooCommerce Categories and Images are not escaped; tab cells are not escaped', () => {
  const csv = shopifyCsv([base({ Title: 'Cap', 'URL handle': 'cap', Type: '+Plus Size', Tags: '-sale', SKU: '\tcode' })]);
  const r = table(convert(csv, { to: 'woocommerce' }).csv)[0];
  assert.equal(r.Categories, '+Plus Size');
  assert.equal(r.Tags, "'-sale");
});

test('R2-M4: an unreadable sale date means the regular price, with a warning', () => {
  const out = convert(woo(wooBase({ Name: 'Kettle', 'Regular price': '100', 'Sale price': '60', 'Date sale price starts': '1/1/2027 0:00' })), { to: 'shopify' });
  assert.equal(table(out.csv)[0].Price, '100.00');
  assert.ok(out.issues.some((i) => i.code === 'SALE_SCHEDULED' && /could not be read/.test(i.message)));
});

test('R2-M5: a WooCommerce "selected columns" export is accepted when WooCommerce is chosen', () => {
  const csv = 'Type,Name,Regular price,Stock\nsimple,Mug,12.00,4\n';
  const out = convert(csv, { from: 'woocommerce', to: 'shopify' });
  assert.equal(out.writtenProducts, 1);
  assert.throws(() => convert('Title,Price\nMug,1\n', { from: 'woocommerce', to: 'shopify' }), (e) => e.code === 'SOURCE_MISMATCH');
});

// ---- Batch 3 ----

test('R3-2: $ and £ with a dot and three digits read as a decimal; €, ¥, kr, R$ as thousands; always warned', () => {
  for (const x of ['$1.250', '£1.250']) { assert.equal(parsePrice(x).value, '1.25', x); assert.ok(parsePrice(x).note, x); }
  for (const x of ['€1.250', '¥1.250', '1.250 kr', 'R$1.250']) { assert.equal(parsePrice(x).value, '1250.00', x); assert.ok(parsePrice(x).note, x); }
  assert.equal(parsePrice('$12.50').note, '');
});

test('R3-3: a separate product sharing a handle, with no first-row columns, is split instead of both being dropped', () => {
  const csv = shopifyCsv([base({ Title: 'Blue Mug', 'URL handle': 'mug', Price: '12.00' }), { Title: 'Red Kettle', 'URL handle': 'mug', 'Option1 value': 'Default Title', Price: '45.00', 'Fulfillment service': 'manual' }]);
  const out = convert(csv, { to: 'shopify' });
  assert.equal(out.writtenProducts, 2);
  assert.ok(out.issues.some((i) => i.code === 'HANDLE_SHARED'));
  assert.ok(!out.issues.some((i) => i.code === 'DUPLICATE_OPTIONS'));
  assert.deepEqual(table(out.csv).map((r) => [r.Title, r['Option1 value']]), [['Blue Mug', 'Default Title'], ['Red Kettle', 'Default Title']]);
});

test('R3-a: every checker message with a line says which line, header problems on line 1', () => {
  const v = validate(shopifyCsv([base({ Title: 'T', 'URL handle': 'bad tee', Status: 'live' })]).replace('Tags', 'tags'));
  assert.ok(v.issues.filter((i) => i.line != null).every((i) => /^Line \d+: /.test(i.message)));
  assert.match(v.issues.find((i) => i.code === 'HEADER_CASE').message, /^Line 1: Header "tags"/);
  assert.match(v.issues.find((i) => i.code === 'HANDLE_SPACES').message, /^Line 2: /);
});
