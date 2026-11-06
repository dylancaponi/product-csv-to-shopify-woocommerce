// Writer: neutral model -> WooCommerce core product CSV importer file.
// Rules from research/woocommerce.md (WooCommerce 11.2.2 source):
// - variable product: parent row Type "variable" with every option value in
//   "Attribute N value(s)"; one row per variation, Type "variation",
//   Parent = parent SKU, exactly one value per attribute
// - list cells joined with ", ", literal commas escaped as "\,"
// - Images: comma-separated URLs, first is the featured image
// - Published 1 / -1 (draft); booleans 1 / 0
// - weight is a plain number in the store unit named in the header
// - export writes a UTF-8 BOM; the importer strips it
import { writeCSV } from '../csv.js';
import { fromGrams, fmtNumber } from '../units.js';
import { joinEscaped, looksLikeFormula, formulaCells } from '../text.js';
import { encodeDescription } from '../woo-columns.js';

export const ID = 'woocommerce';
const WOO_UNIT = { kg: 'kg', g: 'g', lb: 'lbs', oz: 'oz' };

export function write(products, ctx) {
  const { issue } = ctx;
  const unit = ctx.options.wooWeightUnit || 'kg';
  if (!WOO_UNIT[unit]) throw new Error(`wooWeightUnit must be one of ${Object.keys(WOO_UNIT).join(', ')}`);
  const maxAttrs = Math.max(0, ...products.map((p) => p.options.length));
  const base = ['ID', 'Type', 'SKU', 'Name', 'Published', 'Is featured?', 'Visibility in catalog', 'Short description', 'Description',
    'Tax status', 'In stock?', 'Stock', 'Backorders allowed?', `Weight (${WOO_UNIT[unit]})`, 'Sale price', 'Regular price',
    'Categories', 'Tags', 'Images', 'Parent', 'Position'];
  const header = [...base];
  for (let n = 1; n <= maxAttrs; n++) header.push(`Attribute ${n} name`, `Attribute ${n} value(s)`, `Attribute ${n} visible`, `Attribute ${n} global`);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [header];

  // SKUs must be unique across the whole file ("Invalid or duplicated SKU.").
  // Repeats are blanked and reported once per product.
  const used = new Set();
  // Every SKU that is really in the file, so a generated parent SKU never
  // takes one that a later product needs.
  const reserved = new Set(products.flatMap((p) => [p.parentSku, ...p.variants.map((v) => v.sku)]).filter(Boolean).map((s) => s.trim().toLowerCase()));
  let cleared = [];
  const takeSku = (sku) => {
    const s = (sku || '').trim();
    if (!s) return '';
    if (used.has(s.toLowerCase())) { cleared.push(s); return ''; }
    used.add(s.toLowerCase());
    return s;
  };
  const flushCleared = (p) => {
    if (!cleared.length) return;
    const list = [...new Set(cleared)];
    issue('warning', 'DUPLICATE_SKU_CLEARED', `"${p.title}": ${cleared.length === 1 ? 'one row had' : `${cleared.length} rows had`} a SKU already used elsewhere in the file (${list.slice(0, 5).join(', ')}${list.length > 5 ? ', ...' : ''}), so ${cleared.length === 1 ? 'it was' : 'they were'} left blank. WooCommerce rejects duplicated SKUs.`, { handle: p.handle, rule: 'woo.sku-unique' });
    cleared = [];
  };

  let written = 0;
  for (const p of products) {
    if (!p.title) { issue('error', 'MISSING_TITLE', `Product "${p.handle}" has no name and was left out.`, { handle: p.handle }); continue; }
    if (p.options.length) {
      const seen = new Set();
      const dup = p.variants.find((v) => { const k = v.optionValues.join('\u0000').toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; });
      if (dup) { issue('error', 'DUPLICATE_OPTIONS', `"${p.title}" was left out of the WooCommerce file: two variations have the same options (${dup.optionValues.join(' / ')}), so a customer could not choose between them. Make each combination unique in the source and convert again.`, { handle: p.handle, line: p.source?.lines?.[0] }); continue; }
    }
    if (p.variants.some((v) => v.price === null)) {
      issue('warning', 'MISSING_PRICE', `"${p.title}": at least one variant has no price. WooCommerce will import it without a price, and it cannot be bought until you set one.`, { handle: p.handle });
    }
    const cats = p.categories.length ? p.categories : (p.productType ? [p.productType] : []);
    const common = (r) => {
      r[idx.Categories] = joinEscaped(cats);
      r[idx.Tags] = joinEscaped(p.tags);
    };
    const published = p.status === 'active' ? '1' : '-1';
    if (p.status === 'archived') issue('info', 'ARCHIVED_AS_DRAFT', `"${p.title}" was archived, so it was imported as a draft.`, { handle: p.handle });
    const blank = () => header.map(() => '');
    const priceCells = (r, v) => {
      // Shopify-style compare-at price (higher) becomes the regular price and
      // the selling price becomes the sale price.
      if (v.compareAtPrice && v.price && Number(v.compareAtPrice) > Number(v.price)) {
        r[idx['Regular price']] = v.compareAtPrice; r[idx['Sale price']] = v.price;
      } else r[idx['Regular price']] = v.price ?? '';
    };
    const stockCells = (r, v) => {
      const tracked = v.inventoryTracked === true || (v.inventoryTracked === null && v.inventoryQty !== null);
      r[idx.Stock] = tracked ? String(v.inventoryQty ?? 0) : '';
      r[idx['Backorders allowed?']] = v.continueSellingOutOfStock ? '1' : '0';
      r[idx['In stock?']] = !tracked || (v.inventoryQty ?? 0) > 0 || v.continueSellingOutOfStock ? '1' : '0';
      r[idx[`Weight (${WOO_UNIT[unit]})`]] = v.weightGrams === null ? '' : fmtNumber(fromGrams(v.weightGrams, unit), 4);
      r[idx['Tax status']] = v.taxable === false ? 'none' : 'taxable';
    };
    const images = p.images.map((i) => i.url);

    if (!p.options.length) {
      const v = p.variants[0];
      const r = blank();
      r[idx.Type] = v.requiresShipping === false ? 'simple, virtual' : 'simple';
      r[idx.SKU] = takeSku(v.sku);
      r[idx.Name] = p.title;
      r[idx.Published] = published;
      r[idx['Is featured?']] = '0';
      r[idx['Visibility in catalog']] = p.published === false ? 'hidden' : 'visible';
      r[idx.Description] = encodeDescription(p.descriptionHtml);
      r[idx.Images] = joinEscaped(images);
      common(r); priceCells(r, v); stockCells(r, v);
      rows.push(r);
      flushCleared(p);
      written++;
      continue;
    }
    // Variable product. The parent needs a SKU so variations can point at it.
    let parentSku = takeSku(p.parentSku || '');
    if (!parentSku) {
      let cand = p.handle || 'product';
      let n = 2;
      while (used.has(cand.toLowerCase()) || reserved.has(cand.toLowerCase())) cand = `${p.handle}-parent${n > 2 ? `-${n - 1}` : ''}`, n++;
      parentSku = takeSku(cand);
      issue('info', 'PARENT_SKU_ADDED', `"${p.title}": the main product was given the SKU "${parentSku}" so WooCommerce can link its options (variations) to it. Nothing to do.`, { handle: p.handle, rule: 'woo.variation-parent' });
    }
    const pr = blank();
    pr[idx.Type] = 'variable';
    pr[idx.SKU] = parentSku;
    pr[idx.Name] = p.title;
    pr[idx.Published] = published;
    pr[idx['Is featured?']] = '0';
    pr[idx['Visibility in catalog']] = p.published === false ? 'hidden' : 'visible';
    pr[idx.Description] = encodeDescription(p.descriptionHtml);
    pr[idx['Tax status']] = 'taxable';
    pr[idx.Images] = joinEscaped(images);
    common(pr);
    p.options.forEach((o, k) => {
      pr[idx[`Attribute ${k + 1} name`]] = o.name;
      pr[idx[`Attribute ${k + 1} value(s)`]] = joinEscaped(o.values);
      pr[idx[`Attribute ${k + 1} visible`]] = '1';
      pr[idx[`Attribute ${k + 1} global`]] = '0';
    });
    rows.push(pr);
    p.variants.forEach((v, i) => {
      const r = blank();
      r[idx.Type] = v.requiresShipping === false ? 'variation, virtual' : 'variation';
      r[idx.SKU] = takeSku(v.sku);
      r[idx.Name] = `${p.title} - ${v.optionValues.join(', ')}`;
      r[idx.Published] = '1';
      r[idx.Parent] = parentSku;
      r[idx.Position] = String(i + 1);
      if (v.imageUrl) r[idx.Images] = joinEscaped([v.imageUrl]);
      priceCells(r, v); stockCells(r, v);
      p.options.forEach((o, k) => {
        r[idx[`Attribute ${k + 1} name`]] = o.name;
        r[idx[`Attribute ${k + 1} value(s)`]] = joinEscaped([v.optionValues[k]]);
        r[idx[`Attribute ${k + 1} visible`]] = '1';
        r[idx[`Attribute ${k + 1} global`]] = '0';
      });
      rows.push(r);
    });
    flushCleared(p);
    written++;
  }
  const noQty = products.reduce((n, p) => n + p.variants.filter((v) => v.inventoryTracked === true && v.inventoryQty === null).length, 0);
  if (noQty) issue('warning', 'STOCK_MISSING', `${noQty === 1 ? 'One variant has' : `${noQty} variants have`} stock tracking on but no quantity in the file, so ${noQty === 1 ? 'it was' : 'they were'} imported with stock 0 and will show as out of stock. Set the stock after import. (Shopify exports from stores with more than one location can leave the quantity blank.)`, {});
  const shopOnly = new Set();
  for (const p of products) {
    for (const k of Object.keys(p.shopifyRaw || {})) shopOnly.add(k.replace(/ \(product\.metafields\.[^)]+\)$/, ' (metafield)').replace(/^Option\d /, 'Option '));
    for (const k of p.shopifyDropped || []) shopOnly.add(k);
    for (const v of p.variants) for (const k of Object.keys(v.shopifyRaw || {})) { if (!(k === 'Fulfillment service' && v.shopifyRaw[k].toLowerCase() === 'manual')) shopOnly.add(k.replace(/^Packed product .*/, 'Packed dimensions').replace(/^Unit price .*/, 'Unit prices')); }
  }
  if (shopOnly.size) issue('info', 'SHOPIFY_FIELDS_DROPPED', `These Shopify fields have no place in a WooCommerce import file and were not carried over: ${[...shopOnly].join(', ')}.`, {});
  ctx.meta.writtenProducts = written;
  if (products.some((p) => p.vendor)) issue('info', 'VENDOR_DROPPED', 'Vendor names were not carried over: WooCommerce core has no vendor column (Brands exists only on newer versions).', {});
  if (products.some((p) => p.variants.some((v) => v.barcode))) issue('info', 'BARCODE_DROPPED', 'Barcodes were not carried over: WooCommerce 11.2 does not map the GTIN column automatically. Add them in WooCommerce after import if you need them.', {});
  // WooCommerce's importer strips a leading apostrophe before = + - @ in SKU,
  // list fields (categories, tags, images), numbers and Parent
  // (class-wc-product-csv-importer.php unescape_data), so those cells are
  // escaped the way WooCommerce's own exporter does. Name and Description are
  // not unescaped by the importer, so they are left alone and reported.
  // Categories and Images are not unescaped by the importer
  // (parse_categories_field, parse_images_field), and its unescape only
  // handles '= '+ '- '@, so only those four are escaped, only here.
  const ESCAPED = ['SKU', 'Tags', 'Parent', 'Stock', 'Regular price', 'Sale price', `Weight (${WOO_UNIT[unit]})`].map((h) => idx[h]);
  for (let i = 1; i < rows.length; i++) for (const k of ESCAPED) if (looksLikeFormula(rows[i][k]) && /^[=+\-@]/.test(rows[i][k])) rows[i][k] = "'" + rows[i][k];
  const f = formulaCells(rows, new Set(ESCAPED));
  if (f.n) issue('warning', 'FORMULA_CELLS', `${f.n === 1 ? 'One cell starts' : `${f.n} cells start`} with =, +, - or @ (first in the ${f.first.column} column, line ${f.first.line}). Import the file as it is. If you open it in Excel or Google Sheets first, those cells may be run as formulas, so check it in a text editor instead.`, { line: f.first.line, column: f.first.column });
  return writeCSV(rows, { bom: true, eol: '\n' });
}
