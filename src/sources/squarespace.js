// Squarespace Commerce product export. Headers confirmed from real exports
// (32 columns, or 34 with GTIN and MPN after SKU) and the help center:
// https://support.squarespace.com/hc/en-us/articles/115000378108
// https://support.squarespace.com/hc/en-us/articles/360000694948
// First row of a product = product fields + first variant. Following rows
// have a blank Product ID and carry only variant fields.
import { newProduct, newVariant, intOrNull, slugify } from '../model.js';
import { priceReader } from '../money.js';
import { toGrams } from '../units.js';
import { splitList, dedupe } from '../text.js';

export const ID = 'squarespace';
const SIG = ['Product ID [Non Editable]', 'Variant ID [Non Editable]', 'Product Type [Non Editable]', 'Product URL', 'Option Name 1', 'Hosted Image URLs', 'On Sale', 'Visible'];

export function detect(headers) {
  const set = new Set(headers);
  const hits = SIG.filter((h) => set.has(h)).length;
  return { score: hits / SIG.length, reason: hits ? 'Squarespace product export' : '' };
}

export function parse(headers, records, ctx) {
  const { issue, options } = ctx;
  const g = (r, h) => String(r[h] ?? '').trim();
  const unit = options.sourceWeightUnit || null;
  let weightWarned = false;
  const products = [];
  let p = null;
  for (const r of records) {
    const line = r.__line;
    const isProduct = g(r, 'Product ID [Non Editable]') !== '' || g(r, 'Title') !== '';
    if (isProduct) {
      const type = g(r, 'Product Type [Non Editable]').toUpperCase();
      if (type && type !== 'PHYSICAL') {
        issue('warning', 'UNSUPPORTED_TYPE', `"${g(r, 'Title')}" is a ${type.toLowerCase()} product; it was converted as a product without shipping.`, { line });
      }
      p = newProduct({ title: g(r, 'Title') });
      p.source = { platform: ID, lines: [line] };
      p.handle = slugify(g(r, 'Product URL') || g(r, 'Title'));
      p.descriptionHtml = String(r.Description ?? '');
      p.status = g(r, 'Visible').toLowerCase() === 'no' ? 'draft' : 'active';
      p.tags = dedupe(splitList(g(r, 'Tags')));
      p.categories = splitList(g(r, 'Categories')).map((c) => c.replace(/^\/+/, '').split('/').join(' > '));
      p.images = g(r, 'Hosted Image URLs').split(/\s+/).filter(Boolean).map((url) => ({ url, alt: '' }));
      p._names = [];
      p._service = type === 'SERVICE';
      products.push(p);
    } else if (!p) {
      issue('warning', 'SOURCE_ROW_SKIPPED', 'A variant row came before any product row, so it was skipped.', { line });
      continue;
    } else p.source.lines.push(line);
    const optionValues = [];
    for (let n = 1; n <= 6; n++) {
      const name = g(r, `Option Name ${n}`);
      const val = g(r, `Option Value ${n}`);
      if (name && !p._names[n - 1]) p._names[n - 1] = name;
      optionValues[n - 1] = val;
    }
    const readPrice = priceReader(issue);
    const price = { value: readPrice(g(r, 'Price'), { line, name: p.title, column: 'Price' }) };
    const sale = { value: g(r, 'On Sale').toLowerCase() === 'yes' ? readPrice(g(r, 'Sale Price'), { line, name: p.title, column: 'Sale Price', label: 'sale price' }) : null };
    const onSale = g(r, 'On Sale').toLowerCase() === 'yes' && sale.value !== null && price.value !== null && Number(sale.value) < Number(price.value);
    const stock = g(r, 'Stock');
    const unlimited = stock.toLowerCase() === 'unlimited';
    const w = Number(g(r, 'Weight'));
    let grams = null;
    if (g(r, 'Weight') && Number.isFinite(w) && w > 0) {
      if (!unit && !weightWarned) {
        issue('warning', 'WEIGHT_UNIT_ASSUMED', 'Squarespace exports weights without a unit (it uses your store setting). Weights were read as pounds; set the source weight unit if your store uses kilograms.', {});
        weightWarned = true;
      }
      grams = toGrams(w, unit || 'lb');
    }
    p.variants.push(newVariant({
      optionValues,
      sku: g(r, 'SKU'),
      barcode: g(r, 'GTIN'),
      price: onSale ? sale.value : price.value,
      compareAtPrice: onSale ? price.value : null,
      inventoryQty: unlimited ? null : intOrNull(stock),
      inventoryTracked: !unlimited && intOrNull(stock) !== null,
      weightGrams: grams,
      weightUnit: grams === null ? null : (unit || 'lb'),
      requiresShipping: p._service ? false : null,
    }));
  }
  for (const q of products) {
    const count = Math.max(q._names.filter(Boolean).length, ...q.variants.map((v) => v.optionValues.filter(Boolean).length));
    q.options = [];
    for (let i = 0; i < count; i++) q.options.push({ name: q._names[i] || `Option ${i + 1}`, values: dedupe(q.variants.map((v) => v.optionValues[i]).filter(Boolean)) });
    for (const v of q.variants) v.optionValues = v.optionValues.slice(0, count);
    delete q._names; delete q._service;
  }
  return products;
}
