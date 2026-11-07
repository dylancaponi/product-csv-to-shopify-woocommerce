# Magento 2 / Adobe Commerce product export CSV (System > Data Transfer > Export, Entity Type = Products)

Researched 2026-11-06. Every fact below cites a URL that was fetched during this session. Anything that could not be sourced is marked UNVERIFIED.

Source key (short names used below):
- [EXP] Export model, magento2 2.4-develop:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/CatalogImportExport/Model/Export/Product.php
- [IMP] Import model (constants):
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/CatalogImportExport/Model/Import/Product.php
- [IMPX] ImportExport base (separator constant):
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/ImportExport/Model/Import.php
- [CSVA] CSV writer:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/ImportExport/Model/Export/Adapter/Csv.php
- [CONF] Configurable row customizer:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/ConfigurableImportExport/Model/Export/RowCustomizer.php
- [BUN] Bundle row customizer:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/BundleImportExport/Model/Export/RowCustomizer.php
- [GRP] Grouped row customizer:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/GroupedImportExport/Model/Export/RowCustomizer.php
- [DL] Downloadable row customizer:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/DownloadableImportExport/Model/Export/RowCustomizer.php
- [AP] Advanced Pricing export model:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/AdvancedPricingImportExport/Model/Export/AdvancedPricing.php
- [APIMP] Advanced Pricing import constants:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/AdvancedPricingImportExport/Model/Import/AdvancedPricing.php
- [SAMPLE] Magento's own sample product CSV (the "Download Sample File" on the import page):
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/ImportExport/Files/Sample/catalog_product.csv
- [SAMPLE-AP] Magento's own sample Advanced Pricing CSV:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/ImportExport/Files/Sample/advanced_pricing.csv
- [DOC-ATTR] Adobe "Product data attributes reference" (Experience League source markdown):
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-attributes-product.md
- [DOC-EXP] Adobe "Export data":
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-export.md
- [DOC-CSV] Adobe "CSV data files":
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-csv.md
- [DOC-CONF] Adobe "Import configurable products":
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-transfer-configurable-products.md
- [DOC-BUN] Adobe "Import bundle products":
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-transfer-bundle-products.md
- [DOC-TIER] Adobe "Import tier prices":
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-import-price-tier.md
- [DOC-IMG] Adobe "Product image import":
  https://raw.githubusercontent.com/AdobeDocs/commerce-admin.en/main/help/systems/data-import-product-images.md
- [REAL-1] Real export file, 17 products incl. a configurable with 15 children (82 columns, timestamps 11/2017):
  https://raw.githubusercontent.com/ips13/magento-parsecsv/HEAD/inventory/mage.csv
- [REAL-2] Real export file named in Magento's export naming pattern `catalog_product_20160624_180745.csv` (80 columns):
  https://raw.githubusercontent.com/American-Retail-Technologies/Mickey-Magento/HEAD/var/import_history/1466800741_catalog_product_20160624_180745.csv
- [REAL-3] Real export, filtered to a few columns, with a grouped product:
  https://raw.githubusercontent.com/metrik-sales/cliente-hiperferro/main/catalogo_produtos.csv
- [DIR] Directory module config (weight unit):
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/Directory/etc/config.xml
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/Directory/etc/adminhtml/system.xml

## 1. Header row

### 1a. Real export header, copied exactly from [REAL-1] (82 columns)

