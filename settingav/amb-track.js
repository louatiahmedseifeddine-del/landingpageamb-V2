/* ═════════════════════════════════════════════════════════════════════════
   AMB ACADÉMIE — mesure partagée (Clarity + Meta Pixel + CAPI first-party)
   Chargé en <head> de façon synchrone par les deux pages du funnel :
     /settingav/            (page 1 — VSL)
     /settingav/reserver/   (page 2 — quiz + réservation)

   Le code est reporté tel quel depuis l'ancienne page monofichier. L'ordre
   d'exécution est conservé : helpers → init Pixel → PageView → consentement
   → écouteurs d'événements. Seule la partie qui touche au DOM (bannière
   cookies) est différée à DOMContentLoaded, puisque ce fichier s'exécute
   avant le <body>.

   Voir TRACKING.md pour la cartographie complète des événements.
   ═════════════════════════════════════════════════════════════════════════ */

/* ── Microsoft Clarity ───────────────────────────────────────────────── */
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "x0jj09tqk7");

/* ── Meta Pixel ──────────────────────────────────────────────────────── */
// First-party external_id (persisted). Improves Advanced Matching and lets
// this browser Pixel event dedupe with the server-side CAPI event later.
function ambGetExternalId(){
  try{
    var k='amb_ext_id', v=localStorage.getItem(k);
    if(!v){ v='amb_'+Date.now().toString(36)+Math.random().toString(36).slice(2,10); localStorage.setItem(k,v); }
    return v;
  }catch(e){ return null; }
}
// ── fbc / fbp capture ─────────────────────────────────────────────
// If the visitor lands with ?fbclid= (any Meta ad click), persist it and
// build the _fbc cookie ourselves — the Pixel only sets it when it loads,
// and ad blockers prevent that. fbp/fbc are then attached to every
// server-side (CAPI) event for maximum match quality + attribution.
function ambReadCookie(name){
  var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
(function(){
  try{
    var fbclid = new URLSearchParams(location.search).get('fbclid');
    if (fbclid){
      localStorage.setItem('amb_fbclid', fbclid);
      localStorage.setItem('amb_fbclid_ts', String(Date.now()));
      if (!ambReadCookie('_fbc')){
        document.cookie = '_fbc=fb.1.' + Date.now() + '.' + encodeURIComponent(fbclid) +
          '; path=/; max-age=' + (90*24*3600) + '; SameSite=Lax';
      }
    }
  }catch(e){}
})();
function ambGetFbp(){ return ambReadCookie('_fbp'); }
function ambGetFbc(){
  var c = ambReadCookie('_fbc');
  if (c) return c;
  try{
    var id = localStorage.getItem('amb_fbclid');
    var ts = localStorage.getItem('amb_fbclid_ts');
    if (id && ts) return 'fb.1.' + ts + '.' + id;
  }catch(e){}
  return null;
}
// ── first-party CAPI mirror ───────────────────────────────────────
// Sends the same event (same eventID) to our own /api/meta-track, which
// adds the real client IP + user-agent and forwards to Meta's Conversions
// API. Works even when fbevents.js is blocked; Meta dedupes by eventID.
function ambServerTrack(name, id, custom){
  try{
    if (localStorage.getItem('amb_cookie_consent') === 'revoked') return;
    var body = JSON.stringify({
      event_name: name,
      event_id: id,
      event_source_url: location.href,
      fbp: ambGetFbp(),
      fbc: ambGetFbc(),
      external_id: ambGetExternalId(),
      custom_data: custom || {}
    });
    if (navigator.sendBeacon){
      navigator.sendBeacon('/api/meta-track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/meta-track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    }
  }catch(e){}
}
function ambNewEventId(name){
  var r = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));
  return name + '_' + r;
}
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '955572904130075', { external_id: ambGetExternalId() });
var ambPvId = ambNewEventId('PageView');
fbq('track', 'PageView', {}, { eventID: ambPvId });
// Mirror PageView server-side after load, once fbevents has set _fbp.
window.addEventListener('load', function(){
  setTimeout(function(){ ambServerTrack('PageView', ambPvId); }, 400);
});

