// Jucas client enhancements. Every page works without this file —
// it only adds: offline form-draft autosave, live price recalc, SW install.
(function () {
  'use strict';

  // ── Offline-tolerant forms: autosave drafts to localStorage ──
  // Any <form data-draft> keeps its fields on this phone until submitted.
  document.querySelectorAll('form[data-draft]').forEach(function (form) {
    var key = 'jucas-draft:' + location.pathname + ':' + (form.getAttribute('data-draft') || '');
    try {
      var saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved) {
        Object.keys(saved).forEach(function (name) {
          var el = form.elements[name];
          if (el && !el.value) el.value = saved[name];
        });
      }
    } catch (e) {}
    form.addEventListener('input', function () {
      var data = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.name && el.type !== 'checkbox' && el.type !== 'submit') data[el.name] = el.value;
      });
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
    });
    form.addEventListener('submit', function () {
      try { localStorage.removeItem(key); } catch (e) {}
    });
  });

  // Show the offline banner when there's no connection.
  var note = document.querySelector('.offline-note');
  if (note) {
    var update = function () { note.style.display = navigator.onLine ? 'none' : 'block'; };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  // ── Live pricing preview on the menu screen ──
  // Elements: #price-form with package select + addon checkboxes + guest count;
  // targets #pp (per plate) and #tt (total).
  var pf = document.getElementById('price-form');
  if (pf) {
    var recalc = function () {
      var pkg = pf.querySelector('[name=package_id]');
      var guests = pf.querySelector('[name=guest_count]');
      var addons = Array.prototype.filter.call(
        pf.querySelectorAll('input[name=addon]:checked'), function () { return true; }
      ).map(function (el) { return el.value; });
      var qs = 'package_id=' + (pkg ? pkg.value : '') +
        '&guest_count=' + (guests ? guests.value : '') +
        '&addons=' + addons.join(',');
      fetch('/api/pricing/quote?' + qs)
        .then(function (r) { return r.json(); })
        .then(function (q) {
          var pp = document.getElementById('pp'), tt = document.getElementById('tt');
          if (pp) pp.textContent = '₹' + q.perPlate.toLocaleString('en-IN');
          if (tt) tt.textContent = '₹' + q.total.toLocaleString('en-IN');
          var d = document.getElementById('disc');
          if (d) d.textContent = q.discountPct ? '−' + q.discountPct + '%' : '';
        })
        .catch(function () { /* offline: server value stays */ });
    };
    pf.addEventListener('change', recalc);
    var g = pf.querySelector('[name=guest_count]');
    if (g) g.addEventListener('input', recalc);
  }

  // ── Service worker: cache static shell for patchy connections ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
})();
