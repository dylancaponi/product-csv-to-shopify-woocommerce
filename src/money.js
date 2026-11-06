// Price strings to plain decimal strings ("1234.50"). Never uses floats for
// the stored value. Returns { value, note } where value is null when the
// input cannot be read as a price, and note explains any guess made.

const CURRENCY = /[$€£¥₹₩₽₺₪฿₫₴₦₱]|\b(?:USD|EUR|GBP|CAD|AUD|NZD|JPY|INR|CHF|SEK|NOK|DKK|PLN|MXN|BRL|ZAR|SGD|HKD)\b|\b(?:US|CA|AU|NZ|HK|S)\$|kr|zł|R\$/gi;

export function parsePrice(input) {
  if (input === null || input === undefined) return { value: null, note: '' };
  let s = String(input).trim();
  if (s === '') return { value: null, note: '' };
  const original = s;
  // Only symbols whose usual display formats use a dot for thousands
  // (euro, yen, Nordic kronor, real, zloty). $ and £ formats use a decimal dot.
  const hadSymbol = /€|¥|\bkr\b|kr|R\$|zł|\b(?:EUR|JPY|SEK|NOK|DKK|BRL|PLN)\b/i.test(s);
  s = s.replace(CURRENCY, '').replace(/[\s  ']/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { value: null, note: `"${original}" is not a price.` };
  let note = '';
  let threeDot = false;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart;
  let frac = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    const [a, b, ...rest] = s.split(dec);
    if (rest.length) return { value: null, note: `"${original}" is not a price.` };
    intPart = a.split(thou).join('');
    frac = b;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length > 2) {
      // 1,234,567 or 1.234.567: thousands separators only.
      if (parts.slice(1).every((p) => p.length === 3)) intPart = parts.join('');
      else return { value: null, note: `"${original}" is not a price.` };
    } else if (sep === '.' && parts[1].length === 3 && parts[0] !== '0' && parts[0] !== '' && hadSymbol) {
      // "€1.250" or "¥1.250": a currency symbol means display formatting, where
      // a dot before three digits is the thousands separator (euro, yen).
      intPart = parts.join('');
      note = `Read the price "${original}" as ${intPart}, because with a currency symbol the dot usually separates thousands. If it meant ${parts[0]}.${parts[1]}, fix the price in the source file.`;
    } else if (sep === '.' && parts[1].length === 3) {
      // "1.250" without a symbol: a decimal (WooCommerce stores in
      // 3-decimal currencies export prices this way), but always say so.
      intPart = parts[0];
      frac = parts[1];
      threeDot = parts[0] !== '0' && parts[0] !== '';
    } else if (sep === ',' && parts[1].length === 3 && parts[0] !== '0' && parts[0] !== '') {
      // "1,234": read as a thousands separator, but say so. A dot followed by
      // three digits ("1.250") is a decimal: WooCommerce stores in 3-decimal
      // currencies export prices that way.
      intPart = parts.join('');
      note = `Read the price "${original}" as ${intPart}. If it meant ${parts[0]}.${parts[1]}, fix the price in the source file.`;
    } else {
      intPart = parts[0];
      frac = parts[1];
    }
  } else {
    intPart = s;
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return { value: null, note: `"${original}" is not a price.` };
  intPart = intPart.replace(/^0+(?=\d)/, '') || '0';
  if (frac.length > 2 && /^0+$/.test(frac.slice(2))) frac = frac.slice(0, 2);
  if (frac.length > 2) {
    note = note || `The price "${original}" has more than 2 decimal places, so it was rounded to ${'${'}ROUNDED}.`;
    frac = roundFrac(intPart, frac);
    if (frac.includes('.')) { [intPart, frac] = frac.split('.'); }
  }
  frac = (frac + '00').slice(0, 2);
  const value = (negative ? '-' : '') + intPart + '.' + frac;
  note = note.replace('${ROUNDED}', value);
  if (threeDot) note = `Read the price "${original}" as ${value} (a decimal${/0$/.test(original) ? '' : ', rounded to cents'}). If it meant ${original.replace(/\D/g, '')}, fix the price in the source file.`;
  if (original !== value && !note && original.includes(',')) note = `Price "${original}" written as ${value}.`;
  return { value, note };
}

// Round to two decimals using string arithmetic (half up).
function roundFrac(intPart, frac) {
  const cents = BigInt(intPart + frac.slice(0, 2));
  const up = Number(frac[2]) >= 5 ? 1n : 0n;
  const total = cents + up;
  const str = total.toString().padStart(3, '0');
  const i = str.slice(0, -2);
  const f = str.slice(-2);
  return i === intPart ? f : `${i}.${f}`;
}

// A strict check: is this already a plain decimal the importers accept?
export function isPlainDecimal(s) {
  return /^\d+(\.\d{1,2})?$/.test(String(s).trim());
}

// One price reader for every parser, so guesses and problems always reach the
// visitor. Returns the plain decimal, or null (with an error issue) when the
// value cannot be used. Negative prices are refused.
//   read(raw, { line, handle, column, label })  label e.g. 'price', 'sale price'
export function priceReader(issue) {
  return (raw, where = {}) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const { value, note } = parsePrice(s);
    const label = where.label || 'price';
    const who = where.name ? `"${where.name}": ` : '';
    const extra = { line: where.line, handle: where.handle, column: where.column };
    if (value === null) {
      issue('error', 'PRICE_UNREADABLE', `${who}the ${label} "${s}" could not be read as a price.`, extra);
      return null;
    }
    if (value.startsWith('-')) {
      issue('error', 'NEGATIVE_PRICE', `${who}the ${label} "${s}" is negative. A price cannot be below zero, so it was not used.`, extra);
      return null;
    }
    if (note) issue('warning', 'PRICE_GUESSED', `${who}${note}`, extra);
    return value;
  };
}
