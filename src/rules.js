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

const WC = 'https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/';
const WC_IMP = WC + 'includes/import/class-wc-product-csv-importer.php';
const WC_ABS = WC + 'includes/import/abstract-wc-product-importer.php';
const WC_CTRL = WC + 'includes/admin/importers/class-wc-product-csv-importer-controller.php';
const WC_PRODUCT = WC + 'includes/abstracts/abstract-wc-product.php';
const WC_FORMAT = WC + 'includes/wc-formatting-functions.php';
const WC_DOCS = 'https://woocommerce.com/document/product-csv-importer-exporter/';

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
  'woo.sku-skip': { source: WC_IMP, verified: true, text: 'In a new-products import, a row whose SKU already exists is skipped: "A product with this SKU already exists." With Update existing products ticked, it updates that product instead (class-wc-product-csv-importer.php import(), lines 1431-1497). The SKU lookup is an SQL = comparison, which ignores letter case under the default WordPress collation.' },
  'woo.variation-parent': { source: 'https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/abstract-wc-product-importer.php', verified: true, text: 'A variation row needs a Parent (parent SKU or id:N) that is a variable product: "Variation cannot be imported: Missing parent ID or parent does not exist yet."' },
  'woo.type-values': { source: 'https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/abstract-wc-product-importer.php', verified: true, text: 'Type must be a registered product type (core: simple, variable, variation, grouped, external; plugins can add more), optionally with virtual or downloadable: "Invalid product type." Only the first other part is used (class-wc-product-csv-importer.php expand_data).' },
  'woo.file-type': { source: 'https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-admin/includes/file.php', verified: true, text: 'The importer accepts .csv and .txt files only. A normal upload of another file type is refused by WordPress: "Sorry, you are not allowed to upload this file type." (file.php line 969, mimes set in CSVUploadHelper.php). A server file path is refused by WooCommerce: "Invalid file type. The importer supports CSV and TXT file formats." (controller line 146).' },
  'woo.empty-or-encoding': { source: WC_CTRL, verified: true, text: 'When the file has no first data row, the mapping screen shows "The file is empty or using a different encoding than UTF-8, please try again with a new file."' },
  'woo.encoding': { source: WC_IMP, verified: true, text: 'The importer reads UTF-8 unless another character encoding is chosen under "Show advanced options".' },
  'woo.upload-size': { source: WC_DOCS, verified: true, text: 'The Maximum size value shown on the upload screen is set at the server level (PHP upload_max_filesize and post_max_size). WordPress reports "The uploaded file exceeds the upload_max_filesize directive in php.ini."' },
  'woo.quoting': { source: WC_IMP, verified: true, text: 'Rows are read with fgetcsv using double quotes and no escape character (RFC 4180). Cells are matched to columns by position.' },
  'woo.delimiter': { source: WC_CTRL, verified: true, text: 'The delimiter is a comma unless "CSV Delimiter" is changed under "Show advanced options".' },
  'woo.column-mapping': { source: WC_CTRL, verified: true, text: 'Columns are matched automatically only when the header equals a WooCommerce column label (case-insensitive) or an internal field key; others show "Do not import". Weight and dimension labels carry the store unit, e.g. "Weight (lbs)".' },
  'woo.gtin-mapping': { source: WC_CTRL, verified: true, text: 'In WooCommerce 11.2.2 the "GTIN, UPC, EAN, or ISBN" label is not in the automatic column list, so it must be mapped by hand.' },
  'woo.id-unique': { source: WC_IMP, verified: true, text: 'In a new-products import, a row whose ID was already imported in the same file is skipped: "A product with this ID already exists." IDs are compared as numbers (absint). With Update existing products ticked, the row updates the product instead, or is skipped with "No matching product exists to update." (import(), lines 1431-1497).' },
  'woo.variation-placeholder': { source: WC_CTRL, verified: true, text: 'A Parent SKU or id:N that matches no product creates a placeholder "Import placeholder for ..." (status importing; class-wc-product-csv-importer.php lines 288-322). In 11.2.2 the controller deletes every product still in status importing when the import finishes (cleanup_after_import, lines 345-390), along with variations attached to it.' },
  'woo.variation-parent-variable': { source: WC_DOCS, verified: false, text: 'A variation needs a variable parent product. WooCommerce 11.2.2 checks this only when adding variations in an update import; for a new import of a non-variable parent the result was not confirmed.' },
  'woo.variation-attributes': { source: WC_ABS, verified: true, text: 'A variation attribute that the parent product does not have is dropped (set_variation_data skips it), so the variation matches any value.' },
  'woo.variation-values': { source: WC_ABS, verified: false, text: 'A variation keeps only the first value of each attribute (current()). A value that is not one of the parent\'s options is stored as written; that shoppers then cannot select it is our reading, not confirmed in a store.' },
  'woo.visibility-values': { source: WC_PRODUCT, verified: true, text: 'Visibility in catalog must be visible, catalog, search or hidden: "Invalid catalog visibility option."' },
  'woo.tax-status-values': { source: WC_PRODUCT, verified: true, text: 'Tax status must be taxable, shipping or none (the importer also turns true/false into taxable/none): "Invalid product tax status."' },
  'woo.published-values': { source: WC_IMP, verified: true, text: 'Published: 1 published, 0 private, -1 draft, 2 pending; true/false also work. Other text goes through floatval, so a word becomes 0 (private).' },
  'woo.stock-status-values': { source: WC_IMP, verified: true, text: 'In stock?: 1 in stock, 0 out of stock, backorder on backorder; any other non-empty text is truthy (in stock) and a blank cell is falsy (out of stock).' },
  'woo.stock-values': { source: WC_IMP, verified: true, text: 'Stock goes through wc_stock_amount (intval); a non-blank value turns on stock management.' },
  'woo.backorders-values': { source: WC_IMP, verified: true, text: 'Backorders allowed?: 1 yes, 0 no, notify; anything else is no.' },
  'woo.price-format': { source: WC_FORMAT, verified: true, text: 'Prices go through wc_format_decimal: the store decimal separator becomes a dot, then everything except digits, the last dot and minus is removed.' },
  'woo.image-values': { source: WC_ABS, verified: true, text: 'An image value without :// is looked up by file name in the Media Library and never downloaded; if not found: "Unable to use image".' },
  'woo.empty-upload': { source: 'https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-admin/includes/file.php', verified: true, text: 'WordPress refuses an empty upload: "File is empty. Please upload something more substantial." (file.php lines 938-951; same text in CSVUploadHelper.php line 75).' },
  'woo.header-duplicate': { source: WC_IMP, verified: true, text: 'The posted mapping is array_combine() on the header names (line 83) and set_parsed_data writes each mapped key once per column (lines 1166-1186), so for a repeated header the last column wins.' },
  'woo.variation-order': { source: WC_ABS, verified: false, text: 'A variation parsed before its parent row gets a placeholder parent with no attributes (class-wc-product-csv-importer.php parse_relative_field); set_variation_data then drops every attribute (abstract-wc-product-importer.php lines 575-586). Code reading, not tested in a store.' },
  'woo.formula-escape': { source: WC_ABS, verified: true, text: 'The importer removes a leading apostrophe before = + - @ only in fields parsed with unescape_data (not name, descriptions, categories or images).' },
  // Etsy
  'etsy.header': { source: ETSY_SAMPLE, verified: true, text: 'Etsy listings download columns: TITLE, DESCRIPTION, PRICE, CURRENCY_CODE, QUANTITY, TAGS, MATERIALS, IMAGE1 to IMAGE10, VARIATION 1/2 TYPE, NAME, VALUES, SKU.' },
  'etsy.variations': { source: ETSY_HELP, verified: true, text: 'The listing CSV includes Title, Description, Price, Currency code, Quantity, Tags, Materials, Image URLs and SKU per listing. It has no price, quantity or SKU per variation.' },
};
