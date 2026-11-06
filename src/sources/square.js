// Square item library export (Items > Item library > Actions > Export Library, CSV).
// Square publishes no sample export or full column list. Header and row shapes
// come from Square's help pages and real exports in public GitHub repos; see
// research/square.md for every decision and its URL:
//   https://squareup.com/help/us/en/article/5153-import-items-online
//   https://squareup.com/help/us/en/article/8211-item-import-spreadsheet-glossary
// One row per item variation. Variation rows of one item sit next to each other
// and share the Item Name; item-level fields are filled on the first row only.
// UNVERIFIED (warned, never silent): the meaning of Online Sale Price and of the
// "unavailable" Square Online visibility, and Option Name 2 and higher.
import { newProduct, newVariant, intOrNull, slugify, truthy } from '../model.js';
import { priceReader } from '../money.js';
import { toGrams, normalizeUnit } from '../units.js';
import { dedupe, textToHtml } from '../text.js';

export const ID = 'square';
const SIG = ['Token', 'Item Name', 'Variation Name', 'SKU', 'Description', 'Price', 'Square Online Item Visibility', 'Item Type', 'Online Sale Price', 'Archived', 'Option Name 1', 'Option Value 1'];
const LOC_PREFIX = ['Enabled ', 'Current Quantity ', 'New Quantity ', 'Stock Alert Enabled ', 'Stock Alert Count ', 'Price '];
const NO_SHIP_TYPES = ['digital', 'service', 'event', 'donation'];
const DROPPED = ['Social Media Link Title', 'Social Media Link Description', 'Shipping Enabled', 'Self-serve Ordering Enabled', 'Delivery Enabled', 'Pickup Enabled', 'Sellable', 'Stockable', 'Contains Alcohol', 'Skip Detail Screen in POS', 'Auto Add Item to Check', 'Default Vendor Name', 'Default Vendor Code'];

export function detect(headers) {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  const has = (h) => set.has(h.toLowerCase());
  if (!has('Token') || !has('Item Name') || !has('Variation Name')) return { score: 0, reason: '' };
  const hits = SIG.filter(has).length + (headers.some((h) => /^(current quantity|enabled) /i.test(h)) ? 2 : 0);
  return { score: Math.min(1, hits / 8), reason: 'Square item library export' };
}

// "Women's > Hats, Sale" with "\," and "\>" escapes (Square glossary).
export function splitCategories(s) {
  const out = [];
  let cur = '';
  let path = [];
  const str = String(s ?? '');
  const push = () => { path.push(cur.trim()); cur = ''; };
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\' && (str[i + 1] === ',' || str[i + 1] === '>' || str[i + 1] === '\\')) { cur += str[i + 1]; i++; continue; }
    if (c === '>') { push(); continue; }
    if (c === ',') { push(); if (path.some(Boolean)) out.push(path.filter(Boolean).join(' > ')); path = []; continue; }
    cur += c;
  }
  push();
  if (path.some(Boolean)) out.push(path.filter(Boolean).join(' > '));
  return out;
}

