// Every source fixture x every destination shipped.
export const FIXTURES = ['etsy-listings', 'shopify-export', 'shopify-legacy', 'woocommerce-export', 'squarespace-export', 'wix-classic', 'wix-v3'];
export const TARGETS = ['shopify', 'woocommerce'];
export const PAIRS = FIXTURES.flatMap((fixture) => TARGETS.map((to) => ({ fixture, to, options: {} })));
