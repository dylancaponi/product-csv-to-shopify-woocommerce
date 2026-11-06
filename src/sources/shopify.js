// Shopify product CSV (export or import file), current and legacy headers.
// Rows sharing a handle form one product; the first row carries the
// product-level fields; rows with only handle + image columns add images.
import { newProduct, newVariant, truthy, intOrNull } from '../model.js';
import { priceReader } from '../money.js';
import { normalizeUnit, toGrams } from '../units.js';
const lower0 = (hs) => new Set(hs.map((h) => h.toLowerCase()));
import { splitList, dedupe } from '../text.js';
import { resolveHeaders, CURRENT } from '../shopify-columns.js';

// Template columns the neutral model has no field for. They are kept as they
// are for Shopify-to-Shopify files and reported when another destination
// cannot take them.
export const PASS_VARIANT = ['Tax code', 'Unit price total measure', 'Unit price total measure unit', 'Unit price base measure', 'Unit price base measure unit', 'Packed product length', 'Packed product width', 'Packed product height', 'Packed product dimension unit', 'Fulfillment service'];
export const PASS_PRODUCT = CURRENT.filter((h) => /Linked To$|\(product\.metafields\.|^Google Shopping \//.test(h));
const LEGACY = { 'Tax code': ['Variant Tax Code'], 'Fulfillment service': ['Variant Fulfillment Service'], 'Option1 Linked To': ['Option1 LinkedTo'], 'Option2 Linked To': ['Option2 LinkedTo'], 'Option3 Linked To': ['Option3 LinkedTo'] };

export const ID = 'shopify';

export function detect(headers) {
  const m = resolveHeaders(headers);
  const keys = ['handle', 'title', 'description', 'opt1value', 'price', 'imageUrl', 'tracker', 'grams'];
  const hits = keys.filter((k) => m[k]).length;
  return { score: m.handle ? hits / keys.length : 0, reason: hits ? 'Shopify product CSV' : '' };
}

export function parse(headers, records, ctx) {
  const { issue } = ctx;
  const m = resolveHeaders(headers);
  // Matrixify exports use Body HTML and Variant Weight + Variant Weight Unit.
  if (!m.description && lower0(headers).has('body html')) m.description = headers.find((h) => h.toLowerCase() === 'body html');
  const mxWeight = !m.grams ? headers.find((h) => h.toLowerCase() === 'variant weight') : null;
  const get = (r, k) => (m[k] ? String(r[m[k]] ?? '').trim() : '');
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const colOf = (name) => [name, ...(LEGACY[name] || [])].map((n) => lower.get(n.toLowerCase())).find(Boolean);
  const passV = PASS_VARIANT.map((n) => [n, colOf(n)]).filter(([, h]) => h);
  const passP = PASS_PRODUCT.map((n) => [n, colOf(n)]).filter(([, h]) => h);
  const known = new Set([...CURRENT.map((h) => h.toLowerCase()), ...Object.values(m).map((h) => h.toLowerCase()), ...passV.map(([, h]) => h.toLowerCase()), ...passP.map(([, h]) => h.toLowerCase())]);
  const extraCols = headers.filter((h) => /metafield|^Variant Metafield|^Metafield:|^Price \/ |^Compare-at price \/ |^Included \/ /i.test(h) && !known.has(h.toLowerCase()));
  const raw = (r, list) => { const o = {}; for (const [n, h] of list) { const v = String(r[h] ?? '').trim(); if (v) o[n] = v; } return o; };
  const byHandle = new Map();
  const order = [];
  const readPrice = priceReader(issue);
  for (const r of records) {
    const line = r.__line;
    const handle = get(r, 'handle');
    if (!handle) { issue('warning', 'SOURCE_ROW_SKIPPED', 'Row has no handle, so it was skipped.', { line }); continue; }
    let p = byHandle.get(handle);
    const rowTitle = get(r, 'title');
    const norm = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();
    const looksFirst = ['opt1name', 'description', 'vendor', 'status'].some((k) => get(r, k));
    // A different title whose option values repeat a variant already in the
    // product cannot be part of it (the merge would only create a duplicate):
    // it is a separate product, even without first-row columns.
    const rowVals = [1, 2, 3].map((i) => get(r, `opt${i}value`)).join('\u0000');
    const repeats = !!(p && p.variants.some((v) => v.optionValues.join('\u0000') === rowVals));
    if (p && p.title && rowTitle && norm(rowTitle) !== norm(p.title) && !looksFirst && !repeats) {
      issue('warning', 'TITLE_ON_VARIANT_ROW', `Line ${line}: this row of "${p.title}" has a different title ("${rowTitle}"). It was kept as part of "${p.title}"; if it is really another product, give it its own handle.`, { line, handle });
    }
    if (p && p.title && rowTitle && norm(rowTitle) !== norm(p.title) && (looksFirst || repeats)) {
      // A different title on a row that also looks like a product's first
      // row (option names, description, vendor or status) under the same
      // handle is a different product (merged files). Keep it separate.
      issue('warning', 'HANDLE_SHARED', `Line ${line}: "${rowTitle}" uses the handle "${handle}", which "${p.title}" already uses. It was kept as a separate product with its own handle.`, { line, handle });
      p = null;
    }
    if (!p) {
      p = newProduct({ handle });
      p.source = { platform: ID, lines: [] };
      p._optNames = [];
      byHandle.set(handle, p);
      order.push(p);
    }
    p.source.lines.push(line);
    if (!p.title && get(r, 'title')) {
      p.title = get(r, 'title');
      p.descriptionHtml = m.description ? String(r[m.description] ?? '') : '';
      p.vendor = get(r, 'vendor');
      p.productType = get(r, 'type');
      p.tags = dedupe(splitList(get(r, 'tags')));
      p.seoTitle = get(r, 'seoTitle');
      p.seoDescription = get(r, 'seoDescription');
      const st = get(r, 'status').toLowerCase();
      p.status = ['active', 'draft', 'archived'].includes(st) ? st : (truthy(get(r, 'published')) === false ? 'draft' : 'active');
      // Published and Status are separate columns in Shopify's template:
      // an active product can be hidden from the online store.
      p.published = truthy(get(r, 'published'));
      p._giftCard = truthy(get(r, 'giftCard')) === true;
      p.shopifyRaw = raw(r, passP);
      const dropped = extraCols.filter((h) => String(r[h] ?? '').trim());
      if (dropped.length) p.shopifyDropped = dropped;
      if (get(r, 'category')) p.shopifyCategory = get(r, 'category');
    }
    for (let i = 1; i <= 3; i++) {
      const n = get(r, `opt${i}name`);
      if (n && !p._optNames[i - 1]) p._optNames[i - 1] = n;
    }
    const img = get(r, 'imageUrl');
    const pos = Number(get(r, 'imagePosition'));
    if (img && !p.images.some((x) => x.url === img)) p.images.push({ url: img, alt: get(r, 'imageAlt'), _pos: Number.isFinite(pos) && pos > 0 ? pos : Infinity });
    const optionValues = [1, 2, 3].map((i) => get(r, `opt${i}value`));
    const isVariant = optionValues.some(Boolean) || get(r, 'sku') || get(r, 'price');
    if (!isVariant) continue;
    const where = { line, handle, name: p.title || handle };
    const price = { value: readPrice(get(r, 'price'), { ...where, column: m.price }) };
    const compare = { value: readPrice(get(r, 'compareAt'), { ...where, column: m.compareAt, label: 'compare-at price' }) };
    const cost = { value: readPrice(get(r, 'cost'), { ...where, column: m.cost, label: 'cost per item' }) };
    let grams = get(r, 'grams') === '' ? null : Number(get(r, 'grams'));
    if (mxWeight && String(r[mxWeight] ?? '').trim() !== '') {
      const u = normalizeUnit(get(r, 'weightUnit'));
      const w = Number(String(r[mxWeight]).trim());
      grams = u && Number.isFinite(w) ? toGrams(w, u) : null;
      if (grams === null) issue('warning', 'WEIGHT_UNIT_UNKNOWN', `Line ${line}: the weight "${String(r[mxWeight]).trim()}" has no unit we recognise, so it was not carried over.`, { line, handle });
    }
    const policy = get(r, 'policy').toLowerCase();
    p.variants.push(newVariant({
      optionValues,
      sku: get(r, 'sku'),
      barcode: get(r, 'barcode'),
      price: price.value,
      compareAtPrice: compare.value,
      costPerItem: cost.value,
      inventoryQty: intOrNull(get(r, 'qty')),
      inventoryTracked: get(r, 'tracker') ? true : (m.tracker ? false : null),
      continueSellingOutOfStock: policy === 'continue' ? true : policy === 'deny' ? false : null,
      weightGrams: Number.isFinite(grams) ? grams : null,
      weightUnit: normalizeUnit(get(r, 'weightUnit')),
      requiresShipping: truthy(get(r, 'requiresShipping')),
      taxable: truthy(get(r, 'taxable')),
      imageUrl: get(r, 'variantImage'),
      shopifyRaw: raw(r, passV),
      _line: line,
    }));
  }
  const products = [];
  for (const p of order) {
    if (p._giftCard) {
      issue('warning', 'GIFT_CARD_SKIPPED', `"${p.title || p.handle}" is a gift card. Gift cards cannot be created by importing a product file, so it was left out; set up gift cards again in the new store.`, { handle: p.handle, line: p.source.lines[0] });
      continue;
    }
    delete p._giftCard;
    // Image position decides the order (the first is the main image); rows
    // without a position keep their file order after the numbered ones.
    p.images = p.images.map((x, i) => [x, i]).sort((a, b) => (a[0]._pos - b[0]._pos) || (a[1] - b[1])).map(([x]) => { delete x._pos; return x; });
    const names = p._optNames;
    delete p._optNames;
    // Shopify's placeholder for products without options.
    const isDefault = (names[0] === 'Title' || !names[0]) && p.variants.length <= 1 && (p.variants[0]?.optionValues[0] || '') === 'Default Title';
    const count = isDefault ? 0 : Math.max(names.filter(Boolean).length, ...p.variants.map((v) => v.optionValues.filter(Boolean).length), 0);
    p.options = [];
    for (let i = 0; i < count; i++) {
      p.options.push({ name: names[i] || `Option ${i + 1}`, values: dedupe(p.variants.map((v) => v.optionValues[i]).filter(Boolean)) });
    }
    for (const v of p.variants) { v.optionValues = v.optionValues.slice(0, count); delete v._line; }
    if (!p.variants.length) p.variants.push(newVariant());
    if (!p.title) issue('error', 'MISSING_TITLE', `Product "${p.handle}" has no Title on any row.`, { handle: p.handle, line: p.source.lines[0] });
    products.push(p);
  }
  return products;
}