```
sku,store_view_code,attribute_set_code,product_type,categories,product_websites,name,description,short_description,weight,product_online,tax_class_name,visibility,price,special_price,special_price_from_date,special_price_to_date,url_key,meta_title,meta_keywords,meta_description,base_image,base_image_label,small_image,small_image_label,thumbnail_image,thumbnail_image_label,swatch_image,swatch_image_label,created_at,updated_at,new_from_date,new_to_date,display_product_options_in,map_price,msrp_price,map_enabled,gift_message_available,custom_design,custom_design_from,custom_design_to,custom_layout_update,page_layout,product_options_container,msrp_display_actual_price_type,country_of_manufacture,additional_attributes,qty,out_of_stock_qty,use_config_min_qty,is_qty_decimal,allow_backorders,use_config_backorders,min_cart_qty,use_config_min_sale_qty,max_cart_qty,use_config_max_sale_qty,is_in_stock,notify_on_stock_below,use_config_notify_stock_qty,manage_stock,use_config_manage_stock,use_config_qty_increments,qty_increments,use_config_enable_qty_inc,enable_qty_increments,is_decimal_divided,website_id,related_skus,crosssell_skus,upsell_skus,additional_images,additional_image_labels,hide_from_product_page,bundle_price_type,bundle_sku_type,bundle_price_view,bundle_weight_type,bundle_values,configurable_variations,configurable_variation_labels,associated_skus
```

[REAL-2] has the identical header minus `configurable_variations,configurable_variation_labels` (80 columns), i.e. the configurable columns only appear when the ConfigurableImportExport module contributes them.

### 1b. How the header is built in current code (2.4-develop) [EXP]

Order = concatenation of:
1. `sku, store_view_code, attribute_set_code, product_type, categories, product_websites` (internal `_store`, `_attribute_set`, `_product_websites` renamed via `$_fieldsMap`) [EXP `setHeaderColumns`, `$_fieldsMap`]
2. `$_exportMainAttrCodes`, in this order: `name, description, short_description, weight, product_online, tax_class_name, visibility, price, special_price, special_price_from_date, special_price_to_date, url_key, meta_title, meta_keywords, meta_description, base_image, base_image_label, small_image, small_image_label, thumbnail_image, thumbnail_image_label, swatch_image, swatch_image_label, created_at, updated_at, new_from_date, new_to_date, display_product_options_in, map_price, msrp_price, map_enabled, gift_message_available, custom_design, custom_design_from, custom_design_to, custom_layout_update, page_layout, product_options_container, msrp_display_actual_price_type, country_of_manufacture` (the source list repeats some codes; the CSV writer keys header columns by name so duplicates collapse to first position [CSVA `setHeaderCols`])
3. `additional_attributes`
4. The keys of the `cataloginventory_stock_item` row (minus item_id, product_id, low_stock_date, stock_id, stock_status_changed_auto), renamed by `$_fieldsMap` (min_qty->out_of_stock_qty, backorders->allow_backorders, min_sale_qty->min_cart_qty, max_sale_qty->max_cart_qty, notify_stock_qty->notify_on_stock_below) [EXP `prepareCatalogInventory`, `$_fieldsMap`]. Column order therefore follows the DB table; in [REAL-1] it is `qty ... website_id`. [SAMPLE] (newer) additionally has `deferred_stock_update,use_config_deferred_stock_update` after `website_id`.
5. `related_skus, related_position, crosssell_skus, crosssell_position, upsell_skus, upsell_position, additional_images, additional_image_labels, hide_from_product_page, custom_options` [EXP `setHeaderColumns`]. Note: [REAL-1]/[REAL-2] (2016-2017 versions) lack the `*_position` and `custom_options` columns, so these were added in later versions.
6. Row-customizer columns appended by `addHeaderColumns`: bundle `bundle_price_type, bundle_sku_type, bundle_price_view, bundle_weight_type, bundle_values, bundle_shipment_type` [BUN `$bundleColumns` + `$shipmentTypeColumn`]; configurable `configurable_variations, configurable_variation_labels` [CONF]; grouped `associated_skus` [GRP]; downloadable `downloadable_links, downloadable_samples` [DL]. Relative order among customizers in [REAL-1] is bundle, configurable, grouped. Position of downloadable columns and of `bundle_shipment_type` in a real current export: UNVERIFIED (no current real export fetched; customizer order comes from DI/module load order, not sourced).

