// Validator: checks a CSV meant for Shopify's product importer and returns
// per-row problems, each tied to the documented rule in src/rules.js.
import { parseCSV, toRecords } from './csv.js';
import { EngineError } from './errors.js';
import { makeCollector, summarize } from './issues.js';
import { CURRENT, FIELDS, resolveHeaders } from './shopify-columns.js';
import { isPlainDecimal, parsePrice } from './money.js';
import { formulaCells } from './text.js';

const MAX_BYTES = 15 * 1024 * 1024;
const KNOWN = new Set([...CURRENT, ...Object.values(FIELDS).flat(), 'Collection', 'Variant Tax Code', 'Variant Compare-at Price', 'Barcodes', 'Option1 LinkedTo', 'Option2 LinkedTo', 'Option3 LinkedTo']);
const KNOWN_LOWER = new Map([...KNOWN].map((h) => [h.toLowerCase(), h]));
const PATTERN_HEADERS = [/^(Price|Compare-at price|Compare At Price|Included) \/ .+$/i, /\(product\.metafields\.[^)]+\)$/, /^product\.metafields\./, /^Variant Metafield:/i, /^Metafield:/i, /^Google Shopping \/ /];

const byteLength = (s) => new TextEncoder().encode(s).length;
const TRUE_FALSE = new Set(['true', 'false']);

