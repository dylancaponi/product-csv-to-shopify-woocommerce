# Square item library export (research, 2026-11-06)

Export path, from Square's help: Items > Item library > Actions > Export Library, choose "All items" or "Items matching applied filters", then Excel (.xlsx) or CSV. Square recommends .xlsx; CatalogHop reads only the CSV.
https://squareup.com/help/us/en/article/5153-import-items-online

Square publishes no downloadable example export and no full column list. The layout below comes from Square's help pages plus real exports in public GitHub repos. Those files were downloaded to $TMPDIR, read, and NOT copied into the repo. Every row in our fixture is invented.

## Real export files read (evidence for the header and row shapes)
Square names the file `<merchant id>_catalog-YYYY-MM-DD-HHMM.csv`.
- A: https://raw.githubusercontent.com/gokhankelebek/istanbul/HEAD/data/ML9YFNKMX5XZJ_catalog-2025-04-20-0010.csv (60 items, a restaurant, 2 locations, modifier sets)
- B: https://raw.githubusercontent.com/ksfraser/ksf_generate_catalogue/HEAD/2XJWG21S422RM_catalog-2025-08-31-2022.csv (header only, 2 locations, `Weight (kg)`, tax columns)
- C: https://raw.githubusercontent.com/Nancysstays/Nancysstays.github.io/HEAD/MLXCQRF01J16T_catalog-2024-11-23-0442.csv (header with `Default Unit Cost`, `Default Vendor Name`, `Default Vendor Code`, 1 location with no `Enabled` column; its data row was hand-edited and is misaligned, so only the header is used)
- D: https://raw.githubusercontent.com/quirkey/rough-counts/HEAD/square-template.csv (newer header starting `Reference Handle,Token,Item Name,Variation Name,Unit and Precision,...`, with `Reporting Category` + `Additional Categories` instead of `Categories`)

Header of A, exactly:
`Token,Item Name,Variation Name,SKU,Description,Categories,Reporting Category,SEO Title,SEO Description,Permalink,GTIN,Square Online Item Visibility,Item Type,Weight (lb),Social Media Link Title,Social Media Link Description,Shipping Enabled,Self-serve Ordering Enabled,Delivery Enabled,Pickup Enabled,Price,Online Sale Price,Archived,Sellable,Contains Alcohol,Stockable,Auto Add Item to Check,Option Name 1,Option Value 1,Enabled GHOST KITCHEN,Current Quantity GHOST KITCHEN,New Quantity GHOST KITCHEN,Stock Alert Enabled GHOST KITCHEN,Stock Alert Count GHOST KITCHEN,Price GHOST KITCHEN,Enabled Istanbul Mediterranean,...,Price Istanbul Mediterranean,Modifier Set - Add Your Extras,...`