Extra notes:
- Any EAV attribute not in `$_exportMainAttrCodes` is not its own column; it goes into `additional_attributes` [EXP `convertProductStoreData`].
- Excluding an attribute in the Admin export grid: Adobe says the column is omitted [DOC-EXP] (the same page also says "The column appears in the export file, but without any values"; the doc is self-contradictory).
- Files: CSV only for export, written to `var/export` (or `import_export/export` with remote storage), produced asynchronously via message queue/cron [DOC-EXP], [DOC-CSV]. Field delimiter `,`, enclosure `"` [CSVA]. Optional "Fields Enclosure" setting wraps additional_attributes values in double quotes [EXP `wrapValue`], [DOC-EXP].
- Columns missing from a row are written empty (writer merges row into a header-keyed template) [CSVA `writeRow`].

## 2. Row semantics

- One row per (product, store) where the store row has data. For store 0 (admin/default) `store_view_code` is blank; for other store views it is the store code [EXP `appendMultirowData`: store code only set when storeId != 0], [DOC-ATTR "If blank, the product is available at the default store view"].
- Store-view rows contain only values that differ from the default row: `if ($storeId != DEFAULT_STORE_ID && $defaultData[$fieldName] == $attrValue) continue;` [EXP `convertProductStoreData`]. If nothing differs, the store row is dropped (`if (empty($dataRow)) return null`) [EXP `appendMultirowData`]. Store rows always carry `sku`, `attribute_set_code`, `product_type` re-added [EXP]. Categories, websites, gallery (additional_images), links, and row-customizer data (configurable/bundle/etc.) are only emitted on the default row [EXP `appendMultirowData` `if (Store::DEFAULT_STORE_ID == $storeId)`]. Stock columns are merged only into the default row [EXP `processProductRows`]. A real export with store-view rows was not fetched: UNVERIFIED in a sample file (code-sourced only).
- Configurable products: parent row has `configurable_variations` and `configurable_variation_labels`; each child is its own full row [DOC-CONF "The CSV file has a separate row for each simple product variation, and one row for the configurable product"]. In [REAL-1] all 15 children have `visibility=Not Visible Individually`, their option values live in `additional_attributes` (e.g. `color=Green,size=XXL`), and the parent (`T-Shirt`, `product_type=configurable`) has `visibility=Catalog, Search`, `qty=0`, empty price. Children in [REAL-1] were `virtual`, not `simple`. Children appear before the parent in [REAL-1] (export order is by entity link id ascending [EXP `loadCollection` `setOrder($linkField,'asc')`]), so a parser must not assume parent-first.
- `configurable_variations` syntax [CONF]: per child `sku=<childSku>,<attr_code>=<option label>,...`; children joined by `|`. Real value [REAL-1]: `sku=T-Shirt-Black-Medium,color=Black,size=Medium|sku=T-Shirt-Black-Large,color=Black,size=Large|...`. Adobe example: `sku=MH01-XS-Black,size=XS,color=Black|sku=MH01-XS-Gray,size=XS,color=Gray` [DOC-CONF]. Values are option titles (labels) of the admin store, codes are attribute codes [CONF uses `option_title`, `attribute_code`; store set to DEFAULT_STORE_ID].
- `configurable_variation_labels` [CONF]: `attr_code=Label` joined by `,`, e.g. `color=Color,size=Size` form; only emitted when a super-attribute label is set (`if (!empty($optValues['super_attribute_label']))`). In [REAL-1] it is empty. Adobe doc example values `Choose Color:` [DOC-ATTR].
- Grouped: `associated_skus` = `childSku=defaultQty` joined by `,` (from product links, sorted by position) [EXP `appendMultirowData` link loop]. Real: `1010635=0.000000,1010800=0.000000,...` [REAL-3]; Magento sample: `24-WG085=5.0000,24-WG086=5.0000` [SAMPLE].
- Related/cross-sell/up-sell: `*_skus` comma list, `*_position` comma list of positions in the same order [EXP], [DOC-ATTR].

