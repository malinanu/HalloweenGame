// Loads the vendor skin (vendors/<id>/vendor.json): name, colours, collectibles, prizes.
// Pick order: ?vendor=<id> in the URL (pitch demos) -> server default (VENDOR env) -> DEFAULT_VENDOR.
import { API_BASE, DEFAULT_VENDOR, ITEM_SLOTS, ITEM_SHAPES, VENDOR_ID } from './config.js';

export let VENDOR = null;

export async function loadVendor() {
  const asked = new URLSearchParams(location.search).get('vendor');
  let id = asked && VENDOR_ID.test(asked) ? asked : null;
  if (asked && !id) console.error(`Ignoring invalid vendor id "${asked}"`);
  if (!id) {
    try {
      const r = await fetch(`${API_BASE}/vendor`);
      if (r.ok) id = (await r.json()).id;
    } catch { /* static hosting: no API */ }
  }
  for (const candidate of [...new Set([id, DEFAULT_VENDOR])]) {
    if (!candidate || !VENDOR_ID.test(candidate)) continue;
    try {
      VENDOR = await fetchVendor(candidate);
      return VENDOR;
    } catch (err) {
      console.error(`Vendor "${candidate}" could not be loaded: ${err.message}`);
    }
  }
  throw new Error('No vendor could be loaded');
}

async function fetchVendor(id) {
  const base = `vendors/${id}/`;
  const res = await fetch(`${base}vendor.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`vendors/${id}/vendor.json: HTTP ${res.status}`);
  return normalizeVendor(await res.json(), id, base);
}

const HEX = /^#[0-9a-f]{6}$/i;

// Fill defaults and catch mistakes in a vendor file early, with a readable message.
export function normalizeVendor(v, id, base = '') {
  const fail = (msg) => { throw new Error(`vendor.json: ${msg}`); };
  if (!Array.isArray(v.items) || v.items.length !== ITEM_SLOTS.length) fail(`"items" must list exactly ${ITEM_SLOTS.length} collectibles`);
  const item = { one: 'treat', many: 'treats', shape: 'bag', ...(v.item || {}) };
  if (!ITEM_SHAPES.includes(item.shape)) fail(`"item.shape" must be one of ${ITEM_SHAPES.join(', ')}`);
  const colors = { primary: '#ff8a1f', secondary: '#7dff3a', ...(v.colors || {}) };
  if (!HEX.test(colors.primary) || !HEX.test(colors.secondary)) fail('"colors" must be #rrggbb values');
  const title = Array.isArray(v.title) ? v.title : [String(v.title || id)];
  return {
    id,
    title: [title[0], title.slice(1).join(' ')].filter(Boolean),
    name: title.join(' '),
    logo: v.logo ? base + v.logo : null,
    tagline: Array.isArray(v.tagline) && v.tagline.length ? v.tagline : ['COLLECT.', 'SURVIVE.', 'WIN.'],
    colors,
    item,
    label: { brand: title[0], tagline: '', ...(v.label || {}) },
    items: v.items.map((it, i) => {
      if (!it || !it.name || !HEX.test(it.color || '')) fail(`items[${i}] needs a "name" and a #rrggbb "color"`);
      return { id: ITEM_SLOTS[i], name: it.name, color: it.color, accent: HEX.test(it.accent || '') ? it.accent : '#ffffff', image: it.image ? base + it.image : null };
    }),
    prizes: { daily: 'Daily winners receive prize bundles.', weekly: 'Weekly leaders receive bigger prizes.', final: 'Final leaderboard winners receive the main prizes.', ...(v.prizes || {}) },
  };
}
