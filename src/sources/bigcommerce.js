// BigCommerce product export, modern (v3) Import/Export layout only.
// Header row and row shapes verified from BigCommerce's own sample file,
// linked from https://support.bigcommerce.com/articles/en_US/Knowledge/Modern-Import-Export-Overview :
// https://storage.googleapis.com/bigcommerce-production-dev-center/Knowledge%20Base/Products/Import%20Export%20v3%20Guide/v3-product-import-template.csv
// Field meanings: https://support.bigcommerce.com/articles/en_US/Knowledge/Supported-Product-Fields
// Options syntax and blank variant Price/Weight: https://support.bigcommerce.com/articles/en_US/Knowledge/Importing-Complex-Attributes
// Rows: "Product" starts a product; the "Variant" and "Image" (and "Video")
// rows after it belong to it. See research/bigcommerce.md.
import { newProduct, newVariant, intOrNull, slugify, truthy } from '../model.js';
import { priceReader } from '../money.js';
import { toGrams } from '../units.js';
import { dedupe } from '../text.js';

export const ID = 'bigcommerce';
const SIG = ['Item', 'Name', 'Type', 'SKU', 'Options', 'Inventory Tracking', 'Current Stock', 'Is Visible', 'Internal Image URL (Export)', 'Image URL (Import)', 'Variant Image URL', 'Product URL'];
// Legacy "Bulk Edit" export (verified from BigCommerce's v2 sample file:
// .../Import%20Export%20v2%20Guide/bulk-edit-product-import-template.csv). Not supported.
const LEGACY = ['Item Type', 'Product Name', 'Product Code/SKU', 'Option Set', 'Product Visible?', 'Track Inventory', 'Current Stock Level'];

export function detect(headers) {
  // Finding 9: a spreadsheet may rewrite header case.
  const set = new Set(headers.map((h) => h.toLowerCase()));
  const has = (h) => set.has(h.toLowerCase());
  if (!has('Item') || !has('Inventory Tracking')) return { score: 0, reason: '' };
  const hits = SIG.filter(has).length;
  return { score: hits / SIG.length, reason: hits ? 'BigCommerce product export (Import/Export v3)' : '' };
}

export function isLegacy(headers) {
  const set = new Set(headers);
  return LEGACY.filter((h) => set.has(h)).length >= 5;
}

export const LEGACY_MESSAGE = 'This is a BigCommerce "Bulk Edit" (legacy) product export, with columns such as "Item Type", "Product Name" and "Product Code/SKU". CatalogHop reads only the newer BigCommerce export, whose first column is "Item". In BigCommerce, go to Products, Export, and export all products as CSV with the current Import/Export, then try again with that file. Nothing was converted.';

// "Type=Rectangle|Name=Size|Value=XSType=Swatch|Name=Color|Value=Silver[#cccccc]"
// Options follow each other directly or on separate lines in the cell.
export function parseOptions(s) {
  const out = [];
  const re = /Type=([^|]*)\|Name=([^|]*)\|Value=([\s\S]*?)(?=\s*Type=[^|]*\|Name=|\s*$)/g;
  let m;
  while ((m = re.exec(String(s ?? '').trim()))) {
    const type = m[1].trim();
    let value = m[3].trim();
    // Swatch: Value=Red[#FF5500] or Value=Red[pattern image URL].
    if (/^swatch$/i.test(type)) value = value.replace(/\[[^\]]*\]$/, '').trim();
    out.push({ type, name: m[2].trim(), value });
  }
  return out;
}

const num = (s) => { const n = Number(String(s ?? '').trim()); return Number.isFinite(n) ? n : null; };
const DROPPED = {
  'Low Stock': (v) => v && v !== '0', 'Bin Picking Number': (v) => v && v !== '0', 'Free Shipping': (v) => /^true$/i.test(v),
  'Fixed Shipping Cost': (v) => num(v) > 0, Width: (v) => num(v) > 0, Height: (v) => num(v) > 0, Depth: (v) => num(v) > 0,
  'Is Featured': (v) => /^true$/i.test(v), Warranty: Boolean, 'Tax Class': (v) => v && v !== '0', 'Product Condition': (v) => v && !/^new$/i.test(v),
  'Search Keywords': Boolean, 'Meta Keywords': Boolean, 'Manufacturer Part Number': Boolean, 'Global Trade Number': Boolean, 'Sort Order': (v) => v && v !== '0',
};

