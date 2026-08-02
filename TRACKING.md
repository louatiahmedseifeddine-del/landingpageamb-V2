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

> The sticky CTA now smooth-scrolls to the inline Calendly embed (same page) instead of opening a new tab, so every booking posts `event_scheduled` back and fires `Lead`. CAPI remains a server-side backup for events the browser loses (ad blockers, iOS).

## Conversions API (CAPI) — structure ready, credentials pending
Function: `api/calendly-webhook.js` → Vercel endpoint `POST /api/calendly-webhook`.
Without env vars it validates + logs and returns 200 (no-op), so nothing breaks before go-live.

### To go live (when you have the BM + token)
1. Create a **system-user access token** with Conversions API access in Meta Events Manager (Pixel 955572904130075).
2. In Vercel → Settings → Environment Variables, set: `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` (see `.env.example`). Optionally `META_TEST_EVENT_CODE`, `SITE_URL`, `CALENDLY_WEBHOOK_SIGNING_KEY`.
3. Create a Calendly **webhook subscription** (Professional plan+) for `invitee.created` → URL `https://YOUR-DOMAIN/api/calendly-webhook`. Save the signing key into `CALENDLY_WEBHOOK_SIGNING_KEY`.
4. Book a test call → confirm one deduped `Lead` in Events Manager (Test events, then Overview).

## Still worth doing (not tracking-blocking)
- Legal footer links (`Mentions légales`, `Politique de confidentialité`) are `href="#"` — point them to real pages.
- Consider Meta Domain Verification + Aggregated Event Measurement priority (set `Lead` as top priority event) in Events Manager.
