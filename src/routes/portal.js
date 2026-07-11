'use strict';
// Client-facing self-service (public, trilingual):
//   /portal            browse the three thali tiers
//   /portal/quote      request a quotation (creates client + lead)
//   /portal/status/:t  live enquiry/booking status by private token
//   /p/:token          view proposal + accept (typed-name e-sign) → booked event
// Every step is mirrored on WhatsApp via logged wa.me handoffs.

const { get } = require('../db/db');
const { redirect } = require('../lib/router');
const { t, reqLang, locName } = require('../i18n');
const { esc, inr, fmtDate, token, waPhone } = require('../lib/util');
const { publicPage, statusBadge } = require('../views/layout');
const { render, baseUrl } = require('./_common');
const proposals = require('../services/proposals');
const billing = require('../services/billing');
const wa = require('../services/whatsapp');
const { proposalDoc } = require('../views/docs');

const EVENT_TYPES = ['wedding', 'engagement', 'thread_ceremony', 'birthday', 'corporate', 'religious', 'other'];

function bizPhone(db) {
  const r = db.prepare("SELECT value FROM settings WHERE key = 'business_phone'").get();
  return r ? r.value : '';
}

module.exports = function mount(router) {
  router.get('/portal', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const pkgs = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY tier').all();
    const cards = pkgs.map((p) => {
      const ds = db.prepare('SELECT d.* FROM package_dishes pd JOIN dishes d ON d.id = pd.dish_id WHERE pd.package_id = ? ORDER BY d.category').all(p.id);
      return `<div class="pkg t${p.tier}">
  <div style="display:flex;justify-content:space-between;align-items:baseline">
    <b style="font-size:1.1rem">${esc(locName(p, 'name', lang))}</b>
    <span class="price">${inr(p.base_price_per_plate)}<span style="font-size:.8rem" class="muted"> ${t('per_plate', lang)} ${t('onwards', lang)}</span></span>
  </div>
  <div class="muted">${esc(locName(p, 'desc', lang))}</div>
  <div class="dishes">${ds.map((d) => esc(locName(d, 'name', lang))).join(' · ')}</div>
  <div class="muted" style="margin-top:.3rem">${t('min_guests_note', lang)}: ${p.min_guests} ${t('guests', lang)}</div>
</div>`;
    }).join('');
    const content = `
<p class="center muted" style="margin:.4rem 0 1rem">${t('portal_tagline', lang)}</p>
<h2 style="margin:.4rem 0 .6rem;color:var(--brand-2)">${t('our_packages', lang)}</h2>
${cards}
<a class="btn full" href="/portal/quote">📋 ${t('request_quote', lang)}</a>
<a class="btn full ghost wa" style="color:#128c7e;border-color:#128c7e" target="_blank"
   href="https://wa.me/${waPhone(bizPhone(db))}">📲 ${t('whatsapp_us', lang)}</a>`;
    render(req, res, publicPage({ lang, title: t('business_name', lang), content }));
  });

  router.get('/portal/quote', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const pkgs = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY tier').all();
    const content = `
<div class="offline-note">${t('offline_note', lang)}</div>
<form method="post" action="/portal/quote" data-draft="quote" class="card">
  <h2>${t('your_details', lang)}</h2>
  <label>${t('name', lang)} *</label><input name="name" required>
  <label>${t('phone', lang)} (WhatsApp) *</label><input name="phone" type="tel" required inputmode="tel">
  <h2 style="margin-top:1rem">${t('event_details', lang)}</h2>
  <div class="grid2">
    <div><label>${t('event_type', lang)}</label>
      <select name="event_type">${EVENT_TYPES.map((et) => `<option value="${et}">${t('et_' + et, lang)}</option>`).join('')}</select></div>
    <div><label>${t('meal', lang)}</label>
      <select name="meal">${['lunch', 'dinner', 'breakfast'].map((m) => `<option value="${m}">${t('meal_' + m, lang)}</option>`).join('')}</select></div>
  </div>
  <div class="grid2">
    <div><label>${t('date', lang)}</label><input name="event_date" type="date"></div>
    <div><label>${t('guest_count', lang)}</label><input name="guest_count" type="number" min="1" inputmode="numeric"></div>
  </div>
  <label>${t('venue', lang)}</label><input name="venue_text">
  <label>${t('package', lang)}</label>
  <select name="package_pref"><option value="">—</option>${pkgs.map((p) => `<option>${esc(locName(p, 'name', lang))}</option>`).join('')}</select>
  <button class="btn full">${t('submit', lang)}</button>
</form>`;
    render(req, res, publicPage({ lang, title: t('request_quote', lang), content }));
  });

  router.post('/portal/quote', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const phone = String(req.body.phone || '').trim();
    let client = phone ? db.prepare('SELECT * FROM clients WHERE phone = ?').get(phone) : null;
    const clientId = client ? client.id : Number(db.prepare(
      'INSERT INTO clients (name, phone, whatsapp, lang) VALUES (?,?,?,?)')
      .run(String(req.body.name || '').trim() || 'Unknown', phone, phone, lang).lastInsertRowid);
    const tok = token();
    const notes = req.body.package_pref ? `Package preference: ${req.body.package_pref}` : null;
    db.prepare(`INSERT INTO leads (client_id, source, event_type, event_date, meal, guest_count, venue_text, notes, token)
                VALUES (?, 'portal', ?,?,?,?,?,?,?)`)
      .run(clientId, req.body.event_type || null, req.body.event_date || null, req.body.meal || 'lunch',
        Number(req.body.guest_count) || null, req.body.venue_text || null, notes, tok);
    // Mirror over WhatsApp: acknowledgement with tracking link (logged; wa.me handoff)
    wa.sendTemplate(db, {
      templateKey: 'quote_ack', lang, phone, clientId,
      vars: { name: req.body.name, url: `${baseUrl(req)}/portal/status/${tok}` },
    });
    redirect(res, `/portal/status/${tok}?new=1`);
  });

  router.get('/portal/status/:token', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const lead = db.prepare('SELECT l.*, c.name AS client_name FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.token = ?').get(req.params.token);
    if (!lead) return render(req, res, publicPage({ lang, title: '?', content: `<div class="card">🔍 —</div>` }), 404);
    const prop = db.prepare("SELECT * FROM proposals WHERE lead_id = ? AND status IN ('sent','viewed','accepted') ORDER BY version DESC LIMIT 1").get(lead.id);
    const ev = db.prepare('SELECT * FROM events WHERE lead_id = ?').get(lead.id);
    const bal = ev ? billing.eventBalance(db, ev.id) : null;

    const steps = ['new', 'contacted', 'proposal_sent', 'confirmed'];
    const idx = Math.max(steps.indexOf(lead.status), 0);
    const timeline = steps.map((s, i) =>
      `<div class="checkline"><span style="font-size:1.2rem">${i <= idx ? '✅' : '⚪'}</span>
       <span style="${i <= idx ? 'font-weight:600' : 'color:var(--muted)'}">${t('ls_' + s, lang)}</span></div>`).join('');

    const content = `
${req.query.new ? `<div class="ok-note">${t('quote_submitted', lang)}</div>` : ''}
<div class="card">
  <h2>${t('status_of_enquiry', lang)}</h2>
  <div class="sub" style="margin-bottom:.5rem">${esc(lead.client_name)} · ${t('et_' + (lead.event_type || 'other'), lang)} · ${fmtDate(lead.event_date, lang)} · ${lead.guest_count || '?'} ${t('guests', lang)}</div>
  ${lead.status === 'lost' ? statusBadge('lost', t('ls_lost', lang)) : timeline}
</div>
${prop ? `<a class="btn full" href="/p/${prop.token}">📄 ${t('proposal', lang)} — ${inr(prop.per_plate_price)} ${t('per_plate', lang)}</a>` : ''}
${ev && bal ? `<div class="card"><h2>${t('nav_money', lang)}</h2>
  <table class="tbl">
    <tr><td>${t('total', lang)}</td><td class="num">${inr(bal.contractValue)}</td></tr>
    <tr><td>${t('received', lang)}</td><td class="num">${inr(bal.paid)}</td></tr>
    <tr><td><b>${t('balance_due', lang)}</b></td><td class="num"><b>${inr(bal.balance)}</b></td></tr>
  </table></div>` : ''}
<a class="btn full ghost" target="_blank" href="https://wa.me/${waPhone(bizPhone(db))}">📲 ${t('whatsapp_us', lang)}</a>`;
    render(req, res, publicPage({ lang, title: t('track_status', lang), content }));
  });

  // Public proposal: view (marks viewed) + accept (e-sign → booked event)
  router.get('/p/:token', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const prop = db.prepare('SELECT * FROM proposals WHERE token = ?').get(req.params.token);
    if (!prop) return render(req, res, publicPage({ lang, title: '?', content: '<div class="card">—</div>' }), 404);
    proposals.markViewed(db, prop.id);
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(prop.lead_id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(lead.client_id);
    render(req, res, proposalDoc({
      lang, proposal: db.prepare('SELECT * FROM proposals WHERE id = ?').get(prop.id),
      lead, client, acceptUrl: `/p/${prop.token}/accept`,
    }));
  });

  router.post('/p/:token/accept', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const prop = db.prepare('SELECT * FROM proposals WHERE token = ?').get(req.params.token);
    if (!prop) return redirect(res, '/portal');
    const ev = proposals.acceptProposal(db, prop.id, { name: req.body.name, phone: req.body.phone });
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(prop.lead_id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(lead.client_id);
    // Mirror confirmation on WhatsApp (logged)
    wa.sendTemplate(db, {
      templateKey: 'booking_confirmed', lang: client.lang, phone: client.whatsapp || client.phone,
      clientId: client.id, leadId: lead.id, eventId: ev.id,
      vars: {
        name: client.name, date: ev.event_date, guests: ev.guest_count, venue: ev.venue_text,
        total: prop.total, advance: Math.round(prop.total * prop.advance_pct / 100),
        url: `${baseUrl(req)}/portal/status/${lead.token}`,
      },
    });
    const content = `
<div class="ok-note" style="font-size:1.05rem">✅ ${t('proposal_accepted', lang)}</div>
<div class="card">
  <table class="tbl">
    <tr><td>${t('date', lang)}</td><td class="num">${fmtDate(ev.event_date, lang)}</td></tr>
    <tr><td>${t('guest_count', lang)}</td><td class="num">${ev.guest_count}</td></tr>
    <tr><td>${t('total', lang)}</td><td class="num"><b>${inr(prop.total)}</b></td></tr>
    <tr><td>${t('advance', lang)} (${prop.advance_pct}%)</td><td class="num">${inr(Math.round(prop.total * prop.advance_pct / 100))}</td></tr>
  </table>
</div>
${lead.token ? `<a class="btn full" href="/portal/status/${lead.token}">📍 ${t('track_status', lang)}</a>` : ''}`;
    render(req, res, publicPage({ lang, title: t('accept_proposal', lang), content }));
  });

  // Admin-side printable proposal
  router.get('/proposals/:id/print', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const prop = db.prepare('SELECT * FROM proposals WHERE id = ?').get(req.params.id);
    if (!prop) return redirect(res, '/leads');
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(prop.lead_id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(lead.client_id);
    render(req, res, proposalDoc({ lang, proposal: prop, lead, client, acceptUrl: null }));
  });
};
