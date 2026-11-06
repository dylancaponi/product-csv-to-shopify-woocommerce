// Every documented rule the engine enforces, with the primary source it comes
// from. `verified: false` means the rule is our best reading but was not
// stated outright by a primary source; see research/*.md for the notes.
const SH_CSV = 'https://help.shopify.com/en/manual/products/import-export/using-csv';
const SH_IMPORT = 'https://help.shopify.com/en/manual/products/import-export/import-products';
const SH_ERRORS = 'https://help.shopify.com/en/manual/products/import-export/common-import-issues';
const SH_VARIANTS = 'https://help.shopify.com/en/manual/products/variants/add-variants';
const SH_TEMPLATE = 'https://help.shopify.com/csv/product_template.csv';
const ETSY_HELP = 'https://help.etsy.com/hc/en-gb/articles/360000343508-How-to-Download-Your-Listing-Information';
const ETSY_SAMPLE = 'https://raw.githubusercontent.com/FurkanYo/zuzumood/HEAD/products/EtsyListingsDownload.csv';

export const RULES = {
  // Shopify
  'shopify.title-required': { source: SH_CSV, verified: true, text: 'When you create a product CSV file to import new products, the only required column is Title.' },
  'shopify.no-product-data': { source: SH_ERRORS, verified: true, text: 'Shopify skips a product whose first row has a handle but no title: "Ignored line #-## because it did not contain product data".' },
  'shopify.handle-chars': { source: SH_CSV, verified: true, text: "A valid URL handle can contain letters, dashes, and numbers, but it can't contain any spaces." },
  'shopify.handle-unique': { source: SH_ERRORS, verified: true, text: 'Each product needs its own handle, with all its rows together: "Ignored line #-## because handle `example` already exists".' },
  'shopify.headers': { source: SH_IMPORT, verified: true, text: 'Column header names are case-sensitive and must match the sample file; the import fails if there are any missing headers ("Invalid CSV header: missing headers").' },
  'shopify.utf8': { source: SH_IMPORT, verified: true, text: 'UTF-8 encoding is required.' },
  'shopify.file-size': { source: SH_IMPORT, verified: true, text: "Your product CSV can't exceed 15 MB." },
  'shopify.options-max': { source: SH_VARIANTS, verified: true, text: 'Each product can have up to three options.' },
  'shopify.variants-max': { source: SH_VARIANTS, verified: false, text: 'You can create up to 2,048 variants for a product. (The help page does not say whether the CSV importer has a lower cap.)' },
  'shopify.options-unique': { source: SH_ERRORS, verified: true, text: 'Two variants of one product cannot have the same option values: "Validation failed: options are not unique".' },
  'shopify.option-name-needed': { source: SH_CSV, verified: false, text: 'Option names go on the first row of a product; a variant with an option value needs a matching option name.' },
  'shopify.default-title': { source: SH_CSV, verified: false, text: 'A product without options uses Option1 value "Default Title" (Option1 name "Title" by long-standing convention).' },
  'shopify.price-required': { source: SH_ERRORS, verified: true, text: 'A variant row needs a price: "Validation failed: price can\'t be blank".' },
  'shopify.price-format': { source: SH_TEMPLATE, verified: false, text: 'Prices are plain numbers such as 19.99, with no currency symbol or thousands separator, as in Shopify\'s template.' },
  'shopify.status-values': { source: SH_CSV, verified: true, text: 'Status must be active, draft or archived. If the Status column is present, then it needs a value.' },
  'shopify.boolean-values': { source: SH_CSV, verified: true, text: 'Published on online store, Charge tax, Requires shipping and Gift card take true or false.' },
  'shopify.inventory-policy': { source: SH_ERRORS, verified: true, text: 'Continue selling when out of stock must be deny or continue: "Inventory policy is not included in the list".' },
  'shopify.inventory-qty': { source: SH_ERRORS, verified: true, text: 'When inventory is tracked, Inventory quantity must be a whole number: "Inventory quantity can\'t be blank" / "Inventory quantity is not a number".' },
  'shopify.inventory-tracker': { source: SH_CSV, verified: true, text: 'Inventory tracker is shopify, shipwire, amazon_marketplace_web, or blank (not tracked).' },
  'shopify.weight-unit': { source: SH_CSV, verified: true, text: 'Weight unit for display is g, kg, lb or oz. Weight value is in grams.' },
  'shopify.fulfillment': { source: SH_ERRORS, verified: true, text: '"Fulfillment service can\'t be blank". Use manual unless you use a fulfillment app.' },
  'shopify.image-url': { source: SH_ERRORS, verified: true, text: 'Image URLs must be public, direct links that include the protocol (https://), or the import fails with "Validation failed: getaddrinfo..." or "An error occurred while trying to download the image".' },
  'shopify.images-max': { source: SH_CSV, verified: true, text: 'You can add up to 250 images to a product.' },
  'shopify.tags-max': { source: SH_CSV, verified: true, text: 'Add a maximum of 250 tags to each product.' },
  'shopify.seo-title-max': { source: SH_CSV, verified: true, text: 'SEO title: maximum 70 characters.' },
  'shopify.seo-description-max': { source: SH_CSV, verified: true, text: 'SEO description: maximum 320 characters.' },
  'shopify.alt-max': { source: SH_CSV, verified: true, text: 'Image alt text: maximum 512 characters.' },
  'shopify.title-length': { source: 'third-party only (Matrixify, Ablestar)', verified: false, text: 'Titles and handles longer than 255 characters are reported to fail.' },
  'shopify.packed-dimensions': { source: SH_CSV, verified: true, text: 'Packed product length, width, height and dimension unit go together: a file with values in only some of them results in an import error.' },
  'shopify.quoting': { source: SH_ERRORS, verified: true, text: 'Smart quotes or a stray double quote break the file: "Illegal quoting on line" / "Missing or stray quote on line".' },
  'shopify.barcode-columns': { source: SH_CSV, verified: true, text: "Your CSV file can't have both the Barcode column and the Barcodes column." },
  // WooCommerce (core importer, tag 11.2.2)
  'woo.sku-unique': { source: 'https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/abstracts/abstract-wc-product.php', verified: true, text: 'Each SKU can be used once: "Invalid or duplicated SKU."' },
  'woo.variation-parent': { source: 'https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/abstract-wc-product-importer.php', verified: true, text: 'A variation row needs a Parent (parent SKU or id:N) that is a variable product: "Variation cannot be imported: Missing parent ID or parent does not exist yet."' },
  'woo.type-values': { source: 'https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/abstract-wc-product-importer.php', verified: true, text: 'Type must be simple, variable, variation, grouped or external (optionally with virtual or downloadable): "Invalid product type."' },
  // Etsy
  'etsy.header': { source: ETSY_SAMPLE, verified: true, text: 'Etsy listings download columns: TITLE, DESCRIPTION, PRICE, CURRENCY_CODE, QUANTITY, TAGS, MATERIALS, IMAGE1 to IMAGE10, VARIATION 1/2 TYPE, NAME, VALUES, SKU.' },
  'etsy.variations': { source: ETSY_HELP, verified: true, text: 'The listing CSV includes Title, Description, Price, Currency code, Quantity, Tags, Materials, Image URLs and SKU per listing. It has no price, quantity or SKU per variation.' },
};
