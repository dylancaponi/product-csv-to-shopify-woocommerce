// Store migration engine: product CSV exports in, import-ready product CSVs
// out, plus a Shopify import validator. Plain ES module, zero dependencies,
// runs unchanged in browsers, Web Workers and Node 20+. No network access.
import { EngineError, fail } from './src/errors.js';
import { parseCSV, writeCSV, toRecords } from './src/csv.js';
import { makeCollector, summarize } from './src/issues.js';
import { uniquifyHandles, slugify } from './src/model.js';
import { RULES } from './src/rules.js';
import * as etsy from './src/sources/etsy.js';
import * as shopifySrc from './src/sources/shopify.js';
import * as wooSrc from './src/sources/woocommerce.js';
import * as squarespace from './src/sources/squarespace.js';
import * as wix from './src/sources/wix.js';
import * as shopifyOut from './src/targets/shopify.js';
import * as wooOut from './src/targets/woocommerce.js';
import { validateShopify } from './src/validate-shopify.js';

export { EngineError, parseCSV, writeCSV, RULES, validateShopify };

export const SOURCES = {
  etsy: { label: 'Etsy (EtsyListingsDownload.csv)', detect: etsy.detect, parse: etsy.parse },
  shopify: { label: 'Shopify product CSV', detect: shopifySrc.detect, parse: shopifySrc.parse },
  woocommerce: { label: 'WooCommerce product export', detect: wooSrc.detect, parse: wooSrc.parse, minimal: wooSrc.minimal },
  squarespace: { label: 'Squarespace product export', detect: squarespace.detect, parse: squarespace.parse },
  wix: { label: 'Wix Stores export (classic catalog)', detect: wix.detect, parse: wix.parse },
  'wix-v3': { label: 'Wix Stores export (new catalog)', detect: wix.detectV3, parse: wix.parseV3 },
};

export const TARGETS = {
  shopify: { label: 'Shopify product CSV', write: shopifyOut.write, filename: 'shopify-products.csv' },
  woocommerce: { label: 'WooCommerce product CSV', write: wooOut.write, filename: 'woocommerce-products.csv' },
};

const MAX_BYTES = 100 * 1024 * 1024;

