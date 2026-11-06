// Writer: neutral model -> Shopify product CSV in the current template layout.
// Layout per https://help.shopify.com/en/manual/products/import-export/using-csv
// and the official template (research/shopify.md):
// - first row of a product: product fields + first variant + first image
// - following rows: URL handle + variant fields only
// - then one row per extra image: URL handle + image columns only
// Products that Shopify would reject are left out of the file and reported.
import { CURRENT } from '../shopify-columns.js';
import { writeCSV } from '../csv.js';
import { formulaCells } from '../text.js';

export const ID = 'shopify';
export const LIMITS = { options: 3, variants: 2048, images: 250, tags: 250, seoTitle: 70, seoDescription: 320, alt: 512 };

const B = (v, dflt) => ((v === null || v === undefined ? dflt : v) ? 'TRUE' : 'FALSE');

export function write(products, ctx) {
  const { issue } = ctx;
  const rows = [CURRENT];
  const idx = Object.fromEntries(CURRENT.map((h, i) => [h, i]));
  const blank = () => CURRENT.map(() => '');
  let written = 0;
  for (const p of products) {
    const reason = rejectReason(p);
    if (reason) {
      issue('error', reason.code, `"${p.title || p.handle}" was left out of the Shopify file: ${reason.message}`, { handle: p.handle, line: p.source?.lines?.[0], rule: reason.rule });
      continue;
    }
    const hasOptions = p.options.length > 0;
    const tags = p.tags.slice(0, LIMITS.tags);
    if (p.tags.length > LIMITS.tags) issue('warning', 'TAGS_TRUNCATED', `"${p.title}" has ${p.tags.length} tags; Shopify allows 250, so the rest were dropped.`, { handle: p.handle, rule: 'shopify.tags-max' });
    const images = p.images.slice(0, LIMITS.images);
    if (p.images.length > LIMITS.images) issue('warning', 'IMAGES_TRUNCATED', `"${p.title}" has ${p.images.length} images; Shopify allows 250, so the rest were dropped.`, { handle: p.handle, rule: 'shopify.images-max' });
    let seoTitle = p.seoTitle;
    if (seoTitle.length > LIMITS.seoTitle) { seoTitle = ''; issue('warning', 'SEO_TITLE_DROPPED', `"${p.title}": the SEO title is over 70 characters, so it was left blank and Shopify will use the product title.`, { handle: p.handle, rule: 'shopify.seo-title-max' }); }
    let seoDesc = p.seoDescription;
    if (seoDesc.length > LIMITS.seoDescription) { seoDesc = seoDesc.slice(0, LIMITS.seoDescription); issue('warning', 'SEO_DESCRIPTION_CUT', `"${p.title}": the SEO description was cut to 320 characters.`, { handle: p.handle, rule: 'shopify.seo-description-max' }); }

    p.variants.forEach((v, i) => {
      const r = blank();
      const set = (h, val) => { r[idx[h]] = val ?? ''; };
      set('URL handle', p.handle);
      if (i === 0) {
        set('Title', p.title);
        set('Description', p.descriptionHtml);
        set('Vendor', p.vendor);
        set('Product category', p.shopifyCategory || '');
        set('Type', p.productType);
        set('Tags', tags.join(', '));
        set('Published on online store', B(p.status === 'active' && p.published !== false));
        set('Status', p.status);
        set('Gift card', 'FALSE');
        set('SEO title', seoTitle);
        set('SEO description', seoDesc);
        if (hasOptions) p.options.forEach((o, k) => set(`Option${k + 1} name`, o.name));
        else set('Option1 name', 'Title');
        for (const [h, v] of Object.entries(p.shopifyRaw || {})) set(h, v);
        if (images[0]) { set('Product image URL', images[0].url); set('Image position', '1'); set('Image alt text', (images[0].alt || '').slice(0, LIMITS.alt)); }
      }
      if (hasOptions) v.optionValues.forEach((val, k) => set(`Option${k + 1} value`, val));
      else set('Option1 value', 'Default Title');
      set('SKU', v.sku);
      set('Variant Barcodes', v.barcode);
      set('Price', v.price);
      if (v.compareAtPrice && v.price && Number(v.compareAtPrice) <= Number(v.price)) {
        issue('warning', 'COMPARE_AT_DROPPED', `"${p.title}" ${v.optionValues.join(' / ') || ''}: compare-at price ${v.compareAtPrice} is not higher than the price ${v.price}, so it was left blank (a compare-at price only shows as a sale when it is higher).`, { handle: p.handle });
        set('Compare-at price', '');
      } else set('Compare-at price', v.compareAtPrice);
      set('Cost per item', v.costPerItem);
      set('Charge tax', B(v.taxable, true));
      const tracked = v.inventoryTracked === true || (v.inventoryTracked === null && v.inventoryQty !== null);
      set('Inventory tracker', tracked ? 'shopify' : '');
      set('Inventory quantity', tracked ? String(v.inventoryQty ?? 0) : '');
      set('Continue selling when out of stock', v.continueSellingOutOfStock ? 'CONTINUE' : 'DENY');
      // Whole grams, as in Shopify's template (decimal grams UNVERIFIED).
      set('Weight value (grams)', v.weightGrams === null ? '' : String(Math.round(v.weightGrams)));
      set('Weight unit for display', v.weightUnit || (v.weightGrams === null ? '' : 'kg'));
      set('Requires shipping', B(v.requiresShipping, true));
      for (const [h, val] of Object.entries(v.shopifyRaw || {})) set(h, val);
      if (!(v.shopifyRaw && v.shopifyRaw['Fulfillment service'])) set('Fulfillment service', 'manual');
      set('Variant image URL', v.imageUrl);
      rows.push(r);
    });
    images.slice(1).forEach((img, k) => {
      const r = blank();
      r[idx['URL handle']] = p.handle;
      r[idx['Product image URL']] = img.url;
      r[idx['Image position']] = String(k + 2);
      r[idx['Image alt text']] = (img.alt || '').slice(0, LIMITS.alt);
      rows.push(r);
    });
    written++;
  }
  const extra = [...new Set(products.flatMap((p) => p.shopifyDropped || []))];
  if (extra.length) issue('info', 'SHOPIFY_FIELDS_DROPPED', `These columns are not part of Shopify's product template and were not carried over: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? `, and ${extra.length - 8} more` : ''}. Re-create those values after import if you need them.`, {});
  ctx.meta.writtenProducts = written;
  // Shopify documents no way to escape formulas, so cells are written as they
  // are and the visitor is warned not to open the file in a spreadsheet first.
  const f = formulaCells(rows);
  if (f.n) issue('warning', 'FORMULA_CELLS', `${f.n === 1 ? 'One cell starts' : `${f.n} cells start`} with =, +, - or @ (first in the ${f.first.column} column, line ${f.first.line}). Import the file into Shopify as it is. If you open it in Excel or Google Sheets first, those cells may be run as formulas, so check it in a text editor instead.`, { line: f.first.line, column: f.first.column });
  // UTF-8, LF line endings, no BOM: https://help.shopify.com/en/manual/products/import-export/using-csv
  return writeCSV(rows, { eol: '\n' });
}

