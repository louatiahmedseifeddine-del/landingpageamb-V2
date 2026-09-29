/* ═════════════════════════════════════════════════════════════════════════
   AMB ACADÉMIE — page 2 : questionnaire (8 étapes) + réservation Calendly

   Logique reprise telle quelle depuis l'ancienne page monofichier : mêmes
   validations, mêmes libellés d'erreur, même collecte, même double envoi
   (/api/quiz puis le web app Apps Script), même embranchement Instagram,
   même passage des paramètres d'attribution à Calendly.

   Ne modifie pas les noms de champs (prenom_nom, email, whatsapp, situation,
   objectifs, experience, manque, demarrage, connaissance, presence) ni les
   doublons q1–q7 : ils sont attendus par api/quiz.js et par la feuille
   Google (voir scripts/quiz-sheet.gs).
   ═════════════════════════════════════════════════════════════════════════ */
// ── QUIZ ────────────────────────────────────────────────────────────
(function(){
  var form = document.getElementById('quiz');
  if (!form) return;
  var steps = form.querySelectorAll('.quiz-step');
  var nextBtn = document.getElementById('quiz-next');
  var backBtn = document.getElementById('quiz-back');
  var submitBtn = document.getElementById('quiz-submit');
  var errEl = document.getElementById('quiz-error');
  var labelEl = document.getElementById('quiz-step-label');
  var fillEl = document.getElementById('quiz-progress-fill');
  var calendlyStep = document.getElementById('calendly-step');
  var instaStep = document.getElementById('insta-step');
  var stickyLink = document.querySelector('#sticky-cta a');
  var TOTAL = steps.length;
  var current = 0;
  var advancing = false;
  var INSTAGRAM_OPTION = "Je me renseigne encore (ne pas prendre l'appel - suis moi sur insta)";
  var SHEETS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbx62XSiKseDBKlevj8QZTSobPEtezm6Kf1l4qkqMNp5EdRFNGAPQj0xlxOBCTFDM7hO9Q/exec';

  function showError(msg){
    if (!errEl) return;
    if (!msg) { errEl.classList.remove('is-on'); errEl.textContent = ''; return; }
    errEl.textContent = msg;
    errEl.classList.add('is-on');
  }

  function isLast(){ return current === TOTAL - 1; }

  function currentStepEl(){ return steps[current]; }

  function radioValue(name){
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function render(){
    steps.forEach(function(s, i){ s.classList.toggle('is-active', i === current); });
    if (labelEl) labelEl.textContent = 'Étape ' + (current + 1) + ' / ' + TOTAL;
    if (fillEl) fillEl.style.width = (((current + 1) / TOTAL) * 100) + '%';
    if (backBtn) backBtn.hidden = current === 0;
    if (nextBtn) nextBtn.hidden = isLast();
    if (submitBtn) submitBtn.hidden = !isLast();
    showError('');
  }

  function validateStep(){
    var step = currentStepEl();
    var prenomNomEl = step.querySelector('[name="prenom_nom"]');
    if (prenomNomEl) {
      var prenomNom = (form.prenom_nom.value || '').trim();
      var email = (form.email.value || '').trim();
      var wa = (form.whatsapp.value || '').trim();
      if (prenomNom.length < 2) { showError('Merci d’indiquer ton prénom et nom.'); form.prenom_nom.focus(); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('Merci d’indiquer un email valide.'); form.email.focus(); return false; }
      if ((wa.replace(/\D/g, '')).length < 8) { showError('Merci d’indiquer un numéro WhatsApp valide.'); form.whatsapp.focus(); return false; }
    }
    var radio = step.querySelector('input[type="radio"]');
    if (radio && !radioValue(radio.name)) {
      showError('Merci de choisir une réponse pour continuer.');
      return false;
    }
    var textarea = step.querySelector('textarea');
    if (textarea && !(textarea.value || '').trim()) {
      showError('Merci de répondre pour continuer.');
      textarea.focus();
      return false;
    }
    var checkbox = step.querySelector('input[type="checkbox"]');
    if (checkbox && !checkbox.checked) {
      showError('Merci de confirmer ta présence pour continuer.');
      return false;
    }
    return true;
  }

  function go(n){
    current = Math.max(0, Math.min(TOTAL - 1, n));
    render();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collect(){
    var pageQ = new URLSearchParams(location.search);
    var prenomNom = (form.prenom_nom.value || '').trim();
    var situation = radioValue('situation');
    var objectifs = (form.objectifs.value || '').trim();
    var experience = radioValue('experience');
    var manque = (form.manque.value || '').trim();
    var demarrage = radioValue('demarrage');
    var connaissance = radioValue('connaissance');
    var presenceEl = form.querySelector('input[name="presence"]');
    var presence = (presenceEl && presenceEl.checked) ? (presenceEl.value || '') : '';
    return {
      prenom_nom: prenomNom,
      email: (form.email.value || '').trim(),
      whatsapp: (form.whatsapp.value || '').trim(),
      situation: situation,
      objectifs: objectifs,
      experience: experience,
      manque: manque,
      demarrage: demarrage,
      connaissance: connaissance,
      presence: presence,
      // Live Apps Script may still append q1–q7 + prenom until redeployed.
      q1: situation,
      q2: objectifs,
      q3: experience,
      q4: manque,
      q5: demarrage,
      q6: connaissance,
      q7: presence,
      prenom: prenomNom,
      utm_source: pageQ.get('utm_source') || '',
      utm_medium: pageQ.get('utm_medium') || '',
      utm_campaign: pageQ.get('utm_campaign') || '',
      page_url: location.href
    };
  }

  function sendToSheet(data){
    var body = JSON.stringify(data);
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).catch(function(){});
    return fetch(SHEETS_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).then(function(){ return { ok: true }; });
  }

  function revealCalendly(){
    form.hidden = true;
    if (instaStep) instaStep.hidden = true;
    if (calendlyStep) calendlyStep.hidden = false;
    if (stickyLink) {
      stickyLink.setAttribute('href', '#calendly');
      stickyLink.removeAttribute('target');
      stickyLink.textContent = 'Réserve ton appel gratuit →';
    }
    if (typeof window.ambLoadCalendly === 'function') window.ambLoadCalendly();
    if (calendlyStep) {
      calendlyStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function revealInstagram(){
    form.hidden = true;
    if (calendlyStep) calendlyStep.hidden = true;
    if (instaStep) instaStep.hidden = false;
    if (stickyLink) {
      stickyLink.setAttribute('href', 'https://www.instagram.com/sarah.nmdsoul/');
      stickyLink.setAttribute('target', '_blank');
      stickyLink.setAttribute('rel', 'noopener noreferrer');
      stickyLink.textContent = 'Suis-moi sur Instagram →';
    }
    if (instaStep) {
      instaStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function revealAfterSubmit(skipCalendly){
    if (skipCalendly) revealInstagram();
    else revealCalendly();
  }

  form.addEventListener('change', function(e){
    var t = e.target;
    if (!t || t.type !== 'radio' || isLast() || advancing) return;
    if (!validateStep()) return;
    advancing = true;
    setTimeout(function(){ advancing = false; go(current + 1); }, 220);
  });

  if (nextBtn) nextBtn.addEventListener('click', function(){
    if (!validateStep()) return;
    go(current + 1);
  });
  if (backBtn) backBtn.addEventListener('click', function(){ go(current - 1); });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    if (!validateStep()) return;
    var data = collect();
    var required = ['prenom_nom','email','whatsapp','situation','objectifs','experience','manque','demarrage','connaissance','presence'];
    if (required.some(function(k){ return !data[k]; })) {
      showError('Toutes les questions sont obligatoires.');
      return;
    }
    var skipCalendly = data.demarrage === INSTAGRAM_OPTION;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours…';
    sendToSheet(data).then(function(){
      revealAfterSubmit(skipCalendly);
      try { window.dispatchEvent(new CustomEvent('amb:quiz-submitted')); } catch(e){}
    }).catch(function(){
      var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      if (local) { revealAfterSubmit(skipCalendly); return; }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Découvrir si le programme est fait pour moi';
      showError('Impossible d’envoyer tes réponses. Réessaie dans un instant.');
    });
  });

  render();
})();

// ── LAZY-LOAD CALENDLY ──────────────────────────────────────────────
// Loaded only after the quiz is submitted (the widget is hidden until then).
(function(){
  var wrap = document.getElementById('calendly');
  if (!wrap) return;
  var loaded = false;
  function loadCalendly(){
    if (loaded) return; loaded = true;
    try {
      var w = wrap.querySelector('.calendly-inline-widget');
      if (w) {
        var u = new URL(w.getAttribute('data-url'));
        var pageQ = new URLSearchParams(location.search);
        ['utm_source','utm_medium','utm_campaign'].forEach(function(k){
          var v = pageQ.get(k); if (v) u.searchParams.set(k, v);
        });
        var fbc = (typeof ambGetFbc === 'function') && ambGetFbc();
        var fbp = (typeof ambGetFbp === 'function') && ambGetFbp();
        var ext = (typeof ambGetExternalId === 'function') && ambGetExternalId();
        if (fbc) u.searchParams.set('utm_content', fbc);
        if (fbp) u.searchParams.set('utm_term', fbp);
        if (ext) u.searchParams.set('salesforce_uuid', ext);
        w.setAttribute('data-url', u.toString());
      }
    } catch(e){}
    var s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    document.body.appendChild(s);
  }
  window.ambLoadCalendly = loadCalendly;
  document.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('a[href="#calendly"]') : null;
    if (a) loadCalendly();
  }, true);
})();
