// ─────────────────────────────────────────────────────────────────────────────
// First-party browser → Meta Conversions API bridge   [Vercel serverless]
//
// The landing page mirrors every Pixel event here (same eventID) via
// sendBeacon. This function adds what only the server can see reliably —
// real client IP + user-agent — and forwards to Meta. Because the eventID
// matches the browser Pixel event, Meta deduplicates: no double counting,
// and if the Pixel was blocked (ad blocker, iOS), the event still lands.
//
// Env vars (Vercel → Project → Settings → Environment Variables):
//   META_PIXEL_ID             e.g. 955572904130075
//   META_CAPI_ACCESS_TOKEN    system-user token with CAPI access
//   META_TEST_EVENT_CODE      (optional) Events Manager → Test events code
//   META_GRAPH_VERSION        (optional) default v23.0
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

// Only events the page actually fires; anything else is rejected.
const ALLOWED_EVENTS = ['PageView', 'ViewContent', 'Contact', 'InitiateCheckout', 'Lead', 'Schedule'];
const ALLOWED_CUSTOM = ['content_name', 'content_category', 'currency', 'value'];

function sha256(v) {
  if (v == null || v === '') return undefined;
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || undefined;
}

// fbp/fbc look like "fb.1.1700000000000.xxxx" — drop anything else.
function fbCookie(v) {
  return (typeof v === 'string' && /^fb\.\d\.\d+\..+/.test(v) && v.length < 512) ? v : undefined;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
  } catch (e) {
    res.status(400).json({ error: 'invalid json' });
    return;
  }

  const name = body.event_name;
  const eventId = body.event_id;
  if (!ALLOWED_EVENTS.includes(name) ||
      typeof eventId !== 'string' || eventId.length < 5 || eventId.length > 120) {
    res.status(400).json({ error: 'bad event' });
    return;
  }

  const user_data = {
    client_ip_address: clientIp(req),
    client_user_agent: req.headers['user-agent'],
    fbp: fbCookie(body.fbp),
    fbc: fbCookie(body.fbc),
    external_id: sha256(body.external_id),
  };
  Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);

  const custom_data = {};
  if (body.custom_data && typeof body.custom_data === 'object') {
    ALLOWED_CUSTOM.forEach((k) => {
      const v = body.custom_data[k];
      if (typeof v === 'string' && v.length <= 200) custom_data[k] = v;
      if (typeof v === 'number' && isFinite(v)) custom_data[k] = v;
    });
  }

  const event = {
    event_name: name,
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: (typeof body.event_source_url === 'string' && body.event_source_url.length < 1024)
      ? body.event_source_url : (process.env.SITE_URL || undefined),
    user_data,
    custom_data,
  };

  const PIXEL = process.env.META_PIXEL_ID;
  const TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
  if (!PIXEL || !TOKEN) {
    console.log('[CAPI] meta-track skipped — env vars missing. Would send:', JSON.stringify(event));
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const r = await fetch('https://graph.facebook.com/' + GRAPH_VERSION + '/' + PIXEL +
        '/events?access_token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) console.error('[CAPI] meta-track Meta error', r.status, json);
    res.status(200).json({ ok: r.ok });
  } catch (e) {
    console.error('[CAPI] meta-track send failed', e);
    res.status(200).json({ ok: false });
  }
};
