// Validator: checks a CSV meant for WooCommerce's core product importer
// (Products > Import) and returns the rows and columns WooCommerce would
// reject, skip or import differently from what the file seems to say. Every
// rule mirrors WooCommerce 11.2.2 source; see src/rules.js (woo.* ids) and
// research/woocommerce.md. Severity: error = the file or row is rejected or
// skipped; warning = it imports, but not as written; info = a mapping note.
import { parseCSV } from './csv.js';
import { EngineError } from './errors.js';
import { makeCollector, summarize } from './issues.js';
import { splitEscaped } from './text.js';

// English column labels (exporter get_default_column_names, 11.2.2) and the
// generic aliases (mappings/generic.php), lowercased, to internal keys.
const LABELS = {
  id: 'id', type: 'type', sku: 'sku', name: 'name', title: 'name', 'product title': 'name',
  published: 'published', 'is featured?': 'featured', 'visibility in catalog': 'catalog_visibility',
  'short description': 'short_description', description: 'description',
  'date sale price starts': 'date_on_sale_from', 'date sale price ends': 'date_on_sale_to',
  'tax status': 'tax_status', 'tax class': 'tax_class', 'in stock?': 'stock_status', stock: 'stock_quantity', quantity: 'stock_quantity',
  'low stock amount': 'low_stock_amount', 'backorders allowed?': 'backorders', 'sold individually?': 'sold_individually',
  'allow customer reviews?': 'reviews_allowed', 'purchase note': 'purchase_note', 'sale price': 'sale_price',
  'regular price': 'regular_price', price: 'regular_price', categories: 'category_ids', tags: 'tag_ids',
  'shipping class': 'shipping_class_id', images: 'images', 'download limit': 'download_limit',
  'download expiry days': 'download_expiry', parent: 'parent_id', 'parent sku': 'parent_id',
  'grouped products': 'grouped_products', upsells: 'upsell_ids', 'cross-sells': 'cross_sell_ids',
  'external url': 'product_url', 'button text': 'button_text', position: 'menu_order', 'menu order': 'menu_order',
  brands: 'brand_ids', 'cost of goods': 'cogs_value',
  // mappings/wordpress.php (finding 14)
  post_id: 'id', post_title: 'name', post_content: 'description', post_excerpt: 'short_description', post_parent: 'parent_id',
};
// Internal keys: an unmatched header equal to one of these still auto-selects
// that field on the mapping screen (html-csv-import-mapping.php).
const RAW_KEYS = new Set([...Object.values(LABELS), 'global_unique_id', 'tags_spaces', 'stock_quantity']);
const SPECIAL = [/^attribute (.+) (name|value\(s\)|visible|global|default)$/i, /^download (.+) (id|name|url)$/i, /^meta: (.+)$/i, /^meta:.+$/, /^attributes:/, /^downloads:/];
const WEIGHT_UNITS = ['kg', 'g', 'lbs', 'oz'];
const DIM_UNITS = ['m', 'cm', 'mm', 'in', 'yd'];
const TYPES = new Set(['simple', 'variable', 'variation', 'grouped', 'external']);
const VISIBILITY = new Set(['visible', 'catalog', 'search', 'hidden']);
const TAX = new Set(['taxable', 'shipping', 'none', 'true', 'false']);
const byteLength = (s) => new TextEncoder().encode(s).length;

// What wc_format_decimal makes of a price on a store whose decimal separator
// is a dot (the default): every character other than digits, dot and minus
// is removed, and only the last dot is kept.
export function wooDecimal(v) {
  return String(v).replace(/\.(?![^.]+$)|[^0-9.-]/g, '');
}

// PHP intval() of a string (PHP 7.1+): a numeric string, including "1e3" and
// "+5", is converted whole; otherwise the leading digits are read.
export function phpIntval(v) {
  const t = String(v).trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) { const n = Math.trunc(Number(t)); return Object.is(n, -0) ? 0 : n; }
  const m = t.match(/^[+-]?\d+/);
  return m ? Number(m[0]) : 0;
}

