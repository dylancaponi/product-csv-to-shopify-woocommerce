// Builds the synthetic fixture CSVs in fixtures/ from the CONFIRMED header
// rows (see research/*.md for where each header came from). All data is
// invented; no real merchant data. Run: node test-support/make-fixtures.mjs
// Uses its own tiny CSV quoting so fixtures do not depend on src/csv.js.
import { writeFileSync } from 'node:fs';
import { CURRENT as SHOPIFY_HEADER } from '../src/shopify-columns.js';

const dir = new URL('../fixtures/', import.meta.url);
const q = (v, force) => {
  const s = v == null ? '' : String(v);
  return force || /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function csv(header, rows, { eol = '\n', bom = false, quoteHeader = () => false, quoteAll = false } = {}) {
  const lines = [header.map((h) => q(h, quoteAll || quoteHeader(h))).join(',')];
  for (const r of rows) lines.push(header.map((h) => q(r[h], quoteAll && r[h] !== undefined && r[h] !== '')).join(','));
  return (bom ? '﻿' : '') + lines.join(eol) + eol;
}
const save = (name, text) => writeFileSync(new URL(name, dir), text);

// ---------- Etsy: header from real EtsyListingsDownload.csv (24 columns)
const ETSY = ['TITLE', 'DESCRIPTION', 'PRICE', 'CURRENCY_CODE', 'QUANTITY', 'TAGS', 'MATERIALS',
  'IMAGE1', 'IMAGE2', 'IMAGE3', 'IMAGE4', 'IMAGE5', 'IMAGE6', 'IMAGE7', 'IMAGE8', 'IMAGE9', 'IMAGE10',
  'VARIATION 1 TYPE', 'VARIATION 1 NAME', 'VARIATION 1 VALUES', 'VARIATION 2 TYPE', 'VARIATION 2 NAME', 'VARIATION 2 VALUES', 'SKU'];
const img = (n) => `https://i.etsystatic.com/00000000/r/il/abc123/${n}/il_fullxfull.${n}_test.jpg`;
save('etsy-listings.csv', csv(ETSY, [
  { TITLE: 'Crème Brûlée Ceramic Mug, 12 oz', DESCRIPTION: 'Hand-thrown stoneware mug.\nGlazed in "Sand" & dishwasher safe, microwave safe.\n\nEach mug is unique, so colour may vary.', PRICE: '24.00', CURRENCY_CODE: 'USD', QUANTITY: '12', TAGS: 'ceramic mug,handmade,coffee cup', MATERIALS: 'stoneware,glaze', IMAGE1: img(1001), IMAGE2: img(1002), IMAGE3: img(1003), SKU: 'MUG-001' },
  { TITLE: 'Linen Tee', DESCRIPTION: 'Relaxed fit linen tee.', PRICE: '38.50', CURRENCY_CODE: 'USD', QUANTITY: '30', TAGS: 'linen,tee,summer', IMAGE1: img(2001), 'VARIATION 1 TYPE': 'Unisex shirt size', 'VARIATION 1 NAME': 'Size', 'VARIATION 1 VALUES': 'S,M,L', 'VARIATION 2 TYPE': 'Primary color', 'VARIATION 2 NAME': 'Color', 'VARIATION 2 VALUES': 'Sand / Ivory,Black', SKU: 'TEE-BASE' },
  { TITLE: '日本茶 Matcha Bowl', DESCRIPTION: 'Chawan for matcha.', PRICE: '1250.00', CURRENCY_CODE: 'USD', QUANTITY: '3', TAGS: 'matcha,tea', IMAGE1: img(3001), 'VARIATION 1 TYPE': 'Color', 'VARIATION 1 NAME': '', 'VARIATION 1 VALUES': 'Moss,Ash', SKU: '' },
  { TITLE: 'Crème Brûlée Ceramic Mug, 12 oz', DESCRIPTION: 'Second listing with the same title.', PRICE: '26.00', CURRENCY_CODE: 'USD', QUANTITY: '5', TAGS: 'ceramic mug', IMAGE1: img(4001), SKU: 'MUG-002' },
  { TITLE: 'Broken Price Print', DESCRIPTION: 'Art print.', PRICE: 'N/A', CURRENCY_CODE: 'USD', QUANTITY: '1', TAGS: 'print', IMAGE1: img(5001), SKU: 'PRINT-1' },
], { quoteHeader: (h) => h.startsWith('VARIATION') }));

// ---------- Shopify: current template header (61 columns), CRLF like the template
const desc = '<p>Soft cotton tee, "garment dyed", pre-shrunk.</p>\n<ul><li>100% cotton</li><li>Unisex, regular fit</li></ul>';
const shop = (o) => o;
save('shopify-export.csv', csv(SHOPIFY_HEADER, [
  shop({ Title: 'Garment Dyed Tee', 'URL handle': 'garment-dyed-tee', Description: desc, Vendor: 'Acme Threads', Type: 'T-Shirt', Tags: 'cotton, tee, unisex', 'Published on online store': 'TRUE', Status: 'active', SKU: 'GDT-S-BLK', 'Option1 name': 'Size', 'Option1 value': 'S', 'Option2 name': 'Color', 'Option2 value': 'Black', Price: '28.00', 'Compare-at price': '35.00', 'Charge tax': 'TRUE', 'Inventory tracker': 'shopify', 'Inventory quantity': '10', 'Continue selling when out of stock': 'DENY', 'Weight value (grams)': '181', 'Weight unit for display': 'lb', 'Requires shipping': 'TRUE', 'Fulfillment service': 'manual', 'Product image URL': 'https://cdn.example.com/tee-black.jpg', 'Image position': '1', 'Image alt text': 'Black tee', 'Variant image URL': 'https://cdn.example.com/tee-black.jpg', 'Gift card': 'FALSE' }),
  shop({ 'URL handle': 'garment-dyed-tee', SKU: 'GDT-S-WHT', 'Option1 value': 'S', 'Option2 value': 'White', Price: '28.00', 'Compare-at price': '35.00', 'Charge tax': 'TRUE', 'Inventory tracker': 'shopify', 'Inventory quantity': '0', 'Continue selling when out of stock': 'CONTINUE', 'Weight value (grams)': '181', 'Weight unit for display': 'lb', 'Requires shipping': 'TRUE', 'Fulfillment service': 'manual', 'Variant image URL': 'https://cdn.example.com/tee-white.jpg' }),
  shop({ 'URL handle': 'garment-dyed-tee', SKU: 'GDT-M-BLK', 'Option1 value': 'M', 'Option2 value': 'Black', Price: '28.00', 'Charge tax': 'TRUE', 'Inventory tracker': 'shopify', 'Inventory quantity': '7', 'Continue selling when out of stock': 'DENY', 'Weight value (grams)': '195', 'Weight unit for display': 'lb', 'Requires shipping': 'TRUE', 'Fulfillment service': 'manual' }),
  shop({ 'URL handle': 'garment-dyed-tee', SKU: 'GDT-M-WHT', 'Option1 value': 'M', 'Option2 value': 'White', Price: '28.00', 'Charge tax': 'TRUE', 'Inventory tracker': 'shopify', 'Inventory quantity': '3', 'Continue selling when out of stock': 'DENY', 'Weight value (grams)': '195', 'Weight unit for display': 'lb', 'Requires shipping': 'TRUE', 'Fulfillment service': 'manual' }),
  shop({ 'URL handle': 'garment-dyed-tee', 'Product image URL': 'https://cdn.example.com/tee-white.jpg', 'Image position': '2', 'Image alt text': 'White tee' }),
  shop({ 'URL handle': 'garment-dyed-tee', 'Product image URL': 'https://cdn.example.com/tee-detail.jpg', 'Image position': '3' }),
  shop({ Title: 'Gift Wrap', 'URL handle': 'gift-wrap', Description: 'Recycled paper wrap', Vendor: 'Acme Threads', Tags: '', 'Published on online store': 'FALSE', Status: 'draft', SKU: 'WRAP', 'Option1 name': 'Title', 'Option1 value': 'Default Title', Price: '4.50', 'Charge tax': 'FALSE', 'Inventory tracker': '', 'Inventory quantity': '', 'Continue selling when out of stock': 'DENY', 'Weight value (grams)': '50', 'Weight unit for display': 'g', 'Requires shipping': 'TRUE', 'Fulfillment service': 'manual' }),
], { eol: '\r\n' }));

// ---------- Shopify legacy header (26 columns quoted on help.shopify.com common-import-issues)
const LEGACY = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare-at Price', 'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Alt Text'];
save('shopify-legacy.csv', csv(LEGACY, [
  { Handle: 'wool-beanie', Title: 'Wool Beanie', 'Body (HTML)': '<p>Merino wool.</p>', Vendor: 'Acme', Type: 'Hat', Tags: 'wool, winter', Published: 'TRUE', 'Option1 Name': 'Color', 'Option1 Value': 'Grey', 'Variant SKU': 'BEANIE-GRY', 'Variant Grams': '90', 'Variant Inventory Tracker': 'shopify', 'Variant Inventory Qty': '20', 'Variant Inventory Policy': 'deny', 'Variant Fulfillment Service': 'manual', 'Variant Price': '22.00', 'Variant Compare-at Price': '', 'Variant Requires Shipping': 'TRUE', 'Variant Taxable': 'TRUE', 'Variant Barcode': '012345678905', 'Image Src': 'https://cdn.example.com/beanie.jpg', 'Image Alt Text': 'Grey beanie' },
  { Handle: 'wool-beanie', 'Option1 Value': 'Navy', 'Variant SKU': 'BEANIE-NVY', 'Variant Grams': '90', 'Variant Inventory Tracker': 'shopify', 'Variant Inventory Qty': '0', 'Variant Inventory Policy': 'deny', 'Variant Fulfillment Service': 'manual', 'Variant Price': '22.00', 'Variant Requires Shipping': 'TRUE', 'Variant Taxable': 'TRUE' },
]));

// ---------- WooCommerce: exporter header, 11.2.2 (get_default_column_names), BOM like the exporter
const WOO = ['ID', 'Type', 'SKU', 'GTIN, UPC, EAN, or ISBN', 'Name', 'Published', 'Is featured?', 'Visibility in catalog', 'Short description', 'Description', 'Date sale price starts', 'Date sale price ends', 'Tax status', 'Tax class', 'In stock?', 'Stock', 'Low stock amount', 'Backorders allowed?', 'Sold individually?', 'Weight (lbs)', 'Length (in)', 'Width (in)', 'Height (in)', 'Allow customer reviews?', 'Purchase note', 'Sale price', 'Regular price', 'Categories', 'Tags', 'Shipping class', 'Images', 'Download limit', 'Download expiry days', 'Parent', 'Grouped products', 'Upsells', 'Cross-sells', 'External URL', 'Button text', 'Position', 'Brands',
  'Attribute 1 name', 'Attribute 1 value(s)', 'Attribute 1 visible', 'Attribute 1 global', 'Attribute 2 name', 'Attribute 2 value(s)', 'Attribute 2 visible', 'Attribute 2 global', 'Attribute 1 default', 'Attribute 2 default'];
save('woocommerce-export.csv', csv(WOO, [
  { ID: '101', Type: 'simple', SKU: 'CANDLE-01', Name: 'Soy Candle "Fig & Cedar"', Published: '1', 'Is featured?': '0', 'Visibility in catalog': 'visible', 'Short description': 'Hand poured.', Description: '<p>Burns 40 hours.</p>\\n<p>Cotton wick, 8 oz.</p>', 'Tax status': 'taxable', 'In stock?': '1', Stock: '15', 'Backorders allowed?': '0', 'Weight (lbs)': '0.75', 'Sale price': '', 'Regular price': '18', Categories: 'Home > Candles', Tags: 'candle, soy\\, natural', Images: 'https://shop.example.com/wp-content/uploads/candle-1.jpg, https://shop.example.com/wp-content/uploads/candle-2.jpg', Brands: 'Hearth Co' },
  { ID: '200', Type: 'variable', SKU: 'HOODIE', Name: 'Café Hoodie', Published: '1', 'Is featured?': '1', 'Visibility in catalog': 'visible', Description: 'Brushed fleece hoodie.', 'Tax status': 'taxable', 'In stock?': '1', Categories: 'Clothing > Hoodies', Tags: 'hoodie', Images: 'https://shop.example.com/wp-content/uploads/hoodie.jpg', 'Attribute 1 name': 'Color', 'Attribute 1 value(s)': 'Red, Blue', 'Attribute 1 visible': '1', 'Attribute 1 global': '1', 'Attribute 2 name': 'Size', 'Attribute 2 value(s)': 'S, M', 'Attribute 2 visible': '1', 'Attribute 2 global': '1', 'Attribute 1 default': 'Red', 'Attribute 2 default': 'S' },
  { ID: '201', Type: 'variation', SKU: 'HOODIE-RED-S', Name: 'Café Hoodie - Red, S', Published: '1', 'Tax status': 'taxable', 'In stock?': '1', Stock: '4', 'Backorders allowed?': '0', 'Weight (lbs)': '1.2', 'Sale price': '45.00', 'Regular price': '55.00', Parent: 'HOODIE', Position: '1', Images: 'https://shop.example.com/wp-content/uploads/hoodie-red.jpg', 'Attribute 1 name': 'Color', 'Attribute 1 value(s)': 'Red', 'Attribute 1 global': '1', 'Attribute 2 name': 'Size', 'Attribute 2 value(s)': 'S', 'Attribute 2 global': '1' },
  { ID: '202', Type: 'variation', SKU: 'HOODIE-RED-M', Name: 'Café Hoodie - Red, M', Published: '1', 'Tax status': 'taxable', 'In stock?': '0', Stock: '0', 'Backorders allowed?': 'notify', 'Weight (lbs)': '1.3', 'Regular price': '55.00', Parent: 'HOODIE', Position: '2', 'Attribute 1 name': 'Color', 'Attribute 1 value(s)': 'Red', 'Attribute 1 global': '1', 'Attribute 2 name': 'Size', 'Attribute 2 value(s)': 'M', 'Attribute 2 global': '1' },
  { ID: '203', Type: 'variation', SKU: 'HOODIE-BLU-S', Name: 'Café Hoodie - Blue, S', Published: '1', 'Tax status': 'taxable', 'In stock?': '1', Stock: '9', 'Backorders allowed?': '0', 'Weight (lbs)': '1.2', 'Regular price': '55.00', Parent: 'id:200', Position: '3', 'Attribute 1 name': 'Color', 'Attribute 1 value(s)': 'Blue', 'Attribute 1 global': '1', 'Attribute 2 name': 'Size', 'Attribute 2 value(s)': 'S', 'Attribute 2 global': '1' },
  { ID: '300', Type: 'external', SKU: 'AFF-1', Name: 'Partner Book', Published: '1', 'Regular price': '12.00', 'External URL': 'https://partner.example.com/book' },
  { ID: '400', Type: 'simple', SKU: 'CANDLE-01', Name: 'Candle Duplicate SKU', Published: '-1', 'Regular price': '1.234,50', 'Tax status': 'none' },
  { ID: '500', Type: 'variation', SKU: 'ORPHAN-1', Name: 'Orphan', Published: '1', 'Regular price': '5', Parent: 'NOPE' },
], { bom: true }));

// ---------- Squarespace: 34-column header (2026 exports), every header cell quoted
const SQ = ['Product ID [Non Editable]', 'Variant ID [Non Editable]', 'Product Type [Non Editable]', 'Product Page', 'Product URL', 'Title', 'Description', 'SKU', 'GTIN', 'MPN',
  'Option Name 1', 'Option Value 1', 'Option Name 2', 'Option Value 2', 'Option Name 3', 'Option Value 3', 'Option Name 4', 'Option Value 4', 'Option Name 5', 'Option Value 5', 'Option Name 6', 'Option Value 6',
  'Price', 'Sale Price', 'On Sale', 'Stock', 'Categories', 'Tags', 'Weight', 'Length', 'Width', 'Height', 'Visible', 'Hosted Image URLs'];
const sqImg = (n) => `https://images.squarespace-cdn.com/content/v1/000000000000000000000000/${n}/photo-${n}.jpg`;
save('squarespace-export.csv', csv(SQ, [
  { 'Product ID [Non Editable]': 'aaaaaaaaaaaaaaaaaaaaaaa1', 'Variant ID [Non Editable]': 'v1', 'Product Type [Non Editable]': 'PHYSICAL', 'Product Page': 'shop', 'Product URL': 'tote-bag', Title: 'Canvas Tote Bag', Description: '<p style="white-space:pre-wrap;">Heavy canvas, 15" x 16", with an inside pocket.</p>', SKU: 'TOTE-NAT', 'Option Name 1': 'Color', 'Option Value 1': 'Natural', Price: '30.00', 'Sale Price': '24.00', 'On Sale': 'Yes', Stock: '12', Categories: '/bags/totes', Tags: 'tote, canvas', Weight: '1.5', Length: '0.0', Width: '0.0', Height: '0.0', Visible: 'Yes', 'Hosted Image URLs': `${sqImg(1)} ${sqImg(2)}` },
  { 'Variant ID [Non Editable]': 'v2', SKU: 'TOTE-BLK', 'Option Name 1': 'Color', 'Option Value 1': 'Black', Price: '30.00', 'Sale Price': '0.00', 'On Sale': 'No', Stock: 'Unlimited', Weight: '1.5', Length: '0.0', Width: '0.0', Height: '0.0' },
  { 'Variant ID [Non Editable]': 'v3', SKU: 'TOTE-BLK', 'Option Name 1': 'Color', 'Option Value 1': 'Olive', Price: '$32.00', 'Sale Price': '0.00', 'On Sale': 'No', Stock: '0', Weight: '1.5', Length: '0.0', Width: '0.0', Height: '0.0' },
  { 'Product ID [Non Editable]': 'aaaaaaaaaaaaaaaaaaaaaaa2', 'Variant ID [Non Editable]': 'v4', 'Product Type [Non Editable]': 'SERVICE', 'Product Page': 'shop', 'Product URL': 'portrait-session', Title: 'Portrait Session', Description: 'One hour session.', SKU: 'SESSION', Price: '150.00', 'Sale Price': '0.00', 'On Sale': 'No', Stock: 'Unlimited', Weight: '0.0', Visible: 'No', 'Hosted Image URLs': sqImg(3) },
  { 'Product ID [Non Editable]': 'aaaaaaaaaaaaaaaaaaaaaaa3', 'Variant ID [Non Editable]': 'v5', 'Product Type [Non Editable]': 'PHYSICAL', 'Product Page': 'shop', 'Product URL': 'custom-sneaker', Title: 'Custom Sneaker', Description: 'Four options.', SKU: 'SNK-1', 'Option Name 1': 'Size', 'Option Value 1': '9', 'Option Name 2': 'Color', 'Option Value 2': 'Red', 'Option Name 3': 'Lace', 'Option Value 3': 'Flat', 'Option Name 4': 'Sole', 'Option Value 4': 'Gum', Price: '120.00', 'Sale Price': '0.00', 'On Sale': 'No', Stock: '2', Weight: '2.0', Visible: 'Yes', 'Hosted Image URLs': sqImg(4) },
  { 'Variant ID [Non Editable]': 'v6', SKU: 'SNK-2', 'Option Name 1': 'Size', 'Option Value 1': '10', 'Option Name 2': 'Color', 'Option Value 2': 'Red', 'Option Name 3': 'Lace', 'Option Value 3': 'Flat', 'Option Name 4': 'Sole', 'Option Value 4': 'Gum', Price: '120.00', 'Sale Price': '0.00', 'On Sale': 'No', Stock: '1', Weight: '2.0' },
], { quoteAll: true, quoteHeader: () => true }));

// ---------- Wix classic catalog: 53-column header from real catalog_products.csv, BOM
const WIX = ['handleId', 'fieldType', 'name', 'description', 'productImageUrl', 'collection', 'sku', 'ribbon', 'price', 'surcharge', 'visible', 'discountMode', 'discountValue', 'inventory', 'weight', 'cost'];
for (let n = 1; n <= 6; n++) WIX.push(`productOptionName${n}`, `productOptionType${n}`, `productOptionDescription${n}`);
for (let n = 1; n <= 6; n++) WIX.push(`additionalInfoTitle${n}`, `additionalInfoDescription${n}`);
WIX.push('customTextField1', 'customTextCharLimit1', 'customTextMandatory1', 'customTextField2', 'customTextCharLimit2', 'customTextMandatory2', 'brand');
save('wix-classic.csv', csv(WIX, [
  { handleId: 'product_11111111-aaaa-bbbb-cccc-000000000001', fieldType: 'Product', name: 'Ribbed Beanie', description: '<p>Soft acrylic, one size.</p>', productImageUrl: 'abc123_0001~mv2.jpg;abc123_0002~mv2.jpg', collection: 'Hats;All Products', sku: '', ribbon: 'New', price: '20.0', surcharge: '', visible: 'true', discountMode: 'PERCENT', discountValue: '10.0', inventory: 'InStock', weight: '0.2', cost: '', productOptionName1: 'Color', productOptionType1: 'COLOR', productOptionDescription1: '#000000:Black;rgb(255,255,255):White', productOptionName2: 'Size', productOptionType2: 'DROP_DOWN', productOptionDescription2: 'Kids;Adult', brand: 'North Knit' },
  { handleId: 'product_11111111-aaaa-bbbb-cccc-000000000001', fieldType: 'Variant', sku: 'BEA-BLK-K', visible: 'true', inventory: '5', weight: '0.2', surcharge: '', productOptionDescription1: 'Black', productOptionDescription2: 'Kids' },
  { handleId: 'product_11111111-aaaa-bbbb-cccc-000000000001', fieldType: 'Variant', sku: 'BEA-BLK-A', visible: 'true', inventory: '8', weight: '0.25', surcharge: '2.5', productOptionDescription1: 'Black', productOptionDescription2: 'Adult' },
  { handleId: 'product_11111111-aaaa-bbbb-cccc-000000000001', fieldType: 'Variant', sku: 'BEA-WHT-K', visible: 'true', inventory: '0', weight: '0.2', surcharge: '', productOptionDescription1: 'White', productOptionDescription2: 'Kids' },
  { handleId: 'product_11111111-aaaa-bbbb-cccc-000000000001', fieldType: 'Variant', sku: 'BEA-WHT-A', visible: 'true', inventory: '3', weight: '0.25', surcharge: '2.5', productOptionDescription1: 'White', productOptionDescription2: 'Adult' },
  { handleId: 'product_11111111-aaaa-bbbb-cccc-000000000002', fieldType: 'Product', name: 'Enamel Pin', description: 'Hard enamel, gold plating.', productImageUrl: 'abc123_0003~mv2.png', collection: 'Accessories', sku: 'PIN-01', price: '12.0', visible: 'false', discountMode: 'PERCENT', discountValue: '0.0', inventory: '40', weight: '0.05', cost: '3.0', additionalInfoTitle1: 'Care', additionalInfoDescription1: '<p>Wipe clean.</p>' },
], { bom: true }));

// ---------- Wix new catalog (V3): columns observed in real exports (subset in real order)
const WIX3 = ['handle', 'fieldType', 'name', 'visible', 'plainDescription', 'categorySlugs', 'primaryCategorySlug', 'media', 'mediaAltText', 'ribbon', 'brand', 'price', 'strikethroughPrice', 'cost', 'inventory', 'preOrderEnabled', 'preOrderMessage', 'preOrderLimit', 'sku', 'barcode', 'weight', 'baseUnit', 'baseUnitMeasurement', 'totalUnits', 'totalUnitsMeasurement'];
for (let n = 1; n <= 6; n++) WIX3.push(`productOptionName${n}`, `productOptionType${n}`, `productOptionChoices${n}`);
for (let n = 1; n <= 10; n++) WIX3.push(`modifierName${n}`, `modifierType${n}`, `modifierCharLimit${n}`, `modifierMandatory${n}`, `modifierDescription${n}`);
save('wix-v3.csv', csv(WIX3, [
  { handle: 'linen-napkins', fieldType: 'PRODUCT', name: 'Linen Napkins (Set of 4)', visible: 'TRUE', plainDescription: '<p>Stonewashed linen, 45 x 45 cm.</p>', categorySlugs: 'kitchen;table-linen', brand: 'Loom', inventory: 'IN_STOCK', productOptionName1: 'Color', productOptionType1: 'SWATCH_CHOICES', productOptionChoices1: '#808080:Grey;#FFFFFF:White' },
  { handle: 'linen-napkins', fieldType: 'VARIANT', price: '32.00', strikethroughPrice: '40.00', inventory: '6', sku: 'NAP-GRY', weight: '0.4', productOptionName1: 'Color', productOptionType1: 'SWATCH_CHOICES', productOptionChoices1: 'Grey' },
  { handle: 'linen-napkins', fieldType: 'VARIANT', price: '32.00', inventory: 'OUT_OF_STOCK', sku: 'NAP-WHT', weight: '0.4', productOptionName1: 'Color', productOptionType1: 'SWATCH_CHOICES', productOptionChoices1: 'White' },
  { handle: 'linen-napkins', fieldType: 'MEDIA', media: 'fc80e7_0001~mv2.jpg', mediaAltText: 'Grey napkins' },
  { handle: 'linen-napkins', fieldType: 'MEDIA', media: 'fc80e7_0002~mv2.jpg' },
  { handle: 'tea-towel', fieldType: 'PRODUCT', name: 'Tea Towel', visible: 'false', plainDescription: 'Cotton tea towel.', price: '14.00', inventory: '20', sku: 'TOWEL-1', weight: '0.1', modifierName1: 'Monogram', modifierType1: 'TEXT' },
], { bom: true }));

// ---------- Shopify file with problems, for the validator
const BAD = ['Title', 'URL handle', 'Description', 'Status', 'SKU', 'Option1 name', 'Option1 value', 'Price', 'Compare-at price', 'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock', 'Weight value (grams)', 'Weight unit for display', 'Fulfillment service', 'Product image URL', 'Image position', 'tags'];
save('shopify-bad.csv', csv(BAD, [
  { Title: 'Good Mug', 'URL handle': 'good-mug', Status: 'active', SKU: 'M1', 'Option1 name': 'Title', 'Option1 value': 'Default Title', Price: '10.00', 'Inventory tracker': 'shopify', 'Inventory quantity': '3', 'Continue selling when out of stock': 'deny', 'Fulfillment service': 'manual', 'Product image URL': 'https://cdn.example.com/mug.jpg', 'Image position': '1' },
  { Title: 'Bad Tee', 'URL handle': 'bad tee', Status: 'live', SKU: 'M1', 'Option1 name': 'Size', 'Option1 value': 'S', Price: '$1,299.00', 'Compare-at price': '12,50', 'Inventory tracker': 'shopify', 'Inventory quantity': '', 'Continue selling when out of stock': 'sometimes', 'Weight value (grams)': '2 lb', 'Weight unit for display': 'pounds', 'Fulfillment service': 'manual', 'Product image URL': 'images/tee.jpg' },
  { 'URL handle': 'bad tee', 'Option1 value': 'S', Price: '', 'Inventory tracker': 'shopify', 'Inventory quantity': 'ten', 'Continue selling when out of stock': 'deny', 'Fulfillment service': '' },
  { 'URL handle': 'good-mug', Title: 'Good Mug', 'Option1 value': 'Default Title', Price: '10.00', 'Fulfillment service': 'manual' },
  { 'URL handle': 'no-title', 'Option1 value': 'Default Title', Price: '5.00', 'Fulfillment service': 'manual' },
  { Title: 'Status Blank', 'URL handle': 'status-blank', Status: '', 'Option1 name': 'Title', 'Option1 value': 'Default Title', Price: '5.00', 'Fulfillment service': 'manual', 'Product image URL': 'http://cdn.example.com/x.jpg' },
]));
console.log('fixtures written');
