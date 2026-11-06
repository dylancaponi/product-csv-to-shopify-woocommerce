// WooCommerce core product CSV columns (exporter get_default_column_names(),
// tag 11.2.2). Importer matches labels exactly, case-insensitively
// (auto_map_columns). Sources in research/woocommerce.md:
// https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/export/class-wc-product-csv-exporter.php
// https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/admin/importers/class-wc-product-csv-importer-controller.php

export const FIELDS = {
  id: ['ID'],
  type: ['Type'],
  sku: ['SKU'],
  gtin: ['GTIN, UPC, EAN, or ISBN'],
  name: ['Name', 'Title', 'Product Title'],
  published: ['Published'],
  featured: ['Is featured?'],
  visibility: ['Visibility in catalog'],
  shortDescription: ['Short description'],
  description: ['Description'],
  taxStatus: ['Tax status'],
  inStock: ['In stock?'],
  stock: ['Stock', 'Quantity'],
  backorders: ['Backorders allowed?'],
  salePrice: ['Sale price'],
  saleFrom: ['Date sale price starts'],
  saleTo: ['Date sale price ends'],
  regularPrice: ['Regular price', 'Price'],
  categories: ['Categories'],
  tags: ['Tags'],
  images: ['Images'],
  parent: ['Parent', 'Parent SKU'],
  position: ['Position'],
  brands: ['Brands'],
};

// Woo unit codes (option woocommerce_weight_unit) -> our unit codes.
export const WOO_WEIGHT_UNITS = { kg: 'kg', g: 'g', lbs: 'lb', oz: 'oz' };

export function resolveHeaders(headers) {
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const map = {};
  for (const [key, names] of Object.entries(FIELDS)) {
    for (const n of names) {
      const hit = lower.get(n.toLowerCase());
      if (hit !== undefined) { map[key] = hit; break; }
    }
  }
  // "Weight (lbs)" style header: unit is in the label.
  for (const h of headers) {
    const m = h.match(/^weight \(([^)]+)\)$/i);
    if (m) { map.weight = h; map.weightUnit = WOO_WEIGHT_UNITS[m[1].trim().toLowerCase()] || null; }
  }
  // Attribute N name / value(s) / visible / global / default
  const attrs = {};
  for (const h of headers) {
    const m = h.match(/^attribute (\d+) (name|value\(s\)|visible|global|default)$/i);
    if (m) {
      const n = Number(m[1]);
      attrs[n] = attrs[n] || {};
      attrs[n][m[2].toLowerCase().replace('value(s)', 'values')] = h;
    }
  }
  map.attributes = Object.keys(attrs).map(Number).sort((a, b) => a - b).map((n) => ({ n, ...attrs[n] }));
  return map;
}

// Description cells: the exporter writes real newlines as the two
// characters \n and a literal \n as \\n (parse_description_field reverses it).
export function decodeDescription(s) {
  return String(s ?? '').replace(/\\\\n|\\n/g, (m) => (m === '\\n' ? '\n' : '\\n'));
}

export function encodeDescription(s) {
  return String(s ?? '').replace(/\\n/g, '\\\\n').replace(/\r\n?|\n/g, '\\n');
}