## 3. Delimiters and paths

- Multiple-value separator constant `DEFAULT_GLOBAL_MULTI_VALUE_SEPARATOR = ','` [IMPX]; export always uses it (hard-coded constant, not the import-time setting) [EXP].
- Name/value pair separator `=` (`PAIR_NAME_VALUE_SEPARATOR`) and pseudo-multiline separator `|` (`PSEUDO_MULTI_LINE_SEPARATOR`) [IMP].
- `categories`: path segments joined by `/` (`CategoryProcessor::DELIMITER_CATEGORY = '/'`), starting with the root category name, multiple paths joined by `,` [EXP `initCategories`, `updateDataWithCategoryColumns`]; source:
  https://raw.githubusercontent.com/magento/magento2/2.4-develop/app/code/Magento/CatalogImportExport/Model/Import/Product/CategoryProcessor.php
  Example `Default Category/Gear,Default Category/Gear/Fitness Equipment` [SAMPLE], `Default Category/Pricing & Tagging/Garvey Price Guns (Labelers)/2-Line Guns` [REAL-2]. Category names containing `/` are escaped by `quoteCategoryDelimiter` [EXP] (exact escape form UNVERIFIED). Note: [DOC-ATTR] says multiple paths are pipe-separated, but [DOC-CSV] and the code say comma; trust comma.
- `product_websites`: website codes joined by `,` [EXP], e.g. `base` [REAL-1].
- `additional_images`, `additional_image_labels`, `hide_from_product_page`: joined by `,` (gallery entries of store 0) [EXP].
- `additional_attributes`: `code=value` pairs joined by `,` [EXP]; multiselect values inside it joined by `|` (`code=v1|v2`) [EXP `convertProductStoreData`]. Example `has_options=1,quantity_and_stock_status=In Stock,required_options=0` [SAMPLE]; `color=Green,size=XXL` [REAL-1]. Values may contain commas; Adobe ships a patch ACSD-48313 for "configurable_variations column not parsed if attribute value contains comma" (title seen in GitHub code search result from AdobeDocs/commerce-operations.en guide-metadata.csv; patch page itself not fetched).
- Image columns (`base_image`, `small_image`, `thumbnail_image`, `swatch_image`, `additional_images`): raw media-gallery `value` (filename relative to the catalog product media dir), e.g. `/1/3/13060_ink_roller_garvey_400x400.jpg` [REAL-2], `/b/a/banner-inner_3.png` [REAL-1], `/sample_data/m/b/mb01-blue-0.jpg` [DOC-ATTR]. No host/URL in exports [EXP `getMediaGallery` selects `mg.value`; real files confirm]. That the base dir is `pub/media/catalog/product`: UNVERIFIED (not stated in fetched sources). Full URLs are accepted on import only [DOC-IMG Method 2].
- `custom_options`: one entry per option value, entries joined by `|`, each entry `key=value` joined by `,` with keys `name,type,required,price,sku,[max_characters],[file_extension,image_size_x,image_size_y],price_type,option_title` [EXP `getCustomOptionsData`, `optionRowToCellString`]. Example [SAMPLE]: `name=Custom Yoga Option,type=drop_down,required=0,price=10.0000,price_type=fixed,sku=,option_title=Gold|name=Custom Yoga Option,...,option_title=Silver`. Store-view rows only carry custom_options if they differ [EXP].

## 4. Values

