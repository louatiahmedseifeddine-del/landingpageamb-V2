# AMB Académie — Tracking

Live funnel: `settingav/index.html` (root `index.html` redirects here).
Source copy kept in sync: `AMB-Landing-V2.html`.

## Meta Pixel
- ID: **955572904130075** (fixed the old `1324606929887123` that was still in the `<noscript>`).
- Advanced Matching: a persisted first-party `external_id` (localStorage `amb_ext_id`) is passed on `init` and every event.
- Consent: always-on. `fbq('consent','grant')` on load; hidden cookie banner in the DOM, reveal with `window.ambShowCookieBanner()`.

### Events fired (browser)
| Trigger | Event | Notes |
|---|---|---|
| Page load | `PageView` | standard |
| Calendly `event_type_viewed` | `ViewContent` | funnel top |
| Calendly `date_and_time_selected` | `InitiateCheckout` | strong intent |
| Calendly `event_scheduled` | **`Lead`** + `Schedule` | **primary conversion** — optimize campaigns on `Lead` |
| Click a CTA to the booking section (`#calendly` / `#cta`) | `Contact` | intent |

All events carry a deterministic `eventID` for the conversion (`Lead_<inviteeUuid>` / `Schedule_<inviteeUuid>`) so the browser + server events **deduplicate**.

> The sticky CTA now smooth-scrolls to the inline Calendly embed (same page) instead of opening a new tab, so every booking posts `event_scheduled` back and fires `Lead`.

## fbc / fbp capture (browser)
- On landing with `?fbclid=`, the page persists it (localStorage `amb_fbclid`) and sets the `_fbc` cookie itself (`fb.1.<ts>.<fbclid>`) — so attribution survives even when fbevents.js is blocked.
- `_fbp` is read from the Pixel's cookie.
- Both are attached to every server-side event.

## Conversions API (CAPI) — two server paths, both dedupe by eventID
1. **`POST /api/meta-track`** (`api/meta-track.js`) — the page mirrors *every* Pixel event here via `sendBeacon` with the same `eventID`. The function adds the real client IP + user-agent, hashes `external_id`, validates fbp/fbc, and forwards to Meta. If the Pixel is blocked, this still lands; if not, Meta dedupes.
2. **`POST /api/calendly-webhook`** (`api/calendly-webhook.js`) — Calendly `invitee.created` → `Lead` + `Schedule` with hashed email/name. The embed round-trips attribution through Calendly UTM fields: `utm_content` = `_fbc`, `utm_term` = `_fbp`, `salesforce_uuid` = `amb_ext_id`, so the webhook event also carries fbc/fbp/external_id.

Without env vars both functions validate + log and return 200 (no-op), so nothing breaks before go-live.

### Go-live checklist
1. In Vercel → Project → Settings → Environment Variables (all environments), set `META_PIXEL_ID=955572904130075` and `META_CAPI_ACCESS_TOKEN=<system-user token>` (see `.env.example`). Optionally `META_TEST_EVENT_CODE`, `SITE_URL`, `CALENDLY_WEBHOOK_SIGNING_KEY`. Redeploy after adding.
2. Create a Calendly **webhook subscription** (Professional plan+) for `invitee.created` → URL `https://YOUR-DOMAIN/api/calendly-webhook`. Save the signing key into `CALENDLY_WEBHOOK_SIGNING_KEY`.
3. Validate with `META_TEST_EVENT_CODE` (Events Manager → Test events): load the page, click a CTA, book a test call → events show `Browser · Server` badges and one deduped `Lead`. Then **remove** the test code var and redeploy.

## Still worth doing (not tracking-blocking)
- Legal footer links (`Mentions légales`, `Politique de confidentialité`) are `href="#"` — point them to real pages.
- Consider Meta Domain Verification + Aggregated Event Measurement priority (set `Lead` as top priority event) in Events Manager.
