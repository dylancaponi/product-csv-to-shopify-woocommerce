// Magento 2 / Adobe Commerce product export (System > Data Transfer > Export,
// Entity Type Products). Header, row shapes and value formats from Magento's
// own export code, its sample file and real exports on GitHub; every decision
// and its URL is in research/magento.md. Highlights:
//   https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/CatalogImportExport/Model/Export/Product.php
//   https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/CatalogImportExport/Model/Import/Product.php
//   https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/ConfigurableImportExport/Model/Export/RowCustomizer.php
// One default row per product (blank store_view_code); store-view rows repeat
// the sku with only the values that differ and are skipped here (counted).
// Configurable children are their own rows, may come before the parent, and
// are linked by sku through the parent's configurable_variations.
// Magento 1 exports (columns _store, _attribute_set, _type, from OpenMage's
// Mage_ImportExport export constants) are refused by name.
import { newProduct, newVariant, slugify } from '../model.js';
import { priceReader } from '../money.js';
import { toGrams } from '../units.js';
import { dedupe } from '../text.js';

export const ID = 'magento';
const SIG = ['sku', 'store_view_code', 'attribute_set_code', 'product_type', 'categories', 'product_websites', 'name', 'product_online', 'visibility', 'price', 'special_price', 'url_key', 'base_image', 'additional_attributes', 'qty', 'is_in_stock'];
const M1 = ['sku', '_store', '_attribute_set', '_type', '_category', '_root_category', '_product_websites'];

export function detect(headers) {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  if (!set.has('sku') || !set.has('product_type') || !set.has('attribute_set_code')) return { score: 0, reason: '' };
  return { score: SIG.filter((h) => set.has(h)).length / SIG.length, reason: 'Magento 2 product export' };
}

export function isLegacy(headers) {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  return M1.filter((h) => set.has(h)).length >= 4;
}

export const LEGACY_MESSAGE = 'This is a Magento 1 product export, with columns such as "_store", "_attribute_set" and "_type". CatalogHop reads only the Magento 2 (Adobe Commerce) export, whose columns are named store_view_code, attribute_set_code and product_type. Nothing was converted.';

// "sku=A,color=Red,size=M|sku=B,..." (ConfigurableImportExport RowCustomizer).
export function parseVariations(s) {
  return String(s ?? '').split('|').map((part) => {
    const o = {};
    // Review 4: a piece with no "=" belongs to the previous value (a comma inside
    // an option label), as Magento's own importer reads additional_attributes.
    let last = '';
    for (const kv of part.split(',')) { const i = kv.indexOf('='); if (i > 0) { last = kv.slice(0, i).trim(); o[last] = kv.slice(i + 1).trim(); } else if (last) o[last] += ',' + kv; }
    for (const k of Object.keys(o)) o[k] = o[k].trim();
    return o;
  }).filter((o) => o.sku);
}

// additional_attributes, as Magento's importer reads it (Import/Product.php):
// without "Fields Enclosure", pairs split on "," and a piece with no "=" is
// glued back onto the previous value; with it, code="value" with "" for a quote.
export function parseAttributes(s) {
  const str = String(s ?? '').trim();
  const out = {};
  if (/^[A-Za-z0-9_]+="/.test(str)) {
    const re = /([A-Za-z0-9_]+)="((?:[^"]|"")*)"/g;
    let m;
    while ((m = re.exec(str))) out[m[1].toLowerCase()] = m[2].replace(/""/g, '"');
    return out;
  }
  let code = '';
  for (const piece of str.split(',')) {
    const i = piece.indexOf('=');
    if (i < 0) { if (code) out[code] += ',' + piece; continue; }
    code = piece.slice(0, i).toLowerCase();
    out[code] = piece.slice(i + 1);
  }
  return out;
}