## Format decisions (each with its evidence)
| Fact | Evidence | Decision |
|---|---|---|
| One row per item variation; `Token` is per variation | Help 5153: "Tokens are unique labels created by Square for every item variation". File A: "Side Sauce" has 4 rows, one per variation, each with its own Token | Rows with the same Item Name next to each other form one product |
| Item-level fields only on the first variation row | File A rows 49 to 52: Description, Shipping/Delivery/Pickup Enabled, Contains Alcohol blank on later variations; Categories, visibility, Item Type, Price repeated | Item fields read from the first non-blank value in the group |
| Two different items can share a name | File A: two "Chikofte Salad Bowl" rows, each "Regular", different Tokens and different modifier sets | A repeated variation name (or option combination) inside a same-name group starts a new product, with warning `SQUARE_SAME_NAME_ITEMS` |
| Options: `Option Name N` / `Option Value N` | File A ("Sauce On The Side" = Tzatziki ...), headers A to C have `Option Name 1, Option Value 1` | Every `Option Name N`/`Option Value N` pair in the header is read. Only N=1 is seen in real files; higher N is read by the same pattern (UNVERIFIED that Square writes N>=2) |
| No option columns filled | File A: single "Regular" variation with blank options | One variation = a product without options. Several variations without options = one option named "Variation" (our naming, info `SQUARE_OPTION_NAMED`) |
| Weight unit is in the header | Headers A, C, D `Weight (lb)`; header B `Weight (kg)` | Unit read from the header; a bare `Weight` header falls back to the dropdown / pounds with `WEIGHT_UNIT_ASSUMED` |
| Price blank or "Variable" = variable-priced item | Glossary: "Leaving the Price field blank or writing "Variable" will create a variable-priced item" https://squareup.com/help/us/en/article/8211-item-import-spreadsheet-glossary | No price is carried; Shopify leaves the product out (error), WooCommerce imports it without a price; warning `SQUARE_VARIABLE_PRICE` |
| Online Sale Price | Column present in every real header; always blank in file A. No Square page describes it; community threads say sale prices are not in the spreadsheet (older) https://community.squareup.com/t5/Online-Store/Item-Library-Import-Export-gt-All-fields-are-needed/m-p/333094 | UNVERIFIED meaning. When lower than Price: price = sale, compare-at = Price, and warning `SQUARE_ONLINE_SALE_PRICE` every time (Square's name suggests it applied on Square Online only; in-store the Price applied). Not lower: Price kept, warning `SALE_NOT_LOWER` |
| Categories | Glossary: comma separated, ">" for subcategories, backslash escapes a literal comma or ">". File A: "LAVASH WRAPS > LAVASH WRAPS, LAVASH WRAPS"; duplicate names get " (TOKEN)" appended, e.g. "SIDES (P4UDVM47WMBWY7UAJDOH7BI5)" | Split on unescaped commas, levels on unescaped ">". Names kept exactly as exported (the " (TOKEN)" suffix is kept, info `SQUARE_CATEGORY_ID_SUFFIX`). Older header `Category` (single) and newer `Reporting Category` + `Additional Categories` read the same way. First category's last level = Shopify Type |
| Square Online Item Visibility | File A values: visible (52), unavailable (6), hidden (2) | visible = active. hidden = draft. unavailable = draft with warning `SQUARE_UNAVAILABLE` (meaning UNVERIFIED). Any other value or blank = draft with `VISIBILITY_UNCLEAR`. Column absent (older exports): active |
| Archived Y/N | File A all N | Y = draft, warning `SQUARE_ARCHIVED` with count |
| Location columns `Enabled <loc>`, `Current Quantity <loc>`, `New Quantity <loc>`, `Stock Alert Enabled <loc>`, `Stock Alert Count <loc>`, `Price <loc>` | Headers A, B (two locations), C (one location, no Enabled). Help 5153: New Quantity replaces stock on import; glossary: Current Quantity is informational | Stock = `Current Quantity` of the FIRST location in the header; tracked when that cell is a whole number. More than one location with stock: warning `SQUARE_LOCATION_STOCK` naming the location used. `Price <loc>` different from Price: warning `SQUARE_LOCATION_PRICE`. `Enabled <loc>` = N: warning `SQUARE_LOCATION_DISABLED`. A filled `New Quantity`: warning (ignored) |
| Modifier sets `Modifier Set - <name>` = Y | Help 5153 and file A | Not carried: warning `SQUARE_MODIFIERS_NOT_MOVED` with the count of items and set names |
| Taxes `Tax - <name> (<rate>%)` | Help 5153, header B and D | Not carried: info `SQUARE_TAXES_NOT_MOVED` |
| Item Type | Glossary: Standard, Prepared food and beverage, Physical good, Event, Digital, Other, Bundle, Service, Donation; blank = Standard. File A: "Prepared food and beverage", "Physical good" | Digital, Service, Event, Donation: no shipping, warning `SQUARE_ITEM_TYPE` with count. Digital also `DOWNLOAD_FILES_NOT_MOVED`. Bundle: warning (components not linked) |
| Images | No image column in any real header; a Square moderator says images "will need to be done manually via the item library and are not able to be edited via spreadsheet" (same community thread) | Warning `SQUARE_NO_IMAGES` on every file: images must be added after import |
| Description HTML | Glossary: "Exported descriptions for rich-text items include HTML tags" | Kept as HTML when it has tags; plain text becomes paragraphs |
| Default Unit Cost | Header C | Cost per item |
| GTIN, SKU, SEO Title, SEO Description, Permalink | Headers A to D; file A Permalink "beef_n_lamb_doner_rice_bowl" | GTIN = barcode, Permalink = URL handle (slugified) |
| Unit and Precision | Header D; help: units cannot be set by import | Any value: warning `SQUARE_UNIT_PRICING`, the price is carried as a per-item price |
| Shipping Enabled N | File A: "N" on restaurant items | Not used to switch shipping off (an untouched retail export would otherwise lose shipping); info `SQUARE_FIELDS_DROPPED` lists it when set |
| Reference Handle | Header D; community: "used to reference variations within the import/export file" https://community.squareup.com/t5/Archived-Discussions-Read-Only/What-is-the-new-reference-handle-column-in-the-item-catalog-used/m-p/357366 | Ignored (per variation, not per item) |

Dropped with an info list when used: Social Media Link Title/Description, Self-serve Ordering Enabled, Delivery Enabled, Pickup Enabled, Shipping Enabled, Sellable, Stockable, Contains Alcohol, Skip Detail Screen in POS, Auto Add Item to Check, Default Vendor Name, Default Vendor Code, Stock Alert columns.

## Unverified (said on the page and in code)
- Meaning of Online Sale Price and of the "unavailable" visibility.
- Option Name 2 and higher (pattern-read).
- Grouping depends on Square writing a product's variation rows next to each other (file A does; Square documents no order).
