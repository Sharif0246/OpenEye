// api/tle.js — Vercel Serverless Proxy → Celestrak TLE Groups
// Bypasses ISP-level blocks on celestrak.org
// Usage: /api/tle?group=stations  →  returns JSON array of TLE objects
// Cache: 1 hour (Celestrak updates TLEs every few hours)

const ALLOWED_GROUPS = new Set([
  'stations','weather','noaa','goes','resource','sarsat','dmc','tdrss',
  'argos','planet','spire','geo','intelsat','ses','iridium','iridium-NEXT',
  'orbcomm','globalstar','swarm','amateur','x-comm','other-comm',
  'gps-ops','glo-ops','galileo','beidou','sbas','nnss','musson',
  'science','geodetic','engineering','military','radar','cubesat','other',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache for 1 hour on Vercel CDN
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const group = (req.query.group || '').trim();
  const groupLower = group.toLowerCase();
  // Find the actual group name case-insensitively
  const actualGroup = [...ALLOWED_GROUPS].find(g => g.toLowerCase() === groupLower) || group;

  if (!group || !ALLOWED_GROUPS.has(actualGroup)) {
    return res.status(400).json({ error: `Unknown group: "${group}"` });
  }

  try {
    const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${actualGroup}&FORMAT=JSON`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OpenEyeOSINT/1.0 (https://sharif0246.github.io/OpenEye)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`Celestrak HTTP ${response.status}`);

    const text = await response.text();
    if (!text || text.trim().length < 10) throw new Error('Empty response');

    // Parse and validate
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      throw new Error('Celestrak returned invalid JSON');
    }

    if (!Array.isArray(data)) throw new Error('Expected JSON array');
    if (data.length === 0) throw new Error('Empty group array');

    // Return the raw Celestrak JSON array
    // Each object has: OBJECT_NAME, NORAD_CAT_ID, TLE_LINE1, TLE_LINE2, EPOCH, etc.
    res.status(200).json(data);

  } catch (err) {
    console.error(`TLE proxy error for group "${group}":`, err.message);
    res.status(502).json({ error: err.message });
  }
}