- `product_type`: `simple`, `grouped`, `configurable`, `virtual`, `bundle`, `downloadable` [DOC-ATTR]; observed `simple`, `virtual`, `configurable` [REAL-1], `grouped`, `bundle` [SAMPLE]. (Commerce `giftcard` exists in a third-party sample file, not verified against Adobe sources: UNVERIFIED.)
- `product_online`: `1` = enabled, `2` = disabled [DOC-ATTR] (maps from `status` [EXP `$_fieldsMap`]).
- `visibility` strings: `Not Visible Individually`, `Catalog`, `Search`, `Catalog, Search` [DOC-ATTR]; observed `Catalog, Search` and `Not Visible Individually` [REAL-1].
- `tax_class_name`: class name string, e.g. `Taxable Goods` [REAL-1], [REAL-2] (mapped from tax_class_id [EXP]).
- `price`: plain decimal as stored, observed `6.5` [REAL-2], `20`, `5` [REAL-1]; no currency symbol. Configurable parent price blank [REAL-1]. Whether current versions emit 4-decimal `14.0000` style for price: UNVERIFIED.
- `special_price`, `special_price_from_date`, `special_price_to_date`: date attributes (`special_from_date`, `special_to_date`, `news_from_date`, `news_to_date`, `custom_design_from/to`) are formatted with the locale's IntlDateFormatter SHORT date and no time [EXP `dateAttrCodes`, `convertProductStoreData`]; other datetimes (`created_at`, `updated_at`) use SHORT date + SHORT time, observed `6/23/16, 4:30 PM` [REAL-2], `11/10/17, 5:16 AM` [REAL-1]. So en_US special dates look like `M/D/YY`; a real sample with special_price dates was not found (UNVERIFIED in a file). Format is locale-dependent [DOC-EXP "The format of the date is determined by the locale"].
- `qty` and other stock decimals: raw values from `cataloginventory_stock_item` [EXP `prepareCatalogInventory`]. Observed both `10`/`100`/`1` [REAL-1], [REAL-2] and `0.0000` style for `out_of_stock_qty`/`notify_on_stock_below` [REAL-3]; `max_cart_qty` `10000` [REAL-1] vs `10.000.000` [REAL-3, locale-mangled]. The specific `100.0000` qty form: UNVERIFIED in a real file; parse qty as a float. Children of the configurable in [REAL-1] sometimes have blank qty.
- `is_in_stock`, `manage_stock`, `use_config_*`: `1`/`0` [DOC-ATTR], [REAL-1]. When `use_config_manage_stock` is set, export substitutes the config value into `manage_stock` [EXP `prepareCatalogInventory`].
- `weight`: plain number, no unit in the file (e.g. `0.115` [REAL-2], `1.23` [SAMPLE]). Unit is store config `general/locale/weight_unit`, default `lbs`, configurable per default/website/store [DIR config.xml line `<weight_unit>lbs</weight_unit>`, system.xml field `weight_unit` showInDefault/Website/Store].
- `url_key`: slug, e.g. `ink-roller-garvey-13060` [REAL-2].
- `description`: HTML allowed [DOC-ATTR], [REAL-2].

## 5. Bundle / tier prices / downloadable

- Bundle columns [BUN]: `bundle_price_type` `dynamic`|`fixed` (0=dynamic,1=fixed); `bundle_sku_type` `dynamic`|`fixed`; `bundle_price_view` `Price range`|`As low as`; `bundle_weight_type` `dynamic`|`fixed`; `bundle_shipment_type` `together`|`separately`.
- `bundle_values` [BUN `getFormattedBundleOptionValues`]: one entry per selection, joined by `|`; each entry = option part `name=<title>[,name_<storecode>=<title>],type=<type>,required=<0|1>` + `,` + selection part `sku=..,price=..,default=..,default_qty=..,price_type=fixed|percent,can_change_qty=..` (website-scoped `price_website_<code>`/`price_type_website_<code>` when price scope is website). Example [SAMPLE]: `name=Bundle Option One1,type=select,required=1,sku=24-WG085,price=15.0000,default=0,default_qty=1.0000,price_type=fixed|name=Bundle Option One1,type=select,required=1,sku=24-WG086,price=10.0000,default=1,default_qty=1.0000,price_type=fixed`. [DOC-BUN] confirms elements separated by comma, items by vertical bar.
- Downloadable [DL]: `downloadable_links` entries joined by `|`, `downloadable_samples` entries joined by `,` (sic, per code); each entry is the link/sample model data as `key=value` pairs (non-empty only) joined by `,`, plus `group_title`. Exact key set in real output: UNVERIFIED.
- Tier prices are NOT in the Products export. Products export has no tier price columns [EXP header; REAL-1/2].

