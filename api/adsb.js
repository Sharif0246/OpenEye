// api/adsb.js — Vercel Serverless Function
// Fetches 8 regional 250NM zones + military via RapidAPI ADS-B Exchange.
// Server-to-server — RapidAPI explicitly supports this. No CORS block.

const RAPIDAPI_KEY  = '70603dc003msh9b3a27ff6cf425ap1453e0jsn51f9f2226e66';
const RAPIDAPI_HOST = 'adsbexchange-com1.p.rapidapi.com';

// 8 hubs × 250NM radius covers ~85% of global commercial airspace
const HUBS = [
  { name:'NATL',  lat: 40.0, lon: -74.0 },  // New York / North Atlantic
  { name:'EURO',  lat: 51.5, lon:   0.0 },  // London / Europe
  { name:'GULF',  lat: 25.0, lon:  55.0 },  // Dubai / Gulf
  { name:'SEAS',  lat:  1.3, lon: 104.0 },  // Singapore / SE Asia
  { name:'JPKR',  lat: 35.7, lon: 139.7 },  // Tokyo / NE Asia
  { name:'SAAM',  lat:-23.5, lon: -46.6 },  // São Paulo / S America
  { name:'AUSN',  lat:-33.9, lon: 151.2 },  // Sydney / Oceania
  { name:'AFME',  lat: -1.3, lon:  36.8 },  // Nairobi / Africa
];

const HEADERS = {
  'x-rapidapi-key':  RAPIDAPI_KEY,
  'x-rapidapi-host': RAPIDAPI_HOST,
};

async function fetchHub(hub) {
  const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${hub.lat}/lon/${hub.lon}/dist/250/`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Hub ${hub.name}: HTTP ${res.status}`);
  const json = await res.json();
  return (json.ac || []).map(ac => ({ ...ac, _hub: hub.name }));
}

async function fetchMilitary() {
  const url = 'https://adsbexchange-com1.p.rapidapi.com/v2/mil/';
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Military: HTTP ${res.status}`);
  const json = await res.json();
  return (json.ac || []).map(ac => ({ ...ac, _mil: true }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // All hubs + military in parallel
    const results = await Promise.allSettled([
      ...HUBS.map(fetchHub),
      fetchMilitary(),
    ]);

    // Deduplicate by ICAO24 hex — military entry wins over civilian
    const seen = new Map();
    let ok = 0, fail = 0;

    results.forEach(r => {
      if (r.status === 'fulfilled') {
        ok++;
        r.value.forEach(ac => {
          const key = (ac.hex || '').toLowerCase().trim();
          if (!key) return;
          if (!seen.has(key) || ac._mil) seen.set(key, ac);
        });
      } else {
        fail++;
        console.error('Hub failed:', r.reason?.message);
      }
    });

    const ac = Array.from(seen.values());
    res.status(200).json({ ac, total: ac.length, now: Date.now()/1000, ok, fail });

  } catch (err) {
    res.status(502).json({ error: err.message, ac: [], total: 0 });
  }
}
