# BigCommerce product export: layout used by the engine

Researched 2026-11-05 evening. Primary sources only.

## Verified: modern Import/Export (v3) layout. SUPPORTED.
- BigCommerce help, Modern Import/Export overview (links the sample template): https://support.bigcommerce.com/articles/en_US/Knowledge/Modern-Import-Export-Overview
- BigCommerce's sample file (downloaded, 119 rows: 13 Product, 57 Variant, 48 Image): https://storage.googleapis.com/bigcommerce-production-dev-center/Knowledge%20Base/Products/Import%20Export%20v3%20Guide/v3-product-import-template.csv
- Field meanings: https://support.bigcommerce.com/articles/en_US/Knowledge/Supported-Product-Fields
- Options syntax, blank variant Price and Weight: https://support.bigcommerce.com/articles/en_US/Knowledge/Importing-Complex-Attributes

Header row (exact, from the sample):
```
Item,ID,Name,Type,SKU,Options,"Inventory Tracking","Current Stock","Low Stock",Price,"Cost Price","Retail Price","Sale Price","Brand ID",Channels,Categories,Description,"Custom Fields","Page Title","Product URL","Meta Description","Search Keywords","Meta Keywords","Bin Picking Number",UPC/EAN,"Global Trade Number","Manufacturer Part Number","Free Shipping","Fixed Shipping Cost",Weight,Width,Height,Depth,"Is Visible","Is Featured",Warranty,"Tax Class","Product Condition","Show Product Condition","Sort Order","Variant Image URL","Internal Image URL (Export)","Image URL (Import)","Image Description","Image is Thumbnail","Image Sort Order","YouTube ID","Video Title","Video Description","Video Sort Order"
```
Row shapes (sample): a `Product` row, then its `Variant` rows, then its `Image` rows (the sample interleaves P, V..., I...). Help: Item is "Product", "Variant", "Image" or "Video" (case-sensitive).

Field meanings (help, quoted or close paraphrase):
- Type: physical or digital.
- Inventory Tracking: none, product or variant. Current Stock: numbers only, only when tracking.
- Price: base price. Sale Price: "if entered, it will replace the base price". Retail Price: MSRP, "will appear next to your base or sale price". The sample writes 0.00 when there is no sale or retail price.
- Variant row Price: "Leave the Price field blank if you want the variant to have the same price as the base product." Variant Weight: "Leave blank if the weight is the same as the base product." Variant Sale Price: blank meaning not stated.
- Weight: "numbers only; no units". The unit is not in the file (store setting).
- Is Visible: TRUE / FALSE.
- Categories: "Type in the category's ID only, not its name", semicolon-separated (sample: 23;18). Brand ID: an ID number. Neither carries a name.
- Description: text or HTML. Custom Fields: JSON.
- Options (variant rows): `Type=<Radio|Dropdown|Rectangle|Swatch|Picklist|PicklistWithImages>|Name=<name>|Value=<value>`, several options "directly after each other or on separate lines in the cell"; swatch values carry `[#hex]` or `[pattern URL]` after the value. Sample: `Type=Rectangle|Name=Size|Value=XSType=Swatch|Name=Color|Value=Silver[#cccccc]`.
- Images: `Internal Image URL (Export)` (read-only, export) and `Image URL (Import)`; `Image is Thumbnail` TRUE marks the main image; `Image Sort Order` lower first. `Variant Image URL`: one image per variant.
- Modifiers are not in the CSV ("The modifier option itself is not represented in CSV imports/exports"), so there is nothing in the file to warn about per product; the pages say modifiers and rules do not move.

## Verified but NOT supported: legacy "Bulk Edit" export
- Help (links the sample): https://support.bigcommerce.com/articles/en_US/Knowledge/Legacy-Import-Export-Overview
- Sample header (downloaded): https://storage.googleapis.com/bigcommerce-production-dev-center/Knowledge%20Base/Products/Import%20Export%20v2%20Guide/bulk-edit-product-import-template.csv
  `Item Type,Product ID,Product Name,Product Type,Product Code/SKU,Bin Picking Number,Brand Name,Option Set,Option Set Align,Product Description,Price,Cost Price,Retail Price,Sale Price,...,Product Weight,...,Allow Purchases?,Product Visible?,Product Availability,Track Inventory,Current Stock Level,Low Stock Level,Category,Product Image ID - 1,Product Image File - 1,...`
- Refused with a message naming the layout (code UNSUPPORTED_LAYOUT) when 5 of: Item Type, Product Name, Product Code/SKU, Option Set, Product Visible?, Track Inventory, Current Stock Level are present. Reason: its SKU and Rule rows and option format were not researched tonight.

## Our readings (not stated by BigCommerce)
- Sale Price 0.00 or blank = no sale. A sale lower than the price becomes price + compare-at price.
- With no sale, a Retail Price higher than the price becomes the compare-at price.
- Blank variant Price: the variant takes the product's price and the product's sale price. A variant with its own Price uses only its own Sale Price.
- Inventory Tracking product on a product with more than one variant: stock cannot be split, so variants are untracked with a STOCK_NOT_SPLIT warning (same choice as Etsy).
- Is Visible FALSE becomes status draft.
- Product URL "/x/" becomes the handle "x".
- The parent product's own SKU is not kept for products with variants (the model has no product-level SKU); the WooCommerce writer gives the parent a made-up SKU, as for other sources.
