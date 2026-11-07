# WooCommerce core product CSV importer/exporter: exact schema

Researched 2026-11-04 from public source. Pins:
- Latest stable tag: `11.2.2` (released 2026-11-04). Base: https://github.com/woocommerce/woocommerce/tree/11.2.2/plugins/woocommerce
- trunk at commit `37f05098d9130496021c66655b7aed51947e5698` (11.3-dev). Base: https://github.com/woocommerce/woocommerce/tree/37f05098d9130496021c66655b7aed51947e5698/plugins/woocommerce
- Docs page (dateModified 2026-10-09): https://woocommerce.com/document/product-csv-importer-exporter/
- Old GitHub wiki schema ("for WooCommerce 3.1+"): https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema

Files read (paths relative to plugins/woocommerce):
- includes/export/class-wc-product-csv-exporter.php
- includes/export/abstract-wc-csv-exporter.php
- includes/import/class-wc-product-csv-importer.php
- includes/import/abstract-wc-product-importer.php
- includes/admin/importers/class-wc-product-csv-importer-controller.php
- includes/admin/importers/mappings/default.php, generic.php
- includes/admin/importers/views/html-csv-import-mapping.php
- includes/admin/class-wc-admin-brands.php (Brands column)
- includes/abstracts/abstract-wc-product.php (setter error strings)
- sample-data/sample_products.csv

abstract-wc-csv-exporter.php and sample_products.csv are byte-identical between 11.2.2 and trunk.

---

## 1. Default export header row

Source: `get_default_column_names()` in class-wc-product-csv-exporter.php
https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/export/class-wc-product-csv-exporter.php

Order in 11.2.2 (key => English label):

```
id                 => "ID"
type               => "Type"
sku                => "SKU"
global_unique_id   => "GTIN, UPC, EAN, or ISBN"      (added to export in 9.5.0; absent in 9.4.0)
name               => "Name"
published          => "Published"
featured           => "Is featured?"
catalog_visibility => "Visibility in catalog"
short_description  => "Short description"
description        => "Description"
date_on_sale_from  => "Date sale price starts"
date_on_sale_to    => "Date sale price ends"
tax_status         => "Tax status"
tax_class          => "Tax class"
stock_status       => "In stock?"
stock              => "Stock"
low_stock_amount   => "Low stock amount"
backorders         => "Backorders allowed?"
sold_individually  => "Sold individually?"
weight             => sprintf("Weight (%s)", weight unit label)
length             => sprintf("Length (%s)", dimension unit label)
width              => sprintf("Width (%s)", ...)
height             => sprintf("Height (%s)", ...)
reviews_allowed    => "Allow customer reviews?"
purchase_note      => "Purchase note"
sale_price         => "Sale price"
regular_price      => "Regular price"
category_ids       => "Categories"
tag_ids            => "Tags"
shipping_class_id  => "Shipping class"
images             => "Images"
download_limit     => "Download limit"
download_expiry    => "Download expiry days"
parent_id          => "Parent"
grouped_products   => "Grouped products"
upsell_ids         => "Upsells"
cross_sell_ids     => "Cross-sells"
product_url        => "External URL"
button_text        => "Button text"
menu_order         => "Position"
cogs_value         => "Cost of goods"   (only if Cost of Goods Sold feature enabled; first appears in 9.9.0, absent 9.8.0)
```

Then the filter `woocommerce_product_export_product_default_columns` runs; core Brands hooks it (class-wc-admin-brands.php line ~107, `add_column_to_importer_exporter`: `$options['brand_ids'] = __( 'Brands', 'woocommerce' );`), so "Brands" is appended after "Position" / "Cost of goods". Brands are exported as names with `>` hierarchy like categories. Brands file identical in 11.2.2 and trunk.
https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/admin/class-wc-admin-brands.php

trunk only (unreleased, 11.3-dev): `mpn => "MPN"` right after GTIN, plus after Position:
`customs_commodity_code => "Commodity code (HS code)"`, `customs_country_of_origin => "Country of origin"`, `customs_description => "Customs description"` (before Cost of goods).

Dynamic columns, appended per-product in this order as they first appear (prepare_downloads_for_export, prepare_attributes_for_export, prepare_meta_for_export):
- `"Download %d ID"`, `"Download %d name"`, `"Download %d URL"`
- `"Attribute %d name"`, `"Attribute %d value(s)"`, `"Attribute %d visible"`, `"Attribute %d global"`, and `"Attribute %d default"` only for variable products that have a default for that attribute
- `"Meta: %s"` (meta key verbatim; only scalar values; only when "export custom meta" is ticked)

