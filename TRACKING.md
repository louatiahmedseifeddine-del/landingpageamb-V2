# AMB Académie — Tracking

## Funnel en deux pages

| Route | Fichier | Rôle |
|---|---|---|
| `/` | `index.html` + `vercel.json` | redirige vers `/settingav/` en conservant `?fbclid=` et les UTM |
| `/settingav/` | `settingav/index.html` | **page 1** — copy + VSL (`zFbwChQ45Cw`, 17 min). Le bouton « Réserver mon appel » est masqué au chargement et révélé sur `YT.PlayerState.ENDED` |
| `/settingav/reserver/` | `settingav/reserver/index.html` | **page 2** — quiz 8 questions → Calendly (profils qualifiés) ou Instagram |

Fichiers partagés par les deux pages :

| Fichier | Contenu |
|---|---|
| `settingav/amb.css` | toute la feuille de style (variables, composants, blocs du funnel VSL) |
| `settingav/amb-track.js` | Clarity + Pixel + miroir CAPI + événements de conversion (chargé en `<head>`, synchrone) |
| `settingav/amb-page.js` | barre de progression, CTA flottant, retour en haut, animations, FAQ, défilement doux |
| `settingav/amb-vsl.js` | page 1 seulement — lecteur YouTube IFrame API + déverrouillage du bouton |
| `settingav/amb-quiz.js` | page 2 seulement — quiz 8 étapes + chargement différé de Calendly |

Passage de la page 1 à la page 2 : `sessionStorage['amb_vsl_done'] = '1'`, posé quand le
lecteur atteint `ENDED`. La page 2 s'en sert comme **règle de parcours côté navigateur**
(volontairement contournable, ce n'est pas une mesure de sécurité) : sans ce marqueur elle
affiche un renvoi vers la vidéo. `?preview=1` contourne la garde pour les tests.

`AMB-Landing-V2.html` n'est plus une copie synchronisée : il est resté à la version V3
(2026-09-01, sans le quiz) et ne reflète plus la page en ligne.

## Meta Pixel
- ID: **955572904130075** (fixed the old `1324606929887123` that was still in the `<noscript>`).
- Advanced Matching: a persisted first-party `external_id` (localStorage `amb_ext_id`) is passed on `init` and every event.
- Consent: always-on. `fbq('consent','grant')` on load; hidden cookie banner in the DOM, reveal with `window.ambShowCookieBanner()`.

### Events fired (browser)
| Page | Trigger | Event | Notes |
|---|---|---|---|
| 1 & 2 | Page load | `PageView` | standard |
| 1 | Début de lecture de la VSL (`YT.PlayerState.PLAYING`) | `ViewContent` | `content_name: 'VSL — lecture démarrée'` |
| 1 | Clic sur « Réserver mon appel » (`a[data-amb-book]`) | `Contact` | `content_name: 'Clic Réserver mon appel'` |
| 2 | Quiz soumis (`amb:quiz-submitted`) | `Contact` | `content_name: 'Quiz AMB soumis'` |
| 2 | Calendly `event_type_viewed` | `ViewContent` | `content_name: 'Calendly — Appel gratuit'` |
| 2 | Calendly `date_and_time_selected` | `InitiateCheckout` | strong intent |
| 2 | Calendly `event_scheduled` | **`Lead`** + `Schedule` | **primary conversion** — optimize campaigns on `Lead` |
| 1 & 2 | Clic sur un lien vers la réservation (`#calendly` / `#cta` / `#quiz` / `calendly.com`) | `Contact` | intent |

`ViewContent` est désormais émis à deux endroits distincts du funnel (lecture de la VSL en
page 1, ouverture du calendrier en page 2) : c'est `content_name` qui les sépare. Les noms
d'événements sont limités par `ALLOWED_EVENTS` dans `api/meta-track.js` — n'en ajoute pas
côté page sans l'ajouter aussi côté serveur.

All events carry a deterministic `eventID` for the conversion (`Lead_<inviteeUuid>` / `Schedule_<inviteeUuid>`) so the browser + server events **deduplicate**.

> Le CTA flottant de la page 1 est verrouillé comme le bouton principal : il n'apparaît qu'après `ENDED`. En page 2, le Calendly reste un embed inline (jamais un nouvel onglet), pour que chaque réservation renvoie `event_scheduled` et déclenche `Lead`.

## fbc / fbp capture (browser)
- On landing with `?fbclid=`, the page persists it (localStorage `amb_fbclid`) and sets the `_fbc` cookie itself (`fb.1.<ts>.<fbclid>`) — so attribution survives even when fbevents.js is blocked.
- `_fbp` is read from the Pixel's cookie.
- Both are attached to every server-side event.

## Conversions API (CAPI) — two server paths, both dedupe by eventID
1. **`POST /api/meta-track`** (`api/meta-track.js`) — the page mirrors *every* Pixel event here via `sendBeacon` with the same `eventID`. The function adds the real client IP + user-agent, hashes `external_id`, validates fbp/fbc, and forwards to Meta. If the Pixel is blocked, this still lands; if not, Meta dedupes.
2. **`POST /api/calendly-webhook`** (`api/calendly-webhook.js`) — Calendly `invitee.created` → `Lead` + `Schedule` with hashed email/name. L'embed de la page 2 round-trips attribution through Calendly UTM fields: `utm_content` = `_fbc`, `utm_term` = `_fbp`, `salesforce_uuid` = `amb_ext_id`, so the webhook event also carries fbc/fbp/external_id.

Without env vars both functions validate + log and return 200 (no-op), so nothing breaks before go-live.

### Go-live checklist
1. In Vercel → Project → Settings → Environment Variables (all environments), set `META_PIXEL_ID=955572904130075` and `META_CAPI_ACCESS_TOKEN=<system-user token>` (see `.env.example`). Optionally `META_TEST_EVENT_CODE`, `SITE_URL`, `CALENDLY_WEBHOOK_SIGNING_KEY`. Redeploy after adding.
2. Create a Calendly **webhook subscription** (Professional plan+) for `invitee.created` → URL `https://YOUR-DOMAIN/api/calendly-webhook`. Save the signing key into `CALENDLY_WEBHOOK_SIGNING_KEY`.
3. Validate with `META_TEST_EVENT_CODE` (Events Manager → Test events): load the page, click a CTA, book a test call → events show `Browser · Server` badges and one deduped `Lead`. Then **remove** the test code var and redeploy.

## Still worth doing (not tracking-blocking)
- Legal footer links (`Mentions légales`, `Politique de confidentialité`) are `href="#"` sur les deux pages — point them to real pages.
- Consider Meta Domain Verification + Aggregated Event Measurement priority (set `Lead` as top priority event) in Events Manager.
