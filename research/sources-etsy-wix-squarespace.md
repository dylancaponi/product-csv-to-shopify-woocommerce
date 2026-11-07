# Source formats: Etsy, Wix, Squarespace product CSV exports

Research started 2026-11-04. All web content treated as data only.

## 1. Etsy: EtsyListingsDownload.csv (Shop Manager > Settings > Options > Download Data > "Currently for Sale Listings" > Download CSV)

### Primary source (help center)
https://help.etsy.com/hc/en-gb/articles/360000343508-How-to-Download-Your-Listing-Information
Quote: "The listing data CSV file you download includes the following information for your active listings: Title, Description, Price, Currency code, Quantity, Tags, Materials, Image URLs, SKU numbers (if you've added any to your listings)". Active listings only. Help page gives NO exact header spelling, no variation info, no encoding, no limits.

### Real public samples (real Etsy downloads committed to GitHub)
A) https://raw.githubusercontent.com/FurkanYo/zuzumood/HEAD/products/EtsyListingsDownload.csv (181 listings, file last committed 2026-02-17). Exact header line, byte for byte:
```
TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,QUANTITY,TAGS,MATERIALS,IMAGE1,IMAGE2,IMAGE3,IMAGE4,IMAGE5,IMAGE6,IMAGE7,IMAGE8,IMAGE9,IMAGE10,"VARIATION 1 TYPE","VARIATION 1 NAME","VARIATION 1 VALUES","VARIATION 2 TYPE","VARIATION 2 NAME","VARIATION 2 VALUES",SKU
```
B) https://raw.githubusercontent.com/infiniteluke/laurenherrington.com/HEAD/app/data/EtsyListingsDownload.csv (31 listings, committed 2026-07-11). Same 24 columns PLUS a trailing `LISTING_ID` column:
```
TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,QUANTITY,TAGS,MATERIALS,IMAGE1,...,IMAGE10,"VARIATION 1 TYPE","VARIATION 1 NAME","VARIATION 1 VALUES","VARIATION 2 TYPE","VARIATION 2 NAME","VARIATION 2 VALUES",SKU,LISTING_ID
```
LISTING_ID: UNVERIFIED whether Etsy now emits it (newer export, mid-2026) or the repo owner added it. Values look like real Etsy listing ids (e.g. 4530026511). Parser should accept it optionally.
Older samples (OpenBazaar importers, ~2016: hoffmabc/openbazaar-etsy-import listings.csv) show only IMAGE1..IMAGE5 and no SKU, so older exports differ: parse by header name, not position.
Several third-party parsers (austinshin/portfolio App.tsx, ArtifactOwl export_etsy.py, Duncan-Haywood etsy-listing-csv-check) use the same 24-name list.