Unit labels: source uses `I18nUtil::get_weight_unit_label( get_option( 'woocommerce_weight_unit', 'kg' ) )`. Sample file shows `"Weight (lbs)","Length (in)","Width (in)","Height (in)"`, so the label is the unit code for lbs/in. UNVERIFIED for other units (kg, g, oz, cm, m, mm, yd); I18nUtil.php was not fetched.

Official sample header (sample-data/sample_products.csv, starts with UTF-8 BOM `EF BB BF`, 25 rows) is an older/shorter shape (no GTIN, no Low stock amount):
```
ID,Type,SKU,Name,Published,"Is featured?","Visibility in catalog","Short description",Description,"Date sale price starts","Date sale price ends","Tax status","Tax class","In stock?",Stock,"Backorders allowed?","Sold individually?","Weight (lbs)","Length (in)","Width (in)","Height (in)","Allow customer reviews?","Purchase note","Sale price","Regular price",Categories,Tags,"Shipping class",Images,"Download limit","Download expiry days",Parent,"Grouped products",Upsells,Cross-sells,"External URL","Button text",Position,"Attribute 1 name","Attribute 1 value(s)","Attribute 1 visible","Attribute 1 global","Attribute 2 name","Attribute 2 value(s)","Attribute 2 visible","Attribute 2 global","Meta: _wpcom_is_markdown","Download 1 name","Download 1 URL","Download 2 name","Download 2 URL"
```
https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/sample-data/sample_products.csv

---

## 2. Header-to-field mapping in the importer

Source: `auto_map_columns()` in class-wc-product-csv-importer-controller.php
https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/admin/importers/class-wc-product-csv-importer-controller.php

Algorithm (quoted):
```php
$headers = array();
foreach ( $raw_headers as $key => $field ) {
    $normalized_field  = strtolower( $field );
    $index             = $num_indexes ? $key : $field;
    $headers[ $index ] = $normalized_field;

    if ( isset( $default_columns[ $normalized_field ] ) ) {
        $headers[ $index ] = $default_columns[ $normalized_field ];
    } else {
        foreach ( $special_columns as $regex => $special_key ) {
            // Don't use the normalized field in the regex since meta might be case-sensitive.
            if ( preg_match( $regex, $field, $matches ) ) {
                $headers[ $index ] = $special_key . $matches[1];
```
- `normalize_columns_names()` lowercases the label keys, so matching is **exact label, case-insensitive**. Headers are `trim()`med and run through `wc_clean( wp_unslash() )`, and the BOM is stripped from the first header.
- Labels are `__()` translated, i.e. matched in the admin user's locale. mappings/default.php adds the **English labels as extra aliases whenever the user locale is not en_US** (`wc_importer_default_english_mappings`, `wc_importer_default_special_english_mappings`). So English headers always work.
  - Gotcha in default.php: the English weight/dimension aliases use the raw option value: `sprintf( 'Weight (%s)', $weight_unit )`, not the I18n label.
- Special columns: `sanitize_special_column_name_regex` turns `"Attribute %d name"` into `/Attribute %d name/i` with `%d`/`%s` replaced by `(.*)`. So "Attribute 3 value(s)" maps to `attributes:value3`. Same pattern for `Download %d ID|name|URL`, and `Meta: %s` maps to `meta:<key>` (regex `/Meta\: (.*)/i`, which needs a space after the colon).
- Generic aliases (mappings/generic.php, `__()` translated): `"Title"`, `"Product Title"` map to name; `"Price"` to regular_price; `"Parent SKU"` to parent_id; `"Quantity"` to stock_quantity; `"Menu order"` to menu_order.
- Brands: `array( __( 'Brands', 'woocommerce' ) => 'brand_ids' )` via `woocommerce_csv_product_import_mapping_default_columns`.
- **Raw-key passthrough (derived from source):** an unmatched header keeps its lowercased text as the mapping key, and the mapping view uses `selected( $mapped_value, $key )` (html-csv-import-mapping.php line 48). So a header that equals an internal key (`sku`, `regular_price`, `global_unique_id`, `meta:foo`) auto-selects that field. This is also why the docs' `meta:product_depth` (no space) works. Anything else shows "Do not import".
- **Version gotcha:** in **11.2.2 the GTIN label is NOT in auto_map_columns' `$default_columns`** (grep shows `global_unique_id` only in `get_mapping_options`, line 959), nor in default.php. So an exported "GTIN, UPC, EAN, or ISBN" column does not auto-map on <=11.2.2; the user must pick it by hand. trunk adds it (plus MPN and customs). Workaround for the engine: name the header `global_unique_id`, which passes through per the point above (inferred, not tested on a live store).
- The user's saved mapping (`get_user_option( 'woocommerce_product_import_mapping' )`) can override auto-mapping (`auto_map_user_preferences`).

