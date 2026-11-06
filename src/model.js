// The neutral product model every parser produces and every writer consumes.
//
// Product {
//   handle: string            unique id for the product in the output file
//   title: string
//   descriptionHtml: string
//   vendor, productType: string
//   tags: string[]
//   categories: string[]      category paths, "Parent > Child"
//   status: 'active' | 'draft' | 'archived'
//   published: boolean|null    shown on the online store; false = active but
//                              hidden (wholesale, POS-only, pre-launch); null = follow status
//   options: { name: string, values: string[] }[]   in order
//   variants: Variant[]       at least one
//   images: { url, alt }[]    in order, first is the main image
//   seoTitle, seoDescription: string
//   source: { platform, lines: number[] }           source CSV lines used
// }
// Variant {
//   optionValues: string[]    same length and order as product.options
//   sku, barcode: string
//   price, compareAtPrice, costPerItem: string|null  plain decimals "12.50"
//   inventoryQty: number|null
//   inventoryTracked: boolean|null
//   continueSellingOutOfStock: boolean|null
//   weightGrams: number|null
//   weightUnit: 'g'|'kg'|'lb'|'oz'|null   unit the merchant uses for display
//   requiresShipping: boolean|null
//   taxable: boolean|null
//   imageUrl: string
// }

export function newProduct(fields = {}) {
  return {
    handle: '', title: '', descriptionHtml: '', vendor: '', productType: '',
    tags: [], categories: [], status: 'active', published: null, options: [], variants: [], images: [],
    seoTitle: '', seoDescription: '', source: { platform: '', lines: [] },
    ...fields,
  };
}

export function newVariant(fields = {}) {
  return {
    optionValues: [], sku: '', barcode: '', price: null, compareAtPrice: null, costPerItem: null,
    inventoryQty: null, inventoryTracked: null, continueSellingOutOfStock: null,
    weightGrams: null, weightUnit: null, requiresShipping: null, taxable: null, imageUrl: '',
    ...fields,
  };
}

// URL handle from a title: lowercase ASCII letters, digits and hyphens.
// Accents are folded (é -> e). Titles with no Latin letters fall back to
// `fallback`. This is our convention, chosen to be safe for every target.
export function slugify(title, fallback = 'product') {
  const s = String(title || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/g, '');
  return s || fallback;
}

// Ensure handles are unique across products (adds -2, -3 ...).
export function uniquifyHandles(products, issues) {
  const used = new Map();
  for (const p of products) {
    let h = p.handle || slugify(p.title);
    if (used.has(h)) {
      let n = used.get(h) + 1;
      while (used.has(`${h}-${n}`)) n++;
      used.set(h, n);
      const nh = `${h}-${n}`;
      issues?.push({ severity: 'warning', code: 'HANDLE_RENAMED', handle: nh, message: `Two products would share the handle "${h}". The second one was given the handle "${nh}".` });
      h = nh;
    }
    used.set(h, used.get(h) || 1);
    p.handle = h;
  }
}

export function truthy(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 't'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'f'].includes(s)) return false;
  return null;
}

export function intOrNull(v) {
  const s = String(v ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(\.0+)?$/.test(s)) return null;
  return parseInt(s, 10);
}
