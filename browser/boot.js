'use strict';
// Browser boot: runs the REAL Jucas server code fully client-side.
// The same Router + routes + services + views execute against SQLite-in-WASM;
// this file fakes just enough of node:http's req/res and plays "browser as
// network": link clicks and form submits become dispatched requests, the
// response HTML is rendered into an iframe. DB persists to localStorage.

const dbShim = require('./shims/db-shim');
const { Router } = require('../src/lib/router');
const { seed } = require('../src/db/seed');

// Injected by build.js via esbuild `define`
/* global __JUCAS_CSS__, __JUCAS_APPJS__, __JUCAS_WASM_B64__ */
const CSS = __JUCAS_CSS__;
const APP_JS = __JUCAS_APPJS__;

const HOST = 'jucas.demo';
let currentPath = '/';
const cookieJar = {};

// ── fake req/res ──
function makeReq(method, url, body) {
  const cookie = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    method, url,
    headers: { host: HOST, cookie, referer: `http://${HOST}${currentPath}`,
      'content-type': body != null ? 'application/x-www-form-urlencoded' : undefined },
    on(ev, cb) {
      if (ev === 'data' && body) cb(body);
      if (ev === 'end') cb();
    },
    destroy() {},
  };
}

function makeRes(done) {
  let status = 200; const headers = {}; let chunks = '';
  return {
    writeHead(s, h) { status = s; Object.assign(headers, h || {}); },
    end(chunk) {
      if (chunk != null) chunks += chunk;
      const sc = headers['Set-Cookie'];
      if (sc) {
        const m = /^([^=]+)=([^;]*)/.exec(sc);
        if (m) cookieJar[m[1]] = decodeURIComponent(m[2]);
      }
      done({ status, headers, body: chunks });
    },
    // stream API used by static/file handlers (never hit in browser build)
    write(chunk) { chunks += chunk; },
  };
}

const router = new Router();

function dispatch(method, url, body) {
  return new Promise((resolve) => {
    const req = makeReq(method, url, body);
    const res = makeRes(resolve);
    router.handle(req, res);
  });
}

// ── HTML post-processing: make each server page self-contained in the iframe ──
function prepareHtml(html) {
  const fetchShim = `<script>
(function(){
  var _dispatch = parent.__jucasDispatch;
  window.fetch = function(url){
    return _dispatch('GET', String(url)).then(function(r){
      return { json: function(){ return Promise.resolve(JSON.parse(r.body)); }, text: function(){ return Promise.resolve(r.body); } };
    });
  };
  // no service worker inside the demo iframe
  if (navigator.serviceWorker) navigator.serviceWorker.register = function(){ return Promise.reject(new Error('demo')); };
})();
<\/script>`;
  return html
    .replace('<link rel="stylesheet" href="/public/app.css">', `<style>${CSS}</style>`)
    .replace('<link rel="manifest" href="/public/manifest.webmanifest">', '')
    .replace('<script src="/public/app.js" defer></script>', `${fetchShim}<script>${APP_JS}<\/script>`);
}

// ── navigation ──
const frame = () => document.getElementById('app');

async function navigate(method, url, body) {
  const r = await dispatch(method, url, body);
  if (method === 'POST') dbShim.persist();
  if (r.status >= 300 && r.status < 400 && r.headers.Location) {
    const loc = r.headers.Location;
    if (/^https?:\/\//.test(loc) && !loc.startsWith(`http://${HOST}`)) {
      // external handoff (wa.me): open in a new tab, stay on the current page
      window.open(loc, '_blank');
      return navigate('GET', currentPath.startsWith('/') ? currentPath : '/');
    }
    return navigate('GET', loc.replace(`http://${HOST}`, ''));
  }
  if (method === 'GET') currentPath = url;
  frame().srcdoc = prepareHtml(r.body);
}

function hookFrame() {
  const doc = frame().contentDocument;
  if (!doc) return;
  doc.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('tel:') || href.startsWith('mailto:')) return; // native
    if (/^https?:\/\//.test(href)) { a.target = '_blank'; return; }    // external, e.g. wa.me
    e.preventDefault();
    navigate('GET', href.startsWith('/') ? href : resolveRelative(href));
  });
  doc.addEventListener('submit', (e) => {
    const form = e.target;
    e.preventDefault();
    const fd = new FormData(form);
    if (e.submitter && e.submitter.name) fd.append(e.submitter.name, e.submitter.value || '');
    const body = new URLSearchParams(fd).toString();
    const action = form.getAttribute('action') || currentPath;
    const method = (form.getAttribute('method') || 'get').toUpperCase();
    if (method === 'GET') navigate('GET', action + (body ? '?' + body : ''));
    else navigate('POST', action, body);
  });
}