Required columns: **none enforced by source.** No importer check requires Name or SKU. Docs and wiki say "Name: Required." The old wiki says SKU "Required. Auto-generated if missing." The current docs contradict that: "WooCommerce does not automatically generate a SKU for a blank CSV value." Type defaults to simple when absent (`get_type_from_values` returns `ProductType::SIMPLE` if empty). Practical minimum: Type + Name (+ SKU for anything that must be re-matched or used as a Parent).

### Variable products and variations
- Parent row: `Type` = `variable`. Its `Attribute N value(s)` holds all options comma-separated, e.g. `Blue, Green, Red`, with `Attribute N global` 1/0.
- Variation rows: `Type` = `variation`, `Parent` = parent SKU or `id:123` (`parse_relative_field`: `preg_match( '/^id:(\d+)$/', ...)`, otherwise `wc_get_product_id_by_sku`). If the parent SKU is not found, the importer **creates a placeholder** product named `'Import placeholder for ' . $value` with status `importing`, which a later parent row fills. Row order still matters (corrected 2026-11-05 evening, review finding 2): a variation parsed before its parent row is attached to the placeholder before it has attributes, and its attributes are dropped (abstract-wc-product-importer.php set_variation_data, lines 575-586). In 11.2.2 placeholders still in status importing are deleted at the end of the import (controller cleanup_after_import, lines 345-390).
- Variation attribute value: `set_variation_data` uses `$attribute_value = isset( $attribute['value'] ) ? current( $attribute['value'] ) : '';`, i.e. **first value only**. An empty value means "any".
- The parent's attribute gets "used for variations" automatically. `get_variation_parent_attributes` promotes a parent attribute to variation when a variation row references it, and `Attribute N default` also sets `is_variation = 1`.
- For global attributes (`Attribute N global` = 1), the importer looks up or creates the `pa_` taxonomy (`get_attribute_taxonomy_id`). Variation rows use `get_existing_attribute_taxonomy_id`, which does not create it.
- Sample rows: `Type=variation, SKU=woo-vneck-tee-red, Name="V-Neck T-Shirt - Red", Parent=woo-vneck-tee, Attribute 1 name=Color, Attribute 1 value(s)=Red, Attribute 1 global=1`.
- Exporter writes Parent as parent SKU, or `'id:' . $parent->get_id()` when there is no SKU. Same rule for Grouped products, Upsells, Cross-sells.
- Update mode (11.1+/11.2+, from docs plus source): a new variation in an update import needs an empty ID, a SKU or GTIN, and an existing variable parent. Its attribute names and values must exist on the parent (see errors below).

---

## 3. Images
- `parse_images_field`: separator from `apply_filters( 'woocommerce_product_import_image_separator', ',' )`, then `explode_values`. Values containing `://` go through `esc_url_raw`. Anything else is treated as a filename (`sanitize_file_name`), resolved against the existing media library.
- `expand_data`: `$data['raw_image_id'] = array_shift( $images );` means the **first image is the featured image** and the rest are the gallery. A non-empty images cell replaces the whole gallery. An empty cell leaves existing images untouched.
- Exporter: `array_merge( array( $product->get_image_id() ), $product->get_gallery_image_ids() )` writes full-size URLs joined by `", "`.
- Image fetch errors (abstract importer): `Not able to attach "%s".` and `Unable to use image "%s".`

---

## 4. Value formats (export writes / import accepts)

