# product-csv-to-shopify-woocommerce

Convert product CSV exports from Etsy, Wix, Squarespace, WooCommerce, Shopify and BigCommerce into a file the Shopify or WooCommerce product importer accepts, and check a product CSV for the rows and columns the importer would reject before you upload it.

Plain ES modules, zero dependencies, no network calls. The same code runs in the browser, a Web Worker and Node 20+.

Want to convert or check a file without writing code? The free hosted tool runs this engine entirely in your browser (the file never leaves your device):

https://cataloghop.dylan-caponi.workers.dev

Tests: `node --test` (fixtures in `fixtures/`, reviewed expected outputs in `golden/`). Fixtures are rebuilt with `node test-support/make-fixtures.mjs` and goldens with `node test-support/make-golden.mjs`. Only regenerate goldens after reviewing the diff by hand.

## Public API (`index.js`)

All functions take the file as a string. Decode the bytes with `new TextDecoder('utf-8', { fatal: true })` and fall back to `windows-1252` for conversion (files re-saved by Excel on Windows), telling the user; for `validate`, decode as plain UTF-8 so bad bytes show up as NOT_UTF8. A leading BOM, CRLF or LF line endings, and quoted fields with commas, quotes or line breaks are all handled.

### `detectSource(text)`
Returns `{ sourceId, confidence, reason, candidates }`. `sourceId` is one of the `SOURCES` keys, or `null` if the file is not recognised (then `reason` is a sentence to show the user). `candidates` is `[{ id, score }]` sorted best first.

### `convert(text, options)`
`options`:
- `to` (required): `'shopify'` or `'woocommerce'`
- `from`: a source id. If you leave it out, the source is detected. If you give one that does not match the file, `SOURCE_MISMATCH` is thrown.
- `sourceWeightUnit`: `'g' | 'kg' | 'lb' | 'oz'`. Squarespace and Wix exports do not say which unit their weights are in, so set this from a dropdown. If you leave it out, weights are read as pounds and a `WEIGHT_UNIT_ASSUMED` warning is added.
- `wooWeightUnit`: `'kg'` (default) `| 'g' | 'lb' | 'oz'`. Set it to the destination store's weight unit (WooCommerce > Settings > Products). It changes the header to `Weight (kg)`, `Weight (lbs)` and so on, and converts the values.