export function parse(headers, records, ctx) {
  const { issue, options } = ctx;
  // Finding 9: read columns whatever their letter case.
  const actual = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const col = (h) => actual.get(h.toLowerCase()) ?? h;
  const g = (r, h) => String(r[col(h)] ?? '').trim();
  // R2-2: every SKU in the file except each product's own (counted per row).
  const skuCount = new Map();
  for (const r of records) { const k = g(r, 'SKU').toLowerCase(); if (k) skuCount.set(k, (skuCount.get(k) || 0) + 1); }
  let resortWarned = false;
  const resorted = (line, why) => {
    if (resortWarned) return;
    resortWarned = true;
    issue('warning', 'FILE_MAY_BE_RESORTED', `${why} BigCommerce's Variant and Image rows carry no product number: they belong to the Product row above them. If the file was sorted in a spreadsheet, variants and images end up on the wrong products. Export the products again from BigCommerce and convert that file without sorting it.`, { line });
  };
  const unit = options.sourceWeightUnit || null;
  const readPrice = priceReader(issue);
  const products = [];
  const dropped = new Set();
  let weightWarned = false;
  let catWarned = false;
  let brandWarned = false;
  let p = null;
  const grams = (raw) => {
    const w = num(raw);
    if (!raw || w === null || w <= 0) return null;
    if (!unit && !weightWarned) {
      issue('warning', 'WEIGHT_UNIT_ASSUMED', 'BigCommerce exports weights without a unit (it uses your store setting). Weights were read as pounds; set the source weight unit if your store uses kilograms, grams or ounces.', {});
      weightWarned = true;
    }
    return toGrams(w, unit || 'lb');
  };
  for (const r of records) {
    const line = r.__line;
    const rawItem = g(r, 'Item');
    // Finding 8: BigCommerce writes Product, Variant, Image, Video.
    const item = { product: 'Product', variant: 'Variant', image: 'Image', video: 'Video' }[rawItem.toLowerCase()] || rawItem;
    if (item === 'Product') {
      const name = g(r, 'Name');
      p = newProduct({ title: name });
      p.source = { platform: ID, lines: [line] };
      p.handle = slugify(g(r, 'Product URL').replace(/^\/+|\/+$/g, '') || name);
      p.descriptionHtml = String(r[col('Description')] ?? '');
      // Finding 4: only a clear yes publishes; anything unclear stays a draft.
      const vis = truthy(g(r, 'Is Visible'));
      p.status = vis === true ? 'active' : 'draft';
      if (vis === null) issue('warning', 'VISIBILITY_UNCLEAR', `"${name}": Is Visible is ${g(r, 'Is Visible') ? `"${g(r, 'Is Visible')}"` : 'blank'}, not TRUE or FALSE, so the product was kept as a draft (hidden). Publish it in the new store if it should be visible.`, { line });
      p.seoTitle = g(r, 'Page Title');
      p.seoDescription = g(r, 'Meta Description');
      const type = g(r, 'Type').toLowerCase();
      p._digital = type === 'digital';
      if (p._digital) issue('warning', 'DOWNLOAD_FILES_NOT_MOVED', `"${name}" is a digital product. Its download files are not in the BigCommerce export, so it was converted as a product without shipping and without files. Attach the files in the new store.`, { line });
      p._tracking = g(r, 'Inventory Tracking').toLowerCase();
      if (p._tracking && !['none', 'product', 'variant'].includes(p._tracking)) issue('warning', 'TRACKING_UNKNOWN', `"${name}": Inventory Tracking "${g(r, 'Inventory Tracking')}" is not none, product or variant, so stock was not tracked.`, { line });
      const price = readPrice(g(r, 'Price'), { line, name, column: 'Price' });
      const sale = num(g(r, 'Sale Price')) > 0 ? readPrice(g(r, 'Sale Price'), { line, name, column: 'Sale Price', label: 'sale price' }) : null;
      const retail = num(g(r, 'Retail Price')) > 0 ? readPrice(g(r, 'Retail Price'), { line, name, column: 'Retail Price', label: 'retail price' }) : null;
      const cost = num(g(r, 'Cost Price')) > 0 ? readPrice(g(r, 'Cost Price'), { line, name, column: 'Cost Price', label: 'cost price' }) : null;
      p._base = { price, sale, retail, cost, grams: p._digital ? null : grams(g(r, 'Weight')), stock: intOrNull(g(r, 'Current Stock')), sku: g(r, 'SKU'), barcode: g(r, 'UPC/EAN'), line };
      p._variants = [];
      p._images = [];
      p._productSku = g(r, 'SKU');

      if (g(r, 'Categories') && !catWarned) {
        issue('warning', 'CATEGORIES_NOT_MOVED', 'BigCommerce exports categories as ID numbers (for example 23;18), not names, so categories were not carried over. Recreate them in the new store.', { line });
        catWarned = true;
      }
      if (g(r, 'Brand ID') && !brandWarned) {
        issue('warning', 'BRAND_NOT_MOVED', 'BigCommerce exports brands as ID numbers, not names, so brands were not carried over as the vendor. Set the vendor or brand in the new store.', { line });
        brandWarned = true;
      }
      if (g(r, 'Custom Fields')) issue('warning', 'CUSTOM_FIELDS_NOT_MOVED', `"${name}": custom fields were not carried over (the destination file has no place for them).`, { line });
      for (const [h, used] of Object.entries(DROPPED)) if (headers.includes(h) && used(g(r, h))) dropped.add(h);
      products.push(p);
      continue;
    }
    if (!p) { if (item) { issue('warning', 'SOURCE_ROW_SKIPPED', `Line ${line} is a ${item} row with no Product row above it, so it was skipped. Item must be Product, Variant, Image or Video, and every Variant and Image row must sit under its Product row.`, { line }); resorted(line, `Line ${line}: ${item === "Image" ? "an" : "a"} ${item} row comes before any Product row.`); } continue; }
    p.source.lines.push(line);
    if (item === 'Variant') {
      // Finding 3: signs of a re-sorted file.
      const vsku = g(r, 'SKU').toLowerCase();
      const ps = (p._productSku || '').toLowerCase();
      if (vsku && ps && !vsku.startsWith(ps)) {
        const other = products.find((x) => x !== p && x._productSku && vsku.startsWith(x._productSku.toLowerCase() + '-'));
        if (other) resorted(line, `Line ${line}: the variant SKU "${g(r, 'SKU')}" looks like it belongs to "${other.title}" (SKU ${other._productSku}), but it sits under "${p.title}".`);
      }
      const opts = parseOptions(g(r, 'Options'));
      if (!opts.length) issue('warning', 'VARIANT_OPTIONS_UNREADABLE', `"${p.title}": the variant on line ${line} has Options "${g(r, 'Options').slice(0, 80)}", which could not be read, so it was skipped.`, { line });
      else {
        if (opts.some((o) => /^picklist/i.test(o.type))) issue('warning', 'PICK_LIST_NOT_LINKED', `"${p.title}": the option "${opts.find((o) => /^picklist/i.test(o.type)).name}" is a pick list. It was converted as a plain option; the products it links to are not linked in the new store.`, { line });
        p._variants.push({ r, line, opts });
      }
    } else if (item === 'Image') {
      const url = g(r, 'Image URL (Import)') || g(r, 'Internal Image URL (Export)');
      if (url) p._images.push({ url, alt: g(r, 'Image Description'), thumb: /^true$/i.test(g(r, 'Image is Thumbnail')), sort: num(g(r, 'Image Sort Order')) ?? 0, line });
    } else if (item === 'Video') {
      issue('info', 'VIDEO_NOT_MOVED', `"${p.title}": the YouTube video on line ${line} was not carried over.`, { line });
    } else if (item) {
      issue('warning', 'SOURCE_ROW_SKIPPED', `Line ${line} has Item "${item}", which is not Product, Variant, Image or Video, so it was skipped.`, { line });
    }
  }
  for (const q of products) {
    const b = q._base;
    const priced = (price, sale) => (sale !== null && price !== null && Number(sale) < Number(price) ? { price: sale, compareAtPrice: price } : { price, compareAtPrice: null });
    const baseP = priced(b.price, b.sale);
    if (!baseP.compareAtPrice && b.retail !== null && b.price !== null && Number(b.retail) > Number(b.price)) baseP.compareAtPrice = b.retail;
    // Finding 2: BigCommerce says a sale price replaces the base price, even a higher one.
    if (b.sale !== null && b.price !== null && Number(b.sale) > Number(b.price)) issue('warning', 'SALE_NOT_LOWER', `"${q.title}": the sale price ${b.sale} is higher than the price ${b.price}. BigCommerce shows the sale price instead of the price, so shoppers there saw ${b.sale}; the file carries ${b.price} with no sale. Change it in the new store if ${b.sale} is right.`, { line: b.line });
    // Finding 6: the retail price (MSRP) has no place once there is a sale.
    if (baseP.compareAtPrice && b.retail !== null && baseP.compareAtPrice !== b.retail) issue('info', 'RETAIL_PRICE_DROPPED', `"${q.title}": the retail price (MSRP) ${b.retail} was not carried over; the compare-at price is the regular price ${baseP.compareAtPrice}, because the product is on sale.`, { line: b.line });
    // Finding 5: keep BigCommerce's own product SKU for the parent.
    if (q._variants.length && q._productSku && skuCount.get(q._productSku.toLowerCase()) === 1) q.parentSku = q._productSku;
    const shipping = q._digital ? false : null;
    if (!q._variants.length) {
      q.options = [];
      q.variants = [newVariant({
        sku: b.sku, barcode: b.barcode, ...baseP, costPerItem: b.cost,
        inventoryTracked: q._tracking === 'product' || q._tracking === 'variant', inventoryQty: q._tracking === 'none' ? null : b.stock,
        weightGrams: b.grams, weightUnit: b.grams === null ? null : (unit || 'lb'), requiresShipping: shipping,
      })];
    } else {
      const names = [];
      for (const v of q._variants) for (const o of v.opts) if (!names.some((n) => n.toLowerCase() === o.name.toLowerCase())) names.push(o.name);
      q.options = names.map((name) => ({ name, values: dedupe(q._variants.map((v) => (v.opts.find((o) => o.name.toLowerCase() === name.toLowerCase()) || {}).value).filter(Boolean)) }));
      if (q._tracking === 'product' && q._variants.length > 1) issue('warning', 'STOCK_NOT_SPLIT', `"${q.title}": BigCommerce tracks stock for the whole product (${b.stock ?? 0}), not per variant, so stock tracking was turned off for its variants. Set stock per variant in the new store.`, { line: b.line });
      let inherited = 0;
      q.variants = q._variants.map(({ r, line, opts }) => {
        const own = readPrice(g(r, 'Price'), { line, name: q.title, column: 'Price' });
        const ownSale = num(g(r, 'Sale Price')) > 0 ? readPrice(g(r, 'Sale Price'), { line, name: q.title, column: 'Sale Price', label: 'sale price' }) : null;
        const vname = g(r, 'SKU') || opts.map((o) => o.value).join(' / ');
        // Finding 1: no BigCommerce page says whether a product sale applies to a variant with its own price.
        if (own !== null && ownSale === null && b.sale !== null && b.price !== null && Number(b.sale) < Number(b.price)) issue('warning', 'VARIANT_SALE_UNCLEAR', `"${q.title}", variant ${vname}: the variant has its own price ${own} and no sale price, while the product is on sale at ${b.sale} (regular ${b.price}). BigCommerce does not document which price shoppers saw for this variant. The file carries ${own} with no sale; change it in the new store if the sale applied.`, { line });
        if (own !== null && ownSale !== null && Number(ownSale) > Number(own)) issue('warning', 'SALE_NOT_LOWER', `"${q.title}", variant ${vname}: the sale price ${ownSale} is higher than the price ${own}. BigCommerce shows the sale price instead, so shoppers there saw ${ownSale}; the file carries ${own} with no sale.`, { line });
        if (own === null && b.sale !== null && ownSale === null && baseP.compareAtPrice === b.price) inherited++;
        if (own === null && ownSale !== null) issue('warning', 'VARIANT_SALE_UNCLEAR', `"${q.title}", variant ${vname}: the variant has a sale price ${ownSale} but no price of its own. The file carries ${ownSale} with the product price ${b.price ?? 'none'} as the compare-at price; BigCommerce does not document this case.`, { line });
        // Blank variant Price = the product's price (and its sale price).
        const pr = own === null ? (ownSale !== null ? priced(b.price, ownSale) : baseP) : priced(own, ownSale);
        const w = q._digital ? null : (g(r, 'Weight') ? grams(g(r, 'Weight')) : b.grams);
        const tracked = q._tracking === 'variant' || (q._tracking === 'product' && q._variants.length === 1);
        return newVariant({
          optionValues: q.options.map((o) => (opts.find((x) => x.name.toLowerCase() === o.name.toLowerCase()) || {}).value || ''),
          sku: g(r, 'SKU'), barcode: g(r, 'UPC/EAN'), ...pr,
          costPerItem: num(g(r, 'Cost Price')) > 0 ? readPrice(g(r, 'Cost Price'), { line, name: q.title, column: 'Cost Price', label: 'cost price' }) : b.cost,
          inventoryTracked: tracked, inventoryQty: tracked ? (q._tracking === 'variant' ? intOrNull(g(r, 'Current Stock')) : b.stock) : null,
          weightGrams: w, weightUnit: w === null ? null : (unit || 'lb'), requiresShipping: shipping, imageUrl: g(r, 'Variant Image URL'),
        });
      });
      // Finding 1 and 7: BigCommerce documents only that a blank variant price is the base price; carrying the product's sale too is our reading.
      if (inherited) issue('warning', 'VARIANT_SALE_UNCLEAR', `"${q.title}": ${inherited === 1 ? 'one variant has' : `${inherited} variants have`} no price of their own. BigCommerce documents that such a variant takes the product price (${b.price}); it does not say whether the product's sale price (${b.sale}) applies too. The file carries the sale price ${b.sale} with ${b.price} as the compare-at price, as the product itself is sold.`, { line: b.line });
    }
    const imgs = q._images.map((im, k) => ({ ...im, k })).sort((a, c) => (c.thumb - a.thumb) || (a.sort - c.sort) || (a.k - c.k));
    q.images = imgs.map(({ url, alt }) => ({ url, alt }));
    for (const k of ['_base', '_variants', '_images', '_digital', '_tracking', '_productSku']) delete q[k];
  }
  {
    const items = records.map((r) => g(r, 'Item').toLowerCase());
    const lastP = items.lastIndexOf('product');
    const firstV = items.indexOf('variant');
    const pCount = items.filter((x) => x === 'product').length;
    const firstI = items.indexOf('image');
    if (pCount >= 2 && firstV > lastP && (firstI === -1 || firstI > lastP) && lastP >= 0) resorted(records[firstV].__line, `Every Product row comes before every Variant and Image row (the file may have been sorted), so all ${items.filter((x) => x === 'variant').length} variants were put under the last product, "${products[products.length - 1].title}".`);
  }
  if (dropped.size) issue('info', 'BIGCOMMERCE_FIELDS_DROPPED', `These BigCommerce fields have no equivalent in the destination file and were not carried over: ${[...dropped].join(', ')}.`, {});
  return products;
}
