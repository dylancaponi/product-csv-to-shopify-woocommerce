// WooCommerce core product CSV export (Products > Export). Columns and value
// formats from WooCommerce 11.2.2 source; see research/woocommerce.md.
import { newProduct, newVariant, slugify, intOrNull } from '../model.js';
import { priceReader } from '../money.js';
import { toGrams } from '../units.js';
import { splitEscaped, dedupe } from '../text.js';
import { resolveHeaders, decodeDescription } from '../woo-columns.js';

export const ID = 'woocommerce';

// A file from "export selected columns" may lack most columns. When the
// visitor chooses WooCommerce by hand, Type and Name are enough.
export function minimal(headers) {
  const m = resolveHeaders(headers);
  return !!(m.type && m.name);
}

export function detect(headers) {
  const m = resolveHeaders(headers);
  const keys = ['id', 'type', 'sku', 'name', 'published', 'visibility', 'regularPrice', 'parent', 'images', 'inStock'];
  const hits = keys.filter((k) => m[k]).length;
  return { score: m.type && m.name ? hits / keys.length : 0, reason: hits ? 'WooCommerce product export' : '' };
}

// WooCommerce's exporter prefixes every cell that starts with = + - @, tab
// or carriage return with an apostrophe (abstract-wc-csv-exporter.php
// escape_data). Strip it from every cell we read, as the importer does.
const unescape = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
const cell = (r, h) => (h ? unescape(String(r[h] ?? '')) : '');

