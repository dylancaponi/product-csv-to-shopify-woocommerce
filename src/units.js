// Weight conversion. Exact factors: 1 lb = 453.59237 g (international
// avoirdupois pound, NIST SP 811), 1 oz = 1/16 lb = 28.349523125 g.
export const GRAMS_PER = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 };

export function normalizeUnit(u) {
  const s = String(u || '').trim().toLowerCase().replace(/\.$/, '');
  if (['g', 'gr', 'gram', 'grams', 'gm'].includes(s)) return 'g';
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'].includes(s)) return 'kg';
  if (['lb', 'lbs', 'pound', 'pounds'].includes(s)) return 'lb';
  if (['oz', 'ounce', 'ounces'].includes(s)) return 'oz';
  return null;
}

// Parse "1.5", "1,5", "1.5 kg". Returns { value: number|null, unit: string|null }.
export function parseWeight(input, defaultUnit = null) {
  const s = String(input ?? '').trim();
  if (!s) return { value: null, unit: null };
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z.]*)$/);
  if (!m) return { value: null, unit: null, bad: true };
  const value = Number(m[1].replace(',', '.'));
  const unit = m[2] ? normalizeUnit(m[2]) : defaultUnit;
  if (m[2] && !unit) return { value: null, unit: null, bad: true };
  return { value, unit };
}

export function toGrams(value, unit) {
  if (value === null || value === undefined || !unit || !(unit in GRAMS_PER)) return null;
  return value * GRAMS_PER[unit];
}

export function fromGrams(grams, unit) {
  if (grams === null || grams === undefined || !(unit in GRAMS_PER)) return null;
  return grams / GRAMS_PER[unit];
}

// Trim float noise: up to `dp` decimals, no trailing zeros.
export function fmtNumber(n, dp = 3) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return String(Number(n.toFixed(dp)));
}
