// Wix Stores product exports (catalog_products.csv). Two formats exist:
// - legacy catalog: first header "handleId", rows typed Product / Variant,
//   variant price = product price + surcharge
//   https://support.wix.com/en/article/wix-stores-importing-products-to-wix-stores
// - new catalog (V3): first header "handle", rows typed PRODUCT / VARIANT /
//   MEDIA, variants carry their own price; column order varies by site
//   https://support.wix.com/en/article/wix-stores-updating-products-by-exporting-and-importing-them
// Headers confirmed from real exports, see research/sources-etsy-wix-squarespace.md.
import { newProduct, newVariant, intOrNull, slugify, truthy } from '../model.js';
import { parsePrice, priceReader } from '../money.js';
import { toGrams } from '../units.js';
import { dedupe } from '../text.js';

export const ID = 'wix';
export const ID_V3 = 'wix-v3';
// Wix exports media IDs, not URLs. This host is Wix's standard static media
// host; it is NOT stated in Wix's help (UNVERIFIED), so we warn about it.
export const WIX_MEDIA_PREFIX = 'https://static.wixstatic.com/media/';

const V1_SIG = ['handleId', 'fieldType', 'name', 'productImageUrl', 'surcharge', 'productOptionName1', 'productOptionDescription1', 'discountMode'];
const V3_SIG = ['handle', 'fieldType', 'name', 'plainDescription', 'media', 'strikethroughPrice', 'productOptionChoices1', 'inventory'];

export function detect(headers) {
  const set = new Set(headers);
  return { score: V1_SIG.filter((h) => set.has(h)).length / V1_SIG.length, reason: 'Wix Stores product export (classic catalog)' };
}
export function detectV3(headers) {
  const set = new Set(headers);
  return { score: V3_SIG.filter((h) => set.has(h)).length / V3_SIG.length, reason: 'Wix Stores product export (new catalog)' };
}

const g = (r, h) => String(r[h] ?? '').trim();
const splitSemi = (s) => String(s ?? '').split(';').map((x) => x.trim()).filter(Boolean);
// Colour choices look like "#ffc0cb:Pink" or "rgb(255,0,0):Red".
// Colour choices are written code:name, where the code is #hex, rgb(...) or a
// colour word ("black:Black"). Keep only the name.
const choiceLabel = (s, color = false) => s.replace(color ? /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)\s*:\s*(?=\S)/i : /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*:\s*/i, '').trim();
const isColor = (r, n) => /colou?r/i.test(g(r, `productOptionType${n}`));