export function parse(headers, records, ctx) {
  const { issue } = ctx;
  const m = resolveHeaders(headers);
  const get = (r, k) => (m[k] ? unescape(String(r[m[k]] ?? '').trim()) : '');
  if (m.weight && !m.weightUnit) issue('warning', 'WEIGHT_UNIT_UNKNOWN', `The weight column "${m.weight}" has a unit we do not recognise, so weights were not carried over.`, { column: m.weight });

  const parents = new Map(); // key (sku or id:N) -> product
  const products = [];
  const pendingVariations = [];
  for (const r of records) {
    const line = r.__line;
    const typeTokens = get(r, 'type').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    const type = typeTokens.find((t) => !['virtual', 'downloadable'].includes(t)) || 'simple';
    r.__virtual = typeTokens.includes('virtual');
    r.__download = typeTokens.includes('downloadable');
    if (type === 'variation') { pendingVariations.push(r); continue; }
    const name = get(r, 'name');
    if (!['simple', 'variable'].includes(type)) {
      issue('warning', 'UNSUPPORTED_TYPE', `"${name || 'Row ' + line}" has the WooCommerce type "${type}", which this converter does not support yet, so it was skipped.`, { line });
      continue;
    }
    const p = newProduct({ title: name });
    p.source = { platform: ID, lines: [line] };
    p.handle = slugify(name);
    const desc = decodeDescription(cell(r, m.description));
    const short = decodeDescription(cell(r, m.shortDescription));
    p.descriptionHtml = desc || short;
    if (desc && short) issue('info', 'SHORT_DESCRIPTION_DROPPED', `"${name}": the short description was not carried over (the destination has no such field).`, { line });
    const pub = get(r, 'published');
    p.status = pub === '1' ? 'active' : 'draft';
    // Visibility in catalog: visible | catalog | search | hidden. Hidden products stay off the storefront.
    const vis = get(r, 'visibility').toLowerCase();
    if (vis === 'hidden') { p.published = false; issue('info', 'HIDDEN_KEPT_HIDDEN', `"${name}" is hidden from the catalog in WooCommerce, so it stays hidden from the online store in the new file.`, { line }); }
    else if (vis === 'catalog' || vis === 'search') issue('warning', 'VISIBILITY_NOT_KEPT', `"${name}" is shown only in ${vis === 'catalog' ? 'the shop pages, not search' : 'search results, not the shop pages'} in WooCommerce. Shopify has no such setting, so it is published normally.`, { line });
    p.categories = splitEscaped(get(r, 'categories')).map(unescape);
    p.productType = p.categories[0] ? p.categories[0].split('>').pop().trim() : '';
    p.tags = dedupe(splitEscaped(get(r, 'tags')).map(unescape));
    p.images = splitEscaped(get(r, 'images')).map((url) => ({ url, alt: '' }));
    p.vendor = splitEscaped(get(r, 'brands'))[0] || '';
    p.parentSku = get(r, 'sku');
    p._attrs = m.attributes.map((a) => ({ name: cell(r, a.name).trim(), values: splitEscaped(cell(r, a.values)).map(unescape) })).filter((a) => a.name);
    p._wooType = type;
    if (type === 'simple') {
      p.variants.push(variantFrom(r, get, m, line, issue, name));
      if (p._attrs.length) issue('info', 'ATTRIBUTES_DROPPED', `"${name}": attributes (${p._attrs.map((a) => a.name).join(', ')}) on a simple product were not carried over.`, { line });
    }
    if (r.__download) issue('warning', 'DOWNLOAD_FILES_NOT_MOVED', `"${name}" is a downloadable product. Its download files are not part of the product file, so it was converted as a product without shipping; attach the files again in the new store.`, { line });
    p._virtual = r.__virtual;
    if (p.parentSku) parents.set(p.parentSku.toLowerCase(), p);
    if (get(r, 'id')) parents.set(`id:${get(r, 'id')}`, p);
    products.push(p);
  }
  for (const r of pendingVariations) {
    const line = r.__line;
    const ref = get(r, 'parent').toLowerCase();
    const p = parents.get(ref);
    if (!p || p._wooType !== 'variable') {
      issue('error', 'VARIATION_ORPHAN', `Line ${line}: this option row (variation) belongs to a product "${get(r, 'parent')}" that is not in the file as a product with options, so it was skipped. Export all products at once so each option row has its main product.`, { line, rule: 'woo.variation-parent' });
      continue;
    }
    const v = variantFrom(r, get, m, line, issue, p.title);
    if (v.requiresShipping === null && p._virtual) v.requiresShipping = false;
    const vals = {};
    for (const a of m.attributes) {
      const n = cell(r, a.name).trim();
      if (n) vals[n.toLowerCase()] = unescape(splitEscaped(cell(r, a.values))[0] || '');
    }
    v._vals = vals;
    v._line = line;
    const img = get(r, 'images') ? splitEscaped(get(r, 'images'))[0] : '';
    if (img) { v.imageUrl = img; if (!p.images.some((i) => i.url === img)) p.images.push({ url: img, alt: '' }); }
    p.variants.push(v);
  }
  for (const p of products) {
    if (p._wooType === 'variable') {
      // Options = parent attributes that the variations actually use.
      const used = p._attrs.filter((a) => p.variants.some((v) => a.name.toLowerCase() in v._vals));
      const unused = p._attrs.filter((a) => !used.includes(a));
      if (unused.length) issue('info', 'ATTRIBUTES_DROPPED', `"${p.title}": attributes not used for variations (${unused.map((a) => a.name).join(', ')}) were not carried over.`, { line: p.source.lines[0] });
      p.options = used.map((a) => ({ name: a.name, values: [...a.values] }));
      const expanded = [];
      for (const v of p.variants) {
        // A blank attribute value on a variation means "any value".
        let combos = [[]];
        p.options.forEach((o) => {
          const val = v._vals[o.name.toLowerCase()];
          const choices = val ? [val] : o.values;
          combos = combos.flatMap((c) => choices.map((x) => [...c, x]));
        });
        if (combos.length > 1) issue('warning', 'ANY_VARIATION_EXPANDED', `"${p.title}": a variation set to "any" value was expanded into ${combos.length} variants with the same price and stock.`, { line: v._line });
        combos.forEach((optionValues, i) => expanded.push({ ...v, optionValues, sku: i === 0 ? v.sku : '' }));
      }
      const seen = new Set();
      p.variants = expanded.filter((v) => { const k = v.optionValues.join('\u0000'); if (seen.has(k)) return false; seen.add(k); return true; });
      for (const v of p.variants) { delete v._vals; delete v._line; }
      for (const o of p.options) o.values = dedupe([...o.values, ...p.variants.map((v) => v.optionValues[p.options.indexOf(o)])].filter(Boolean));
      if (!p.variants.length) {
        issue('warning', 'NO_VARIATIONS', `"${p.title}" is a variable product with no variations in the file, so it was imported without options and without a price.`, { line: p.source.lines[0] });
        p.options = [];
        p.variants.push(newVariant({ sku: '' }));
      } else if (p.variants.some((v) => v.sku && v.sku.toLowerCase() === p.parentSku.toLowerCase())) p.parentSku = '';
    }
    delete p._attrs; delete p._wooType; delete p._virtual;
  }
  return products;
}