| Column | Export writes | Import accepts (source) |
|---|---|---|
| Type | `implode_values([type, 'downloadable'?, 'virtual'?])`, e.g. `simple, downloadable, virtual` | comma list, lowercased; `virtual` and `downloadable` become flags; the remaining token is the type; must be a key of `WC_Admin_Exporters::get_product_types()` = `wc_get_product_types()` + `variation` (core: simple, grouped, external, variable, variation) |
| Published | draft=-1, private=0, publish=1, pending=2 (other statuses export -1) | `floatval`; `true` gives 1, `false` gives -1; map -1 draft, 0 private, 1 publish, 2 pending; unknown gives draft; variation with -1 is forced to publish |
| Is featured?, Sold individually?, Allow customer reviews?, Attribute N visible/global | 1/0 | `parse_bool_field`: `'0'` is false, `'1'` is true, anything else passes through `wc_clean` (attribute visible/global then go through `wc_string_to_bool`, so yes/true work) |
| Visibility in catalog | visible / catalog / search / hidden | `wc_clean`; an invalid value throws `Invalid catalog visibility option.` |
| Tax status | taxable / shipping / none | also `true`/`false` (true gives taxable, false gives none); an invalid value throws `Invalid product tax status.` |
| Tax class | slug (blank = standard) | `wc_clean` |
| In stock? | `1`, `0`, or `backorder` | `backorder` is onbackorder; truthy is instock; else outofstock. Blank Stock with no In stock? column defaults to in stock |
| Stock | integer if managing stock, `parent` for a variation inheriting, blank if not managed | `wc_stock_amount`; blank sets manage_stock=false; non-blank sets manage_stock=true |
| Backorders allowed? | `1`, `0`, `notify` | empty gives no; `1` yes; `0` no; `notify`; anything else gives no |
| Low stock amount | int or blank | `wc_stock_amount` |
| Weight/Length/Width/Height | plain number in the store unit (unit only in header) | `(float) wc_format_decimal( $value )` (honours store decimal separator) |
| Regular price / Sale price | plain decimal | regular: `wc_format_decimal`; sale: default `wc_clean` |
| Date sale price starts/ends | `Y-m-d G:i:s` (WC_Datetime via format_data) | Unix timestamp or any `strtotime`-parsable string; date-only "ends" value becomes `Y-m-d 23:59:59` |
| Categories | `Parent > Child` per term, joined `", "` | `explode_values`, split each on `>`, terms auto-created (requires `manage_product_terms`) |
| Tags | names joined `", "` | names, created if missing |
| Shipping class | name | name, created if missing |
| Brands | like categories | like categories (`parse_brands_field`) |
| Parent / Upsells / Cross-sells / Grouped products | SKU or `id:N`, joined `", "` | same; unknown SKU creates a placeholder |
| Download limit / expiry | int or blank (docs: "n/a or a limit") | `intval`, blank clears |
| Position | int | `intval` |
| Description / Short description | real newlines exported as literal `\n`; literal `\n` text as `\\n` | reverse of export (`parse_description_field`) |
| Meta: key | scalar value | `wp_kses_post` |

**Commas inside values:** exporter `implode_values` does `str_replace( ',', '\\,', $value )` and joins with `', '`. Importer `explode_values`: `str_replace( '\\,', '::separator::', $value )`, explode on `,`, trim, restore commas. **trunk only** adds `group_quoted_values`: a segment wrapped in `"..."` inside a cell is kept whole (the 11.2.2 explode is plain). Docs: "To import a single category named Places, People, Cities, escape its commas with backslashes: Places\, People\, Cities". Note: `parse_categories_field` does not call `unescape_data` first.

CSV-level quoting: RFC-4180 style. Exporter `fputcsv( $buffer, $row, $delimiter, '"', "\0" )`; importer `fgetcsv(..., '"', "\0")` with the comment: "PHP uses '\' as the default escape character. This is not RFC-4180 compliant. This disables the escape character." So inner quotes are doubled `""`, and backslash is never a CSV escape.

---

## 5. Encoding, delimiter, size, error messages

- Export: `send_content( chr( 239 ) . chr( 187 ) . chr( 191 ) . headers . data )` writes a **UTF-8 BOM**. `Content-Type: text/csv; charset=utf-8`. Non-UTF-8 values are converted `mb_convert_encoding( $data, 'UTF-8', 'ISO-8859-1' )`. Default delimiter `','` (filter `woocommerce_{type}_export_delimiter`).
- Import: `remove_utf8_bom()` strips `efbbbf` from the first header only. BOM is optional. Default `character_encoding` `'UTF-8'` (advanced option lets the user pick another; values go through `mb_convert_encoding`). Rows are also passed through `convert_to_utf8`. Delimiter defaults to `,` and the user can change it under "Show advanced options". Fully empty rows are skipped (`if ( ! count( array_filter( $row ) ) ) continue;`).
- Valid file types: `'csv' => 'text/csv', 'txt' => 'text/plain'` (filter `woocommerce_csv_product_import_valid_filetypes`).
- Size: upload form shows `apply_filters( 'import_upload_size_limit', wp_max_upload_size() )`, i.e. PHP `upload_max_filesize`/`post_max_size`. Docs: "The Maximum size value shown on the upload screen is set at the server level." The workaround is a server file path under uploads ("Show advanced options"). The import runs in batches with `prevent_timeouts` (time/memory checks).