// "Default Category/Gear/Bags,Default Category/Sale"; "\/" is a literal slash
// (Export/Product.php quoteCategoryDelimiter). The first level is the root category.
export function parseCategories(s) {
  const out = [];
  for (const path of String(s ?? '').split(/(?<!\\),/)) {
    const levels = path.split(/(?<!\\)\//).map((x) => x.replace(/\\\//g, '/').trim()).filter(Boolean);
    if (levels.length > 1) out.push(levels.slice(1).join(' > '));
  }
  return dedupe(out);
}

// Locale short dates (Export/Product.php uses IntlDateFormatter SHORT): 6/23/16
// for en_US. Also 2016-06-23. Returns { date, how } or null.
// Review 3: the day/month order is decided ONCE per file (dateOrder) from
// its unambiguous dates; parseDate(s, order) never guesses per date.
const SHORT = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const head = (s) => String(s ?? '').trim().split(/[ ,T]/)[0];
// 'mdy', 'dmy', 'conflict' (both kinds of evidence), or null (no evidence).
export function dateOrder(values) {
  let md = false, dm = false;
  for (const v of values) {
    const m = SHORT.exec(head(v));
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dm = true;
    if (b > 12 && a <= 12) md = true;
  }
  return md && dm ? 'conflict' : md ? 'mdy' : dm ? 'dmy' : null;
}
// Returns { date } or null (unreadable), or { ambiguous: true } when the order matters and is unknown.
export function parseDate(s, order = null) {
  const t = head(s);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return { date: Date.UTC(+m[1], m[2] - 1, +m[3]) };
  m = SHORT.exec(t);
  if (!m) return null;
  let [a, b, y] = [+m[1], +m[2], +m[3]];
  if (y < 100) y += 2000;
  if (a !== b && a <= 12 && b <= 12 && order !== 'mdy' && order !== 'dmy') return { ambiguous: true };
  const [mo, d] = order === 'dmy' || a > 12 ? [b, a] : [a, b];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || (order === 'mdy' && a > 12) || (order === 'dmy' && b > 12)) return null;
  return { date: Date.UTC(y, mo - 1, d) };
}

const label = (code) => code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const SKIP_TYPES = ['bundle', 'grouped', 'downloadable', 'giftcard'];
const OK_TYPES = ['simple', 'virtual', 'configurable'];