### Observations from parsing sample A (python csv module)
- Encoding: UTF-8, no BOM, LF line endings, standard RFC4180 quoting (multi-line descriptions quoted, `""` escapes). Contains non-ASCII (Turkish dotted I) fine as UTF-8.
- The VARIATION column headers themselves are quoted (because of spaces), other headers bare.
- TAGS: comma-separated inside one quoted cell, no space after comma, e.g. `"Vintage,Love,rainbow"`; Etsy multi-word tags appear with underscores in sample A (`bride_sweatshirt,...`) or spaces in other files. MATERIALS: same comma separation (`"Magazine paper,Decorative paper"`).
- VARIATION n VALUES: comma-separated list in one cell, e.g. `Sweatshirt XS,Sweatshirt S,...`. Values can contain spaces and "/" (`Sand / Ivory`); a value containing a comma would be ambiguous (no escaping). VARIATION n TYPE is Etsy's property type (e.g. `Unisex shirt size`, `Color`), VARIATION n NAME is the display name (`Size`, `Primary color`).
- Only 2 variations max. ONE row per listing; no per-variation price, quantity or SKU. PRICE and QUANTITY are listing-level (with variations, PRICE appears to be a single price, QUANTITY e.g. 444 total). SKU is a single value per listing (`Myshop179`), presumably listing-level/first SKU: UNVERIFIED how Etsy chooses it when variants have different SKUs.
- IMAGE1..IMAGE10: one full URL per column (https://i.etsystatic.com/.../il_fullxfull....jpg), empty cells for unused.
- Localization: an exported file from a German-language shop has GERMAN headers (TITEL, BESCHREIBUNG, PREIS, WÄHRUNGSCODE, STÜCKZAHL, TAGS, MATERIALIEN, BILD1-BILD10, VARIATIONSTYP/-NAME/-WERT 1-2, BESTANDSEINHEIT), per xXJimnyCricketXx/wonderland-erp docs/konzept.md (secondary, UNVERIFIED exact spelling). Engine should detect non-English headers and either map known locales or reject with a clear message ("switch Etsy language to English and re-download").

## 2. Wix Stores product export (file name in real exports: catalog_products.csv)

There are TWO incompatible formats in the wild. Detect by first header: `handleId` = legacy (Catalog V1), `handle` = new catalog (V3). Both start with a UTF-8 BOM.

### 2a. Legacy Wix Stores (Catalog V1) export

Primary source (import help, which documents the same columns the export produces):
https://support.wix.com/en/article/wix-stores-importing-products-to-wix-stores
Help states (paraphrased by fetch tool, key phrases quoted): handleId and fieldType required on all rows; fieldType "Product or Variant"; "Variants of a product must have the same handleId as the product"; name and price blank for variants; product rows list all option choices separated by semicolons, variant rows hold the single matching choice; `surcharge` = variant price difference from product price; images up to 15 per product, separated by semicolons with no space; collections separated by semicolons (exclude "All products"); productOptionType must be COLOR or DROP_DOWN (case sensitive); COLOR choices like `#ffffff:white;#000000:black` or `RGB(255, 165, 0):Orange`; max 6 options; DROP_DOWN choice max 20 chars; 5,000 rows per CSV; name 80 chars, description 8,000 chars, sku 40 chars unique; visible TRUE/FALSE (blank=TRUE); inventory InStock/OutOfStock/number; discountMode AMOUNT/PERCENT; max 2 custom text fields, char limit 1-500; non-Latin characters "may not upload correctly" (re-save via Google Sheets); digital products not exportable/importable.
Export help: https://support.wix.com/en/article/wix-stores-exporting-your-product-list ("You can export up to 5,000 rows per CSV file", "Exporting digital products is not currently supported.")

Real exports on GitHub (BOM-prefixed, which a hand-written file would not have):
- https://raw.githubusercontent.com/persiusW/miss-tokyo-site/HEAD/catalog_products.csv (212 Product + 1246 Variant rows)
- https://raw.githubusercontent.com/Shamzbruv/Foryou-Skin-Bar/HEAD/catalog_products%20(5).csv (50 Product + 59 Variant)
- https://raw.githubusercontent.com/lpopek/RufConfigurator/HEAD/resources/catalog_products.csv (195 Product)
Plus ~10 more identical headers found via GitHub code search (TymorIbrahim/ShulaWebApp2, lavague11/lavague-imports, Dent-al/..., 21saul/...).
Exact header (53 columns, preceded by BOM EF BB BF):
```
handleId,fieldType,name,description,productImageUrl,collection,sku,ribbon,price,surcharge,visible,discountMode,discountValue,inventory,weight,cost,productOptionName1,productOptionType1,productOptionDescription1,productOptionName2,productOptionType2,productOptionDescription2,productOptionName3,productOptionType3,productOptionDescription3,productOptionName4,productOptionType4,productOptionDescription4,productOptionName5,productOptionType5,productOptionDescription5,productOptionName6,productOptionType6,productOptionDescription6,additionalInfoTitle1,additionalInfoDescription1,additionalInfoTitle2,additionalInfoDescription2,additionalInfoTitle3,additionalInfoDescription3,additionalInfoTitle4,additionalInfoDescription4,additionalInfoTitle5,additionalInfoDescription5,additionalInfoTitle6,additionalInfoDescription6,customTextField1,customTextCharLimit1,customTextMandatory1,customTextField2,customTextCharLimit2,customTextMandatory2,brand
```
(One older template, olicantropo/ProductPanda Wix_Templates_Products_CSV.csv, has only customTextField1..Mandatory1 then brand, i.e. 50 columns: parse by name.)

Observed in real exports:
- UTF-8 with BOM, LF line endings, RFC4180 quoting.
- fieldType values exactly `Product` / `Variant`. Variant rows follow their product row and share handleId (e.g. `product_b0711b90-4d8e-...`).
- Variant rows populate only: handleId, fieldType, sku, visible, inventory, weight, cost, surcharge, productOptionDescription1..N (single choice). name, price, productOptionName/Type are BLANK on variant rows; match choices positionally to product row productOptionName{n}.
- Variant price = product price + surcharge (surcharge e.g. `1200.0`, blank = 0).
- productImageUrl: semicolon-separated Wix media IDs, NOT URLs, e.g. `7ee6d5_6f58...~mv2.jpeg;7ee6d5_1c41...~mv2.jpeg`. To build a fetchable URL prefix `https://static.wixstatic.com/media/` (UNVERIFIED in help text, but this is the standard Wix static media host). One sample had an ID missing its extension (`a4c79b_9550d7fc...` no `~mv2.png`): handle gracefully.
- collection: semicolon-separated names, e.g. `Two Piece;Deals 2 for 150;Night Wear`.
- productOptionDescription on product row: semicolon list; COLOR type entries are `color:label`, color as `rgb(255,121,0)` or `#ffc0cb` (note rgb() contains commas, so split on `;` then on the LAST `:`).
- description and additionalInfoDescription are HTML (`<p>...</p>`).
- visible: `true`/`false` lowercase in exports. inventory on product rows: `InStock` or a number; variant rows: number. Prices like `80.0`. discountMode `PERCENT`/`AMOUNT`, discountValue e.g. `0.0`.

### 2b. New Wix catalog (V3, "brand-new product creation page") export

Primary source: https://support.wix.com/en/article/wix-stores-updating-products-by-exporting-and-importing-them
Help: "We're in the process of releasing a brand-new product creation page." Each image/video gets its own row; each variant gets its own row; fieldType is PRODUCT, VARIANT or MEDIA (case-sensitive); "The row order determines the media display order on your site."; media IDs added on export, URLs allowed for new media; categories and option choices separated by semicolons ("Small;Medium;Large", "#FFFFFF:White;#808080:Grey"); variant rows take a single choice; inventory IN_STOCK / OUT_OF_STOCK / number; limits: name 80, description 16,000, ribbon 30, brand 50, sku 40, barcode 40 unique, option names 50; file 15 MB, 10,000 rows (rest skipped). Column list per help: handle, fieldType, name, visible, plainDescription, categorySlugs, primaryCategorySlug, media, mediaAltText, ribbon, brand, price, strikethroughPrice, baseUnit, baseUnitMeasurement, totalUnits, totalUnitsMeasurement, cost, inventory, preOrderEnabled, preOrderMessage, preOrderLimit, sku, barcode, weight, packageLength, packageWidth, packageHeight, packageUnit, productOptionName[1], productOptionType[1], productOptionChoices[1], modifierName[1], modifierType[1], modifierCharLimit[1], modifierMandatory[1], modifierDescription[1].

Real exports (BOM-prefixed):
- https://raw.githubusercontent.com/wprgtmo/dreyes/HEAD/addons/dreyes/dreyes_products/catalog_products.csv (93 cols; 250 PRODUCT + 230 MEDIA):
```
handle,fieldType,name,visible,plainDescription,categorySlugs,primaryCategorySlug,media,mediaAltText,ribbon,brand,price,strikethroughPrice,cost,inventory,preOrderEnabled,preOrderMessage,preOrderLimit,sku,barcode,weight,baseUnit,baseUnitMeasurement,totalUnits,totalUnitsMeasurement,productOptionName1,productOptionType1,productOptionChoices1,...,productOptionName6,productOptionType6,productOptionChoices6,modifierName1,modifierType1,modifierCharLimit1,modifierMandatory1,modifierDescription1,...,modifierName10,modifierType10,modifierCharLimit10,modifierMandatory10,modifierDescription10
```
- https://raw.githubusercontent.com/sisovin/lokldo-shop/HEAD/public/catalog_products.csv (91 cols): same but WITHOUT categorySlugs,primaryCategorySlug.
- Wix V3 template-like sample: https://raw.githubusercontent.com/walkidni/shelfshift/HEAD/csv_examples/wix.csv (91 cols, column ORDER differs: baseUnit..totalUnitsMeasurement come BEFORE cost).
- None of the samples contain packageLength/Width/Height/Unit (help lists them; probably newer or only when enabled). UNVERIFIED.
=> V3 column set and order VARIES by site/version. Parser must map by header name, never by position, and treat numbered groups (productOption 1-6, modifier 1-10) dynamically.

Observed V3 structure:
- PRODUCT row: name, visible, plainDescription (HTML despite the name), categorySlugs (`appliances;latin-flavors`, slugs not names), ribbon, brand, price, cost, inventory `IN_STOCK`, sku (simple products), productOptionName/Type/Choices with semicolon list.
- VARIANT rows (omen-agent and shelfshift samples): same handle, carry their own price, strikethroughPrice, cost, inventory, sku, weight, plus productOptionName{n}, productOptionType{n} and a single productOptionChoices{n} value (label only, e.g. `white`, not `#FFFFFF:white`). So V3 has real per-variant price (not surcharge).
- MEDIA rows: handle, fieldType=MEDIA, media = one Wix media ID (`fc80e7_e83f...~mv2.png`), optional mediaAltText. In real exports the product row's own media cell was empty; all images came as MEDIA rows following the product. Order = display order.
- Option types seen: TEXT_CHOICES, SWATCH_CHOICES (swatch choices `#800080:purple`). Help's legacy COLOR/DROP_DOWN do not apply here.
- visible/preOrderEnabled seen as `true`/`false` and `TRUE`/`FALSE`: compare case-insensitively.

## 3. Squarespace product export (Commerce > Products > Export all; real file names look like products_Nov-01_08-14-28PM.csv)

### Primary sources
Import help: https://support.squarespace.com/hc/en-us/articles/115000378108
- Troubleshooting: first cell should read "Product ID [Non Editable]".
- Columns described: Product ID, Variant ID, Product Type, Product Page, Product URL, Title, Description, SKU, GTIN, MPN, Option names/values, Price, Sale Price, On Sale, Stock, Categories, Tags, Weight, Length, Width, Height, Visible, Hosted Image URLs.
- Variants: "only add the title to the first product row" (same for description, categories, tags, visibility, image URLs); each additional row = one option combination. Up to 250 variants per product.
- Separators: Categories comma-separated, lowercase URL slug with leading slash (e.g. /clothing/blouses); Tags comma-separated; Hosted Image URLs separated by spaces or line breaks.
- Values: Product Type Physical or Service (download products cannot be imported); Visible Yes/No; On Sale Yes/No; Stock number or "unlimited"; Price numbers only, 2 decimals, max 1,000,000. Limits: Title 200, SKU 60, Tag 80 each, Category 25 each, Product URL 3-200 chars; 10,000 products (7.1), 200 (7.0).
- Help mentions only 3 option sets; real exports have 6 (see below). Help is out of date on that point.
Export help: https://support.squarespace.com/hc/en-us/articles/360000694948
- "The export .csv option uses the same format as our import .csv, with an additional column for pages." Exports physical and service products, up to 10,000. Export EXCLUDES: additional product information, customer reviews, featured images, product image alt text, variant images.

### Real exports on GitHub
Two header versions exist. Both: every header cell double-quoted, no BOM (first bytes `"Pr`), UTF-8 (curly quotes, "×" intact), LF line endings.

Older (no GTIN/MPN), 32 columns: https://raw.githubusercontent.com/mrbrandonmills/Webdesigner/HEAD/products_Nov-01_08-14-28PM.csv (committed 2025-11-02); also alanranger/schema-tools inputs-files/products_Nov-02_11-15-24AM.csv, uberboutique/ss
```
"Product ID [Non Editable]","Variant ID [Non Editable]","Product Type [Non Editable]","Product Page","Product URL","Title","Description","SKU","Option Name 1","Option Value 1","Option Name 2","Option Value 2","Option Name 3","Option Value 3","Option Name 4","Option Value 4","Option Name 5","Option Value 5","Option Name 6","Option Value 6","Price","Sale Price","On Sale","Stock","Categories","Tags","Weight","Length","Width","Height","Visible","Hosted Image URLs"
```
Newer (GTIN, MPN after SKU), 34 columns: https://raw.githubusercontent.com/sllim126/pokemon-momentum/HEAD/products_Apr-09_04-31-18PM.csv (committed 2026-05-20); also alanranger/alan-shared-resources csv/raw-01-products-sqsp-export.csv
```
"Product ID [Non Editable]","Variant ID [Non Editable]","Product Type [Non Editable]","Product Page","Product URL","Title","Description","SKU","GTIN","MPN","Option Name 1","Option Value 1","Option Name 2","Option Value 2","Option Name 3","Option Value 3","Option Name 4","Option Value 4","Option Name 5","Option Value 5","Option Name 6","Option Value 6","Price","Sale Price","On Sale","Stock","Categories","Tags","Weight","Length","Width","Height","Visible","Hosted Image URLs"
```
Parse by header name; GTIN/MPN optional.

### Observed structure
- First row of a product = product fields AND its first variant (Product ID, Variant ID, Product Type, Product Page, Product URL, Title, Description, SKU, Option Name/Value of variant 1, Price, Sale Price, On Sale, Stock, Categories, Tags, dims, Visible, Hosted Image URLs).
- Following variant rows: Product ID, Product Type, Product Page, Title, Description, Categories, Tags, Visible, Hosted Image URLs all BLANK. They carry only Variant ID, SKU, Option Name n, Option Value n (single value), Price, Sale Price, On Sale, Stock, Weight/Length/Width/Height. Group variants by "most recent row with a Product ID". Option Name repeats on every variant row.
- Product Type values in exports are UPPERCASE: `PHYSICAL`, `SERVICE` (help says Physical/Service).
- Hosted Image URLs: space-separated full URLs on https://images.squarespace-cdn.com/content/v1/<siteId>/<...>/<file>.jpg; no newlines seen in samples but help allows line breaks, so split on any whitespace. No variant images in export.
- Categories: comma+space separated; seen both `/booster-pack/english` (slash path) and bare slugs `photography-classes, photography-courses` (older). Tags: comma+space separated (`English, Booster Pack, Phantasmal Flames`).
- Stock: integer or `Unlimited` (capital U in export). Sale Price `0.00` when not on sale; On Sale `Yes`/`No`. Visible `Yes`/`No`. Weight etc. `0.0`.
- Description: HTML (`<p style="white-space:pre-wrap;" ...>`), sometimes plain text.
- "Product Page" = the store page slug (e.g. `shop`, `merch`); "Product URL" = product slug.

---

# Summary for the engine

## Etsy (EtsyListingsDownload.csv): CONFIRMED (real exports)
- Header (exact, in order): `TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,QUANTITY,TAGS,MATERIALS,IMAGE1,IMAGE2,IMAGE3,IMAGE4,IMAGE5,IMAGE6,IMAGE7,IMAGE8,IMAGE9,IMAGE10,VARIATION 1 TYPE,VARIATION 1 NAME,VARIATION 1 VALUES,VARIATION 2 TYPE,VARIATION 2 NAME,VARIATION 2 VALUES,SKU` (+ optional trailing `LISTING_ID`, UNVERIFIED origin). Older exports: IMAGE1..5 only, no SKU.
- Source: https://raw.githubusercontent.com/FurkanYo/zuzumood/HEAD/products/EtsyListingsDownload.csv ; help https://help.etsy.com/hc/en-gb/articles/360000343508-How-to-Download-Your-Listing-Information
- Variants: NOT rows. Up to 2 variation dimensions, each as TYPE/NAME/VALUES; VALUES comma-separated. No per-variant price, qty or SKU (one PRICE, QUANTITY, SKU per listing). Engine must expand the cartesian product of the two lists and give every variant the listing price/qty, flag "per-variant price/stock not in export".
- Images: one URL per IMAGEn column, up to 10.
- Separators: TAGS, MATERIALS, VARIATION n VALUES all comma, no escaping.
- Encoding: UTF-8, no BOM, LF. Headers localized for non-English shops (German example): detect and handle.

## Wix legacy (Catalog V1), first header `handleId`: CONFIRMED (help + many real exports)
- Header: `handleId,fieldType,name,description,productImageUrl,collection,sku,ribbon,price,surcharge,visible,discountMode,discountValue,inventory,weight,cost,productOptionName1,productOptionType1,productOptionDescription1,...(through 6),additionalInfoTitle1,additionalInfoDescription1,...(through 6),customTextField1,customTextCharLimit1,customTextMandatory1,customTextField2,customTextCharLimit2,customTextMandatory2,brand` (53 cols).
- Source: https://raw.githubusercontent.com/persiusW/miss-tokyo-site/HEAD/catalog_products.csv ; help https://support.wix.com/en/article/wix-stores-importing-products-to-wix-stores
- Variants: rows with fieldType=`Variant` sharing handleId; carry sku, visible, inventory, weight, cost, surcharge, productOptionDescription n (single choice). Variant price = product price + surcharge.
- Images: `productImageUrl` semicolon-separated Wix media IDs (prefix https://static.wixstatic.com/media/ to fetch, UNVERIFIED from help).
- Separators: `;` for images, collections, option choices; COLOR choices `color:label` (color may be `rgb(r,g,b)` or `#hex`).
- Encoding: UTF-8 with BOM, LF. 5,000 rows per export.

## Wix new catalog (V3), first header `handle`: CONFIRMED structure, column ORDER VARIES
- Columns (names confirmed from help + real exports): handle, fieldType, name, visible, plainDescription, [categorySlugs, primaryCategorySlug], media, mediaAltText, ribbon, brand, price, strikethroughPrice, cost, inventory, preOrderEnabled, preOrderMessage, preOrderLimit, sku, barcode, weight, baseUnit, baseUnitMeasurement, totalUnits, totalUnitsMeasurement, [packageLength, packageWidth, packageHeight, packageUnit: help only, not seen], productOptionName/Type/Choices 1-6, modifierName/Type/CharLimit/Mandatory/Description 1-10. Map by name only.
- Source: https://raw.githubusercontent.com/wprgtmo/dreyes/HEAD/addons/dreyes/dreyes_products/catalog_products.csv ; help https://support.wix.com/en/article/wix-stores-updating-products-by-exporting-and-importing-them
- Variants: fieldType=`VARIANT` rows with own price, strikethroughPrice, cost, inventory, sku, weight, and single choice per productOptionChoices n.
- Images: fieldType=`MEDIA` rows, one media ID each in `media`, ordered.
- Separators: `;` for categorySlugs and option choices; swatch `#hex:label`. fieldType PRODUCT/VARIANT/MEDIA uppercase; inventory IN_STOCK/OUT_OF_STOCK/number. UTF-8 BOM. Limit 10,000 rows / 15 MB.

## Squarespace: CONFIRMED (help + real exports)
- Header (current, 34 cols): `Product ID [Non Editable],Variant ID [Non Editable],Product Type [Non Editable],Product Page,Product URL,Title,Description,SKU,GTIN,MPN,Option Name 1,Option Value 1,...,Option Name 6,Option Value 6,Price,Sale Price,On Sale,Stock,Categories,Tags,Weight,Length,Width,Height,Visible,Hosted Image URLs`. Older (32 cols) lacks GTIN,MPN.
- Source: https://raw.githubusercontent.com/sllim126/pokemon-momentum/HEAD/products_Apr-09_04-31-18PM.csv and https://raw.githubusercontent.com/mrbrandonmills/Webdesigner/HEAD/products_Nov-01_08-14-28PM.csv ; help https://support.squarespace.com/hc/en-us/articles/115000378108 and https://support.squarespace.com/hc/en-us/articles/360000694948
- Variants: first row = product + variant 1; following rows have blank Product ID/Title/etc. and only variant fields (Variant ID, SKU, Option Name/Value n, Price, Sale Price, On Sale, Stock, dims). Real per-variant price, stock and SKU.
- Images: `Hosted Image URLs` whitespace-separated full CDN URLs on the first row only; no variant images, no alt text, no featured image in export.
- Separators: Categories and Tags comma (comma+space in exports); categories may be `/a/b` paths or bare slugs.
- Encoding: UTF-8, no BOM, all fields quoted in header, LF. Product Type exported uppercase (PHYSICAL/SERVICE). Stock number or `Unlimited`. Max 10,000 products, 250 variants/product.

## Not confirmed
- Etsy LISTING_ID column provenance; how Etsy picks the single SKU for multi-SKU listings; exact localized header spellings.
- Wix: static media URL prefix (convention, not in help); V3 package* columns (help only).
- Nothing was left fully unconfirmed: all three formats have parseable confirmed headers.
