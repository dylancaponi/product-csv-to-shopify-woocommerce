# Shopify product CSV import: rules (researched 2026-11-04)

Rules: primary sources only (help.shopify.com, shopify.dev, official template). Anything else is tagged UNVERIFIED.

## 1. Official template (downloaded 2026-11-04)

Source: https://help.shopify.com/csv/product_template.csv
(redirects to https://help.shopify.com/cdn/shopifycloud/product-knowledge/production/csv/product_template.csv, HTTP 200)

File facts (measured locally): no UTF-8 BOM (starts `54 69 74` = "Tit"), CRLF line endings (17 lines, 17 CR), standard RFC4180 quoting (fields with commas quoted with `"`), contains non-ASCII curly quotes in a Title so it is UTF-8. 61 columns.

Exact header row, in order:

```
Title,URL handle,Description,Vendor,Product category,Type,Tags,Published on online store,Status,SKU,Variant Barcodes,Option1 name,Option1 value,Option1 Linked To,Option2 name,Option2 value,Option2 Linked To,Option3 name,Option3 value,Option3 Linked To,Price,Compare-at price,Cost per item,Charge tax,Tax code,Unit price total measure,Unit price total measure unit,Unit price base measure,Unit price base measure unit,Inventory tracker,Inventory quantity,Continue selling when out of stock,Weight value (grams),Weight unit for display,Requires shipping,Fulfillment service,Product image URL,Image position,Image alt text,Variant image URL,Gift card,SEO title,SEO description,Color (product.metafields.shopify.color-pattern),Google Shopping / Google product category,Google Shopping / Gender,Google Shopping / Age group,Google Shopping / Manufacturer part number (MPN),Google Shopping / Ad group name,Google Shopping / Ads labels,Google Shopping / Condition,Google Shopping / Custom product,Google Shopping / Custom label 0,Google Shopping / Custom label 1,Google Shopping / Custom label 2,Google Shopping / Custom label 3,Google Shopping / Custom label 4,Packed product length,Packed product width,Packed product height,Packed product dimension unit
```

Notes from the template data rows:
- The barcode column is "Variant Barcodes" (not "Barcode"), and values can be typed lists: `ean:4006381333931; upc:036000291452` or a bare number `5784397766`.
- "Option2 Linked To" = `product.metafields.shopify.color-pattern` on first row only (option linked to a category metafield); the "Color (product.metafields.shopify.color-pattern)" column then holds `green; gray; red`.
- First row of a product carries Title, Description, Vendor, Product category, Type, Tags, Published, Status, Option names, images, Gift card, SEO. Following rows carry only URL handle + variant fields (SKU, Option values, Price, inventory, weight, shipping...).
- Option names appear only on the first row; subsequent rows give only option values.
- Status values in sample: `Active` and `active` (case-insensitive in practice). Published: `TRUE`/`FALSE`. Continue selling: `DENY`/`CONTINUE`. Inventory tracker: `shopify` or blank (digital product leaves it blank). Fulfillment service: `manual`. Weight unit: `g`. Booleans: `TRUE`/`FALSE`.
- Product category uses the full Shopify taxonomy path: `Apparel & Accessories > Clothing > Clothing Tops > T-Shirts`.
- Tags: comma-separated inside a quoted field: `"Unisex, Clothing, Men, Women, Casual, Vintage"`.
- Sample has no image-only extra rows (each product has a single image).

## 2. Help page: Using CSV files to import and export products

Source: https://help.shopify.com/en/manual/products/import-export/using-csv
(curl gets a 403 bot challenge "Verifying your connection..."; content read through WebFetch, so quotes are as WebFetch returned them.)

Required columns and row structure:
- "When you create a product CSV file to import new products, the only required column is Title."
- URL handle: "A valid URL handle can contain letters, dashes, and numbers, but it can't contain any spaces." Needed to update and to attach variant/image rows to a product; defaults from Title.
- Status: "If this column is present, then it needs a value." Values `active` (default), `draft`, `archived`. (No "unlisted" mentioned; UNVERIFIED whether accepted.)
- Variants: "In the following rows, enter the URL handle." / "Then skip the Title, Description, Vendor, and Tags columns."
- Images: "In the following rows, only enter the handle and the URL for each additional image." / "You must use only one row per image." / "You can add up to 250 images to a product."
- Options: up to 3. "If a product has only one option, then this value should be Default Title." (i.e. Option1 name `Title`, Option1 value `Default Title`, per legacy convention; the exact Option1 name value is UNVERIFIED from this page.) Omitting Option1 name/value creates a default variant and deletes existing variants.
- Changing Option1-3 values "deletes existing variant IDs, and creates new variant IDs".

Allowed values (as listed on the page):
- Published on online store: `true` (default) / `false`. Charge tax: `true` (default) / `false`. Requires shipping: `true` (default) / `false`. Gift card: `false` (default) / `true`, but "you can't create a gift card by importing a product CSV file."
- Inventory tracker: `shopify`, `shipwire`, `amazon_marketplace_web`, or blank (= not tracked).
- Inventory quantity: "This applies only to Shopify stores that have a single location." Default 0.
- Continue selling when out of stock: `deny` (default) / `continue`. (Template uses uppercase DENY/CONTINUE, so case-insensitive.)
- Weight value (grams): numeric grams, default 0. Weight unit for display: `g`, `kg` (default), `lb`, `oz`.
- Fulfillment service: `manual` (default), `shipwire`, `webgistix`, `amazon_marketplace_web`, or a custom service handle.
- Packed product length/width/height + Packed product dimension unit (`cm` or `in`): "A file with values in only some of them results in an import error, and the affected product isn't imported."
- Price: "The default value is 0.00 if no value is entered."
- Product category: Shopify Standard Product Taxonomy breadcrumb or category ID.
- Barcodes: up to 20, semicolon-separated, optional type prefixes. "Your CSV file can't have both the Barcode column and the Barcodes column."
- Metafield columns: `product.metafields.namespace.key`; variant metafields not supported.
- Market columns: "Price / International", "Compare-at price / International", "Included / [Primary]", "Included / International".
- Collection column (optional, anywhere): "The Collection column is the only column that you can add to the CSV file that doesn't break the format." One collection per product, max 255 chars, not exported.

Length limits on the page: Tags max 250 per product ("Add a maximum of 250 tags to each product"); SEO title 70 chars; SEO description 320 chars; Image alt text 512 chars; Collection 255. No limit given for Title, handle, or option values.

Encoding: "save your CSV file in UTF-8 format using LF-style linefeeds." First line must be headers; comma separated. (Note: the official template itself uses CRLF, so the importer evidently accepts CRLF too.)

Legacy names: "Shopify maintains backward compatibility with older column names". The only old name explicitly mentioned is singular "Barcode", which "is updated to Barcodes on the next export."

Header-string discrepancies between page and template (UNVERIFIED which the importer prefers; backward compat suggests both work):
- Page: "Barcodes"; template: "Variant Barcodes".
- Page: "Option1 LinkedTo"; template: "Option1 Linked To".
- "Tax code" and the four "Unit price ..." columns are in the template but not described on the page.

## 3. Importing products page

Source: https://help.shopify.com/en/manual/products/import-export/import-products
- "Your product CSV can't exceed 15 MB."
- "UTF-8 encoding is required to prevent unexpected characters from appearing in your content."
- "If the overwrite option isn't selected, then the products that match an existing handle are ignored during CSV import." With overwrite, file values replace existing ones "when the handle in the import CSV file matches an existing handle in your products list."
- "Column header names are case-sensitive" (headers should match the sample file).
- Error headings documented: "Illegal quoting error"; "Line is invalid (No details)" (option conflict); "Network error: Unexpected token < in JSON at position 0" (mismatched column headers). Import fails "if there are any missing headers."
- Sorting rows in a spreadsheet can break image links and "your product's images will be lost."

## 4. Variant/option limits

Source: https://help.shopify.com/en/manual/products/variants/add-variants
- "You can create up to 2,048 variants for a product."
- "Each product can have up to three options."
- Daily rate limit "for uploading variants by using an app or CSV file import" applies to stores with 500,000+ variants: "You can add up to 10,000 new variants in a day before the limit is reached." Not on Plus.
- No help page says the CSV importer is capped lower than 2,048, so assume 2,048 applies to CSV (UNVERIFIED: not explicitly stated for CSV).
- Option value length, title length (255), handle length (255): UNVERIFIED (only third-party sources such as Matrixify / Ablestar say 255). shopify.dev Storefront ProductOption reportedly says option names are limited to 255 chars (from search snippet, page not fetched: UNVERIFIED).

## 5. Common import errors (exact strings)

Source: https://help.shopify.com/en/manual/products/import-export/common-import-issues
- "Daily variant creation limit reached, try again" (500k+ variant stores, 10,000/24h)
- "Fulfillment service can't be blank" (use `manual`)
- "Ignored line #-## because handle `example` already exists" (each product needs a unique handle; i.e. a handle reused non-contiguously / for a different product)
- "Ignored line #-## because it did not contain product data" (handle but no title)
- "Illegal quoting on line" (illegal character, file must be UTF-8; or missing/stray quote)
- "Incorrect header check" (image problem; remove the image from that line)
- "Invalid CSV header: missing headers" (first line must match; check "extra white spaces at the end of the first line")
- "Inventory policy is not included in the list" (must be deny/continue)
- "Inventory quantity can't be blank"
- "Inventory quantity is not a number"
- "Missing or stray quote on line" (smart quotes or extra quote)
- "Not a valid product category" (must exactly match taxonomy breadcrumb or ID)
- "Validation failed: An error occurred while trying to download the image"
- "Validation failed: getaddrinfo: nodename nor servname provided, or not known" (bad image URL; must be public direct link with protocol)
- "Validation failed: options are not unique" (duplicate option value combos within a handle, incl. the same handle appearing elsewhere in the file with matching options)
- "Validation failed: price can't be blank"
- "Validation failed: The uploaded image exceeds the 20 megapixel limit" (page body also mentions 5000 x 5000 px / 25 MP; inconsistent)
- "Validation failed: Value must be a valid product reference" (metafield product reference)
- Wrong headers trigger a "Choose column headings" mapping window in the admin.

Legacy header row shown verbatim on this page (old format, still documented):
```
Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text
```
Note: this page still says "Variant Inventory Tracker" in the "Inventory quantity can't be blank" fix, showing old names remain in the docs.

## 6. Export format

Source: https://help.shopify.com/en/manual/products/import-export/export-products
- Two options: "CSV file for Excel, Numbers, or another spreadsheet program" and "Plain CSV file". "A CSV file with UTF-8 encoding is the only file format that can be used to import to or export from Shopify."
- "The Inventory tracker column shows shopify when inventory tracking is enabled, and is blank when it isn't." (new column name used for exports)
- "If any single product has more than 100 variants, then the CSV file is emailed to you." (current page / selected exports)
- Whether the export header equals the template exactly: UNVERIFIED. Evidence it uses the new names: using-csv says Barcode "is updated to Barcodes on the next export" and export page uses "Inventory tracker". Whether the Excel option adds a BOM: UNVERIFIED. Parser should strip a BOM, accept CRLF/LF, and accept both new and legacy names, plus unknown extra columns (metafields, market columns "Price / <Market>", "Included / <Market>", "Variant Image" legacy etc.).
- Older exports (pre-2024) used the legacy names (Handle, Body (HTML), Variant Price, Image Src, Image Position, Variant Image, Variant Weight Unit, Gift Card, SEO Title, SEO Description, Status, Cost per item, Variant Tax Code). This list beyond the 26 columns quoted above is from memory of the old template: UNVERIFIED.

## Summary for the engine

Header row to emit (new names, exact order of the official template, https://help.shopify.com/csv/product_template.csv):
Title, URL handle, Description, Vendor, Product category, Type, Tags, Published on online store, Status, SKU, Variant Barcodes, Option1 name, Option1 value, Option1 Linked To, Option2 name, Option2 value, Option2 Linked To, Option3 name, Option3 value, Option3 Linked To, Price, Compare-at price, Cost per item, Charge tax, Tax code, Unit price total measure, Unit price total measure unit, Unit price base measure, Unit price base measure unit, Inventory tracker, Inventory quantity, Continue selling when out of stock, Weight value (grams), Weight unit for display, Requires shipping, Fulfillment service, Product image URL, Image position, Image alt text, Variant image URL, Gift card, SEO title, SEO description, Color (product.metafields.shopify.color-pattern), Google Shopping / Google product category, Google Shopping / Gender, Google Shopping / Age group, Google Shopping / Manufacturer part number (MPN), Google Shopping / Ad group name, Google Shopping / Ads labels, Google Shopping / Condition, Google Shopping / Custom product, Google Shopping / Custom label 0..4, Packed product length, Packed product width, Packed product height, Packed product dimension unit.
Recommendation: emit the template header verbatim (it is Shopify's own file, so guaranteed to import); headers are case-sensitive (import-products page).

Legacy -> new mapping for PARSING (old names from the legacy row at https://help.shopify.com/en/manual/products/import-export/common-import-issues; pairing is my inference from column meaning; backward compat stated at https://help.shopify.com/en/manual/products/import-export/using-csv):
- Handle -> URL handle; Title -> Title; Body (HTML) -> Description; Vendor -> Vendor; Type -> Type; Tags -> Tags; Published -> Published on online store
- Option1 Name/Value -> Option1 name/value (same for 2, 3); Option1 LinkedTo / Option1 Linked To -> Option1 Linked To
- Variant SKU -> SKU; Variant Grams -> Weight value (grams); Variant Inventory Tracker -> Inventory tracker; Variant Inventory Qty -> Inventory quantity; Variant Inventory Policy -> Continue selling when out of stock; Variant Fulfillment Service -> Fulfillment service; Variant Price -> Price; Variant Compare-at Price / Variant Compare At Price -> Compare-at price; Variant Requires Shipping -> Requires shipping; Variant Taxable -> Charge tax; Variant Barcode / Barcode / Barcodes -> Variant Barcodes; Image Src -> Product image URL; Image Alt Text -> Image alt text
- UNVERIFIED legacy names (not in the quoted row): Image Position -> Image position; Variant Image -> Variant image URL; Variant Weight Unit -> Weight unit for display; Gift Card -> Gift card; SEO Title -> SEO title; SEO Description -> SEO description; Cost per item -> Cost per item; Variant Tax Code -> Tax code; Status -> Status; Product Category -> Product category.
- Parser: match headers case-insensitively and trim whitespace (Shopify itself is case-sensitive, so the emitter must not be).

Required: Title is the only required column for new products (using-csv). URL handle needed to group variant/image rows (using-csv). If Status column present, every product row needs a value (using-csv). Price blank on a variant row -> "Validation failed: price can't be blank" (common-import-issues), even though using-csv says default 0.00; emit a price always.

Row model (using-csv): first row per handle = all product fields + first variant + first image. Following rows = URL handle + variant fields (leave Title, Description, Vendor, Tags blank). Extra image rows = URL handle + Product image URL (+ Image position, Image alt text) only. One row per image. Option names on first row only. Single-variant product: Option1 value "Default Title" (Option1 name "Title" by convention, UNVERIFIED). Keep all rows of a handle contiguous and never reuse a handle for a different product ("Ignored line ... because handle ... already exists").

Limits:
- 15 MB per file: https://help.shopify.com/en/manual/products/import-export/import-products (split larger catalogs, keep a handle's rows in one file)
- 3 options, 2,048 variants per product: https://help.shopify.com/en/manual/products/variants/add-variants (CSV applicability of 2,048 UNVERIFIED but not contradicted)
- 10,000 new variants/day for stores with 500k+ variants (non-Plus): same page
- 250 images per product; 250 tags; SEO title 70; SEO description 320; alt text 512; Collection 255: https://help.shopify.com/en/manual/products/import-export/using-csv
- Image max 20 MP (or 25 MP / 5000x5000, page inconsistent): https://help.shopify.com/en/manual/products/import-export/common-import-issues
- Title 255, handle 255, option value length: UNVERIFIED (third-party only). Engine: warn above 255.
- Handle chars: letters, dashes, numbers, no spaces (using-csv). Engine: lowercase, replace non [a-z0-9] runs with "-", trim dashes.

Allowed values (using-csv; casing per template):
- Status: active | draft | archived (template writes "Active"; case-insensitive in practice). "unlisted": UNVERIFIED, do not emit.
- Booleans (Published on online store, Charge tax, Requires shipping, Gift card): TRUE / FALSE (template uses uppercase).
- Continue selling when out of stock: DENY | CONTINUE (template uppercase; page lowercase). Else "Inventory policy is not included in the list".
- Inventory tracker: shopify | shipwire | amazon_marketplace_web | blank. If tracker set, Inventory quantity must be numeric and non-blank.
- Weight value (grams): number in grams; Weight unit for display: g | kg | lb | oz.
- Fulfillment service: manual (default) or a service handle; never blank ("Fulfillment service can't be blank").
- Packed dimensions: all four or none; unit cm | in.
- Product category: exact taxonomy breadcrumb or ID, else "Not a valid product category"; safest to leave blank when unknown.
- Barcodes: up to 20, "; " separated, optional "ean:"/"upc:" prefixes. Never emit both Barcode and Barcodes columns.
- Image URLs: public, direct, https.

Encoding (using-csv, import-products): UTF-8 required; page says LF line endings, official template uses CRLF and no BOM. Emit UTF-8 without BOM, LF or CRLF, RFC4180 quoting with straight double quotes, quote any field containing comma, quote, or newline; convert smart quotes only in structural positions (never needed if the writer quotes correctly). No trailing whitespace after the header line.

Error rules to pre-validate (exact strings, https://help.shopify.com/en/manual/products/import-export/common-import-issues): duplicate option combos within a handle -> "Validation failed: options are not unique"; non-contiguous/duplicate handle -> "Ignored line #-## because handle `example` already exists"; handle row with no title on the first row -> "Ignored line #-## because it did not contain product data"; bad header -> "Invalid CSV header: missing headers"; bad quoting -> "Illegal quoting on line" / "Missing or stray quote on line"; blank price -> "Validation failed: price can't be blank"; bad inventory policy -> "Inventory policy is not included in the list"; blank/non-numeric quantity -> "Inventory quantity can't be blank" / "Inventory quantity is not a number"; blank fulfillment -> "Fulfillment service can't be blank"; bad category -> "Not a valid product category"; bad image URL -> "Validation failed: getaddrinfo: nodename nor servname provided, or not known" / "Validation failed: An error occurred while trying to download the image".
