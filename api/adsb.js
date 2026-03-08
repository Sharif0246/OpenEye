// api/adsb.js — Vercel Serverless Function
// Proxies ADSB.lol aviation data to bypass browser CORS restrictions.
// Deployed on Vercel's servers (trusted) → no CORS block.

export default async function handler(req, res) {
  // Allow requests from your GitHub Pages site (and localhost for testing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const response = await fetch('https://api.adsb.lol/v2/all', {
      headers: {
        'User-Agent': 'OpenEye-Tactical/4.0',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`ADSB.lol responded with ${response.status}`);
    }

    const data = await response.json();

    // Return the data with proper headers
    res.status(200).json(data);

  } catch (error) {
    res.status(502).json({
      error: 'Proxy fetch failed',
      message: error.message,
      ac: [],
      total: 0,
    });
  }
}