export function validateShopify(text, opts = {}) {
  const { issues, issue } = makeCollector();
  // Issues are returned sorted by line (file-level issues first).
  const result = () => ({ ok: !issues.some((i) => i.severity === 'error'), issues: issues.map((x) => (x.line != null && !/^Line \d+/.test(x.message) ? { ...x, message: `Line ${x.line}: ${x.message}` } : x)).map((x, k) => [x, k]).sort((a, b) => ((a[0].line ?? 0) - (b[0].line ?? 0)) || a[1] - b[1]).map(([x]) => x), summary: summarize(issues), stats });
  const stats = { rows: 0, products: 0, variants: 0, images: 0 };
  if (typeof text !== 'string' || !text.trim()) { issue('error', 'EMPTY_FILE', 'The file is empty.'); return result(); }
  const bytes = opts.byteLength ?? byteLength(text);
  if (bytes > MAX_BYTES) issue('error', 'FILE_TOO_LARGE', `The file is ${(bytes / 1048576).toFixed(1)} MB. Shopify accepts product CSV files up to 15 MB, so split it into smaller files, keeping all rows of a product in the same file.`, { rule: 'shopify.file-size' });
  if (text.includes('�')) issue('error', 'NOT_UTF8', 'The file contains characters that could not be read (shown as �). It was probably saved in an encoding other than UTF-8. Save it again as "CSV UTF-8" and re-check.', { rule: 'shopify.utf8' });
  else if (/Ã[\u0080-¿]|â€[\u0080-¿™œ]/.test(text)) issue('warning', 'MOJIBAKE', 'Some text looks garbled (for example "Ã©" instead of "é"). The file may have been converted between encodings by a spreadsheet program. Check accented characters before importing.', { rule: 'shopify.utf8' });

  let rows;
  try { rows = parseCSV(text, { delimiter: ',' }); } catch (e) {
    if (e instanceof EngineError) { issue('error', 'ILLEGAL_QUOTING', `${e.message} Shopify reports this as "Illegal quoting" or "Missing or stray quote".`, { rule: 'shopify.quoting' }); return result(); }
    throw e;
  }
  if (rows.length < 2) { issue('error', 'NO_ROWS', 'The file has a header row but no products.'); return result(); }
  const f = formulaCells(rows);
  if (f.n) issue('warning', 'FORMULA_CELLS', `${f.n === 1 ? 'One cell starts' : `${f.n} cells start`} with =, +, - or @ (first in the ${f.first.column} column, line ${f.first.line}). Shopify imports them as text, but a spreadsheet program may run them as formulas, so do not open and re-save this file in Excel or Google Sheets.`, { line: f.first.line, column: f.first.column });
  const rawHeaders = rows[0];
  if (rawHeaders.length === 1 && /[;\t]/.test(rawHeaders[0])) {
    issue('error', 'WRONG_DELIMITER', 'The columns are separated by semicolons or tabs. Shopify needs commas. Save the file as "CSV UTF-8 (comma delimited)".', { rule: 'shopify.headers' });
    return result();
  }
  // Header checks.
  const seen = new Set();
  rawHeaders.forEach((h, i) => {
    if (h !== h.trim()) issue('error', 'HEADER_WHITESPACE', `Column ${i + 1} header "${h}" has extra spaces. Shopify needs header names to match exactly ("Invalid CSV header: missing headers").`, { line: 1, column: h.trim(), rule: 'shopify.headers' });
    const t = h.trim();
    if (!t) { issue('warning', 'HEADER_BLANK', `Column ${i + 1} has no header name. Remove the empty column.`, { line: 1 }); return; }
    if (seen.has(t)) issue('error', 'HEADER_DUPLICATE', `The header "${t}" appears more than once.`, { line: 1, column: t, rule: 'shopify.headers' });
    seen.add(t);
    if (KNOWN.has(t)) return;
    const extraOpt = t.match(/^Option(\d+) (name|value|linked to)$/i);
    if (extraOpt && Number(extraOpt[1]) > 3) {
      issue('error', 'TOO_MANY_OPTIONS', `The file has a column "${t}". Shopify allows up to three options per product (Option1 to Option3), so this column cannot be imported. Combine options or split the product.`, { line: 1, column: t, rule: 'shopify.options-max' });
      return;
    }
    const ci = KNOWN_LOWER.get(t.toLowerCase());
    if (ci) issue('error', 'HEADER_CASE', `Header "${t}" should be written "${ci}". Shopify column headers are case-sensitive.`, { line: 1, column: t, rule: 'shopify.headers' });
    else if (!PATTERN_HEADERS.some((re) => re.test(t))) issue('info', 'HEADER_UNKNOWN', `Shopify does not recognise the column "${t}". It will be ignored or Shopify will ask you to map it.`, { line: 1, column: t, rule: 'shopify.headers' });
  });
  const headerSet = new Set(rawHeaders.map((h) => h.trim()));
  if ((headerSet.has('Barcode') || headerSet.has('Variant Barcode')) && (headerSet.has('Barcodes') || headerSet.has('Variant Barcodes'))) {
    issue('error', 'BARCODE_BOTH', 'The file has both a Barcode column and a Barcodes column. Keep only one.', { line: 1, rule: 'shopify.barcode-columns' });
  }
  const { headers, records } = toRecords(rows);
  const m = resolveHeaders(headers);
  if (!m.title) issue('error', 'MISSING_TITLE_COLUMN', 'The file has no Title column. Title is the only required column for new products.', { line: 1, rule: 'shopify.title-required' });
  if (!m.handle) issue('warning', 'MISSING_HANDLE_COLUMN', 'The file has no URL handle column, so Shopify cannot group variant and image rows under a product. Every row will be treated as its own product.', { line: 1, rule: 'shopify.handle-unique' });
  if (!m.price) issue('warning', 'MISSING_PRICE_COLUMN', 'The file has no Price column. New products need a price on every variant row ("Validation failed: price can\'t be blank").', { line: 1, rule: 'shopify.price-required' });
  const g = (r, k) => (m[k] ? String(r[m[k]] ?? '') : '');
  const gt = (r, k) => g(r, k).trim();

  stats.rows = records.length;
  // Group rows by handle, checking that each handle's rows are together.
  const groups = new Map();
  let prev = null;
  for (const r of records) {
    const line = r.__line;
    if (r.__cells !== headers.length && r.__cells > 1) issue('warning', 'ROW_CELL_COUNT', `Line ${line} has ${r.__cells} cells but the header has ${headers.length}. A missing or extra comma or quote may have shifted the columns.`, { line, rule: 'shopify.quoting' });
    const handle = m.handle ? gt(r, 'handle') : `__row${line}`;
    if (!handle) {
      issue('error', 'MISSING_HANDLE', `Line ${line} has no URL handle.${gt(r, 'title') ? ' Shopify will make one from the title, but variant and image rows need it to attach to the product.' : ' Without a handle or a title, Shopify cannot attach this row to a product.'}`, { line, column: m.handle, rule: 'shopify.handle-unique' });
      continue;
    }
    if (groups.has(handle) && prev !== handle) {
      issue('error', 'HANDLE_NOT_CONTIGUOUS', `Line ${line} uses the handle "${handle}" again after rows for another product. Keep all rows of a product together, and give each product its own handle; otherwise Shopify reports "Ignored line ... because handle ${handle} already exists".`, { line, handle, rule: 'shopify.handle-unique' });
    }
    if (!groups.has(handle)) groups.set(handle, []);
    groups.get(handle).push(r);
    prev = handle;
  }

  const skuSeen = new Map();
  for (const [handle, rs] of groups) {
    stats.products++;
    const first = rs[0];
    const fl = first.__line;
    const H = m.handle ? handle : undefined;
    if (m.handle && /\s/.test(handle)) issue('error', 'HANDLE_SPACES', `Handle "${handle}" contains spaces. A handle can contain letters, dashes and numbers only.`, { line: fl, handle: H, column: m.handle, rule: 'shopify.handle-chars' });
    else if (m.handle && !/^[\p{L}\p{N}-]+$/u.test(handle)) issue('warning', 'HANDLE_CHARS', `Handle "${handle}" contains characters other than letters, numbers and dashes. Shopify may change it on import, which breaks links to the product.`, { line: fl, handle: H, column: m.handle, rule: 'shopify.handle-chars' });
    if (handle.length > 255) issue('warning', 'HANDLE_LONG', `Handle "${handle.slice(0, 40)}..." is longer than 255 characters.`, { line: fl, handle: H, rule: 'shopify.title-length' });
    const title = gt(first, 'title');
    if (m.title && !title) issue('error', 'NO_PRODUCT_DATA', `The first row for "${handle}" (line ${fl}) has no Title. Shopify will report "Ignored line ${fl} because it did not contain product data" unless the product already exists and you are overwriting it.`, { line: fl, handle: H, column: m.title, rule: 'shopify.no-product-data' });
    if (title.length > 255) issue('warning', 'TITLE_LONG', `The title for "${handle}" is ${title.length} characters; titles over 255 characters are reported to fail.`, { line: fl, handle: H, rule: 'shopify.title-length' });
    for (const r of rs.slice(1)) if (gt(r, 'title') && gt(r, 'title') !== title) issue('warning', 'TITLE_ON_VARIANT_ROW', `Line ${r.__line} repeats the handle "${handle}" with a different Title ("${gt(r, 'title')}"). If this is a different product, give it its own handle.`, { line: r.__line, handle: H, rule: 'shopify.handle-unique' });
    if (m.status) {
      const st = gt(first, 'status').toLowerCase();
      if (!st) issue('error', 'STATUS_BLANK', `"${handle}" has a blank Status. When the Status column is present, each product needs active, draft or archived.`, { line: fl, handle: H, column: m.status, rule: 'shopify.status-values' });
      else if (!['active', 'draft', 'archived'].includes(st)) issue('error', 'STATUS_INVALID', `"${handle}" has Status "${gt(first, 'status')}". Use active, draft or archived.`, { line: fl, handle: H, column: m.status, rule: 'shopify.status-values' });
    }
    if (m.published && gt(first, 'published') && !TRUE_FALSE.has(gt(first, 'published').toLowerCase())) issue('error', 'BOOLEAN_INVALID', `"${handle}": ${m.published} is "${gt(first, 'published')}". Use TRUE or FALSE.`, { line: fl, handle: H, column: m.published, rule: 'shopify.boolean-values' });
    const tags = gt(first, 'tags').split(',').map((s) => s.trim()).filter(Boolean);
    if (tags.length > 250) issue('error', 'TOO_MANY_TAGS', `"${handle}" has ${tags.length} tags. Shopify allows 250 per product.`, { line: fl, handle: H, column: m.tags, rule: 'shopify.tags-max' });
    if (gt(first, 'seoTitle').length > 70) issue('warning', 'SEO_TITLE_LONG', `"${handle}": the SEO title is ${gt(first, 'seoTitle').length} characters; Shopify's limit is 70.`, { line: fl, handle: H, column: m.seoTitle, rule: 'shopify.seo-title-max' });
    if (gt(first, 'seoDescription').length > 320) issue('warning', 'SEO_DESCRIPTION_LONG', `"${handle}": the SEO description is ${gt(first, 'seoDescription').length} characters; Shopify's limit is 320.`, { line: fl, handle: H, column: m.seoDescription, rule: 'shopify.seo-description-max' });

    const optNames = [1, 2, 3].map((i) => gt(first, `opt${i}name`));
    const combos = new Map();
    let variants = 0;
    let images = 0;
    for (const r of rs) {
      const line = r.__line;
      const vals = [1, 2, 3].map((i) => gt(r, `opt${i}value`));
      const img = gt(r, 'imageUrl');
      const variantFields = ['sku', 'price', 'compareAt', 'qty', 'grams', 'tracker', 'policy', 'barcode', 'variantImage'];
      const isVariant = vals.some(Boolean) || variantFields.some((k) => gt(r, k)) || r === first;
      const isImageOnly = !isVariant && img;
      if (img) {
        images++;
        checkImage(img, line, H, m.imageUrl, issue);
        if (gt(r, 'imageAlt').length > 512) issue('warning', 'ALT_LONG', `Line ${line}: image alt text is over 512 characters.`, { line, handle: H, column: m.imageAlt, rule: 'shopify.alt-max' });
        if (m.imagePosition && gt(r, 'imagePosition') && !/^\d+$/.test(gt(r, 'imagePosition'))) issue('error', 'IMAGE_POSITION', `Line ${line}: Image position "${gt(r, 'imagePosition')}" must be a whole number.`, { line, handle: H, column: m.imagePosition });
      }
      if (gt(r, 'variantImage')) checkImage(gt(r, 'variantImage'), line, H, m.variantImage, issue);
      if (isImageOnly || (!isVariant && !img)) continue;
      variants++;
      vals.forEach((v, i) => {
        if (v && !optNames[i]) issue('warning', 'OPTION_NAME_MISSING', `Line ${line}: Option${i + 1} value "${v}" has no Option${i + 1} name on the product's first row.`, { line, handle: H, rule: 'shopify.option-name-needed' });
        if (!v && optNames[i]) issue('error', 'OPTION_VALUE_MISSING', `Line ${line}: the product has an option "${optNames[i]}" but this variant has no Option${i + 1} value.`, { line, handle: H, rule: 'shopify.options-unique' });
      });
      const key = vals.join('\u0000');
      if (combos.has(key)) issue('error', 'DUPLICATE_OPTIONS', `Line ${line}: "${handle}" already has a variant with ${vals.filter(Boolean).join(' / ') || 'no option values'} (line ${combos.get(key)}). Shopify rejects this with "Validation failed: options are not unique".`, { line, handle: H, rule: 'shopify.options-unique' });
      else combos.set(key, line);
      // Price.
      const price = gt(r, 'price');
      if (m.price) {
        if (!price) issue('error', 'PRICE_BLANK', `Line ${line}: the variant has no price. Shopify reports "Validation failed: price can't be blank".`, { line, handle: H, column: m.price || 'Price', rule: 'shopify.price-required' });
        else checkPrice(price, line, H, m.price, issue);
      }
      if (gt(r, 'compareAt')) {
        checkPrice(gt(r, 'compareAt'), line, H, m.compareAt, issue);
        if (price && isPlainDecimal(price) && isPlainDecimal(gt(r, 'compareAt')) && Number(gt(r, 'compareAt')) <= Number(price)) issue('warning', 'COMPARE_AT_LOW', `Line ${line}: the compare-at price ${gt(r, 'compareAt')} is not higher than the price ${price}, so Shopify will not show it as a sale.`, { line, handle: H, column: m.compareAt });
      }
      if (gt(r, 'cost')) checkPrice(gt(r, 'cost'), line, H, m.cost, issue);
      // Inventory.
      const tracker = gt(r, 'tracker').toLowerCase();
      if (tracker && !['shopify', 'shipwire', 'amazon_marketplace_web'].includes(tracker)) issue('error', 'TRACKER_INVALID', `Line ${line}: Inventory tracker "${gt(r, 'tracker')}" must be shopify, shipwire, amazon_marketplace_web or blank.`, { line, handle: H, column: m.tracker, rule: 'shopify.inventory-tracker' });
      const qty = gt(r, 'qty');
      if (tracker && m.qty && !qty) issue('error', 'QTY_BLANK', `Line ${line}: inventory is tracked but Inventory quantity is blank ("Inventory quantity can't be blank"). Enter 0 or the stock count.`, { line, handle: H, column: m.qty, rule: 'shopify.inventory-qty' });
      if (qty && !/^-?\d+$/.test(qty)) issue('error', 'QTY_NOT_NUMBER', `Line ${line}: Inventory quantity "${qty}" is not a whole number ("Inventory quantity is not a number").`, { line, handle: H, column: m.qty, rule: 'shopify.inventory-qty' });
      const policy = gt(r, 'policy').toLowerCase();
      if (m.policy && policy && !['deny', 'continue'].includes(policy)) issue('error', 'POLICY_INVALID', `Line ${line}: "${gt(r, 'policy')}" is not allowed in ${m.policy}. Use DENY or CONTINUE ("Inventory policy is not included in the list").`, { line, handle: H, column: m.policy, rule: 'shopify.inventory-policy' });
      // Weight.
      const grams = gt(r, 'grams');
      if (grams && !/^\d+(\.\d+)?$/.test(grams)) issue('error', 'WEIGHT_INVALID', `Line ${line}: weight "${grams}" must be a plain number of grams, with no unit.`, { line, handle: H, column: m.grams, rule: 'shopify.weight-unit' });
      else if (grams && grams.includes('.') && !/\.0+$/.test(grams)) issue('warning', 'WEIGHT_DECIMAL', `Line ${line}: weight "${grams}" has decimals. Shopify asks for whole grams, so write ${Math.round(Number(grams))}.`, { line, handle: H, column: m.grams, rule: 'shopify.weight-unit' });
      const wu = gt(r, 'weightUnit').toLowerCase();
      if (wu && !['g', 'kg', 'lb', 'oz'].includes(wu)) issue('error', 'WEIGHT_UNIT_INVALID', `Line ${line}: weight unit "${gt(r, 'weightUnit')}" must be g, kg, lb or oz.`, { line, handle: H, column: m.weightUnit, rule: 'shopify.weight-unit' });
      // Booleans.
      for (const k of ['taxable', 'requiresShipping', 'giftCard']) {
        const v = gt(r, k);
        if (v && !TRUE_FALSE.has(v.toLowerCase())) issue('error', 'BOOLEAN_INVALID', `Line ${line}: ${m[k]} is "${v}". Use TRUE or FALSE.`, { line, handle: H, column: m[k], rule: 'shopify.boolean-values' });
      }
      if (m.fulfillment && !gt(r, 'fulfillment')) issue('error', 'FULFILLMENT_BLANK', `Line ${line}: ${m.fulfillment} is blank. Enter manual ("Fulfillment service can't be blank").`, { line, handle: H, column: m.fulfillment, rule: 'shopify.fulfillment' });
      // Packed dimensions: all or none.
      const dims = ['Packed product length', 'Packed product width', 'Packed product height', 'Packed product dimension unit'].filter((h) => headerSet.has(h));
      const filled = dims.filter((h) => String(r[h] ?? '').trim());
      if (dims.length && filled.length && filled.length < 4) issue('error', 'PACKED_DIMENSIONS_PARTIAL', `Line ${line}: only some packed dimensions are filled (${filled.join(', ')}). Fill length, width, height and unit, or none of them.`, { line, handle: H, rule: 'shopify.packed-dimensions' });
      const sku = gt(r, 'sku');
      if (sku) {
        if (skuSeen.has(sku)) issue('warning', 'DUPLICATE_SKU', `Line ${line}: SKU "${sku}" is also used on line ${skuSeen.get(sku)}. Shopify allows this, but duplicate SKUs make inventory and order exports ambiguous.`, { line, handle: H, column: m.sku });
        else skuSeen.set(sku, line);
      }
    }
    const optCount = optNames.filter(Boolean).length;
    if (variants > 2048) issue('error', 'TOO_MANY_VARIANTS', `"${handle}" has ${variants} variants. Shopify allows up to 2,048 per product.`, { line: fl, handle: H, rule: 'shopify.variants-max' });
    if (images > 250) issue('error', 'TOO_MANY_IMAGES', `"${handle}" has ${images} images. Shopify allows up to 250 per product.`, { line: fl, handle: H, rule: 'shopify.images-max' });
    if (optCount === 0 && variants > 1) issue('error', 'VARIANTS_WITHOUT_OPTIONS', `"${handle}" has ${variants} variant rows but no option names, so the variants cannot be told apart ("options are not unique").`, { line: fl, handle: H, rule: 'shopify.options-unique' });
    stats.variants += variants;
    stats.images += images;
  }
  return result();
}