export function parse(headers, records, ctx) {
  const { issue, options } = ctx;
  const actual = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const col = (h) => actual.get(h.toLowerCase()) ?? h;
  const has = (h) => actual.has(h.toLowerCase());
  const g = (r, h) => String(r[col(h)] ?? '').trim();
  const readPrice = priceReader(issue);
  const num = (s) => { const n = Number(String(s ?? '').trim()); return s !== '' && Number.isFinite(n) ? n : null; };

  // Option columns: every "Option Name N" with its "Option Value N".
  const optN = headers.map((h) => (/^option name (\d+)$/i.exec(h) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  // Locations, in header order, from the location-specific columns.
  const locs = [];
  for (const h of headers) {
    for (const pre of LOC_PREFIX) {
      if (h.toLowerCase().startsWith(pre.toLowerCase()) && h.length > pre.length) {
        const name = h.slice(pre.length);
        if (!locs.includes(name)) locs.push(name);
      }
    }
  }
  const locCol = (pre, loc) => (has(pre + loc) ? col(pre + loc) : null);
  const modCols = headers.filter((h) => /^modifier set - /i.test(h));
  const taxCols = headers.filter((h) => /^tax - /i.test(h));
  const catCols = ['Categories', 'Category', 'Reporting Category', 'Additional Categories'].filter(has);
  // Weight unit from the header, e.g. "Weight (lb)" or "Weight (kg)".
  const wHead = headers.find((h) => /^weight(\s*\(.*\))?$/i.test(h.trim()));
  const headUnit = wHead ? normalizeUnit((/\(([^)]*)\)/.exec(wHead) || [])[1]) : null;
  const unit = headUnit || options.sourceWeightUnit || null;
  let weightWarned = false;
  const grams = (raw) => {
    const w = num(raw);
    if (!raw || w === null || w <= 0) return null;
    if (!unit && !weightWarned) {
      issue('warning', 'WEIGHT_UNIT_ASSUMED', 'The weight column in this Square export does not name a unit. Weights were read as pounds; set the source weight unit if your store uses kilograms, grams or ounces.', {});
      weightWarned = true;
    }
    return toGrams(w, unit || 'lb');
  };

  // Group rows: consecutive rows with the same Item Name form one item.
  // Review finding 1: real exports (file A in research/square.md) fill the
  // item-level switches below on an item's FIRST row only and leave them blank
  // on its later variation rows, so a filled switch on a later row starts a new
  // item. A different non-blank Description does too. A repeated variation
  // name or option combination is the fallback when the file has no switches.
  const FLAGS = ['Shipping Enabled', 'Contains Alcohol', 'Self-serve Ordering Enabled', 'Delivery Enabled', 'Pickup Enabled'].filter(has);
  const optNames = (r) => optN.map((n) => g(r, `Option Name ${n}`)).join('\u0000');
  const group = (flags) => {
    const groups = [];
    let cur = null;
    let fillDown = false;
    for (const r of records) {
      const name = g(r, 'Item Name');
      const key = optN.map((n) => g(r, `Option Value ${n}`)).join('\u0000') + '\u0001' + g(r, 'Variation Name');
      if (!name) {
        if (flags === FLAGS && Object.values(r).some((v) => String(v ?? '').trim() && v !== r.__line)) issue('warning', 'SOURCE_ROW_SKIPPED', `Line ${r.__line} has no Item Name, so it was skipped.`, { line: r.__line });
        continue;
      }
      if (cur && cur.name === name) {
        const desc = g(r, 'Description');
        const flagged = flags.some((h) => g(r, h));
        const why = flagged ? 'flag' : (desc && cur.desc && desc !== cur.desc ? 'desc' : (cur.keys.has(key) ? 'key' : null));
        // R2-1: a row split only by the switches that has the same option
        // names and a new option value is a continuation row with the
        // switches filled in (fill-down in a spreadsheet), not a new item.
        if (why === 'flag' && optNames(r).replace(/\u0000/g, '') && optNames(r) === optNames(cur.rows[0]) && !cur.keys.has(key) && !(desc && cur.desc && desc !== cur.desc)) fillDown = true;
        if (!why) { cur.rows.push(r); cur.keys.add(key); if (!cur.desc) cur.desc = desc; continue; }
      }
      cur = { name, rows: [r], keys: new Set([key]), desc: g(r, 'Description') };
      groups.push(cur);
    }
    return { groups, fillDown };
  };
  let { groups, fillDown } = group(FLAGS);
  // R2-1: the switches are not reliable in this file, so group by name, description and repeated variation only.
  if (fillDown) groups = group([]).groups;
  const boundaryUnknown = !FLAGS.length || fillDown;
  // Every item name used by more than one product is named (finding 1, 2 and 11).
  const seen = new Map();
  for (const gr of groups) seen.set(gr.name, (seen.get(gr.name) || 0) + 1);
  const repeated = [...seen].filter(([, n]) => n > 1).map(([n]) => n);
  const names3 = (a) => a.slice(0, 3).map((n) => `"${n}"`).join(', ') + (a.length > 3 ? ` and ${a.length - 3} more` : '');
  if (repeated.length) issue('warning', 'SQUARE_SAME_NAME_ITEMS', `${repeated.length === 1 ? 'One item name is' : `${repeated.length} item names are`} used by more than one product: ${names3(repeated)}. Each was converted as its own product (separate Square items with the same name, or rows that were sorted apart). Square rows carry no item number, so check these products after import; if the file was sorted in a spreadsheet, export it again from Square.`, {});
  // No item-level switch columns: where one item ends cannot be seen, so say how many products were built from several rows.
  if (boundaryUnknown) {
    const multi = groups.filter((gr) => gr.rows.length > 1).map((gr) => gr.name);
    if (multi.length) issue('warning', 'SQUARE_ITEM_BOUNDARY_UNKNOWN', `${fillDown ? 'In this file the columns that mark where a Square item starts (Shipping Enabled, Pickup Enabled and so on) are also filled on later variation rows (Square leaves them blank there; the file may have been edited), so they were not used' : 'This file has none of the columns that mark where a Square item starts (Shipping Enabled, Pickup Enabled and so on)'}, so rows with the same Item Name next to each other were joined into one product: ${multi.length} ${multi.length === 1 ? 'product' : 'products'}, ${names3(multi)}. If two different items share a name, they were joined; check these after import.`, {});
  }

  const counts = { variable: [], archived: [], unavailable: [], mods: new Set(), modItems: 0, taxes: false, locStock: 0, locPrice: 0, locOff: 0, newQty: 0, unitPricing: 0, catId: false, optionNamed: 0, caseRenamed: [], rounded: [], locUse: new Map(), locPriceOnly: 0, types: new Map(), dropped: new Set() };
  const products = [];
  for (const gr of groups) {
    const rows = gr.rows;
    const first = rows[0];
    const line = first.__line;
    const any = (h) => { for (const r of rows) { const v = g(r, h); if (v) return v; } return ''; };
    const p = newProduct({ title: gr.name });
    p.source = { platform: ID, lines: rows.map((r) => r.__line) };
    p.handle = slugify(any('Permalink').replace(/^\/+|\/+$/g, '') || gr.name);
    p.descriptionHtml = textToHtml(String(rows.map((r) => r[col('Description')] ?? '').find((d) => String(d).trim()) ?? ''));
    p.seoTitle = any('SEO Title');
    p.seoDescription = any('SEO Description');
    const cats = [];
    for (const c of catCols) cats.push(...splitCategories(any(c)));
    p.categories = dedupe(cats);
    if (p.categories.some((c) => /\([A-Z0-9]{20,}\)/.test(c))) counts.catId = true;
    p.productType = p.categories[0] ? p.categories[0].split(' > ').pop() : '';

    // Status: only a clear "visible" publishes.
    let status = 'active';
    if (has('Square Online Item Visibility')) {
      const vis = any('Square Online Item Visibility').toLowerCase();
      if (vis === 'hidden') status = 'draft';
      else if (vis === 'unavailable') { status = 'draft'; counts.unavailable.push(gr.name); }
      else if (vis !== 'visible') { status = 'draft'; issue('warning', 'VISIBILITY_UNCLEAR', `"${gr.name}": Square Online Item Visibility is ${vis ? `"${any('Square Online Item Visibility')}"` : 'blank'}, not visible, hidden or unavailable, so the product was kept as a draft (hidden). Publish it in the new store if it should be visible.`, { line }); }
    }
    if (truthy(any('Archived')) === true) { status = 'draft'; counts.archived.push(gr.name); }
    p.status = status;

    const type = any('Item Type').toLowerCase();
    const noShip = NO_SHIP_TYPES.includes(type);
    if (noShip || type === 'bundle') counts.types.set(any('Item Type'), (counts.types.get(any('Item Type')) || 0) + 1);
    if (type === 'digital') issue('warning', 'DOWNLOAD_FILES_NOT_MOVED', `"${gr.name}" is a Digital item. Its files are not in the Square export, so it was converted as a product without shipping and without files. Attach the files in the new store.`, { line });

    if (modCols.some((h) => rows.some((r) => truthy(g(r, h)) === true))) { counts.modItems++; for (const h of modCols) if (rows.some((r) => truthy(g(r, h)) === true)) counts.mods.add(h.replace(/^modifier set - /i, '')); }
    if (taxCols.some((h) => rows.some((r) => truthy(g(r, h)) === true))) counts.taxes = true;
    if (any('Unit and Precision')) counts.unitPricing++;
    // A "N" in Shipping Enabled is a setting too (not shippable on Square Online); others count when switched on or filled.
    for (const h of DROPPED) if (has(h) && rows.some((r) => { const v = g(r, h); return v && (h === 'Shipping Enabled' ? truthy(v) === false : truthy(v) !== false); })) counts.dropped.add(h === 'Shipping Enabled' ? 'Shipping Enabled (N: not shipped on Square Online; converted as shippable)' : h);
    if (locs.some((l) => locCol('Stock Alert Enabled ', l) && rows.some((r) => truthy(g(r, 'Stock Alert Enabled ' + l)) === true))) counts.dropped.add('Stock Alert');

    // Options.
    const usedN = optN.filter((n) => rows.some((r) => g(r, `Option Name ${n}`) || g(r, `Option Value ${n}`)));
    // Finding 4: options are used only when every variation has every option
    // value and no two variations share a combination; otherwise the variation
    // names are the option, when they tell the variations apart.
    const combo = (r) => usedN.map((n) => g(r, `Option Value ${n}`)).join('\u0000');
    const optsFull = usedN.length && rows.every((r) => usedN.every((n) => g(r, `Option Value ${n}`)));
    const optsUnique = new Set(rows.map(combo)).size === rows.length;
    const vnUnique = new Set(rows.map((r) => g(r, 'Variation Name'))).size === rows.length;
    const allHaveOpts = optsFull && (optsUnique || !vnUnique || rows.length === 1);
    let names = [];
    let valuesOf;
    if (allHaveOpts) {
      for (const n of usedN) { const nm = any(`Option Name ${n}`) || `Option ${n}`; if (!names.some((x) => x.toLowerCase() === nm.toLowerCase())) names.push(nm); else names.push(`${nm} ${n}`); }
      valuesOf = (r) => usedN.map((n) => g(r, `Option Value ${n}`));
    } else if (rows.length > 1) {
      if (usedN.length) issue('warning', 'SQUARE_OPTIONS_INCOMPLETE', optsFull ? `"${gr.name}": two or more variations have the same option values, so the variation names were used as the only option instead.` : `"${gr.name}": some variations are missing an option value, so the variation names were used as the only option instead.`, { line });
      names = ['Variation'];
      counts.optionNamed++;
      // R2-3: values that differ only by case get a number, because WooCommerce compares values without case.
      const vals = [];
      for (const r of rows) {
        const base = g(r, 'Variation Name') || `Variation ${rows.indexOf(r) + 1}`;
        let v = base;
        for (let k = 2; vals.some((x) => x.toLowerCase() === v.toLowerCase()); k++) v = `${base} (${k})`;
        if (v !== base) counts.caseRenamed.push(`"${gr.name}": "${base}" became "${v}"`);
        vals.push(v);
      }
      valuesOf = (r) => [vals[rows.indexOf(r)]];
    } else {
      valuesOf = () => [];
    }
    p.options = names.map((name, k) => ({ name, values: dedupe(rows.map((r) => valuesOf(r)[k]).filter(Boolean)) }));

    const shipping = noShip ? false : null;
    let variable = false;
    let locPriceOnly = false;
    let stockElsewhere = false;
    p.variants = rows.map((r) => {
      const vline = r.__line;
      const rawPrice = g(r, 'Price');
      const vname = g(r, 'SKU') || g(r, 'Variation Name') || gr.name;
      let price = null;
      if (!rawPrice || /^variable$/i.test(rawPrice)) { variable = true; if (locs.some((l) => locCol('Price ', l) && g(r, 'Price ' + l))) locPriceOnly = true; }
      else price = readPrice(rawPrice, { line: vline, name: gr.name, column: 'Price' });
      const saleRaw = g(r, 'Online Sale Price');
      const sale = saleRaw && num(saleRaw) !== 0 ? readPrice(saleRaw, { line: vline, name: gr.name, column: 'Online Sale Price', label: 'online sale price' }) : null;
      let pr = { price, compareAtPrice: null };
      if (sale !== null && price !== null) {
        if (Number(sale) < Number(price)) {
          pr = { price: sale, compareAtPrice: price };
          issue('warning', 'SQUARE_ONLINE_SALE_PRICE', `"${gr.name}", variation ${vname}: Online Sale Price ${sale}, Price ${price}. Square does not document this column; its name suggests the sale applied on Square Online only, while ${price} applied in person. The file carries ${sale} with ${price} as the compare-at price. Change it in the new store if the sale should not continue.`, { line: vline });
        } else if (Number(sale) > Number(price)) {
          issue('warning', 'SALE_NOT_LOWER', `"${gr.name}", variation ${vname}: the Online Sale Price ${sale} is higher than the Price ${price}. The file carries ${price} with no sale. Change it in the new store if ${sale} is right.`, { line: vline });
        }
      } else if (sale !== null && price === null) {
        issue('warning', 'SQUARE_ONLINE_SALE_PRICE', `"${gr.name}", variation ${vname}: there is an Online Sale Price ${sale} but no Price, so no price was carried. Set the price in the new store.`, { line: vline });
      }
      for (const l of locs) {
        const pc = locCol('Price ', l);
        if (pc && g(r, 'Price ' + l) && price !== null) { const lp = readPrice(g(r, 'Price ' + l), { line: vline, name: gr.name, column: 'Price ' + l }); if (lp !== null && lp !== price) counts.locPrice++; }
        const ec = locCol('Enabled ', l);
        if (ec && truthy(g(r, 'Enabled ' + l)) === false) counts.locOff++;
        if (locCol('New Quantity ', l) && g(r, 'New Quantity ' + l)) counts.newQty++;
      }
      // Finding 7: stock comes from the first location where this variation is
      // switched on (no Enabled column counts as on).
      const locUsed = locs.find((l) => locCol('Current Quantity ', l) && !(locCol('Enabled ', l) && truthy(g(r, 'Enabled ' + l)) === false));
      for (const l of locs) if (l !== locUsed && locCol('Current Quantity ', l) && num(g(r, 'Current Quantity ' + l)) !== null) stockElsewhere = true;
      // Finding 6: a fractional count (items sold by weight) is rounded down, and counted.
      let qty = null;
      if (locUsed) {
        const raw = g(r, 'Current Quantity ' + locUsed).replace(/,/g, '');
        const n = num(raw);
        if (n !== null) { qty = Math.trunc(n) || 0; if (qty !== n) counts.rounded.push(`${gr.name} (${g(r, 'Variation Name') || vname})`); counts.locUse.set(locUsed, (counts.locUse.get(locUsed) || 0) + 1); }
      }
      const w = noShip ? null : grams(wHead ? g(r, wHead) : '');
      return newVariant({
        optionValues: valuesOf(r), sku: g(r, 'SKU'), barcode: g(r, 'GTIN'), ...pr,
        costPerItem: num(g(r, 'Default Unit Cost')) > 0 ? readPrice(g(r, 'Default Unit Cost'), { line: vline, name: gr.name, column: 'Default Unit Cost', label: 'unit cost' }) : null,
        inventoryTracked: qty !== null, inventoryQty: qty,
        weightGrams: w, weightUnit: w === null ? null : (unit || 'lb'), requiresShipping: shipping,
      });
    });
    if (variable) counts.variable.push(gr.name);
    if (locPriceOnly) counts.locPriceOnly++;
    if (stockElsewhere) counts.locStock++;
    products.push(p);
  }

  const list = (a) => a.slice(0, 3).map((n) => `"${n}"`).join(', ') + (a.length > 3 ? ` and ${a.length - 3} more` : '');
  // Findings 9 and 10: said only when items were read, and as information (nothing in the file is wrong).
  if (products.length) issue('info', 'SQUARE_NO_IMAGES', 'Square item library exports contain no images, so no images were carried over. Add product images in the new store after import.', {});
  if (counts.variable.length) issue('warning', 'SQUARE_VARIABLE_PRICE', `${counts.variable.length} ${counts.variable.length === 1 ? 'item has' : 'items have'} a variable price (Price blank or "Variable") in Square: ${list(counts.variable)}. ${counts.variable.length === 1 ? 'It has' : 'They have'} no price in the file${counts.locPriceOnly ? ` (${counts.locPriceOnly === 1 && counts.variable.length === 1 ? 'it has' : `${counts.locPriceOnly} of them ${counts.locPriceOnly === 1 ? 'has' : 'have'}`} a price at a location, which was not used)` : ''}. Shopify rejects products without a price, so ${counts.variable.length === 1 ? 'it is' : 'they are'} left out of Shopify files; WooCommerce imports ${counts.variable.length === 1 ? 'it' : 'them'} without a price. Set a price in the new store.`, {});
  if (counts.archived.length) issue('warning', 'SQUARE_ARCHIVED', `${counts.archived.length} archived ${counts.archived.length === 1 ? 'item was converted as a draft' : 'items were converted as drafts'} (hidden): ${list(counts.archived)}. Delete ${counts.archived.length === 1 ? 'it' : 'them'} in the new store if ${counts.archived.length === 1 ? 'it is' : 'they are'} not wanted.`, {});
  if (counts.unavailable.length) issue('warning', 'SQUARE_UNAVAILABLE', `${counts.unavailable.length} ${counts.unavailable.length === 1 ? 'item is' : 'items are'} marked "unavailable" on Square Online: ${list(counts.unavailable)}. Square does not document exactly what shoppers saw, so ${counts.unavailable.length === 1 ? 'it was kept as a draft' : 'they were kept as drafts'} (hidden). Publish ${counts.unavailable.length === 1 ? 'it' : 'them'} in the new store if ${counts.unavailable.length === 1 ? 'it' : 'they'} should be visible.`, {});
  if (counts.modItems) issue('warning', 'SQUARE_MODIFIERS_NOT_MOVED', `${counts.modItems} ${counts.modItems === 1 ? 'item uses' : 'items use'} Square modifier sets (${[...counts.mods].slice(0, 5).join(', ')}${counts.mods.size > 5 ? ', ...' : ''}). Modifiers are add-on choices with their own prices; Shopify and WooCommerce product CSVs have no place for them, so they were not carried over.`, {});
  if (counts.taxes) issue('info', 'SQUARE_TAXES_NOT_MOVED', 'Square tax settings (the "Tax - ..." columns) were not carried over. Set up taxes in the new store.', {});
  const usedLocs = [...counts.locUse].map(([l, n]) => `"${l}" for ${n} ${n === 1 ? 'variation' : 'variations'}`).join(', ');
  if (locs.length > 1 && counts.locStock) issue('warning', 'SQUARE_LOCATION_STOCK', `This export has ${locs.length} locations (${locs.slice(0, 4).join(', ')}). Stock was taken from the first location where each variation is switched on (${usedLocs || 'none'}); ${counts.locStock} ${counts.locStock === 1 ? 'item also has' : 'items also have'} stock at other locations, which was not added. Set stock per location in the new store.`, {});
  if (counts.rounded.length) issue('warning', 'SQUARE_STOCK_ROUNDED', `${counts.rounded.length} ${counts.rounded.length === 1 ? 'variation has' : 'variations have'} a stock count with a fraction (for example items sold by weight): ${list(counts.rounded)}. Stock counts must be whole numbers, so ${counts.rounded.length === 1 ? 'it was' : 'they were'} rounded toward zero (2.5 becomes 2) and stock stays tracked.`, {});
  if (counts.caseRenamed.length) issue('warning', 'SQUARE_VARIATION_RENAMED', `${counts.caseRenamed.length} variation ${counts.caseRenamed.length === 1 ? 'name differs' : 'names differ'} from another of the same item only by capital letters, which WooCommerce treats as the same value, so a number was added: ${counts.caseRenamed.slice(0, 3).join('; ')}${counts.caseRenamed.length > 3 ? ` and ${counts.caseRenamed.length - 3} more` : ''}.`, {});
  if (counts.locPrice) issue('warning', 'SQUARE_LOCATION_PRICE', `${counts.locPrice} ${counts.locPrice === 1 ? 'variation has' : 'variations have'} a location price different from its Price. Only the Price column was carried over.`, {});
  if (counts.locOff) issue('warning', 'SQUARE_LOCATION_DISABLED', `${counts.locOff} ${counts.locOff === 1 ? 'variation is' : 'variations are'} switched off at one or more Square locations (an "Enabled" column says N). The new store has no per-location availability in its import file, so they were converted as available.`, {});
  if (counts.newQty) issue('warning', 'SQUARE_NEW_QUANTITY_IGNORED', `${counts.newQty} "New Quantity" ${counts.newQty === 1 ? 'cell is' : 'cells are'} filled. Square uses that column only when importing back into Square; the stock carried over is the "Current Quantity" column.`, {});
  if (counts.unitPricing) issue('warning', 'SQUARE_UNIT_PRICING', `${counts.unitPricing} ${counts.unitPricing === 1 ? 'item has' : 'items have'} a unit ("Unit and Precision", for example sold by weight). The price was carried over as a price per item; set up unit pricing in the new store if needed.`, {});
  for (const [t, n] of counts.types) issue('warning', 'SQUARE_ITEM_TYPE', t.toLowerCase() === 'bundle' ? `${n} Bundle ${n === 1 ? 'item was' : 'items were'} converted as ordinary products. The items inside each bundle are not in the export and are not linked.` : `${n} ${t} ${n === 1 ? 'item was' : 'items were'} converted as ${n === 1 ? 'a product' : 'products'} without shipping.`, {});
  if (counts.optionNamed) issue('info', 'SQUARE_OPTION_NAMED', `${counts.optionNamed} ${counts.optionNamed === 1 ? 'item has' : 'items have'} several variations but no option name in Square, so the option was named "Variation" and each variation name became its value. Rename the option in the new store if you like.`, {});
  if (counts.catId) issue('info', 'SQUARE_CATEGORY_ID_SUFFIX', 'Some Square category names end in an ID in brackets, for example "SIDES (P4UDVM47WMBWY7UAJDOH7BI5)". Square adds it when two categories share a name. The names were kept exactly as exported; tidy them in the new store.', {});
  if (counts.dropped.size) issue('info', 'SQUARE_FIELDS_DROPPED', `These Square fields have no equivalent in the destination file and were not carried over: ${[...counts.dropped].join(', ')}.`, {});
  return products;
}
