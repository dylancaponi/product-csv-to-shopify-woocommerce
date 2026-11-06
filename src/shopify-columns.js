// Shopify product CSV columns. CURRENT is the header row of Shopify's
// official template, downloaded 2026-11-04 from
// https://help.shopify.com/csv/product_template.csv (61 columns, CRLF, UTF-8,
// no BOM). See research/shopify.md.
export const CURRENT = [
  'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
  'Published on online store', 'Status', 'SKU', 'Variant Barcodes',
  'Option1 name', 'Option1 value', 'Option1 Linked To',
  'Option2 name', 'Option2 value', 'Option2 Linked To',
  'Option3 name', 'Option3 value', 'Option3 Linked To',
  'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Tax code',
  'Unit price total measure', 'Unit price total measure unit', 'Unit price base measure', 'Unit price base measure unit',
  'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
  'Weight value (grams)', 'Weight unit for display', 'Requires shipping', 'Fulfillment service',
  'Product image URL', 'Image position', 'Image alt text', 'Variant image URL', 'Gift card',
  'SEO title', 'SEO description', 'Color (product.metafields.shopify.color-pattern)',
  'Google Shopping / Google product category', 'Google Shopping / Gender', 'Google Shopping / Age group',
  'Google Shopping / Manufacturer part number (MPN)', 'Google Shopping / Ad group name',
  'Google Shopping / Ads labels', 'Google Shopping / Condition', 'Google Shopping / Custom product',
  'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1', 'Google Shopping / Custom label 2',
  'Google Shopping / Custom label 3', 'Google Shopping / Custom label 4',
  'Packed product length', 'Packed product width', 'Packed product height', 'Packed product dimension unit',
];

// Field key -> accepted header names (current name first, then the older
// names Shopify used before the 2024/2025 rename). Matching is
// case-insensitive. Legacy names: see research/shopify.md.
export const FIELDS = {
  title: ['Title'],
  handle: ['URL handle', 'Handle'],
  description: ['Description', 'Body (HTML)'],
  vendor: ['Vendor'],
  category: ['Product category', 'Product Category'],
  type: ['Type'],
  tags: ['Tags'],
  published: ['Published on online store', 'Published'],
  status: ['Status'],
  sku: ['SKU', 'Variant SKU'],
  barcode: ['Variant Barcodes', 'Variant Barcode', 'Barcode'],
  opt1name: ['Option1 name', 'Option1 Name'], opt1value: ['Option1 value', 'Option1 Value'],
  opt2name: ['Option2 name', 'Option2 Name'], opt2value: ['Option2 value', 'Option2 Value'],
  opt3name: ['Option3 name', 'Option3 Name'], opt3value: ['Option3 value', 'Option3 Value'],
  price: ['Price', 'Variant Price'],
  compareAt: ['Compare-at price', 'Variant Compare-at Price', 'Variant Compare At Price'],
  cost: ['Cost per item'],
  taxable: ['Charge tax', 'Variant Taxable'],
  tracker: ['Inventory tracker', 'Variant Inventory Tracker'],
  qty: ['Inventory quantity', 'Variant Inventory Qty'],
  policy: ['Continue selling when out of stock', 'Variant Inventory Policy'],
  grams: ['Weight value (grams)', 'Variant Grams'],
  weightUnit: ['Weight unit for display', 'Variant Weight Unit'],
  requiresShipping: ['Requires shipping', 'Variant Requires Shipping'],
  fulfillment: ['Fulfillment service', 'Variant Fulfillment Service'],
  imageUrl: ['Product image URL', 'Image Src'],
  imagePosition: ['Image position', 'Image Position'],
  imageAlt: ['Image alt text', 'Image Alt Text'],
  variantImage: ['Variant image URL', 'Variant Image'],
  giftCard: ['Gift card', 'Gift Card'],
  seoTitle: ['SEO title', 'SEO Title'],
  seoDescription: ['SEO description', 'SEO Description'],
};

// Build a resolver: field key -> actual header present in this file.
export function resolveHeaders(headers) {
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const map = {};
  for (const [key, names] of Object.entries(FIELDS)) {
    for (const n of names) {
      const hit = lower.get(n.toLowerCase());
      if (hit !== undefined) { map[key] = hit; break; }
    }
  }
  return map;
}