function variantFrom(r, get, m, line, issue, name) {
  const readPrice = priceReader(issue);
  const regular = { value: readPrice(get(r, 'regularPrice'), { line, name, column: m.regularPrice, label: 'regular price' }) };
  const sale = { value: readPrice(get(r, 'salePrice'), { line, name, column: m.salePrice, label: 'sale price' }) };
  let onSale = sale.value !== null && regular.value !== null && Number(sale.value) < Number(regular.value);
  // Scheduled sales: the destination files have no sale dates, so a sale
  // price is used only while its dates include today.
  const from = get(r, 'saleFrom'), to = get(r, 'saleTo');
  if (onSale && (from || to)) {
    const today = new Date().toISOString().slice(0, 10);
    const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '');
    // A date that cannot be read counts as "not running": the regular price
    // is safer than a sale that may not have started.
    const unreadable = (from && !day(from)) || (to && !day(to));
    const live = !unreadable && (!from || day(from) <= today) && (!to || day(to) >= today);
    if (!live) onSale = false;
    issue('warning', 'SALE_SCHEDULED', `"${name}": the sale price ${sale.value} is scheduled${from ? ` from ${day(from) || from}` : ''}${to ? ` until ${day(to) || to}` : ''}. ${unreadable ? ' The date could not be read, so the sale is treated as not running.' : ''} Import files cannot carry sale dates, so ${live ? 'the sale price is used now; end the sale by hand when it should stop' : `the regular price ${regular.value} is used; start the sale by hand when it should begin`}.`, { line });
  }
  const stockRaw = get(r, 'stock');
  const qty = intOrNull(stockRaw);
  const bo = get(r, 'backorders').toLowerCase();
  const inStock = get(r, 'inStock').toLowerCase();
  const w = get(r, 'weight');
  const grams = w && m.weightUnit && Number.isFinite(Number(w)) ? toGrams(Number(w), m.weightUnit) : null;
  const tax = get(r, 'taxStatus').toLowerCase();
  if (stockRaw.toLowerCase() === 'parent') issue('info', 'STOCK_FROM_PARENT', `"${name}": a variation used the parent's stock; its stock was left untracked.`, { line });
  return newVariant({
    sku: get(r, 'sku'),
    price: onSale ? sale.value : regular.value,
    compareAtPrice: onSale ? regular.value : null,
    inventoryQty: qty,
    // No managed stock: out-of-stock items become tracked with 0 so they are not sold.
    inventoryTracked: qty !== null ? true : (inStock === '0' ? true : false),
    continueSellingOutOfStock: bo === '1' || bo === 'notify',
    weightGrams: grams,
    weightUnit: m.weightUnit || null,
    taxable: tax === 'none' ? false : true,
    requiresShipping: r.__virtual || r.__download ? false : null,
  });
}
