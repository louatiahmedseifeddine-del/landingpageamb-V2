// ─────────────────────────────────────────────────────────────────────────────
// Calendly  →  Meta Conversions API (CAPI) bridge   [Vercel serverless function]
//
// STATUS: structure ready, credentials pending.
// Deployed automatically by Vercel at:  POST /api/calendly-webhook
//
// Until META_PIXEL_ID + META_CAPI_ACCESS_TOKEN are set in Vercel, this function
// verifies + parses the webhook and LOGS the event it *would* send, returning
// 200 so Calendly's delivery still succeeds. Add the env vars later and it goes
// live with zero code changes.
//
// Set in Vercel → Project → Settings → Environment Variables:
//   META_PIXEL_ID                 e.g. 955572904130075
//   META_CAPI_ACCESS_TOKEN        system-user token with CAPI access
//   META_TEST_EVENT_CODE          (optional) Events Manager → Test events code
//   META_GRAPH_VERSION            (optional) default v21.0
//   CALENDLY_WEBHOOK_SIGNING_KEY  (optional) verifies Calendly-Webhook-Signature
//   SITE_URL                      (optional) event_source_url, e.g. https://.../settingav/
//
// DEDUP: the browser Pixel fires  Lead / Schedule  with eventID
// "Lead_<inviteeUuid>" / "Schedule_<inviteeUuid>". This function reuses the SAME
// ids so Meta collapses the browser + server events into one. No double counting.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

// SHA-256 hash, normalized (trim + lowercase) — required for Meta user_data.
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

// Calendly-Webhook-Signature header: "t=<timestamp>,v1=<hex hmac>"
function verifyCalendlySignature(rawBody, header, signingKey) {
  if (!signingKey) return true;            // verification disabled until key set
  if (!header) return false;
  try {
    const parts = {};
    header.split(',').forEach((kv) => {
      const i = kv.indexOf('=');
      parts[kv.slice(0, i)] = kv.slice(i + 1);
    });
    const signed = parts.t + '.' + rawBody.toString('utf8');
    const expected = crypto.createHmac('sha256', signingKey).update(signed).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.v1 || '');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function inviteeUuid(uri) {
  const m = (uri || '').match(/invitees\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

async function sendToMeta(events) {
  const PIXEL = process.env.META_PIXEL_ID;
  const TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
  if (!PIXEL || !TOKEN) {
    console.log('[CAPI] Skipped — set META_PIXEL_ID + META_CAPI_ACCESS_TOKEN. Would send:',
      JSON.stringify(events));
    return { skipped: true };
  }
  const body = { data: events };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  const url = 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + PIXEL +
    '/events?access_token=' + encodeURIComponent(TOKEN);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) console.error('[CAPI] Meta error', r.status, json);
  return json;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    res.status(400).json({ error: 'bad body' });
    return;
  }

  if (!verifyCalendlySignature(raw, req.headers['calendly-webhook-signature'],
      process.env.CALENDLY_WEBHOOK_SIGNING_KEY)) {
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  let evt;
  try {
    evt = JSON.parse(raw.toString('utf8') || '{}');
  } catch (e) {
    res.status(400).json({ error: 'invalid json' });
    return;
  }

  // Convert only on a confirmed booking.
  if (evt.event !== 'invitee.created') {
    res.status(200).json({ ok: true, ignored: evt.event });
    return;
  }

  const p = evt.payload || {};
  const iid = inviteeUuid(p.uri);
  const name = (p.name || '').trim();
  const first = name.split(' ')[0] || '';
  const last = name.split(' ').slice(1).join(' ') || '';
  const nowSec = Math.floor(Date.now() / 1000);

  // The landing page round-trips browser attribution through the Calendly
  // embed's UTM fields: utm_content = _fbc, utm_term = _fbp,
  // salesforce_uuid = amb_ext_id (the same external_id the Pixel sends).
  const tr = p.tracking || {};
  const isFb = (v) => typeof v === 'string' && /^fb\.\d\.\d+\..+/.test(v) && v.length < 512;
  const fbc = isFb(tr.utm_content) ? tr.utm_content : undefined;
  const fbp = isFb(tr.utm_term) ? tr.utm_term : undefined;
  const extIds = [tr.salesforce_uuid, iid].filter(Boolean).map(sha256);

  // Hashed user data (Meta hashes PII; we send it already hashed).
  // fbc/fbp must NOT be hashed.
  const user_data = {
    em: sha256(p.email),
    fn: sha256(first),
    ln: sha256(last),
    external_id: extIds.length ? extIds : undefined,
    fbc,
    fbp,
  };
  Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);

  const common = {
    action_source: 'website',
    event_time: nowSec,
    event_source_url: process.env.SITE_URL || undefined,
    user_data,
    custom_data: {
      content_name: 'Appel gratuit',
      content_category: 'Booking',
      currency: 'EUR',
      value: 0,
    },
  };

  // Same event_id as the browser Pixel → Meta deduplicates.
  const events = [
    Object.assign({ event_name: 'Lead',     event_id: iid ? 'Lead_' + iid : undefined }, common),
    Object.assign({ event_name: 'Schedule', event_id: iid ? 'Schedule_' + iid : undefined }, common),
  ];

  try {
    const result = await sendToMeta(events);
    res.status(200).json({ ok: true, meta: result });
  } catch (e) {
    console.error('[CAPI] send failed', e);
    // 200 so Calendly does not retry-storm; failure is logged.
    res.status(200).json({ ok: false, error: String(e) });
  }
};
