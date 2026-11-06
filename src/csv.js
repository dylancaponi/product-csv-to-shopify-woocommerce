// RFC 4180 style CSV reader and writer. No dependencies, no Node APIs.
// Handles: UTF-8 BOM, CRLF / LF / CR line endings, quoted fields with
// embedded delimiters, quotes ("" escape) and newlines.
import { fail } from './errors.js';

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Guess the delimiter from the first line (outside quotes).
export function sniffDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (let i = 0; i < text.length && i < 20000; i++) {
    const c = text[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && (c === '\n' || c === '\r')) break;
    else if (!inQ && c in counts) counts[c]++;
  }
  let best = ',';
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d;
  return best;
}

// Returns an array of rows; each row is an array of strings. Each row also
// gets a non-enumerable `line` (1-based physical line where the row starts).
export function parseCSV(input, opts = {}) {
  const text = stripBom(String(input));
  const d = opts.delimiter || sniffDelimiter(text);
  const maxRows = opts.maxRows || Infinity;
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  let line = 1;
  let rowLine = 1;
  let quotedField = false;
  const n = text.length;
  const pushRow = () => {
    row.push(field);
    Object.defineProperty(row, 'line', { value: rowLine, enumerable: false });
    // Drop fully empty physical lines (a single empty unquoted field).
    if (!(row.length === 1 && row[0] === '' && !quotedField)) rows.push(row);
    row = [];
    field = '';
    quotedField = false;
  };
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else {
        // Embedded line breaks are normalised to \n.
        if (c === '\r') { line++; if (text[i + 1] === '\n') i++; field += '\n'; continue; }
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') { inQ = true; quotedField = true; continue; }
    if (c === d) { row.push(field); field = ''; quotedField = false; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
      line++;
      rowLine = line;
      if (rows.length >= maxRows) return rows;
      continue;
    }
    field += c;
  }
  if (inQ) fail('CSV_UNTERMINATED_QUOTE', `A quoted field that starts on or after line ${rowLine} is never closed. The file may be cut off or have a stray double quote.`);
  if (field !== '' || row.length > 0 || quotedField) pushRow();
  return rows;
}

// Convert rows (arrays) to objects keyed by the header row. Duplicate header
// names keep the first occurrence; `extra` lists headers seen more than once.
export function toRecords(rows) {
  if (!rows.length) return { headers: [], records: [], duplicates: [] };
  const headers = rows[0].map((h) => h.trim());
  const seen = new Set();
  const duplicates = [];
  headers.forEach((h) => { if (seen.has(h) && h) duplicates.push(h); seen.add(h); });
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const rec = {};
    const raw = rows[r];
    headers.forEach((h, i) => { if (!(h in rec)) rec[h] = raw[i] === undefined ? '' : raw[i]; });
    Object.defineProperty(rec, '__line', { value: raw.line, enumerable: false });
    Object.defineProperty(rec, '__cells', { value: raw.length, enumerable: false });
    records.push(rec);
  }
  return { headers, records, duplicates };
}

function quote(v, d) {
  const s = v === null || v === undefined ? '' : String(v);
  if (s === '') return '';
  if (s.includes('"') || s.includes(d) || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// rows: array of arrays. Output uses the given line ending (default \n) and
// ends with a trailing line ending. `bom: true` prefixes U+FEFF.
export function writeCSV(rows, opts = {}) {
  const d = opts.delimiter || ',';
  const eol = opts.eol || '\n';
  const body = rows.map((r) => r.map((v) => quote(v, d)).join(d)).join(eol) + eol;
  return (opts.bom ? '﻿' : '') + body;
}
