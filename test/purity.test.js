import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseProducts } from '../index.js';

// The engine must run unchanged in a browser Web Worker: no Node built-ins,
// no Buffer, no process, no require in index.js or src/.
test('src/ and index.js use no Node-only APIs', () => {
  const files = ['../index.js', ...readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => `../src/${f}`)];
  for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/from ['"]node:|\bBuffer\b|\bprocess\.|\brequire\(|from ['"](fs|path|os)['"]/.test(code), `${f} uses a Node-only API`);
  }
});

test('etsy: translated (German) headers are recognised and refused with a clear message', () => {
  const text = 'TITEL,BESCHREIBUNG,PREIS,WÄHRUNGSCODE,STÜCKZAHL,TAGS,BILD1\nTasse,Eine Tasse,10.00,EUR,1,tasse,https://i.etsystatic.com/x.jpg\n';
  // Review F10: zero products is an error, carrying the reason.
  assert.throws(() => parseProducts(text, { source: 'etsy' }), (e) => e.code === 'NO_PRODUCTS' && /Switch your Etsy account language to English/.test(e.message));
  assert.throws(() => parseProducts(text), (e) => /Switch your Etsy account language to English/.test(e.message));
});

test('etsy: optional LISTING_ID column and old 5-image exports without SKU parse by name', () => {
  const text = 'TITLE,DESCRIPTION,PRICE,CURRENCY_CODE,QUANTITY,TAGS,MATERIALS,IMAGE1,IMAGE2,IMAGE3,IMAGE4,IMAGE5,"VARIATION 1 TYPE","VARIATION 1 NAME","VARIATION 1 VALUES","VARIATION 2 TYPE","VARIATION 2 NAME","VARIATION 2 VALUES",LISTING_ID\nCard,Greeting card,4.00,USD,9,card,,https://i.etsystatic.com/a.jpg,,,,,,,,,,,1234567890\n';
  const r = parseProducts(text);
  assert.equal(r.sourceId, 'etsy');
  assert.equal(r.products[0].variants[0].sku, '');
  assert.equal(r.products[0].source.listingId, '1234567890');
});