/* ── CONSENTEMENT + ÉVÉNEMENTS DE CONVERSION ─────────────────────────── */
(function(){
  var CONSENT_KEY = 'amb_cookie_consent';

  // ── CONSENT (always-on) ─────────────────────────────────────────
  // Tracking is granted by default and the banner stays hidden. The
  // banner lives in the DOM for transparency and can be shown on demand
  // via window.ambShowCookieBanner().
  function grantConsent(){
    try { localStorage.setItem(CONSENT_KEY, 'granted'); } catch(e){}
    if (typeof fbq === 'function') fbq('consent', 'grant');
  }
  function revokeConsent(){
    try { localStorage.setItem(CONSENT_KEY, 'revoked'); } catch(e){}
    if (typeof fbq === 'function') fbq('consent', 'revoke');
  }
  grantConsent();

  // La bannière vit dans le DOM : on la câble une fois le <body> analysé.
  function wireBanner(){
    var banner = document.getElementById('cookie-banner');
    window.ambShowCookieBanner = function(){ if (banner) banner.hidden = false; };
    var acc = document.getElementById('cb-accept');
    var ref = document.getElementById('cb-refuse');
    if (acc) acc.addEventListener('click', function(){ grantConsent(); if (banner) banner.hidden = true; });
    if (ref) ref.addEventListener('click', function(){ revokeConsent(); if (banner) banner.hidden = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBanner);
  else wireBanner();

  window.addEventListener('amb:quiz-submitted', function(){
    track('Contact', { content_name: 'Quiz AMB soumis', content_category: 'Quiz' });
  });

  // ── EVENT HELPERS ───────────────────────────────────────────────
  // Every event goes out twice with the SAME eventID: browser Pixel +
  // first-party /api/meta-track (CAPI). Meta dedupes; if the Pixel is
  // blocked, the server event still lands.
  // Noms d'événements autorisés côté serveur : voir ALLOWED_EVENTS dans
  // api/meta-track.js — n'en introduis pas d'autre sans l'ajouter là-bas.
  function extId(){ return (typeof ambGetExternalId === 'function') ? ambGetExternalId() : null; }
  function track(name, params, forcedId){
    params = params || {};
    var id = forcedId || ambNewEventId(name);
    if (typeof ambServerTrack === 'function') ambServerTrack(name, id, params);
    if (typeof fbq !== 'function') return id;
    var p = {};
    for (var k in params) p[k] = params[k];
    var x = extId(); if (x) p.external_id = x;
    fbq('track', name, p, { eventID: id });
    return id;
  }
  // Exposé pour les scripts de page (événements vidéo de la VSL, etc.).
  window.ambTrack = track;

  // ── CTA CLICKS → intent (Contact) ───────────────────────────────
  // Any CTA that jumps to the booking section, or a raw Calendly link.
  document.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('calendly.com') !== -1 || href === '#calendly' || href === '#cta' || href === '#quiz') {
      track('Contact', { content_name: 'Clic réservation appel', content_category: 'Booking' });
    }
  }, true);

  // ── CALENDLY (inline embed) → funnel + conversion events ─────────
  function inviteeId(payload){
    var uri = (payload && payload.invitee && payload.invitee.uri) || '';
    var m = uri.match(/invitees\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }
  window.addEventListener('message', function(e){
    var d = e.data;
    if (!d || typeof d.event !== 'string' || d.event.indexOf('calendly.') !== 0) return;
    var payload = d.payload || {};
    switch (d.event) {
      case 'calendly.event_type_viewed':
        track('ViewContent', { content_name: 'Calendly — Appel gratuit', content_category: 'Booking' });
        break;
      case 'calendly.date_and_time_selected':
        track('InitiateCheckout', { content_name: 'Créneau sélectionné', content_category: 'Booking' });
        break;
      case 'calendly.event_scheduled':
        // ── PRIMARY CONVERSION — booked call ──
        // Deterministic eventID from the Calendly invitee so the server-side
        // CAPI event (Calendly webhook) dedupes with this browser event.
        var iid = inviteeId(payload);
        track('Lead', {
          content_name: 'Appel gratuit réservé',
          content_category: 'Booking',
          value: 0.00, currency: 'EUR'
        }, iid ? ('Lead_' + iid) : null);
        // Meta appointment-booking event (kept in parallel for flexibility)
        track('Schedule', {
          content_name: 'Appel gratuit', content_category: 'Booking'
        }, iid ? ('Schedule_' + iid) : null);
        break;
    }
  }, false);
})();
