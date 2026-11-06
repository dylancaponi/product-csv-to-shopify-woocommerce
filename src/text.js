// Small text helpers shared by parsers and writers.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
}

// Does this string already contain HTML markup?
export function looksLikeHtml(s) {
  return /<\/?(p|br|div|span|ul|ol|li|strong|em|b|i|h[1-6]|a|img|table)\b[^>]*>/i.test(String(s ?? ''));
}

// Plain text (Etsy descriptions) to simple HTML: blank lines split
// paragraphs, single line breaks become <br>.
export function textToHtml(s) {
  const t = String(s ?? '').replace(/\r\n?/g, '\n').trim();
  if (!t) return '';
  if (looksLikeHtml(t)) return t;
  return t.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

// Split a list cell on a separator, trimming and dropping empties.
export function splitList(s, sep = ',') {
  return String(s ?? '').split(sep).map((x) => x.trim()).filter(Boolean);
}

// Split on commas, honouring WooCommerce's "\," escape for a literal comma.
export function splitEscaped(s) {
  const out = [];
  let cur = '';
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\' && str[i + 1] === ',') { cur += ','; i++; continue; }
    if (str[i] === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += str[i];
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export function joinEscaped(values) {
  return values.map((v) => String(v).replace(/,/g, '\\,')).join(', ');
}

export function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => { const k = String(x).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Spreadsheet formula injection (OWASP "CSV Injection"): a cell starting with
// = + - @ tab or carriage return may run as a formula when the file is opened
// in Excel or Google Sheets.
export const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
export function looksLikeFormula(v) {
  const s = String(v ?? '');
  return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s);
}

// Count formula-like cells (header row excluded) for a warning, with the
// first column and product they were found in.
export function formulaCells(rows, skipCols = new Set()) {
  let n = 0;
  let first = null;
  for (let i = 1; i < rows.length; i++) {
    rows[i].forEach((v, k) => {
      if (skipCols.has(k) || !looksLikeFormula(v)) return;
      n++;
      if (!first) first = { column: rows[0][k], line: i + 1 };
    });
  }
  return { n, first };
}
