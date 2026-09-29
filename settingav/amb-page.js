/* ═════════════════════════════════════════════════════════════════════════
   AMB ACADÉMIE — comportements de page partagés
   Barre de progression, CTA flottant, retour en haut, animations d'entrée,
   accordéon FAQ, défilement doux. Chargé par les deux pages du funnel ;
   chaque bloc est protégé, un élément absent n'est jamais une erreur.
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  document.body.classList.remove('no-js');

  // ── SCROLL : progress + sticky CTA + back-to-top ───────────────────
  var bar       = document.getElementById('progress-bar');
  var stickyCta = document.getElementById('sticky-cta');
  var btt       = document.getElementById('back-to-top');
  var hero      = document.getElementById('hero');
  var endSec    = document.getElementById('final') || document.getElementById('cta');

  // Sur la page VSL, le CTA flottant est verrouillé comme le bouton principal :
  // il n'apparaît qu'une fois la vidéo terminée (attribut posé par amb-vsl.js).
  var ctaGated = !!document.querySelector('[data-vsl-gate]');

  function onScroll() {
    var st = window.scrollY;
    var dh = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (dh > 0 ? (st / dh * 100) : 0) + '%';

    if (stickyCta) {
      var heroBtm = hero   ? hero.getBoundingClientRect().bottom : 0;
      var endTop  = endSec ? endSec.getBoundingClientRect().top  : Infinity;
      var allowed = !ctaGated || document.documentElement.hasAttribute('data-vsl-unlocked');
      var show    = allowed && heroBtm < 0 && endTop > window.innerHeight;
      stickyCta.classList.toggle('in', show);
      var link = stickyCta.querySelector('a');
      if (link) link.tabIndex = show ? 0 : -1;
    }

    if (btt) btt.classList.toggle('in', st > 500);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  // Rejoué quand la vidéo déverrouille le CTA, sans attendre un défilement.
  window.addEventListener('amb:vsl-unlocked', onScroll);
  onScroll();

  // ── SCROLL ANIMATIONS ───────────────────────────────────────────────
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-up, .stagger').forEach(function (el) { io.observe(el); });
  }

  // ── FAQ ACCORDION ───────────────────────────────────────────────────
  // Global : appelé depuis les attributs onclick du balisage FAQ.
  window.toggleFaq = function (btn) {
    var item = btn.closest('.faq-item');
    var body = btn.nextElementSibling;
    var open = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(function (o) {
      o.classList.remove('open');
      o.querySelector('.faq-btn').setAttribute('aria-expanded', 'false');
      o.querySelector('.faq-body').style.maxHeight = '0';
    });
    if (!open) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      body.style.maxHeight = body.scrollHeight + 'px';
    }
  };

  // ── SMOOTH SCROLL ───────────────────────────────────────────────────
  // Plain native smooth scroll. The only guard: settle the target's fade-up
  // entrance first so it doesn't drift ~24px while the browser scrolls to it.
  // The landing gap is handled by `scroll-padding-top` on <html> in CSS.
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (!t) return;
      e.preventDefault();
      t.classList.add('in');
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ── VISIONNEUSE DE CAPTURES ─────────────────────────────────────────
  // Les captures de témoignages sont trop denses en texte pour être lues à la
  // taille d'une carte sur mobile. Amélioration progressive : sans JS, le lien
  // ouvre simplement l'image. Fermeture au clic hors image, sur la croix, ou
  // avec Échap ; le focus revient sur la vignette d'origine.
  (function () {
    var triggers = document.querySelectorAll('a[data-lightbox]');
    if (!triggers.length) return;
    var box = null, opener = null;

    function close() {
      if (!box) return;
      box.remove();
      box = null;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (opener) { opener.focus(); opener = null; }
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Esc') close(); }

    function open(href, alt, from) {
      close();
      opener = from;
      box = document.createElement('div');
      box.className = 'shot-lb';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', alt || 'Capture agrandie');

      var img = document.createElement('img');
      img.src = href;
      img.alt = alt || '';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shot-lb__close';
      btn.setAttribute('aria-label', 'Fermer');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

      box.appendChild(img);
      box.appendChild(btn);
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      btn.addEventListener('click', close);
      document.body.appendChild(box);
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      btn.focus();
    }

    triggers.forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;   // laisse « ouvrir dans un onglet »
        e.preventDefault();
        var img = a.querySelector('img');
        open(a.getAttribute('href'), img && img.alt, a);
      });
    });
  })();

  // ── CTA « Réserver mon appel » → intention de réservation ───────────
  // Le clic quitte la page 1 pour la page 2 ; l'écouteur générique de
  // amb-track.js ne couvre que les liens #calendly / #quiz / calendly.com.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-amb-book]') : null;
    if (!a) return;
    if (typeof window.ambTrack === 'function') {
      window.ambTrack('Contact', { content_name: 'Clic Réserver mon appel', content_category: 'Booking' });
    }
  }, true);
})();