function mediaUrl(id, state) {
  if (/^https?:\/\//i.test(id)) return id;
  state.mediaBuilt = true;
  return WIX_MEDIA_PREFIX + id;
}

function weightOf(raw, ctx, state) {
  const w = Number(raw);
  if (!raw || !Number.isFinite(w) || w <= 0) return { grams: null, unit: null };
  const unit = ctx.options.sourceWeightUnit || 'lb';
  if (!ctx.options.sourceWeightUnit && !state.weightWarned) {
    ctx.issue('warning', 'WEIGHT_UNIT_ASSUMED', 'Wix exports weights without a unit (it uses your store setting). Weights were read as pounds; set the source weight unit if your store uses kilograms.', {});
    state.weightWarned = true;
  }
  return { grams: toGrams(w, unit), unit };
}

function inventory(raw) {
  const s = raw.toLowerCase().replace(/_/g, '');
  if (s === 'instock' || s === '') return { qty: null, tracked: false };
  if (s === 'outofstock') return { qty: 0, tracked: true };
  const n = intOrNull(raw);
  return n === null ? { qty: null, tracked: false } : { qty: n, tracked: true };
}

function finish(products, ctx, state) {
  if (state.mediaBuilt) ctx.issue('warning', 'WIX_MEDIA_URLS', `Wix exports image IDs rather than links. Image links were built as ${WIX_MEDIA_PREFIX}<id>, Wix's usual image host. Open one in a browser before importing to make sure it loads.`, {});
  if (state.dropped.size) ctx.issue('info', 'WIX_FIELDS_DROPPED', `These Wix fields have no equivalent in the destination and were not carried over: ${[...state.dropped].join(', ')}.`, {});
  return products;
}

export function parse(headers, records, ctx) {
  const { issue } = ctx;
  const state = { dropped: new Set() };
  const products = [];
  const byHandle = new Map();
  for (const r of records) {
    const line = r.__line;
    const ft = g(r, 'fieldType').toLowerCase();
    const h = g(r, 'handleId');
    if (ft === 'product') {
      const p = newProduct({ title: g(r, 'name') });
      p.source = { platform: ID, lines: [line] };
      p.handle = slugify(g(r, 'name'));
      p.descriptionHtml = String(r.description ?? '');
      p.status = truthy(g(r, 'visible')) === false ? 'draft' : 'active';
      p.categories = splitSemi(g(r, 'collection')).filter((c) => c.toLowerCase() !== 'all products');
      p.productType = p.categories[0] || '';
      p.vendor = g(r, 'brand');
      p.images = splitSemi(g(r, 'productImageUrl')).map((id) => ({ url: mediaUrl(id, state), alt: '' }));
      for (let n = 1; n <= 6; n++) {
        const name = g(r, `productOptionName${n}`);
        if (name) { (p._color = p._color || [])[p.options.length] = isColor(r, n); p.options.push({ name, values: dedupe(splitSemi(g(r, `productOptionDescription${n}`)).map((c) => choiceLabel(c, isColor(r, n)))) }); }
      }
      for (let n = 1; n <= 6; n++) if (g(r, `additionalInfoTitle${n}`)) state.dropped.add('additional info sections');
      for (let n = 1; n <= 2; n++) if (g(r, `customTextField${n}`)) state.dropped.add('custom text fields');
      if (g(r, 'ribbon')) state.dropped.add('ribbons');
      const price = { value: priceReader(issue)(g(r, 'price'), { line, name: p.title, column: 'price' }) };
      p._base = { price: price.value, row: r, line };
      p._discount = { mode: g(r, 'discountMode').toUpperCase(), value: Number(g(r, 'discountValue')) || 0 };
      products.push(p);
      byHandle.set(h, p);
    } else if (ft === 'variant') {
      const p = byHandle.get(h);
      if (!p) { issue('warning', 'SOURCE_ROW_SKIPPED', `Variant row with handleId "${h}" has no product row before it, so it was skipped.`, { line }); continue; }
      p.source.lines.push(line);
      const optionValues = p.options.map((_, i) => choiceLabel(g(r, `productOptionDescription${i + 1}`), !!(p._color && p._color[i])));
      if (truthy(g(r, 'visible')) === false) issue('warning', 'WIX_HIDDEN_VARIANT', `"${p.title}" (${optionValues.join(' / ')}): this variant is hidden in Wix. It was converted like the others, so delete it in the new store if you do not sell it.`, { line });
      p.variants.push(variantFromRow(r, p, optionValues, ctx, state, line));
    } else {
      issue('warning', 'SOURCE_ROW_SKIPPED', `Row has fieldType "${g(r, 'fieldType')}" (expected Product or Variant), so it was skipped.`, { line });
    }
  }
  for (const p of products) {
    if (!p.variants.length) {
      if (p.options.length) {
        const combos = p.options.reduce((acc, o) => acc.flatMap((a) => o.values.map((v) => [...a, v])), [[]]);
        combos.forEach((ov) => p.variants.push(variantFromRow(p._base.row, p, ov, ctx, state, p._base.line, true)));
        issue('warning', 'WIX_NO_VARIANT_ROWS', `"${p.title}" has options but no variant rows, so every combination was created with the product price and SKUs left blank.`, { line: p._base.line });
      } else p.variants.push(variantFromRow(p._base.row, p, [], ctx, state, p._base.line));
    }
    delete p._base; delete p._discount; delete p._color;
  }
  return finish(products, ctx, state);
}

function variantFromRow(r, p, optionValues, ctx, state, line, isCombo = false) {
  const sur = parsePrice(g(r, 'surcharge'));
  let price = p._base.price;
  if (price !== null && r !== p._base.row && sur.value) price = (Math.round(Number(price) * 100) + Math.round(Number(sur.value) * 100)) / 100;
  let compareAt = null;
  const d = p._discount;
  if (price !== null && d.value > 0 && (d.mode === 'PERCENT' || d.mode === 'AMOUNT')) {
    const cents = Math.round(Number(price) * 100);
    const off = d.mode === 'PERCENT' ? Math.round(cents * d.value / 100) : Math.round(d.value * 100);
    if (off > 0 && off < cents) { compareAt = (cents / 100).toFixed(2); price = (cents - off) / 100; }
  }
  const inv = inventory(g(r, 'inventory'));
  const w = weightOf(g(r, 'weight'), ctx, state);
  const cost = { value: priceReader(ctx.issue)(g(r, 'cost'), { line, name: p.title, column: 'cost', label: 'cost' }) };
  return newVariant({
    optionValues,
    sku: isCombo ? '' : g(r, 'sku'),
    price: price === null ? null : Number(price).toFixed(2),
    compareAtPrice: compareAt,
    costPerItem: cost.value && Number(cost.value) > 0 ? cost.value : null,
    inventoryQty: inv.qty,
    inventoryTracked: inv.tracked,
    weightGrams: w.grams,
    weightUnit: w.unit,
  });
}

export function parseV3(headers, records, ctx) {
  const { issue } = ctx;
  const state = { dropped: new Set() };
  const products = [];
  const byHandle = new Map();
  const optionCols = [];
  for (let n = 1; n <= 6; n++) if (headers.includes(`productOptionName${n}`)) optionCols.push(n);
  for (const r of records) {
    const line = r.__line;
    const ft = g(r, 'fieldType').toUpperCase();
    const h = g(r, 'handle');
    if (ft === 'PRODUCT') {
      const p = newProduct({ title: g(r, 'name') });
      p.source = { platform: ID_V3, lines: [line] };
      p.handle = slugify(h || g(r, 'name'));
      p.descriptionHtml = String(r.plainDescription ?? '');
      p.status = truthy(g(r, 'visible')) === false ? 'draft' : 'active';
      p.categories = splitSemi(g(r, 'categorySlugs'));
      p.vendor = g(r, 'brand');
      if (g(r, 'ribbon')) state.dropped.add('ribbons');
      for (let n = 1; n <= 10; n++) if (g(r, `modifierName${n}`)) state.dropped.add('modifiers (custom text and choice fields)');
      splitSemi(g(r, 'media')).forEach((id) => p.images.push({ url: mediaUrl(id, state), alt: g(r, 'mediaAltText') }));
      for (const n of optionCols) {
        const name = g(r, `productOptionName${n}`);
        (p._colorV3 = p._colorV3 || {})[n] = isColor(r, n);
        if (name) p.options.push({ name, values: dedupe(splitSemi(g(r, `productOptionChoices${n}`)).map((c) => choiceLabel(c, isColor(r, n)))) });
      }
      p._row = r; p._line = line;
      products.push(p);
      byHandle.set(h, p);
      continue;
    }
    const p = byHandle.get(h);
    if (!p) { issue('warning', 'SOURCE_ROW_SKIPPED', `Row with handle "${h}" has no PRODUCT row before it, so it was skipped.`, { line }); continue; }
    p.source.lines.push(line);
    if (ft === 'MEDIA') {
      splitSemi(g(r, 'media')).forEach((id) => p.images.push({ url: mediaUrl(id, state), alt: g(r, 'mediaAltText') }));
    } else if (ft === 'VARIANT') {
      const vals = {};
      const prod = byHandle.get(h);
      const colorOf = (n) => isColor(r, n) || (prod && prod._colorV3 && prod._colorV3[n]);
      for (const n of optionCols) { const nm = g(r, `productOptionName${n}`); if (nm) vals[nm.toLowerCase()] = choiceLabel(g(r, `productOptionChoices${n}`), colorOf(n)); }
      const optionValues = p.options.map((o, i) => vals[o.name.toLowerCase()] ?? choiceLabel(g(r, `productOptionChoices${optionCols[i]}`), colorOf(optionCols[i])));
      p.variants.push(v3Variant(r, optionValues, ctx, state, line, p.title));
    } else issue('warning', 'SOURCE_ROW_SKIPPED', `Row has fieldType "${g(r, 'fieldType')}" (expected PRODUCT, VARIANT or MEDIA), so it was skipped.`, { line });
  }
  for (const p of products) {
    if (!p.variants.length) {
      if (p.options.length) issue('warning', 'WIX_NO_VARIANT_ROWS', `"${p.title}" lists options but has no VARIANT rows, so it was converted without options.`, { line: p._line });
      p.options = [];
      p.variants.push(v3Variant(p._row, [], ctx, state, p._line, p.title));
    }
    delete p._row; delete p._line; delete p._colorV3;
  }
  return finish(products, ctx, state);
}

function v3Variant(r, optionValues, ctx, state, line, title) {
  const read = priceReader(ctx.issue);
  const price = { value: read(g(r, 'price'), { line, name: title, column: 'price' }) };
  const strike = { value: read(g(r, 'strikethroughPrice'), { line, name: title, column: 'strikethroughPrice', label: 'strikethrough price' }) };
  const inv = inventory(g(r, 'inventory'));
  const w = weightOf(g(r, 'weight'), ctx, state);
  const cost = { value: read(g(r, 'cost'), { line, name: title, column: 'cost', label: 'cost' }) };
  return newVariant({
    optionValues,
    sku: g(r, 'sku'),
    barcode: g(r, 'barcode'),
    price: price.value,
    compareAtPrice: strike.value && price.value && Number(strike.value) > Number(price.value) ? strike.value : null,
    costPerItem: cost.value && Number(cost.value) > 0 ? cost.value : null,
    inventoryQty: inv.qty,
    inventoryTracked: inv.tracked,
    weightGrams: w.grams,
    weightUnit: w.unit,
  });
}