// Both importers download every image from its link, so only full public
// links can work. "//host/x.jpg" gets https:. Anything else (a file name, a
// path such as /wp-content/uploads/x.jpg) is dropped with a warning, so the
// product itself still imports.
function checkImageLinks(products, issue) {
  const full = (u) => { try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') && x.hostname.includes('.') && !/\s/.test(u); } catch { return false; } };
  for (const p of products) {
    const fix = (u) => (/^\/\/[^/\s]+\.[^/\s]+\//.test(u) ? 'https:' + u : u);
    const dropped = [];
    p.images = p.images.map((i) => ({ ...i, url: fix(i.url) })).filter((i) => (full(i.url) ? true : (dropped.push(i.url), false)));
    for (const v of p.variants) {
      if (!v.imageUrl) continue;
      v.imageUrl = fix(v.imageUrl);
      if (!full(v.imageUrl)) { dropped.push(v.imageUrl); v.imageUrl = ''; }
    }
    if (dropped.length) {
      const list = [...new Set(dropped)];
      issue('warning', 'IMAGE_NOT_LINK', `"${p.title || p.handle}": ${list.length === 1 ? `the image "${list[0].slice(0, 80)}" is` : `${list.length} images (first "${list[0].slice(0, 80)}") are`} not a full web link starting with https://, so the new store could not download ${list.length === 1 ? 'it' : 'them'}. ${list.length === 1 ? 'It was' : 'They were'} left out; add the images after import, or put full links in the source file.`, { handle: p.handle, line: p.source?.lines?.[0], rule: 'shopify.image-url' });
    }
  }
}

function sniffNonCsv(text) {
  if (typeof text !== 'string') return 'The file could not be read as text. Upload the .csv file exactly as it was downloaded.';
  if (!text.trim()) return 'This file is empty.';
  const head = text.slice(0, 512);
  if (head.startsWith('PK')) return 'This looks like an Excel (.xlsx) or zip file. Open it in Excel or Google Sheets, save or download it as CSV, then upload the CSV.';
  if (head.startsWith('%PDF')) return 'This is a PDF, not a CSV export.';
  if (/^\s*<(!doctype|html)/i.test(head)) return 'This is a web page, not a CSV export.';
  if (head.includes('\u0000')) return 'This file is not plain text (it may be UTF-16 or a spreadsheet). Save it as "CSV UTF-8" and try again.';
  if (text.length > MAX_BYTES) return 'This file is larger than 100 MB. Export fewer products at a time.';
  return null;
}

function headerRows(text) {
  const bad = sniffNonCsv(text);
  if (bad) fail('NOT_CSV', bad);
  const rows = parseCSV(text);
  if (!rows.length) fail('NOT_CSV', 'This file is empty.');
  return toRecords(rows);
}

// detectSource(text) -> { sourceId: string|null, confidence: 0..1, reason, candidates }
export function detectSource(text) {
  const bad = sniffNonCsv(text);
  if (bad) return { sourceId: null, confidence: 0, reason: bad, candidates: [] };
  let headers;
  try { headers = parseCSV(text.slice(0, 200000), { maxRows: 1 })[0].map((h) => h.trim()); } catch (e) {
    return { sourceId: null, confidence: 0, reason: e instanceof EngineError ? e.message : 'The file could not be read as CSV.', candidates: [] };
  }
  const candidates = Object.entries(SOURCES)
    .map(([id, s]) => ({ id, ...s.detect(headers) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.5) {
    return { sourceId: null, confidence: best ? best.score : 0, reason: 'We could not recognise this file. Upload the product export exactly as your store platform produced it (Etsy, Shopify, WooCommerce, Wix or Squarespace).', candidates: candidates.map(({ id, score }) => ({ id, score })) };
  }
  return { sourceId: best.id, confidence: best.score, reason: best.reason, candidates: candidates.map(({ id, score }) => ({ id, score })) };
}

// parseProducts(text, { source?, sourceWeightUnit? }) -> { sourceId, products, issues, summary }
export function parseProducts(text, options = {}) {
  const { headers, records, duplicates } = headerRows(text);
  let sourceId = options.source;
  if (!sourceId) {
    const d = detectSource(text);
    if (!d.sourceId) fail('UNKNOWN_SOURCE', d.reason);
    sourceId = d.sourceId;
  }
  const src = SOURCES[sourceId];
  if (!src) fail('UNKNOWN_SOURCE', `Unknown source "${sourceId}". Supported: ${Object.keys(SOURCES).join(', ')}.`);
  if (options.source) {
    // A platform chosen by hand must match the file, or the output is empty
    // or made up.
    const fit = src.detect(headers.map((h) => h.trim()));
    if ((!fit || fit.score < 0.5) && !(src.minimal && src.minimal(headers.map((h) => h.trim())))) {
      const d = detectSource(text);
      const other = d.sourceId && d.sourceId !== sourceId ? ` It looks like this file is a ${SOURCES[d.sourceId].label} instead.` : '';
      fail('SOURCE_MISMATCH', `The platform chosen (${src.label}) does not match this file.${other} Choose the platform the file came from, or let it be detected.`, { chosen: sourceId, detected: d.sourceId });
    }
  }
  const { issues, issue } = makeCollector();
  if (duplicates.length) issue('warning', 'DUPLICATE_HEADERS', `These column names appear more than once; only the first of each was read: ${duplicates.join(', ')}.`, { line: 1 });
  if (text.includes('\ufffd')) {
    // Never convert damaged text: every accent it touched would be carried
    // into the new store. Name the first line so it can be found.
    const line = text.slice(0, text.indexOf('\ufffd')).split(/\r\n|\n|\r/).length;
    fail('SOURCE_UNREADABLE_CHARACTERS', `Line ${line} of the file has characters that could not be read (shown as \ufffd), so accented letters and symbols would be damaged. Usually the file was saved in an encoding other than UTF-8. Open it in your spreadsheet program, save it as "CSV UTF-8", and use that file. Nothing was converted.`, { line });
  }
  const ctx = { issue, options, meta: {} };
  const products = src.parse(headers, records, ctx);
  products.forEach((p, i) => { if (!p.handle) p.handle = slugify(p.title, `product-${i + 1}`); });
  uniquifyHandles(products, issues);
  checkImageLinks(products, issue);
  if (!products.length) {
    const why = issues.find((i) => i.severity === 'error') || issues.find((i) => i.severity === 'warning');
    fail('NO_PRODUCTS', why ? why.message : 'No products were found in this file. Check that it is the product export, not an orders, customers or inventory file.', { issues });
  }
  return { sourceId, products, issues, summary: summarize(issues), meta: ctx.meta };
}

// writeProducts(products, target, options) -> { csv, filename, issues, summary }
export function writeProducts(products, target, options = {}) {
  const t = TARGETS[target];
  if (!t) fail('UNKNOWN_TARGET', `Unknown destination "${target}". Supported: ${Object.keys(TARGETS).join(', ')}.`);
  const { issues, issue } = makeCollector();
  const ctx = { issue, options, meta: {} };
  const csv = t.write(products, ctx);
  return { csv, filename: t.filename, issues, summary: summarize(issues), writtenProducts: ctx.meta.writtenProducts };
}

// convert(text, { from?, to, sourceWeightUnit?, wooWeightUnit? })
//   -> { sourceId, target, csv, filename, products, issues, summary, check }
// `issues` holds parse and write problems in that order. For Shopify the
// output is re-checked with validateShopify and the result is in `check`.
export function convert(text, options = {}) {
  if (!options.to) fail('UNKNOWN_TARGET', 'Choose a destination: shopify or woocommerce.');
  const parsed = parseProducts(text, { ...options, source: options.from });
  let products = parsed.products;
  let written = writeProducts(products, options.to, options);
  const leftOut = [];
  let check;
  if (options.to === 'shopify') {
    // The writer leaves out what it knows Shopify rejects. Anything else the
    // validator still finds in a product leaves that product out too, so the
    // file never contains a product the checker itself would fail.
    for (let round = 0; round < 3; round++) {
      check = validateShopify(written.csv, { byteLength: 0 });
      const bad = productErrors(written.csv, check.issues, new Set(products.map((p) => p.handle)));
      if (!bad.size) break;
      for (const [handle, issue] of bad) {
        const p = products.find((x) => x.handle === handle);
        leftOut.push({ severity: 'error', code: issue.code, handle, line: p?.source?.lines?.[0], rule: issue.rule, message: `"${p?.title || handle}" was left out of the Shopify file, because Shopify would reject it: ${issue.message.replace(/^Line \d+: /, '')}` });
      }
      products = products.filter((p) => !bad.has(p.handle));
      written = writeProducts(products, options.to, options);
    }
  }
  const issues = [...parsed.issues, ...leftOut, ...written.issues];
  const out = {
    sourceId: parsed.sourceId, target: options.to, csv: written.csv, filename: written.filename,
    products: parsed.products.length, writtenProducts: written.writtenProducts,
    variants: parsed.products.reduce((n, p) => n + p.variants.length, 0),
    issues, summary: summarize(issues), parts: null,
  };
  if (options.to === 'shopify') {
    out.parts = splitShopify(written.csv);
    out.check = validateShopify(written.csv, out.parts ? { byteLength: Math.max(...out.parts.map((x) => byteLength(x.csv))) } : {});
    if (out.parts) {
      const note = { severity: 'warning', code: 'FILE_SPLIT', rule: RULES['shopify.file-size'] ? { id: 'shopify.file-size', ...RULES['shopify.file-size'] } : undefined, message: `The Shopify file is over 15 MB, which is Shopify's limit, so it was also split into ${out.parts.length} files with every product kept whole. Import them one at a time.` };
      out.issues.push(note);
      out.summary = summarize(out.issues);
    }
  }
  return out;
}

const SHOPIFY_MAX_BYTES = 15 * 1024 * 1024;
const byteLength = (s) => new TextEncoder().encode(s).length;

// Product-level errors found by the validator in our own output, by handle.
function productErrors(csv, issues, handles) {
  const rows = parseCSV(csv);
  const hIdx = rows[0].indexOf('URL handle');
  const bad = new Map();
  for (const i of issues) {
    // File-level problems (header, encoding, size) are not any one product's.
    if (i.severity !== 'error' || i.line === 1) continue;
    const handle = i.handle || (i.line && rows[i.line - 1] ? rows[i.line - 1][hIdx] : '');
    if (handle && handles.has(handle) && !bad.has(handle)) bad.set(handle, i);
  }
  return bad;
}

// Over 15 MB: split into parts below the limit, never splitting a product.
function splitShopify(csv) {
  if (byteLength(csv) <= SHOPIFY_MAX_BYTES) return null;
  const rows = parseCSV(csv);
  const header = rows[0];
  const hIdx = header.indexOf('URL handle');
  const headerBytes = byteLength(writeCSV([header]));
  const limit = SHOPIFY_MAX_BYTES - 64 * 1024;
  const parts = [];
  let cur = [];
  let size = headerBytes;
  let i = 1;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j][hIdx] === rows[i][hIdx]) j++;
    const group = rows.slice(i, j);
    const g = byteLength(writeCSV(group));
    if (cur.length && size + g > limit) { parts.push(cur); cur = []; size = headerBytes; }
    cur.push(...group);
    size += g;
    i = j;
  }
  if (cur.length) parts.push(cur);
  return parts.map((p, k) => ({ filename: `shopify-products-part-${k + 1}.csv`, csv: writeCSV([header, ...p], { eol: '\n' }) }));
}

// validate(text, { target: 'shopify' }) -> { ok, issues, summary, stats }
export function validate(text, options = {}) {
  const target = options.target || 'shopify';
  if (target !== 'shopify') fail('UNKNOWN_TARGET', 'Only Shopify product CSV validation is available so far.');
  return validateShopify(text, options);
}
