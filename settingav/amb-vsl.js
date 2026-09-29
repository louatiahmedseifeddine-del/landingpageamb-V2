/* ═════════════════════════════════════════════════════════════════════════
   AMB ACADÉMIE — page 1 : lecteur VSL + déverrouillage du bouton
   ═════════════════════════════════════════════════════════════════════════

   Le bouton « Réserver mon appel » est réellement absent du rendu au
   chargement (attribut `hidden`, donc ni cliquable ni focusable au clavier).
   Il n'est révélé que lorsque le lecteur YouTube passe à l'état
   YT.PlayerState.ENDED.

   Pourquoi l'IFrame API et pas un simple <iframe> : un iframe ordinaire ne
   remonte aucun état de lecture. On charge donc l'API officielle et on crée
   le lecteur avec YT.Player (enablejsapi + origin), ce qui donne accès à
   onStateChange.

   Pourquoi une façade (miniature cliquable) : le player YouTube pèse
   plusieurs centaines de Ko. On affiche d'abord la miniature, et on crée le
   lecteur au premier clic. Aucune lecture automatique n'est déclenchée sans
   action de la visiteuse — l'autoplay du playerVars ne s'applique qu'au
   lecteur créé *par* son clic.

   ATTENTION À L'INTERPRÉTATION : ENDED signifie que le lecteur a atteint la
   fin de la vidéo. Une personne peut avancer manuellement dans la barre de
   lecture. Ce mécanisme ne prouve donc pas un visionnage intégral, et rien
   dans la copy ne le prétend.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  var VIDEO_ID  = 'zFbwChQ45Cw';
  var STATE_KEY = 'amb_vsl_done';   // sessionStorage : survit à un refresh / retour arrière

  var frame    = document.getElementById('vsl-frame');
  var facade   = document.getElementById('vsl-facade');
  var errBox   = document.getElementById('vsl-error');
  var retryBtn = document.getElementById('vsl-retry');
  var fallback = document.getElementById('vsl-fallback');
  var durLabel = document.getElementById('vsl-duration');
  if (!frame || !facade) return;

  var player = null;
  var unlocked = false;
  var playTracked = false;
  var apiInjected = false;
  var apiWaiters = [];

  /* ── session (tolère un sessionStorage indisponible : navigation privée) ── */
  function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  /* ── déverrouillage ─────────────────────────────────────────────────── */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    sessionSet(STATE_KEY, '1');
    document.documentElement.setAttribute('data-vsl-unlocked', '');

    document.querySelectorAll('[data-vsl-gate]').forEach(function (gate) {
      var locked = gate.querySelector('[data-vsl-locked]');
      var cta    = gate.querySelector('[data-vsl-cta]');
      if (locked) locked.hidden = true;
      if (cta) {
        cta.hidden = false;
        cta.classList.add('vsl-unlocked');
      }
    });

    // Le CTA flottant se réévalue tout de suite, sans attendre un défilement.
    try { window.dispatchEvent(new CustomEvent('amb:vsl-unlocked')); } catch (e) {}
    prefetchStep2();
  }

  // La page 2 est préchargée seulement quand elle devient atteignable.
  function prefetchStep2() {
    try {
      if (document.getElementById('vsl-prefetch')) return;
      var l = document.createElement('link');
      l.id = 'vsl-prefetch';
      l.rel = 'prefetch';
      l.href = 'reserver/';
      document.head.appendChild(l);
    } catch (e) {}
  }

  // Retour sur la page dans la même session : le bouton reste disponible.
  if (sessionGet(STATE_KEY) === '1') unlock();

  /* ── chargement de l'IFrame API ─────────────────────────────────────── */
  function apiReady() { return !!(window.YT && window.YT.Player); }

  function injectApi() {
    if (apiInjected) return;
    apiInjected = true;
    // Point d'entrée imposé par l'API : YouTube l'appelle quand elle est prête.
    window.onYouTubeIframeAPIReady = function () {
      apiWaiters.splice(0).forEach(function (w) { w(null); });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = function () {
      apiInjected = false;                                    // une nouvelle tentative pourra réinjecter
      apiWaiters.splice(0).forEach(function (w) { w(new Error('api-load')); });
    };
    document.head.appendChild(s);
  }

  function whenApi(cb) {
    if (apiReady()) { cb(null); return; }
    var done = false;
    function once(err) { if (done) return; done = true; cb(err); }
    apiWaiters.push(once);
    injectApi();
    setTimeout(function () {
      if (done) return;
      if (apiReady()) once(null);
      else { apiInjected = false; once(new Error('api-timeout')); }
    }, 12000);
  }

  // Préchargement discret : l'API est prête avant même le clic, donc la
  // lecture démarre sans attente perceptible.
  function warmApi() { if (!apiReady()) injectApi(); }
  if ('requestIdleCallback' in window) requestIdleCallback(warmApi, { timeout: 4000 });
  else setTimeout(warmApi, 2500);

  /* ── erreurs ────────────────────────────────────────────────────────── */
  function showError() {
    if (errBox) errBox.hidden = false;
    facade.hidden = false;
    if (durLabel) durLabel.textContent = '17 min';
  }
  function hideError() { if (errBox) errBox.hidden = true; }

  /* ── création du lecteur ────────────────────────────────────────────── */
  // YT.Player remplace l'élément cible par un <iframe> : on recrée un hôte
  // propre à chaque tentative, inséré avant la façade pour rester dessous.
  function resetHost() {
    frame.querySelectorAll('#vsl-player, iframe').forEach(function (n) { n.remove(); });
    var host = document.createElement('div');
    host.id = 'vsl-player';
    frame.insertBefore(host, facade);
    return host;
  }

  function mount() {
    hideError();
    resetHost();
    try {
      player = new YT.Player('vsl-player', {
        videoId: VIDEO_ID,
        playerVars: {
          autoplay: 1,            // la lecture suit le clic de la visiteuse, jamais le chargement
          playsinline: 1,         // iOS : lecture dans la page, pas en plein écran forcé
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: location.origin,
          hl: 'fr'
        },
        events: {
          onReady: function () {
            facade.hidden = true;
            if (durLabel) durLabel.textContent = '17 min';
          },
          onStateChange: onStateChange,
          onError: showError
        }
      });
    } catch (e) {
      showError();
    }
  }

  function onStateChange(e) {
    if (!window.YT || !YT.PlayerState) return;
    if (e.data === YT.PlayerState.PLAYING && !playTracked) {
      playTracked = true;
      if (typeof window.ambTrack === 'function') {
        window.ambTrack('ViewContent', { content_name: 'VSL — lecture démarrée', content_category: 'VSL' });
      }
    }
    if (e.data === YT.PlayerState.ENDED) unlock();
  }

  /* ── interactions ───────────────────────────────────────────────────── */
  // <button> : clic souris, tap tactile et Entrée/Espace au clavier sont
  // gérés nativement, sans code supplémentaire.
  facade.addEventListener('click', function () {
    if (durLabel) durLabel.textContent = 'Chargement…';
    whenApi(function (err) {
      if (err) { showError(); return; }
      mount();
    });
  });

  if (retryBtn) retryBtn.addEventListener('click', function () {
    hideError();
    if (durLabel) durLabel.textContent = 'Chargement…';
    whenApi(function (err) {
      if (err) { showError(); return; }
      mount();
    });
  });

  // Uniquement atteignable après un échec réel du lecteur : la visiteuse part
  // voir la vidéo sur YouTube, où nous ne recevons plus aucun état. Sans cette
  // porte de sortie elle resterait bloquée sans jamais pouvoir réserver. Le
  // déverrouillage suit donc une action délibérée, dans un cas d'erreur avéré.
  if (fallback) fallback.addEventListener('click', function () { unlock(); });
})();