Error strings (exact, 11.2.2 unless noted):
- Controller/importer file errors:
  - `Invalid file type. The importer supports CSV and TXT file formats.`
  - `File path provided for import is invalid.`
  - `Unable to open the CSV file, please try again with a new file.`
  - `The file is empty or using a different encoding than UTF-8, please try again with a new file.`
- Row skip (class-wc-product-csv-importer.php `import()`):
  - `A product with this SKU already exists.` (create mode, SKU exists)
  - `A product with this ID already exists.` (create mode, ID exists)
  - `No matching product exists to update.` (update mode, ID/SKU/GTIN matches nothing)
- New variation in update mode (`can_create_variation`):
  - `A new variation cannot be created for a row that specifies an ID.`
  - `A new variation cannot be created without a SKU or a GTIN, UPC, EAN, or ISBN.`
  - `A new variation cannot be created without a parent product.`
  - `A new variation can only be created for a variable parent product.`
  - `A new variation cannot be created for a parent product that does not exist.`
  - `A new variation cannot be created because the parent product has no "%s" attribute.`
  - `A new variation cannot be created because "%1$s" is not an option of the parent product's "%2$s" attribute.`
- abstract-wc-product-importer.php:
  - `Invalid product type.` (code `woocommerce_product_importer_invalid_type`)
  - `Invalid product ID %d.`
  - `The Global Unique ID matches a product of a different type.`
  - `Variation cannot be imported: Missing parent ID or parent does not exist yet.`
  - `Variation cannot be imported: Parent product cannot be a product variation`
  - `Variation cannot be imported: Parent product must be an existing variable product.` (trunk only in this exact place; UNVERIFIED for 11.2.2)
  - `Not able to attach "%s".`
  - `Unable to use image "%s".`
- Product setters (abstract-wc-product.php, surfaced as `woocommerce_product_csv_importer_<code>`):
  - `Invalid or duplicated SKU.`
  - `Invalid or duplicated GTIN, UPC, EAN or ISBN.`
  - `Invalid GTIN, UPC, EAN, or ISBN. The letter X is only valid as the final ISBN-10 check digit.`
  - `Invalid catalog visibility option.`
  - `Invalid product tax status.`
- trunk only: SKU conflict hint `%1$s The ID of this row matches product #%2$d, but its SKU "%3$s" already belongs to product #%4$d. ...`
- The row identifier in reports is built from `Name`, `ID %d`, `SKU %s`, `GTIN, UPC, EAN, or ISBN %s`.
- A `"%s is not a valid ..."` string was NOT found in these files (UNVERIFIED / likely nonexistent).

---

## 6. Formula escaping
Exporter `escape_data()` (abstract-wc-csv-exporter.php):
```php
$active_content_triggers = array( '=', '+', '-', '@', chr( 0x09 ), chr( 0x0d ) );
// Don't escape pure numeric values since they cannot form a valid formula to be injected.
if ( is_int( $data ) || is_float( $data ) ) { return $data; }
if ( in_array( mb_substr( $data, 0, 1 ), $active_content_triggers, true ) ) { $data = "'" . $data; }
```
This applies to headers too. Note that numeric strings like `"-5"` are strings, so they get the `'` prefix; only PHP int/float are exempt.

Importer `unescape_data()` (abstract importer):
```php
$active_content_triggers = array( "'=", "'+", "'-", "'@" );
if ( in_array( mb_substr( $value, 0, 2 ), $active_content_triggers, true ) ) { $value = mb_substr( $value, 1 ); }
```
It strips the quote only for = + - @ (not tab/CR). It is called by the SKU, relative (Parent/upsells), comma, float, stock, int, published, tax_status, tags and customs parsers. **Not** called for name (`parse_skip_field`), description, categories, images, regular_price (`wc_format_decimal`), or plain `wc_clean` columns, so a leading `'` survives there.

---