export function validateWooCommerce(text, opts = {}) {
  const { issues, issue } = makeCollector();
  const stats = { rows: 0, products: 0, variations: 0, images: 0 };
  const result = () => ({ ok: !issues.some((i) => i.severity === 'error'), issues: issues.map((x) => (x.line != null && !/^Line \d+/.test(x.message) ? { ...x, message: `Line ${x.line}: ${x.message}` } : x)).map((x, k) => [x, k]).sort((a, b) => ((a[0].line ?? 0) - (b[0].line ?? 0)) || a[1] - b[1]).map(([x]) => x), summary: summarize(issues), stats });

  if (opts.fileName && !/\.(csv|txt)$/i.test(opts.fileName)) {
    issue('error', 'FILE_TYPE', `The file is called "${opts.fileName}". WooCommerce only accepts .csv and .txt files. On a normal upload WordPress refuses it with "Sorry, you are not allowed to upload this file type."; with a file path on the server WooCommerce says "Invalid file type. The importer supports CSV and TXT file formats." Save or download it as CSV first.`, { rule: 'woo.file-type' });
  }
  if (typeof text !== 'string' || !text.trim()) { issue('error', 'EMPTY_FILE', 'The file is empty. WordPress refuses an empty upload with "File is empty. Please upload something more substantial."', { rule: 'woo.empty-upload' }); return result(); }
  // Finding 10: say what a non-CSV file is, as the Shopify side does.
  const notCsv = opts.sniff ? opts.sniff(text) : null;
  if (notCsv) { issue('error', 'NOT_CSV', notCsv, { rule: 'woo.file-type' }); return result(); }
  if (text.includes('�')) {
    const line = text.slice(0, text.indexOf('�')).split(/\r\n|\n|\r/).length;
    issue('error', 'NOT_UTF8', `Line ${line} has characters that could not be read as UTF-8 (shown as �). WooCommerce reads files as UTF-8 unless you pick another encoding under "Show advanced options", so accented letters would be damaged. Save the file as "CSV UTF-8" and check again.`, { line, rule: 'woo.encoding' });
  } else if (/Ã[\u0080-¿]|â€[\u0080-¿™œ]/.test(text)) {
    issue('warning', 'MOJIBAKE', 'Some text looks garbled (for example "Ã©" instead of "é"). The file was probably opened and saved in the wrong encoding by a spreadsheet program. WooCommerce will import the garbled text as it is, so fix it before importing.', { rule: 'woo.encoding' });
  }
  if (opts.byteLength && opts.byteLength > 2 * 1024 * 1024) {
    issue('info', 'FILE_SIZE', `The file is ${(opts.byteLength / 1048576).toFixed(1)} MB. WooCommerce's upload limit is set by your server (shown as "Maximum size" on the import screen; often 2 MB to 128 MB). If the upload fails with "The uploaded file exceeds the upload_max_filesize directive in php.ini.", split the file or raise the limit.`, { rule: 'woo.upload-size' });
  }

  let rows;
  try { rows = parseCSV(text, { delimiter: ',' }); } catch (e) {
    if (e instanceof EngineError) { issue('error', 'ILLEGAL_QUOTING', `${e.message} WooCommerce would read the rest of the file as one cell, so rows would run together or go missing.`, { rule: 'woo.quoting' }); return result(); }
    throw e;
  }
  const header = rows[0].map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h).trim());
  // Finding 3: count separators outside quotes on the first line; a
  // semicolon file can still split on the commas inside "GTIN, UPC, EAN, or ISBN".
  const firstLine = (() => { const t = text.replace(/^\ufeff/, ''); const c = { ',': 0, ';': 0, '\t': 0 }; let q = false; for (let i = 0; i < t.length && i < 20000; i++) { const ch = t[i]; if (ch === '"') q = !q; else if (!q && (ch === '\n' || ch === '\r')) break; else if (!q && ch in c) c[ch]++; } return c; })();
  if ((header.length === 1 && /[;\t]/.test(header[0])) || Math.max(firstLine[';'], firstLine['\t']) > firstLine[',']) {
    issue('error', 'WRONG_DELIMITER', 'The columns are separated by semicolons or tabs, not commas. WooCommerce expects commas, so every column would land in one. Save the file as "CSV UTF-8 (comma delimited)", or set "CSV Delimiter" under "Show advanced options" on the import screen.', { line: 1, rule: 'woo.delimiter' });
    return result();
  }
  const data = rows.slice(1).filter((r) => r.some((c) => String(c ?? '') !== ''));
  if (!data.length) { issue('error', 'NO_ROWS', 'The file has a header row but no products. WooCommerce shows "The file is empty or using a different encoding than UTF-8, please try again with a new file."', { line: 1, rule: 'woo.empty-or-encoding' }); return result(); }

  // Map headers the way auto_map_columns does: exact label, case-insensitive.
  const col = {};
  const attrCols = {};
  const seenHead = new Map();
  header.forEach((h, i) => {
    if (h && seenHead.has(h.toLowerCase())) issue('warning', 'HEADER_DUPLICATE', `The column "${h}" appears more than once (columns ${seenHead.get(h.toLowerCase()) + 1} and ${i + 1}). WooCommerce imports only the last one, so the values in the earlier column are ignored. Delete one of them.`, { line: 1, column: h, rule: 'woo.header-duplicate' });
    if (h) seenHead.set(h.toLowerCase(), i);
  });
  header.forEach((h, i) => {
    const low = h.toLowerCase();
    if (!h) { issue('info', 'HEADER_BLANK', `Column ${i + 1} has no header name, so WooCommerce will not import it.`, { line: 1, rule: 'woo.column-mapping' }); return; }
    if (LABELS[low]) { col[LABELS[low]] = i; return; }
    const unit = h.match(/^(weight|length|width|height) \(([^)]*)\)$/i);
    if (unit) {
      const ok = /^weight$/i.test(unit[1]) ? WEIGHT_UNITS : DIM_UNITS;
      if (!ok.includes(unit[2].trim().toLowerCase())) issue('warning', 'HEADER_UNIT_UNKNOWN', `The column "${h}" will not be matched automatically: WooCommerce names it after the store's unit setting, which is one of ${ok.join(', ')}. Pick the field by hand on the "Map CSV fields to products" screen, and check the numbers are in your store's unit.`, { line: 1, column: h, rule: 'woo.column-mapping' });
      else issue('info', 'HEADER_UNIT', `"${h}" is only matched automatically when your store's ${unit[1].toLowerCase() === 'weight' ? 'weight' : 'dimension'} unit is ${unit[2].trim()}. WooCommerce does not convert units: the numbers are read in the store's unit.`, { line: 1, column: h, rule: 'woo.column-mapping' });
      col[unit[1].toLowerCase()] = i;
      return;
    }
    if (low === 'gtin, upc, ean, or isbn') { issue('info', 'GTIN_NOT_AUTO_MAPPED', `WooCommerce 11.2 and earlier do not match the "${h}" column automatically. Choose "GTIN, UPC, EAN, or ISBN" for it on the mapping screen, or it will not be imported.`, { line: 1, column: h, rule: 'woo.gtin-mapping' }); col.global_unique_id = i; return; }
    const a = h.match(/^attribute (.+) (name|value\(s\)|visible|global|default)$/i);
    if (a) { attrCols[a[1]] = attrCols[a[1]] || {}; attrCols[a[1]][a[2].toLowerCase()] = i; return; }
    if (SPECIAL.some((re) => re.test(h)) || RAW_KEYS.has(low)) { if (RAW_KEYS.has(low)) col[low] = i; return; }
    const near = /^attribute \d+ value$/i.test(h) ? ` Did you mean "${h}(s)"?` : '';
    issue('info', 'HEADER_UNMAPPED', `"${h}" is not one of WooCommerce's English column names, so unless it is the translated name in your admin language it shows as "Do not import" on the mapping screen.${near} Rename it to a WooCommerce column name or pick a field by hand.`, { line: 1, column: h, rule: 'woo.column-mapping' });
  });
  const attrs = Object.entries(attrCols).filter(([, c]) => c.name !== undefined).map(([n, c]) => ({ n, ...c }));
  for (const [n, c] of Object.entries(attrCols)) if (c.name === undefined && c['value(s)'] !== undefined) issue('warning', 'ATTRIBUTE_NAME_COLUMN_MISSING', `There is an "Attribute ${n} value(s)" column but no "Attribute ${n} name" column, so those values have no attribute to belong to.`, { line: 1, rule: 'woo.variation-attributes' });

  // Finding 15: nothing matched at all, so no value could be checked.
  if (!Object.keys(col).length && !attrs.length) issue('warning', 'NOTHING_MAPPED', 'None of the columns is a WooCommerce English column name, so nothing would be matched automatically and the values in the rows could not be checked. If the file uses another language\'s column names, they only map on a store whose admin language matches.', { line: 1, rule: 'woo.column-mapping' });
  // R2-3: WooCommerce walks only the cells a row has (I:1166), so for a
  // repeated header the last column present in that row wins.
  const colsFor = {};
  header.forEach((h, i) => { const k = LABELS[h.toLowerCase()] || (RAW_KEYS.has(h.toLowerCase()) ? h.toLowerCase() : null); if (k && col[k] !== undefined) (colsFor[k] = colsFor[k] || []).push(i); });
  const cell = (r, k) => {
    if (col[k] === undefined) return '';
    const list = colsFor[k] && colsFor[k].length > 1 ? colsFor[k].filter((i) => i < r.length) : null;
    const i = list ? (list.length ? list[list.length - 1] : col[k]) : col[k];
    return String(r[i] ?? '');
  };
  const ct = (r, k) => cell(r, k).trim();
  const colName = (k) => (col[k] === undefined ? k : header[col[k]]);
  const typeOf = (r) => {
    const parts = ct(r, 'type').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    return parts.filter((p) => p !== 'virtual' && p !== 'downloadable')[0] || 'simple';
  };
  const attrOf = (r) => attrs.map((a) => ({ name: String(r[a.name] ?? '').trim(), values: splitEscaped(r[a['value(s)']] ?? '') })).filter((a) => a.name);

  // First pass: index by SKU and ID.
  const bySku = new Map();
  const byId = new Map();
  stats.rows = data.length;
  for (const r of data) {
    const line = r.line;
    if (r.length !== header.length && r.length > 1) issue('warning', 'ROW_CELL_COUNT', `Line ${line} has ${r.length} cells but the header has ${header.length}. WooCommerce matches cells to columns by position, so a missing or extra comma or quote shifts every value after it into the wrong column.`, { line, rule: 'woo.quoting' });
    const sku = ct(r, 'sku');
    if (sku) {
      const key = sku.toLowerCase();
      const prev = bySku.get(key);
      if (prev) {
        const same = ct(prev, 'sku') === sku;
        issue('error', 'SKU_DUPLICATE', `SKU "${sku}" is also on line ${prev.line}${same ? '' : ` (as "${ct(prev, 'sku')}"; WordPress databases usually ignore letter case when matching SKUs)`}. On a new-products import the first row creates the product and this row is skipped with "A product with this SKU already exists."; with "Update existing products" ticked, this row overwrites what line ${prev.line} imported instead. Give every product and variation its own SKU.`, { line, column: colName('sku'), rule: 'woo.sku-skip' });
      } else bySku.set(key, r);
    }
    const id = ct(r, 'id');
    if (id && /^\d+$/.test(id) && Number(id) > 0) {
      const key = String(Number(id));
      const prev = byId.get(key);
      if (prev) issue('error', 'ID_DUPLICATE', `ID ${id} is also on line ${prev.line}${ct(prev, 'id') === id ? '' : ` (as ${ct(prev, 'id')}, the same number)`}. On a new-products import only the first is imported and this row is skipped with "A product with this ID already exists."; with "Update existing products" ticked, this row overwrites the same product instead, or both are skipped with "No matching product exists to update." if the ID is not in your store.`, { line, column: colName('id'), rule: 'woo.id-unique' });
      else byId.set(key, r);
    }
  }

  const resolveParent = (v) => {
    const m = v.match(/^id:(\d+)$/);
    return m ? byId.get(String(Number(m[1]))) : bySku.get(v.toLowerCase());
  };

  for (const r of data) {
    const line = r.line;
    const name = ct(r, 'name');
    const label = name ? `"${name.slice(0, 60)}"` : 'This row';
    // Type.
    const rawType = ct(r, 'type');
    if (rawType) {
      // Finding 9: WooCommerce uses only the first part that is not virtual
      // or downloadable (current(array_diff())), and accepts any type a
      // plugin registers.
      const first = rawType.toLowerCase().split(',').map((s) => s.trim()).filter((p) => p && p !== 'virtual' && p !== 'downloadable')[0];
      if (first && !TYPES.has(first)) { issue('warning', 'TYPE_INVALID', `${label}: Type "${rawType}" is not one of WooCommerce's own product types, so the row fails with "Invalid product type." unless a plugin on your store adds the type "${first}". Otherwise use simple, variable, variation, grouped or external, optionally followed by ", virtual" or ", downloadable".`, { line, column: colName('type'), rule: 'woo.type-values' }); continue; }
    }
    const type = typeOf(r);
    if (type === 'variation') stats.variations++; else stats.products++;

    // Variations and their parent.
    if (type === 'variation') {
      const pv = ct(r, 'parent_id');
      if (!pv) {
        issue('error', 'VARIATION_NO_PARENT', `${label} is a variation with no Parent, so it fails with "Variation cannot be imported: Missing parent ID or parent does not exist yet." Put the parent product's SKU (or id:123) in the Parent column.`, { line, column: col.parent_id === undefined ? undefined : colName('parent_id'), rule: 'woo.variation-parent' });
      } else {
        const parent = resolveParent(pv);
        if (!parent) {
          issue('warning', 'VARIATION_PARENT_NOT_IN_FILE', `${label}: the parent "${pv}" is not in this file. If no product in your store has that ${/^id:\d+$/.test(pv) ? 'ID' : 'SKU'}, WooCommerce attaches the variation to a temporary "Import placeholder for ${/^id:\d+$/.test(pv) ? pv.slice(3) : pv}" product and deletes both when the import finishes, so the variation is lost. Add the parent row (Type variable) to the file above its variations, or check the SKU.`, { line, column: colName('parent_id'), rule: 'woo.variation-placeholder' });
        } else {
          const pt = typeOf(parent);
          if (pt === 'variable' && parent.line > line) issue('warning', 'VARIATION_BEFORE_PARENT', `${label} (line ${line}) comes before its parent "${pv}" (line ${parent.line}). WooCommerce then attaches the variation to a placeholder that has no attributes yet and drops the variation's attributes, so it matches every choice. Move the parent row above its variations.`, { line, column: colName('parent_id'), rule: 'woo.variation-order' });
          if (pt === 'variation') issue('error', 'VARIATION_PARENT_IS_VARIATION', `${label}: the Parent "${pv}" is another variation (line ${parent.line}), so the row fails with "Variation cannot be imported: Parent product cannot be a product variation". Use the variable product's SKU.`, { line, column: colName('parent_id'), rule: 'woo.variation-parent' });
          else if (pt !== 'variable') issue('warning', 'VARIATION_PARENT_NOT_VARIABLE', `${label}: the Parent "${pv}" (line ${parent.line}) has Type "${ct(parent, 'type') || 'simple'}", not variable. Variations only show on a variable product, so change the parent's Type to variable.`, { line, column: colName('parent_id'), rule: 'woo.variation-parent-variable' });
          else {
            const pAttrs = attrOf(parent);
            for (const a of attrOf(r)) {
              const pa = pAttrs.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
              if (!pa) issue('warning', 'VARIATION_ATTRIBUTE_NOT_ON_PARENT', `${label}: the attribute "${a.name}" is not on the parent "${pv}" (line ${parent.line}). WooCommerce drops it from the variation, which then matches any value. Add "${a.name}" with all its values to the parent row.`, { line, rule: 'woo.variation-attributes' });
              else if (a.values[0] && pa.values.length && !pa.values.some((v) => v.toLowerCase() === a.values[0].toLowerCase())) issue('warning', 'VARIATION_VALUE_NOT_ON_PARENT', `${label}: "${a.values[0]}" is not one of the parent's ${pa.name} values (${pa.values.slice(0, 8).join(', ')}). Shoppers may not be able to choose this variation. Add the value to the parent row or fix the spelling.`, { line, rule: 'woo.variation-values' });
            }
          }
        }
      }
      for (const a of attrOf(r)) if (a.values.length > 1) issue('warning', 'VARIATION_MULTIPLE_VALUES', `${label}: the variation has ${a.values.length} values for "${a.name}" (${a.values.join(', ')}). A variation takes one value per attribute; WooCommerce keeps only the first, "${a.values[0]}". Make one variation row per value.`, { line, rule: 'woo.variation-values' });
    }

    // Enumerated fields.
    const vis = ct(r, 'catalog_visibility');
    if (vis && !VISIBILITY.has(vis.toLowerCase())) issue('error', 'VISIBILITY_INVALID', `${label}: Visibility in catalog "${vis}" is not allowed, so the row fails with "Invalid catalog visibility option." Use visible, catalog, search or hidden.`, { line, column: colName('catalog_visibility'), rule: 'woo.visibility-values' });
    const tax = ct(r, 'tax_status');
    if (tax && !TAX.has(tax.toLowerCase())) issue('error', 'TAX_STATUS_INVALID', `${label}: Tax status "${tax}" is not allowed, so the row fails with "Invalid product tax status." Use taxable, shipping or none.`, { line, column: colName('tax_status'), rule: 'woo.tax-status-values' });
    const pub = ct(r, 'published');
    if (col.published !== undefined && !pub) issue('warning', 'PUBLISHED_BLANK', `${label}: Published is ${cell(r, 'published') ? 'only spaces' : 'blank'}, so WooCommerce imports this ${type === 'variation' ? 'variation' : 'product'} as ${cell(r, 'published') ? 'private (spaces are read as 0)' : 'a draft'}, not visible in your shop. Write 1 to publish it, or delete the Published column to use the default.`, { line, column: colName('published'), rule: 'woo.published-values' });
    if (pub && !['-1', '0', '1', '2', 'true', 'false'].includes(pub.toLowerCase())) {
      const n = Number.isFinite(parseFloat(pub)) ? Math.trunc(parseFloat(pub)) : 0;
      const became = { '-1': 'a draft', 0: 'private', 1: 'published', 2: 'pending review' }[n] || 'a draft';
      issue('warning', 'PUBLISHED_INVALID', `${label}: Published is "${pub}". WooCommerce reads only 1 (published), 0 (private), -1 (draft) and 2 (pending review), so this product will be ${type === 'variation' && became === 'a draft' ? 'published' : became}. Write 1 to publish it.`, { line, column: colName('published'), rule: 'woo.published-values' });
    }
    // Stock.
    const ins = ct(r, 'stock_status');
    const stock = ct(r, 'stock_quantity');
    if (ins && !['1', '0', 'backorder'].includes(ins)) {
      issue('warning', 'IN_STOCK_INVALID', `${label}: In stock? is "${ins}". WooCommerce reads only 1, 0 and backorder (in lower case); any other text counts as yes, so this product will be marked in stock. Write 1 (in stock), 0 (out of stock) or backorder.`, { line, column: colName('stock_status'), rule: 'woo.stock-status-values' });
    } else if (col.stock_status !== undefined && !ins && !stock && (type === 'simple' || type === 'variation')) {
      issue('warning', 'IN_STOCK_BLANK', `${label}: In stock? is blank and Stock is blank, so WooCommerce marks the product out of stock. Write 1 for in stock, or enter a stock number.`, { line, column: colName('stock_status'), rule: 'woo.stock-status-values' });
    }
    if (stock && stock.toLowerCase() !== 'parent' && !/^[+-]?\d+$/.test(stock.replace(/^'(?=-)/, ''))) {
      const read = phpIntval(stock.replace(/^'(?=-)/, ''));
      issue('warning', 'STOCK_NOT_WHOLE_NUMBER', `${label}: Stock "${stock}" is not a whole number. WooCommerce reads it as ${read} and turns on stock management. Write a plain whole number such as 1200, or leave it blank to not track stock.`, { line, column: colName('stock_quantity'), rule: 'woo.stock-values' });
    }
    const bo = ct(r, 'backorders');
    if (bo && !['0', '1', 'notify'].includes(bo)) issue('warning', 'BACKORDERS_INVALID', `${label}: Backorders allowed? is "${bo}". WooCommerce reads only 1, 0 and notify, so this becomes "Do not allow". Write 1 to allow backorders or notify to allow them with a notice.`, { line, column: colName('backorders'), rule: 'woo.backorders-values' });
    // Prices.
    for (const k of ['regular_price', 'sale_price']) {
      const v = ct(r, k);
      if (!v) continue;
      const read = wooDecimal(v);
      if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) issue('info', 'PRICE_COMMA', `${label}: ${colName(k)} "${v}" has a thousands comma. On a store whose decimal separator is a dot (the default), WooCommerce removes it and reads ${read}, which is right; leaving it out is safer.`, { line, column: colName(k), rule: 'woo.price-format' });
      else if ((read.match(/\./g) || []).length === 1 && (v.match(/\./g) || []).length > 1 && !v.includes(',')) issue('warning', 'PRICE_DOTS', `${label}: ${colName(k)} "${v}" has more than one dot. WooCommerce keeps only the last one and reads ${read}. Write the price with one dot before the cents, for example 12.50.`, { line, column: colName(k), rule: 'woo.price-format' });
      else if (v.includes(',')) issue('warning', 'PRICE_COMMA', `${label}: ${colName(k)} "${v}" has a comma. On a store whose decimal separator is a dot (the default), WooCommerce removes the comma and reads ${read || 'nothing'}. Write the price with a dot before the cents and no thousands separator, for example 1299.00.`, { line, column: colName(k), rule: 'woo.price-format' });
      else if (!/^-?\d*\.?\d+$/.test(read) || read !== v) {
        if (!/^-?\d*\.?\d+$/.test(read)) issue('warning', 'PRICE_NOT_NUMBER', `${label}: ${colName(k)} "${v}" has no number WooCommerce can read, so the product gets no ${k === 'sale_price' ? 'sale ' : ''}price${k === 'regular_price' ? ' and cannot be bought' : ''}. Write a plain number such as 19.99.`, { line, column: colName(k), rule: 'woo.price-format' });
        else issue('info', 'PRICE_EXTRA_CHARACTERS', `${label}: ${colName(k)} "${v}" has characters other than digits and a dot. WooCommerce strips them and reads ${read}. Check that is right.`, { line, column: colName(k), rule: 'woo.price-format' });
      }
    }
    // Images.
    const imgs = splitEscaped(cell(r, 'images'));
    stats.images += imgs.length;
    const local = imgs.filter((u) => !u.includes('://'));
    if (local.length) issue('warning', 'IMAGE_NOT_URL', `${label}: the image "${local[0].slice(0, 80)}" is not a web link. WooCommerce only looks for a file with that name already in your Media Library; if it is not there the image fails with "Unable to use image". Use a full https:// link, or upload the files to the Media Library first.`, { line, column: colName('images'), rule: 'woo.image-values' });
    // Leading apostrophe kept in fields WooCommerce does not unescape.
    for (const k of ['name', 'description', 'short_description', 'category_ids', 'images', 'sku', 'parent_id']) {
      const v = cell(r, k);
      if (/^'[=+\-@]/.test(v)) { issue('warning', 'APOSTROPHE_KEPT', `${label}: ${colName(k)} starts with an apostrophe before ${v[1]}. WooCommerce removes that apostrophe in number and code columns, but not in ${colName(k)}, so it will show in your store. Remove it.`, { line, column: colName(k), rule: 'woo.formula-escape' }); break; }
    }
  }
  return result();
}
