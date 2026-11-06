// Etsy "Download Data" listings export (EtsyListingsDownload.csv).
// Header confirmed from real exports on GitHub, see research/sources-etsy-wix-squarespace.md:
// TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,QUANTITY,TAGS,MATERIALS,IMAGE1..IMAGE10,
// VARIATION 1 TYPE,VARIATION 1 NAME,VARIATION 1 VALUES,VARIATION 2 TYPE,
// VARIATION 2 NAME,VARIATION 2 VALUES,SKU[,LISTING_ID]
// One row per active listing. No per-variation price, quantity or SKU.
import { newProduct, newVariant, intOrNull } from '../model.js';
import { priceReader } from '../money.js';
import { textToHtml, splitList, dedupe } from '../text.js';

export const ID = 'etsy';
export const REQUIRED = ['TITLE', 'PRICE'];
const SIGNATURE = ['TITLE', 'DESCRIPTION', 'PRICE', 'CURRENCY_CODE', 'QUANTITY', 'TAGS', 'IMAGE1', 'VARIATION 1 VALUES'];
// German-language shops export translated headers (secondary source only,
// so we recognise them to give a clear message but do not parse them).
const GERMAN = ['TITEL', 'BESCHREIBUNG', 'PREIS', 'BILD1'];

export function detect(headers) {
  const set = new Set(headers);
  const hits = SIGNATURE.filter((h) => set.has(h)).length;
  if (GERMAN.filter((h) => set.has(h)).length >= 3) {
    return { score: 0.6, reason: 'This looks like an Etsy listings file downloaded in German.', localized: true };
  }
  return { score: hits / SIGNATURE.length, reason: hits ? 'Etsy listings download (EtsyListingsDownload.csv)' : '' };
}

export function parse(headers, records, ctx) {
  const { issue } = ctx;
  if (detect(headers).localized) {
    issue('error', 'ETSY_LOCALIZED_HEADERS', 'This Etsy file has translated column names. Switch your Etsy account language to English, download the listings CSV again, and upload that file.', { rule: 'etsy.header' });
    return [];
  }
  const products = [];
  const readPrice = priceReader(issue);
  const currencies = new Set();
  let variationListings = 0;
  for (const r of records) {
    const line = r.__line;
    const title = (r.TITLE || '').trim();
    if (!title) { issue('warning', 'SOURCE_ROW_SKIPPED', 'Row has no TITLE, so it was skipped.', { line }); continue; }
    const p = newProduct({ title, descriptionHtml: textToHtml(r.DESCRIPTION), status: 'active' });
    p.source = { platform: ID, lines: [line], listingId: r.LISTING_ID || '' };
    p.tags = dedupe(splitList(r.TAGS));
    if (r.MATERIALS && r.MATERIALS.trim()) {
      p.materials = splitList(r.MATERIALS);
    }
    for (let i = 1; i <= 10; i++) {
      const u = (r[`IMAGE${i}`] || '').trim();
      if (u) p.images.push({ url: u, alt: '' });
    }
    const price = { value: readPrice(r.PRICE, { line, handle: title, name: title, column: 'PRICE' }) };
    if (r.CURRENCY_CODE) currencies.add(r.CURRENCY_CODE.trim().toUpperCase());
    const qty = intOrNull(r.QUANTITY);
    const sku = (r.SKU || '').trim();

    for (let n = 1; n <= 2; n++) {
      const values = dedupe(splitList(r[`VARIATION ${n} VALUES`]));
      if (!values.length) continue;
      const name = (r[`VARIATION ${n} NAME`] || r[`VARIATION ${n} TYPE`] || `Option ${n}`).trim();
      p.options.push({ name, values });
    }
    if (!p.options.length) {
      p.variants.push(newVariant({ price: price.value, sku, inventoryQty: qty, inventoryTracked: qty !== null }));
    } else {
      variationListings++;
      const combos = p.options.reduce((acc, o) => acc.flatMap((a) => o.values.map((v) => [...a, v])), [[]]);
      for (const optionValues of combos) {
        // Untracked so the variants stay buyable; Etsy gives no per-variant stock.
        p.variants.push(newVariant({ optionValues, price: price.value, sku: '', inventoryQty: null, inventoryTracked: false }));
      }
      const parts = [`It has ${combos.length} variant${combos.length === 1 ? '' : 's'} (${p.options.map((o) => o.name).join(' x ')}). Etsy's export has one price, one quantity and one SKU per listing, so every variant got the listing price (${price.value ?? 'none'}), stock tracking was turned off for the variants so they can still be bought${qty !== null ? ` (the listing has ${qty} in total)` : ''}, and SKUs were left blank. Set stock per variant after import if you want it tracked.`];
      if (sku) parts.push(`The listing SKU "${sku}" was not copied to the variants, to avoid duplicate SKUs.`);
      parts.push('Etsy does not export which combinations you turned off, so delete any that you do not sell.');
      issue('warning', 'ETSY_VARIATIONS_NO_DETAIL', `"${title}": ${parts.join(' ')}`, { line, handle: title, rule: 'etsy.variations' });
    }
    if (p.materials) issue('info', 'ETSY_MATERIALS_DROPPED', `"${title}": materials (${p.materials.join(', ')}) have no column in the destination file and were not carried over.`, { line, handle: title });
    products.push(p);
  }
  if (currencies.size > 1) issue('warning', 'MIXED_CURRENCY', `The file has prices in more than one currency (${[...currencies].join(', ')}). Prices were copied as they are, without conversion.`, {});
  ctx.meta.currency = [...currencies][0] || '';
  ctx.meta.etsyVariationListings = variationListings;
  return products;
}