function checkPrice(v, line, handle, column, issue) {
  if (isPlainDecimal(v)) return;
  const p = parsePrice(v);
  if (p.value !== null && p.value.startsWith('-')) {
    issue('error', 'PRICE_FORMAT', `Line ${line}: ${column || 'price'} "${v}" is negative. Prices cannot be below zero.`, { line, handle, column, rule: 'shopify.price-format' });
    return;
  }
  // Only suggest a value when the reading is certain; a guess ("1,299")
  // could make someone change a price by a factor of 1000.
  const fix = p.value !== null && !/^Read the price/.test(p.note) ? ` Write it as ${p.value}.` : ' Write it with a dot before the cents, for example 12.50.';
  issue('error', 'PRICE_FORMAT', `Line ${line}: ${column || 'price'} "${v}" is not a plain number.${fix} Leave out currency symbols and thousands separators.`, { line, handle, column, rule: 'shopify.price-format' });
}

function checkImage(url, line, handle, column, issue) {
  let ok = false;
  try { const u = new URL(url); ok = (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && u.hostname.includes('.'); } catch { ok = false; }
  if (!ok || /\s/.test(url)) {
    issue('error', 'IMAGE_URL_INVALID', `Line ${line}: image "${url.slice(0, 80)}" is not a full public link (it must start with https:// and contain no spaces). Shopify reports "Validation failed: getaddrinfo..." for links like this.`, { line, handle, column, rule: 'shopify.image-url' });
  } else if (url.startsWith('http:')) {
    issue('warning', 'IMAGE_URL_HTTP', `Line ${line}: image link uses http:// rather than https://. Use https:// if the host supports it.`, { line, handle, column, rule: 'shopify.image-url' });
  }
}
