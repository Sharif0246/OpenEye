// api/adsb.js — Vercel Serverless Proxy → AirLabs Flights API
// Server-to-server call — API key never exposed to browser.
// AirLabs free tier: 1,000 req/month. Polling every 60s = ~720/month.
// Response fields: hex, flight_icao, flag, lat, lng, alt, dir, speed, v_speed, squawk, aircraft_icao

const AIRLABS_KEY = '5aec3b5f-b400-42ad-891f-c9bb278a9bc0';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache 55s — slightly under poll interval to always serve fresh data
  res.setHeader('Cache-Control', 's-maxage=55, stale-while-revalidate=10');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const url = `https://airlabs.co/api/v9/flights?api_key=${AIRLABS_KEY}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'OpenEyeOSINT/1.0' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) throw new Error(`AirLabs HTTP ${response.status}`);

    const data = await response.json();

    if (data.error) throw new Error(data.error.message || 'AirLabs error');

    // Normalize to our format — filter out on-ground and invalid positions
    const flights = (data.response || [])
      .filter(f =>
        f.lat != null && f.lng != null &&
        isFinite(f.lat) && isFinite(f.lng) &&
        Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180 &&
        f.alt > 50   // above ground
      )
      .map(f => ({
        icao24:      (f.hex         || '').toLowerCase(),
        callsign:    (f.flight_icao || f.flight_iata || f.hex || '').trim(),
        country:     f.flag         || '?',
        lat:         f.lat,
        lon:         f.lng,           // AirLabs uses 'lng', we use 'lon'
        altitude:    f.alt  || 1000,  // metres
        velocity:    f.speed || 0,    // km/h already
        heading:     f.dir   || 0,
        vrate:       f.v_speed != null ? Math.round(f.v_speed) : null,
        squawk:      f.squawk || null,
        acType:      f.aircraft_icao || null,
        reg:         f.reg_number    || null,
        depIata:     f.dep_iata      || null,
        arrIata:     f.arr_iata      || null,
      }));

    res.status(200).json({
      flights,
      total: flights.length,
      time:  Math.floor(Date.now() / 1000),
    });

  } catch (err) {
    console.error('AirLabs proxy error:', err.message);
    res.status(502).json({ error: err.message, flights: [], total: 0 });
  }
}