export function parse(headers, records, ctx) {
  const { issue, options } = ctx;
  const actual = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const col = (h) => actual.get(h.toLowerCase()) ?? h;
  const g = (r, h) => String(r[col(h)] ?? '').trim();
  const readPrice = priceReader(issue);
  const num = (s) => { const v = String(s ?? '').trim(); const n = Number(v); return v !== '' && Number.isFinite(n) ? n : null; };
  const unit = options.sourceWeightUnit || null;
  const today = options.today ? Date.parse(options.today) : Date.now();
  const list = (a) => a.slice(0, 3).map((n) => `"${n}"`).join(', ') + (a.length > 3 ? ` and ${a.length - 3} more` : '');
  const c = { storeRows: 0, storeOrphans: [], skipped: new Map(), relImages: [], fullImages: 0, notActive: [], endsLater: [], dateHow: new Set(), badDates: [], customOptions: [], links: [], attrCodes: new Set(), shortDesc: 0, outOfStock: [], rounded: [], missingChild: [], alsoVisible: [], hidden: [], optionFromCode: new Set(), childOff: [], allChildrenOff: [], metaKeywords: 0, dupSku: [], unclear: [] };
  let weightWarned = false;
  const grams = (raw) => {
    const w = num(raw);
    if (w === null || w <= 0) return null;
    if (!unit && !weightWarned) { issue('warning', 'WEIGHT_UNIT_ASSUMED', 'Magento exports weights without a unit (it uses the store setting, pounds by default). Weights were read as pounds; set the source weight unit if your store uses kilograms, grams or ounces.', {}); weightWarned = true; }
    return toGrams(w, unit || 'lb');
  };

  // Default rows by sku; store-view rows skipped (counted). Skus match without case (review 6).
  const bySku = new Map();
  const order = [];
  for (const r of records) {
    const sku = g(r, 'sku');
    if (!sku) { if (Object.entries(r).some(([k, v]) => k !== '__line' && String(v ?? '').trim())) issue('warning', 'SOURCE_ROW_SKIPPED', `Line ${r.__line} has no sku, so it was skipped.`, { line: r.__line }); continue; }
    if (g(r, 'store_view_code')) { c.storeRows++; continue; }
    if (bySku.has(sku.toLowerCase())) { c.dupSku.push(sku); continue; }
    bySku.set(sku.toLowerCase(), r);
    order.push(sku);
  }
  for (const r of records) { const sku = g(r, 'sku'); if (sku && g(r, 'store_view_code') && !bySku.has(sku.toLowerCase()) && !c.storeOrphans.includes(sku)) c.storeOrphans.push(sku); }

  // Children named by configurable parents.
  const childOf = new Map();
  for (const sku of order) {
    const r = bySku.get(sku.toLowerCase());
    if (g(r, 'product_type').toLowerCase() !== 'configurable') continue;
    for (const v of parseVariations(g(r, 'configurable_variations'))) if (!childOf.has(v.sku.toLowerCase())) childOf.set(v.sku.toLowerCase(), sku);
  }
  const rawDates = order.flatMap((sku) => { const r = bySku.get(sku.toLowerCase()); return [g(r, 'special_price_from_date'), g(r, 'special_price_to_date')]; });
  const dateOrderFound = dateOrder(rawDates);
  const order_ = dateOrderFound === 'conflict' ? null : dateOrderFound;

  const priceOf = (r, name, line) => {
    const price = readPrice(g(r, 'price'), { line, name, column: 'price' });
    const sp = g(r, 'special_price') ? readPrice(g(r, 'special_price'), { line, name, column: 'special_price', label: 'special price' }) : null;
    if (sp === null || price === null) return { price, compareAtPrice: null };
    if (Number(sp) >= Number(price)) {
      if (Number(sp) > Number(price)) issue('warning', 'SALE_NOT_LOWER', `"${name}": the special price ${sp} is higher than the price ${price}. Magento shows the lower of the two, so the file carries ${price} with no sale.`, { line });
      return { price, compareAtPrice: null };
    }
    const fromRaw = g(r, 'special_price_from_date'), toRaw = g(r, 'special_price_to_date');
    const from = fromRaw ? parseDate(fromRaw, order_) : null, to = toRaw ? parseDate(toRaw, order_) : null;
    if ((fromRaw && (!from || from.ambiguous)) || (toRaw && (!to || to.ambiguous))) { c.badDates.push(`${name} (${fromRaw || 'no start'} to ${toRaw || 'no end'})`); return { price, compareAtPrice: null }; }
    if ([fromRaw, toRaw].some((x) => SHORT.test(head(x)))) c.dateUsed = true;
    if ((from && today < from.date) || (to && today >= to.date + 86400000)) { c.notActive.push(`${name} (${fromRaw || 'no start'} to ${toRaw || 'no end'})`); return { price, compareAtPrice: null }; }
    if (to) c.endsLater.push(`${name} (ends ${toRaw})`);
    return { price: sp, compareAtPrice: price };
  };
  const stockOf = (r, name) => {
    const manage = g(r, 'manage_stock');
    if (manage === '0') return { inventoryTracked: false, inventoryQty: null };
    let q = num(g(r, 'qty'));
    // Review 1: out of stock is always tracked with stock 0, whatever qty says.
    if (g(r, 'is_in_stock') === '0') { if (q !== 0) c.outOfStock.push(`${name} (qty ${q === null ? 'blank' : q})`); return { inventoryTracked: true, inventoryQty: 0 }; }
    if (q === null) return { inventoryTracked: false, inventoryQty: null };
    if (!Number.isInteger(q)) { c.rounded.push(name); q = Math.trunc(q) || 0; }
    return { inventoryTracked: true, inventoryQty: q };
  };
  const imagesOf = (r, name) => {
    const urls = dedupe([g(r, 'base_image'), ...g(r, 'additional_images').split(',').map((x) => x.trim())].filter((x) => x && x !== 'no_selection'));
    const labels = g(r, 'additional_image_labels').split(',').map((x) => x.trim());
    const out = [];
    let rel = 0;
    urls.forEach((u, i) => {
      if (/^https?:\/\//i.test(u)) { out.push({ url: u, alt: i === 0 ? g(r, 'base_image_label') : (labels[i - 1] || '') }); c.fullImages++; } else rel++;
    });
    if (rel) c.relImages.push(name);
    return out;
  };

  const products = [];
  for (const sku of order) {
    const r = bySku.get(sku.toLowerCase());
    const line = r.__line;
    const type = g(r, 'product_type').toLowerCase();
    const name = g(r, 'name') || sku;
    if (childOf.has(sku.toLowerCase())) { if (!/^not visible individually$/i.test(g(r, 'visibility'))) c.alsoVisible.push(sku); continue; }
    if (!OK_TYPES.includes(type)) { const k = SKIP_TYPES.includes(type) ? type : (type || 'blank'); c.skipped.set(k, [...(c.skipped.get(k) || []), name]); continue; }
    const p = newProduct({ title: name });
    p.source = { platform: ID, lines: [line] };
    p.handle = slugify(g(r, 'url_key') || name);
    p.descriptionHtml = String(r[col('description')] ?? '');
    if (g(r, 'short_description')) c.shortDesc++;
    if (g(r, 'meta_keywords')) c.metaKeywords++;
    p.seoTitle = g(r, 'meta_title');
    p.seoDescription = g(r, 'meta_description');
    p.categories = parseCategories(g(r, 'categories'));
    p.productType = p.categories[0] ? p.categories[0].split(' > ').pop() : '';
    const online = g(r, 'product_online');
    p.status = online === '1' ? 'active' : 'draft';
    if (online !== '1' && online !== '2') c.unclear.push(name);
    if (/^not visible individually$/i.test(g(r, 'visibility')) && p.status === 'active') { p.status = 'draft'; c.hidden.push(name); }
    p.images = imagesOf(r, name);
    if (g(r, 'custom_options')) c.customOptions.push(name);
    if (['related_skus', 'crosssell_skus', 'upsell_skus'].some((h) => g(r, h))) c.links.push(name);
    for (const k of Object.keys(parseAttributes(g(r, 'additional_attributes')))) c.attrCodes.add(k);
    const virtual = type === 'virtual';

    if (type !== 'configurable') {
      p.options = [];
      const w = virtual ? null : grams(g(r, 'weight'));
      p.variants = [newVariant({ sku, ...priceOf(r, name, line), ...stockOf(r, name), weightGrams: w, weightUnit: w === null ? null : (unit || 'lb'), requiresShipping: virtual ? false : null })];
      products.push(p);
      continue;
    }
    // Configurable: options from configurable_variations, labels from configurable_variation_labels.
    const vars = parseVariations(g(r, 'configurable_variations'));
    const labels = parseAttributes(g(r, 'configurable_variation_labels'));
    const codes = [];
    for (const v of vars) for (const k of Object.keys(v)) if (k !== 'sku' && !codes.includes(k)) codes.push(k);
    const names = codes.map((k) => { if (labels[k.toLowerCase()]) return labels[k.toLowerCase()].replace(/:\s*$/, ''); c.optionFromCode.add(k); return label(k); });
    const variants = [];
    // Review 2: disabled children (product_online 2) are left out; if every child is disabled, they are kept and the product is a draft.
    const allOff = vars.every((v) => { const cr = bySku.get(v.sku.toLowerCase()); return !cr || g(cr, 'product_online') === '2'; }) && vars.some((v) => bySku.get(v.sku.toLowerCase()));
    if (allOff) { p.status = 'draft'; c.allChildrenOff.push(name); }
    for (const v of vars) {
      const cr = bySku.get(v.sku.toLowerCase());
      if (!cr) { c.missingChild.push(`${name}: ${v.sku}`); continue; }
      if (!allOff && g(cr, 'product_online') === '2') { c.childOff.push(`${name}: ${g(cr, 'sku')}`); continue; }
      p.source.lines.push(cr.__line);
      const cv = g(cr, 'product_type').toLowerCase() === 'virtual';
      const w = cv ? null : grams(g(cr, 'weight'));
      const img = imagesOf(cr, `${name} (${v.sku})`);
      variants.push(newVariant({ optionValues: codes.map((k) => v[k] || ''), sku: v.sku, ...priceOf(cr, `${name} (${v.sku})`, cr.__line), ...stockOf(cr, `${name} (${v.sku})`), weightGrams: w, weightUnit: w === null ? null : (unit || 'lb'), requiresShipping: cv ? false : null, imageUrl: img[0]?.url || '' }));
      for (const i of img) if (!p.images.some((x) => x.url === i.url)) p.images.push(i);
    }
    if (!variants.length) { c.skipped.set('configurable without its child rows', [...(c.skipped.get('configurable without its child rows') || []), name]); continue; }
    p.options = names.map((n, k) => ({ name: n, values: dedupe(variants.map((x) => x.optionValues[k]).filter(Boolean)) }));
    p.variants = variants;
    if (!variants.some((x) => x.sku.toLowerCase() === sku.toLowerCase())) p.parentSku = sku;
    products.push(p);
  }

  if (c.storeRows) issue('info', 'MAGENTO_STORE_VIEW_ROWS', `${c.storeRows} store-view ${c.storeRows === 1 ? 'row was' : 'rows were'} skipped (rows with a store_view_code, which repeat a product's sku with the names, prices or other values used in one store view). Each product was converted once, from its default row. Translations and store-view prices did not move.`, {});
  if (c.storeOrphans.length) issue('warning', 'MAGENTO_STORE_VIEW_ONLY', `${c.storeOrphans.length} ${c.storeOrphans.length === 1 ? 'sku appears' : 'skus appear'} only on store-view rows, with no default row (blank store_view_code): ${list(c.storeOrphans)}. ${c.storeOrphans.length === 1 ? 'It was' : 'They were'} not converted. Export again with all store views, or check the file was not filtered.`, {});
  if (c.dupSku.length) issue('warning', 'MAGENTO_DUPLICATE_SKU', `${c.dupSku.length} default ${c.dupSku.length === 1 ? 'row repeats' : 'rows repeat'} a sku already read: ${list(c.dupSku)}. Only the first row of each sku was used.`, {});
  for (const [t, names] of c.skipped) issue('warning', 'MAGENTO_TYPE_NOT_MOVED', t === 'configurable without its child rows' ? `${names.length} configurable ${names.length === 1 ? 'product was' : 'products were'} not converted, because none of the child products listed in configurable_variations are in the file: ${list(names)}.` : `${names.length} ${t} ${names.length === 1 ? 'product was' : 'products were'} not converted: ${list(names)}. CatalogHop converts simple, virtual and configurable products only.`, {});
  if (c.childOff.length) issue('warning', 'MAGENTO_CHILD_DISABLED', `${c.childOff.length} disabled child ${c.childOff.length === 1 ? 'product (product_online 2) was' : 'products (product_online 2) were'} left out of ${c.childOff.length === 1 ? 'its' : 'their'} configurable product, so ${c.childOff.length === 1 ? 'it cannot be' : 'they cannot be'} bought in the new store: ${list(c.childOff)}.`, {});
  if (c.allChildrenOff.length) issue('warning', 'MAGENTO_ALL_CHILDREN_DISABLED', `${c.allChildrenOff.length} configurable ${c.allChildrenOff.length === 1 ? 'product has' : 'products have'} only disabled child products: ${list(c.allChildrenOff)}. ${c.allChildrenOff.length === 1 ? 'It was' : 'They were'} kept with ${c.allChildrenOff.length === 1 ? 'its' : 'their'} variations as ${c.allChildrenOff.length === 1 ? 'a draft' : 'drafts'} (hidden, not for sale).`, {});
  if (c.missingChild.length) issue('warning', 'MAGENTO_CHILD_MISSING', `${c.missingChild.length} ${c.missingChild.length === 1 ? 'variation is' : 'variations are'} listed in configurable_variations but ${c.missingChild.length === 1 ? 'has' : 'have'} no row of its own in the file, so ${c.missingChild.length === 1 ? 'it was' : 'they were'} left out: ${list(c.missingChild)}.`, {});
  if (c.alsoVisible.length) issue('warning', 'MAGENTO_CHILD_ALSO_VISIBLE', `${c.alsoVisible.length} ${c.alsoVisible.length === 1 ? 'product is' : 'products are'} part of a configurable product and also visible on its own in Magento: ${list(c.alsoVisible)}. ${c.alsoVisible.length === 1 ? 'It was' : 'They were'} converted only as a variation: ${c.alsoVisible.length === 1 ? 'its' : 'their'} own product page, URL key and description do not move.`, {});
  if (c.hidden.length) issue('warning', 'MAGENTO_NOT_VISIBLE', `${c.hidden.length} ${c.hidden.length === 1 ? 'product is' : 'products are'} "Not Visible Individually" and not part of a configurable product in this file: ${list(c.hidden)}. ${c.hidden.length === 1 ? 'It was' : 'They were'} kept as ${c.hidden.length === 1 ? 'a draft' : 'drafts'} (hidden).`, {});
  if (c.unclear.length) issue('warning', 'VISIBILITY_UNCLEAR', `${c.unclear.length} ${c.unclear.length === 1 ? 'product has' : 'products have'} a product_online value other than 1 (enabled) or 2 (disabled): ${list(c.unclear)}. ${c.unclear.length === 1 ? 'It was' : 'They were'} kept as ${c.unclear.length === 1 ? 'a draft' : 'drafts'} (hidden).`, {});
  if (c.relImages.length) issue('warning', 'MAGENTO_IMAGES_RELATIVE', `Magento exports image paths relative to the store's media folder (for example /m/b/mb01-blue-0.jpg), not web links, so the new store cannot download them. Images were left out for ${c.relImages.length} ${c.relImages.length === 1 ? 'product' : 'products'}: ${list(c.relImages)}. Add the images after import, or put full links (your store's product media address plus the path) in the file before converting.`, {});
  if (c.notActive.length) issue('warning', 'MAGENTO_SALE_NOT_ACTIVE', `${c.notActive.length} special ${c.notActive.length === 1 ? 'price is' : 'prices are'} outside ${c.notActive.length === 1 ? 'its' : 'their'} date window today, so the regular price was carried with no sale: ${list(c.notActive)}. Set up the sale in the new store if it should run.`, {});
  if (c.endsLater.length) issue('warning', 'MAGENTO_SALE_END_DATE', `${c.endsLater.length} special ${c.endsLater.length === 1 ? 'price is' : 'prices are'} active today and carried as the sale price, but the import file has no end date, so the sale will not end on its own: ${list(c.endsLater)}.`, {});
  if (c.dateUsed && order_) issue('warning', 'MAGENTO_SALE_DATES_READ', `Special price dates were read as ${order_ === 'mdy' ? 'month/day/year' : 'day/month/year'} for the whole file, because the file has dates that can only be read that way (Magento writes dates in the admin's language). Check the sale prices if that is wrong.`, {});
  if (c.badDates.length) issue('warning', 'MAGENTO_SALE_DATE_UNREADABLE', `${c.badDates.length} ${c.badDates.length === 1 ? 'product has' : 'products have'} a special price whose dates could not be read${dateOrderFound === 'conflict' ? ' (the file has dates in both month/day and day/month order)' : (rawDates.some((x) => parseDate(x)?.ambiguous) ? ' (the file has no date that shows whether the day or the month comes first)' : '')}: ${list(c.badDates)}. The sale price was left out and the regular price carried. Set the sale in the new store.`, {});
  if (c.outOfStock.length) issue('warning', 'MAGENTO_OUT_OF_STOCK', `${c.outOfStock.length} ${c.outOfStock.length === 1 ? 'product is' : 'products are'} marked out of stock (is_in_stock 0) while qty is blank or above zero: ${list(c.outOfStock)}. Stock was written as 0 so ${c.outOfStock.length === 1 ? 'it is' : 'they are'} not sold by mistake.`, {});
  if (c.rounded.length) issue('warning', 'MAGENTO_STOCK_ROUNDED', `${c.rounded.length} ${c.rounded.length === 1 ? 'product has' : 'products have'} a stock quantity with a fraction: ${list(c.rounded)}. Stock counts must be whole numbers, so ${c.rounded.length === 1 ? 'it was' : 'they were'} rounded toward zero.`, {});
  if (c.customOptions.length) issue('warning', 'MAGENTO_CUSTOM_OPTIONS', `${c.customOptions.length} ${c.customOptions.length === 1 ? 'product has' : 'products have'} custom options (custom_options): ${list(c.customOptions)}. Customer-entered options and their prices have no place in the import file and were not carried over.`, {});
  if (c.links.length) issue('info', 'MAGENTO_LINKS_NOT_MOVED', `${c.links.length} ${c.links.length === 1 ? 'product has' : 'products have'} related, up-sell or cross-sell links, which were not carried over.`, {});
  if (c.optionFromCode.size) issue('info', 'MAGENTO_OPTION_NAMED', `Option names were made from the attribute codes (${[...c.optionFromCode].join(', ')}), because the export has no label for them. Rename the options in the new store if you like.`, {});
  const attrs = [...c.attrCodes];
  if (attrs.length) issue('info', 'MAGENTO_ATTRIBUTES_DROPPED', `Extra attributes in additional_attributes were not carried over: ${attrs.slice(0, 8).join(', ')}${attrs.length > 8 ? ` and ${attrs.length - 8} more` : ''}.`, {});
  const dropped = [c.shortDesc ? `short descriptions (${c.shortDesc})` : '', c.metaKeywords ? `meta keywords (${c.metaKeywords})` : ''].filter(Boolean);
  if (dropped.length) issue('info', 'MAGENTO_FIELDS_DROPPED', `Not carried over: ${dropped.join(', ')}.`, {});
  issue('info', 'MAGENTO_NOT_IN_EXPORT', 'Tier prices are in a separate Magento export, not in the Products export, and stock per source (multi-source inventory) is not in this file, so neither moved.', {});
  return products;
}