function rejectReason(p) {
  if (!p.title) return { code: 'MISSING_TITLE', message: 'it has no title, and Title is the only required column.', rule: 'shopify.title-required' };
  if (p.options.length > LIMITS.options) {
    return { code: 'TOO_MANY_OPTIONS', message: `it has ${p.options.length} options (${p.options.map((o) => o.name).join(', ')}) and Shopify allows 3 per product. Combine or remove options in the source, or split it into separate products.`, rule: 'shopify.options-max' };
  }
  if (p.variants.length > LIMITS.variants) {
    return { code: 'TOO_MANY_VARIANTS', message: `it has ${p.variants.length} variants and Shopify allows 2,048 per product.`, rule: 'shopify.variants-max' };
  }
  const missing = p.variants.filter((v) => v.price === null || v.price === '').length;
  if (missing) return { code: 'MISSING_PRICE', message: `${missing === 1 && p.variants.length === 1 ? 'it has no price' : `${missing} of its ${p.variants.length} variants have no price`}, and Shopify rejects a blank price. Add a price in the source file and convert again.`, rule: 'shopify.price-required' };
  const seen = new Set();
  for (const v of p.variants) {
    const k = v.optionValues.join('\u0000');
    if (seen.has(k)) return { code: 'DUPLICATE_OPTIONS', message: `two variants have the same option values (${v.optionValues.join(' / ') || 'none'}).`, rule: 'shopify.options-unique' };
    seen.add(k);
  }
  return null;
}

