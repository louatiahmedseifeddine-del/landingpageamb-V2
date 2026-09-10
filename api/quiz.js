// ─────────────────────────────────────────────────────────────────────────────
// Quiz  →  Google Sheet   [Vercel serverless function]
//
// POST /api/quiz
// Forwards validated answers to a Google Apps Script web app bound to:
//   https://docs.google.com/spreadsheets/d/1WEhedr0Z5aojUGwAehwF3MCyEUbBfLgsPnDnnfHghxc
//
// Set in Vercel → Project → Settings → Environment Variables:
//   GOOGLE_SHEETS_WEBAPP_URL   Apps Script web app URL (see scripts/quiz-sheet.gs)
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_FIELDS = [
  'prenom_nom',
  'email',
  'whatsapp',
  'situation',
  'objectifs',
  'experience',
  'manque',
  'demarrage',
  'connaissance',
  'presence',
];

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function str(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    const raw = await readRawBody(req);
    body = JSON.parse(raw.toString('utf8') || '{}');
  } catch (e) {
    res.status(400).json({ error: 'invalid json' });
    return;
  }

  const prenomNom = str(body.prenom_nom || body.prenom, 80);
  const situation = str(body.situation || body.q1, 200);
  const objectifs = str(body.objectifs || body.q2, 4000);
  const experience = str(body.experience || body.q3, 200);
  const manque = str(body.manque || body.q4, 4000);
  const demarrage = str(body.demarrage || body.q5, 200);
  const connaissance = str(body.connaissance || body.q6, 200);
  const presence = str(body.presence || body.q7, 240);

  const payload = {
    prenom_nom: prenomNom,
    email: str(body.email, 120).toLowerCase(),
    whatsapp: str(body.whatsapp, 40),
    situation,
    objectifs,
    experience,
    manque,
    demarrage,
    connaissance,
    presence,
    // Live Apps Script may still read q1–q7 + prenom until the web app is redeployed.
    q1: situation,
    q2: objectifs,
    q3: experience,
    q4: manque,
    q5: demarrage,
    q6: connaissance,
    q7: presence,
    prenom: prenomNom,
    utm_source: str(body.utm_source, 120),
    utm_medium: str(body.utm_medium, 120),
    utm_campaign: str(body.utm_campaign, 120),
    page_url: str(body.page_url, 500),
  };

  const missing = SHEET_FIELDS.filter((k) => !payload[k]);
  if (missing.length) {
    res.status(400).json({ error: 'missing', fields: missing });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  if (digits(payload.whatsapp).length < 8) {
    res.status(400).json({ error: 'invalid_whatsapp' });
    return;
  }

  const webhook = process.env.GOOGLE_SHEETS_WEBAPP_URL
    || 'https://script.google.com/macros/s/AKfycbx62XSiKseDBKlevj8QZTSobPEtezm6Kf1l4qkqMNp5EdRFNGAPQj0xlxOBCTFDM7hO9Q/exec';

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await r.text().catch(() => '');
    let json = {};
    try { json = JSON.parse(text); } catch (e) {}
    if (!r.ok || json.ok === false) {
      console.error('[quiz] Apps Script error', r.status, text.slice(0, 400));
      res.status(502).json({ error: 'sheet_write_failed' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[quiz] send failed', e);
    res.status(502).json({ error: 'sheet_write_failed' });
  }
};