Returns:
```
{
  sourceId, target,
  csv,             // string to download; WooCommerce files start with a UTF-8 BOM, Shopify files do not
  filename,        // 'shopify-products.csv' or 'woocommerce-products.csv'
  products,        // products read from the source
  writtenProducts, // products written to csv (Shopify leaves out products it would reject)
  variants,
  issues,          // parse issues, then write issues
  summary,         // { error, warning, info } counts
  check,           // Shopify only: validateShopify(csv) run on the output, same shape as validate()
  parts            // Shopify only: null, or [{ filename, csv }] each under 15 MB when csv is larger
}
```
For Shopify, any product the validator would reject is left out of `csv` (error issue with the validator's reason), so `check.ok` is false only for file-level problems.

Throws `EngineError` (`{ code, message }`, message safe to show) for unreadable input: `NOT_CSV`, `UNKNOWN_SOURCE`, `SOURCE_MISMATCH`, `NO_PRODUCTS` (message carries the reason, for example translated Etsy headers or a file of only gift cards), `UNKNOWN_TARGET`, `CSV_UNTERMINATED_QUOTE`.

### `validate(text, { target: 'shopify', byteLength? })`
Checks a CSV meant for Shopify's product importer. Pass `byteLength` (`file.size`) to check the 15 MB limit exactly. Returns `{ ok, issues, summary, stats: { rows, products, variants, images } }`. `ok` is false when there is any error. Issues are sorted by line.

### Lower level
- `parseProducts(text, { source?, sourceWeightUnit? })` returns `{ sourceId, products, issues, summary }`, with products in the neutral model (`src/model.js`).
- `writeProducts(products, target, options)` returns `{ csv, filename, issues, summary, writtenProducts }`.
- `parseCSV(text)` and `writeCSV(rows, { bom, eol })` are the CSV reader and writer.
- `SOURCES`, `TARGETS`: `{ id: { label } }` for building menus.
- `RULES`: every rule id with `{ text, source, verified }`.

### Issue shape
```
{
  severity: 'error' | 'warning' | 'info',
  code: 'DUPLICATE_OPTIONS',          // stable id
  message: 'Line 4: "bad-tee" already has a variant with S (line 3). ...',  // plain English
  line?: 4,                            // 1-based line in the file the issue is about
  handle?: 'bad-tee',
  column?: 'Option1 value',
  rule?: { id, text, source, verified }  // the documented rule and its URL
}
```
Meaning: `error` = the importer would reject this row or product (in `convert` to Shopify, that product was left out of the file). `warning` = it will import, but something was guessed, dropped or changed. `info` = something was not carried over because the destination has no place for it.

## Supported pairs

Every source below converts to both Shopify and WooCommerce, and every pair is covered by a golden-file test. 8 fixtures x 2 destinations = 16 pairs.

| Source (`sourceId`) | Known limitations |
|---|---|
| Etsy listings download, EtsyListingsDownload.csv (`etsy`) | Etsy exports one price, one quantity and one SKU per listing, not per variation. Every variant gets the listing price, stock is set to 0 and SKUs are left blank, with a warning per listing. Disabled combinations are not in the export, so every combination is created. Materials are dropped. Descriptions are plain text and become `<p>`/`<br>` HTML. Shops with non-English headers are refused with instructions. Only active listings are in the export. |
| Shopify product CSV, current and legacy headers (`shopify`) | Metafields, market prices, Google Shopping columns and unit prices are not carried over. Product category is kept for Shopify-to-Shopify only. |
| WooCommerce product export (`woocommerce`) | Simple and variable products only (grouped and external products are skipped with a warning). Attributes not used for variations, short descriptions and featured or visibility flags are dropped. "Any value" variations are expanded into every value. The first category becomes the Shopify Type. |
| Squarespace product export, 32 or 34 columns (`squarespace`) | Weights have no unit in the file, so set `sourceWeightUnit`. Service products are converted without shipping. The export has no variant images or alt text. Up to 6 options are read; Shopify takes 3, so products with more are left out of Shopify files. |
| Wix Stores, classic catalog, header `handleId` (`wix`) | Images are Wix media IDs. Links are built as `https://static.wixstatic.com/media/<id>` (Wix's usual host; Wix's help does not document it). Variant price = product price + surcharge, minus the product discount. Ribbons, additional info sections and custom text fields are dropped. Weight unit as for Squarespace. |
| Wix Stores, new catalog, header `handle` (`wix-v3`) | Same image link caveat. Modifiers and ribbons are dropped. Category slugs become WooCommerce categories, not Shopify collections. |
| BigCommerce product export, modern Import/Export (v3) layout (`bigcommerce`) | The export has category and brand ID numbers only, so categories and brands cannot move. Variant rows carry no product reference, so a file re-sorted in a spreadsheet is detected and warned. A product-level sale price on variants is warned with both prices named. Modifiers are not in the CSV. The older Bulk Edit layout is refused by name. |

Destination notes:
- Shopify: writes the official template header (61 columns, https://help.shopify.com/csv/product_template.csv) as UTF-8 with LF line endings and no BOM. Weights go out in whole grams, as in the template. Products over 3 options or 2,048 variants, with duplicate option combinations, or with a blank price are left out and reported as errors. Tags over 250 and images over 250 are cut, and the SEO title is dropped over 70 characters (all with warnings).
- WooCommerce: writes the core importer's English labels (WooCommerce 11.2.2). Variable products get a parent SKU (from the handle) when the source has none, so variations can link to it. Repeated SKUs are blanked, because WooCommerce rejects duplicates. Attributes are written as local (not global) attributes. Vendor and barcodes are not written (no core vendor column; the GTIN column does not auto-map in 11.2).

## Validator rules (Shopify)
File: empty file, over 15 MB, not UTF-8, garbled accents, illegal quoting, wrong delimiter, header with extra spaces, wrong case or duplicated, unknown header, Option4+ columns, Barcode and Barcodes both present, missing Title, URL handle or Price column.
Per product: handle has spaces or other characters, handle rows not kept together, first row without a Title, Status blank or invalid, Published not TRUE/FALSE, over 250 tags, SEO title over 70 or description over 320, title or handle over 255, over 2,048 variants, over 250 images, variant rows without options.
Per row: duplicate option combination, option value without a name or missing for a named option, blank price, price or compare-at or cost not a plain number (with the corrected value), inventory tracker invalid, quantity blank when tracked or not a whole number, inventory policy invalid, weight not plain grams, weight unit invalid, TRUE/FALSE fields invalid, blank fulfillment service, packed dimensions only partly filled, image URL not a full public link (http:// gets a warning), image position not a number, alt text over 512, duplicate SKU (warning).

Each rule's source URL is in `src/rules.js`. Rules with `verified: false` are best readings that no primary source states outright: the 2,048 variant cap applying to CSV import, the `Title`/`Default Title` convention for products without options, needing an option name for an option value, plain-number prices, and the 255-character title limit (third-party sources only).

## Sample data
Most fixtures are constructed and contain no real merchant data. The exception is `fixtures/bigcommerce-export.csv`. Its first two products, "[Sample] Fog Linen Chambray Towel - Beige Stripe" and "[Sample] 1 L Le Parfait Jar" (rows 2 to 25: the two Product rows, their 16 Variant rows and 6 Image rows), are copied unchanged from BigCommerce's own published sample import/export file. The rest of that file (the Wool Beanie, the digital Shop Gift Guide, the Winter Mug and their variant, image and video rows) is constructed for the tests. The sample file is at:

https://storage.googleapis.com/bigcommerce-production-dev-center/Knowledge%20Base/Products/Import%20Export%20v3%20Guide/v3-product-import-template.csv

It is linked from BigCommerce's Modern Import/Export overview:

https://support.bigcommerce.com/articles/en_US/Knowledge/Modern-Import-Export-Overview

The golden files for that fixture are generated from it, so they contain those two products as well. All other fixtures are invented.