## Summary for the engine

**Header row to write** (targets >=9.5 and 11.2.x; omit Cost of goods unless COGS is on; omit Brands if targeting <9.6, UNVERIFIED exactly when Brands became core):
```
ID,Type,SKU,"GTIN, UPC, EAN, or ISBN",Name,Published,"Is featured?","Visibility in catalog","Short description",Description,"Date sale price starts","Date sale price ends","Tax status","Tax class","In stock?",Stock,"Low stock amount","Backorders allowed?","Sold individually?","Weight (kg)","Length (cm)","Width (cm)","Height (cm)","Allow customer reviews?","Purchase note","Sale price","Regular price",Categories,Tags,"Shipping class",Images,"Download limit","Download expiry days",Parent,"Grouped products",Upsells,Cross-sells,"External URL","Button text",Position,Brands,"Attribute 1 name","Attribute 1 value(s)","Attribute 1 visible","Attribute 1 global","Attribute 1 default",...,"Meta: <key>"
```
- Unit in the header must match the target store's unit codes (kg/g/lbs/oz, cm/m/mm/in/yd) or the column won't auto-map. Values are plain numbers in that unit; convert in the engine.
- Write a UTF-8 BOM, comma delimiter, CRLF/LF fine, RFC-4180 quoting (`""`), no backslash CSV escape.
- On 11.2.x, GTIN does not auto-map. Either tell the user to map it or emit the header `global_unique_id` (raw-key passthrough).
- Sources:
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/export/class-wc-product-csv-exporter.php
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/admin/importers/class-wc-product-csv-importer-controller.php

**Value formats:**
- Published `1` / `0` / `-1` / `2`
- Booleans `1`/`0`
- Visibility `visible|catalog|search|hidden`
- Tax status `taxable|shipping|none`
- In stock? `1|0|backorder`
- Backorders `1|0|notify`
- Stock: integer, blank = unmanaged, `parent` for variations
- Prices as plain `.` decimals
- Categories and Brands `A > B, C`
- Tags `a, b`
- List cells joined `", "` with literal commas as `\,`
- Images comma-separated URLs, first = featured
- Description newlines as literal `\n`
- Type `simple|variable|variation|grouped|external` plus optional `, virtual` / `, downloadable`
- Avoid leading `= + - @` in name/description/categories/images (not unescaped there). In other text cells, the importer strips a `'` prefix before those characters.
- Sources:
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/class-wc-product-csv-importer.php
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/abstract-wc-product-importer.php
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/export/abstract-wc-csv-exporter.php

**Variation representation:**
- Parent row: `variable` with every option in `Attribute N value(s)`, and `Attribute N global` 1 for `pa_` taxonomy attributes or 0 for local ones.
- Child rows: `variation`, a unique SKU, `Parent` = parent SKU (or `id:N`), the same `Attribute N name`/`global`, and exactly one value (an extra value is ignored, first wins; blank = any).
- Put parents before children (required for single-pass update imports per docs; create mode tolerates either order via placeholders).
- Give every row a SKU so re-imports match.
- Sources:
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/abstract-wc-product-importer.php
  - https://woocommerce.com/document/product-csv-importer-exporter/

**Error rules to pre-validate (mirror importer):**
- Type is in the allowed set, else `Invalid product type.`
- SKU is unique in the file and against the store, else `Invalid or duplicated SKU.` or, in create mode, `A product with this SKU already exists.`
- Variation has a Parent that resolves to a `variable` row, else `Variation cannot be imported: Missing parent ID or parent does not exist yet.` or `... Parent product cannot be a product variation`.
- Variation attribute names and values exist on the parent (update-mode messages listed in section 5).
- Visibility and tax status are in the enums (`Invalid catalog visibility option.` / `Invalid product tax status.`).
- GTIN is valid digits (an `X` is only allowed as the ISBN-10 check digit).
- The file is CSV/TXT, UTF-8, and non-empty.
- Sources:
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/import/class-wc-product-csv-importer.php
  - https://github.com/woocommerce/woocommerce/blob/11.2.2/plugins/woocommerce/includes/abstracts/abstract-wc-product.php

**UNVERIFIED items:**
- I18nUtil unit labels for non-imperial units
- The exact version Brands became core (believed 9.6)
- Whether the 11.2.2 abstract importer has the "must be an existing variable product" error
- No `"%s is not a valid"` string found
- The raw-key passthrough trick has not been tested on a live store
