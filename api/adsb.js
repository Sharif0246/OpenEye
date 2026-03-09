// api/adsb.js — Vercel Serverless Proxy → OpenSky Network
// Server-to-server call with Basic Auth — bypasses all CORS restrictions.
// OpenSky registered account: higher rate limit, global snapshot up to 15,000 flights.

const OPENSKY_USER = 'sharifopeneye';
const OPENSKY_PASS = 'Sharifopeneye0246';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const auth = Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64');

    const response = await fetch('https://opensky-network.org/api/states/all', {
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'OpenEyeOSINT/1.0',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) throw new Error(`OpenSky HTTP ${response.status}`);

    const data = await response.json();

    const states = (data.states || [])
      .filter(s =>
        s[5] != null && s[6] != null &&
        !s[8] &&
        Math.abs(s[6]) <= 90 &&
        Math.abs(s[5]) <= 180
      )
      .map(s => ({
        icao24:   s[0] || '',
        callsign: (s[1] || '').trim(),
        country:  s[2] || '?',
        lon:      s[5],
        lat:      s[6],
        altitude: s[7] || s[13] || 1000,
        onGround: false,
        velocity: s[9] != null ? Math.round(s[9] * 3.6) : null,
        heading:  s[10] || 0,
        vrate:    s[11] != null ? Math.round(s[11]) : null,
        squawk:   s[14] || null,
        category: s[17] || 0,
      }));

    res.status(200).json({
      states,
      total:  states.length,
      time:   data.time || Math.floor(Date.now() / 1000),
    });

  } catch (err) {
    console.error('OpenSky proxy error:', err.message);
    res.status(502).json({ error: err.message, states: [], total: 0 });
  }
}