## 6. Products export vs Advanced Pricing export

- Separate entity type `Advanced Pricing` in the same Export screen [DOC-EXP], [DOC-TIER].
- Columns exactly: `sku,tier_price_website,tier_price_customer_group,tier_price_qty,tier_price,tier_price_value_type` [AP `$templateExportData`], [DOC-TIER], [SAMPLE-AP]. One row per tier.
- `tier_price_website`: website code, or `All Websites [<base currency>]` for website 0, e.g. `All Websites [USD]` [AP `_getWebsiteCode`], [SAMPLE-AP].
- `tier_price_customer_group`: group name or `ALL GROUPS` [APIMP `VALUE_ALL_GROUPS`], [SAMPLE-AP].
- `tier_price_value_type`: `Fixed` or `Discount` (Discount when percentage_value is set; `tier_price` then holds the percent) [AP `tierPriceTypeValue`], [APIMP].
- Sample [SAMPLE-AP]: `sku123,base,General,2,10,Fixed` / `sku124,All Websites [USD],ALL GROUPS,3,15,Discount`.
- [DOC-ATTR] also lists legacy `group_price_*` columns; current exporter does not emit them [AP].

## Summary of UNVERIFIED items
- `pub/media/catalog/product` as image base dir (paths observed relative, but base dir not stated in fetched sources).
- `100.0000` style qty in real exports (observed integer and `0.0000` forms; varies by version).
- Special price date format in an actual file (code says locale SHORT date).
- Header position of `downloadable_*` and `bundle_shipment_type` in a current-version export; whether a current export includes `related_position` etc. (code says yes, 2016-2017 files do not).
- A real export file containing store-view override rows (behavior sourced from code only).
- Exact escape for `/` in category names.

## Decisions taken in the parser (2026-11-06, src/sources/magento.js)
- Magento 1 refused by name: its export columns are `_store`, `_attribute_set`, `_type`, `_category`, `_root_category`, `_product_websites` (OpenMage Mage_ImportExport export constants COL_STORE, COL_ATTR_SET, COL_TYPE, COL_CATEGORY, COL_ROOT_CATEGORY):
  https://raw.githubusercontent.com/OpenMage/magento-lts/main/app/code/core/Mage/ImportExport/Model/Export/Entity/Product.php
- additional_attributes read as Magento's importer does ([IMP] parseAttributesWithoutWrappedValues: split on ",", a piece without "=" is appended to the previous value; parseAttributesWithWrappedValues: code="value" with "" for a quote, used when the cell starts with code=").
- Category "\/" is a literal slash ([EXP] quoteCategoryDelimiter). The first path level is the root category and is dropped; a path with only the root gives no category.
- special_price: used as the sale when lower than price and today is inside [from, to] (the to day included). Dates: YYYY-MM-DD, or a/b/yy(yy) read as month/day/year unless the first number is over 12 (UNVERIFIED beyond en_US). Unreadable dates: regular price, warned.
- Stock: manage_stock 0 = not tracked; qty truncated toward zero (warned); is_in_stock 0 with qty > 0 written as 0 (warned).
- Status: product_online 1 = active, 2 = draft, other = draft warned; "Not Visible Individually" outside a configurable = draft warned. A configurable child that is also visible on its own is converted only as a variation (warned).
- Option names: configurable_variation_labels label, else the attribute code humanised (color -> Color), info note.
- Images: relative paths left out (warned with product names); full http(s) links kept. The site has no text-option pattern, so no media base URL input was added.
- Not converted, named and counted: bundle, grouped, downloadable, giftcard (giftcard type name UNVERIFIED), configurable without any child rows.