function resolveRelative(href) {
  if (href.startsWith('?')) return currentPath.split('?')[0] + href;
  const base = currentPath.split('?')[0].split('/').slice(0, -1).join('/');
  return (base || '') + '/' + href;
}

// Demo content so first open isn't an empty screen (only on a fresh DB).
function seedDemo(db) {
  const proposals = require('../src/services/proposals');
  const scaling = require('../src/services/scaling');
  const staffing = require('../src/services/staffing');
  const billing = require('../src/services/billing');
  const { token } = require('../src/lib/util');

  const inWeeks = (w) => new Date(Date.now() + w * 7 * 864e5).toISOString().slice(0, 10);
  const clientId = Number(db.prepare(
    "INSERT INTO clients (name, phone, whatsapp, lang) VALUES ('Anil Deshmukh', '9876543210', '9876543210', 'mr')").run().lastInsertRowid);
  const leadId = Number(db.prepare(`
    INSERT INTO leads (client_id, source, event_type, event_date, meal, guest_count, venue_text, token)
    VALUES (?, 'phone', 'wedding', ?, 'lunch', 800, 'Sai Lawns', ?)`)
    .run(clientId, inWeeks(6), token()).lastInsertRowid);
  const pkg = db.prepare("SELECT id FROM packages WHERE code = 'RAJWADI'").get();
  const solkadhi = db.prepare("SELECT id FROM dishes WHERE name_en = 'Solkadhi'").get();
  const prop = proposals.createProposal(db, { leadId, packageId: pkg.id, guestCount: 800, addonDishIds: [solkadhi.id] });
  proposals.markSent(db, prop.id);
  const ev = proposals.acceptProposal(db, prop.id, { name: 'Anil Deshmukh', phone: '9876543210' });
  scaling.generateProcurement(db, ev.id);
  staffing.assign(db, { eventId: ev.id, staffId: 1 });
  staffing.assign(db, { eventId: ev.id, staffId: 11 });
  staffing.setStatus(db, db.prepare('SELECT id FROM staff_assignments WHERE event_id = ? LIMIT 1').get(ev.id).id, 'confirmed');
  billing.recordPayment(db, { eventId: ev.id, amount: 160000, method: 'upi', ref: 'UPI-2201' });
  billing.createInvoiceForEvent(db, ev.id);

  // a fresh open enquiry in the pipeline
  const c2 = Number(db.prepare(
    "INSERT INTO clients (name, phone, whatsapp, lang) VALUES ('Patil Family', '9765432100', '9765432100', 'mr')").run().lastInsertRowid);
  db.prepare(`INSERT INTO leads (client_id, source, event_type, event_date, meal, guest_count, venue_text, token)
    VALUES (?, 'portal', 'thread_ceremony', ?, 'lunch', 350, 'Shrirampur Mangal Karyalay', ?)`)
    .run(c2, inWeeks(3), token());
}

async function main() {
  const wasmBinary = Uint8Array.from(atob(__JUCAS_WASM_B64__), (c) => c.charCodeAt(0)).buffer;
  const db = await dbShim.init({ wasmBinary });
  if (db.prepare('SELECT COUNT(*) AS c FROM packages').get().c === 0) {
    seed(db);
    try { seedDemo(db); } catch (e) { console.warn('demo seed skipped:', e); }
    dbShim.persist();
  }

  require('../src/routes/dashboard')(router);
  require('../src/routes/leads')(router);
  require('../src/routes/events')(router);
  require('../src/routes/staff')(router);
  require('../src/routes/money')(router);
  require('../src/routes/reports')(router);
  require('../src/routes/catalog')(router);
  require('../src/routes/portal')(router);
  require('../src/routes/api')(router);

  window.__jucasDispatch = dispatch;
  frame().addEventListener('load', hookFrame);
  document.getElementById('reset').addEventListener('click', () => {
    if (window.confirm('Reset demo data? / डेमो डेटा पुसायचा?')) {
      dbShim.reset(); location.reload();
    }
  });
  await navigate('GET', '/');
}

main().catch((e) => {
  document.getElementById('boot-error').textContent = 'Failed to start: ' + e.message;
  console.error(e);
});
