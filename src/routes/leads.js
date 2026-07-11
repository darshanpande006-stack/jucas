'use strict';
// Slice 1: lead capture → proposal → send on WhatsApp → e-sign → booked event.

const { get } = require('../db/db');
const { redirect } = require('../lib/router');
const { t, reqLang, locName } = require('../i18n');
const { esc, inr, fmtDate, token } = require('../lib/util');
const { page, statusBadge } = require('../views/layout');
const { render, baseUrl } = require('./_common');
const proposals = require('../services/proposals');
const { quote } = require('../services/pricing');
const wa = require('../services/whatsapp');

const LEAD_STATUSES = ['new', 'contacted', 'proposal_sent', 'confirmed', 'lost'];
const EVENT_TYPES = ['wedding', 'engagement', 'thread_ceremony', 'birthday', 'corporate', 'religious', 'other'];
const SOURCES = ['walk_in', 'phone', 'whatsapp', 'referral', 'portal'];

function clientFields(lang, c = {}) {
  return `
<label>${t('name', lang)} *</label><input name="client_name" required value="${esc(c.name || '')}">
<div class="grid2">
  <div><label>${t('phone', lang)} *</label><input name="client_phone" type="tel" required value="${esc(c.phone || '')}"></div>
  <div><label>WhatsApp</label><input name="client_whatsapp" type="tel" value="${esc(c.whatsapp || '')}" placeholder="= ${t('phone', lang)}"></div>
</div>
<label>${t('language', lang)}</label>
<select name="client_lang">${['mr', 'hi', 'en'].map((l) => `<option value="${l}" ${((c.lang || 'mr') === l) ? 'selected' : ''}>${{ mr: 'मराठी', hi: 'हिंदी', en: 'English' }[l]}</option>`).join('')}</select>`;
}

function eventFields(lang, l = {}) {
  return `
<div class="grid2">
  <div><label>${t('event_type', lang)}</label>
    <select name="event_type">${EVENT_TYPES.map((et) => `<option value="${et}" ${l.event_type === et ? 'selected' : ''}>${t('et_' + et, lang)}</option>`).join('')}</select></div>
  <div><label>${t('meal', lang)}</label>
    <select name="meal">${['lunch', 'dinner', 'breakfast'].map((m) => `<option value="${m}" ${l.meal === m ? 'selected' : ''}>${t('meal_' + m, lang)}</option>`).join('')}</select></div>
</div>
<div class="grid2">
  <div><label>${t('date', lang)}</label><input name="event_date" type="date" value="${esc(l.event_date || '')}"></div>
  <div><label>${t('guest_count', lang)}</label><input name="guest_count" type="number" min="1" inputmode="numeric" value="${esc(l.guest_count || '')}"></div>
</div>
<label>${t('venue', lang)}</label><input name="venue_text" value="${esc(l.venue_text || '')}">
<label>${t('notes', lang)}</label><textarea name="notes">${esc(l.notes || '')}</textarea>`;
}

// Find-or-create a client by phone.
function upsertClient(db, body) {
  const phone = String(body.client_phone || '').trim();
  const existing = phone ? db.prepare('SELECT * FROM clients WHERE phone = ?').get(phone) : null;
  if (existing) return existing.id;
  return Number(db.prepare('INSERT INTO clients (name, phone, whatsapp, lang) VALUES (?,?,?,?)')
    .run(String(body.client_name || '').trim() || 'Unknown', phone || null,
      String(body.client_whatsapp || '').trim() || phone || null, body.client_lang || 'mr')
    .lastInsertRowid);
}

module.exports = function mount(router) {
  const db = () => get();

  router.get('/leads', (req, res) => {
    const lang = reqLang(req);
    const filter = req.query.status;
    const rows = db().prepare(`
      SELECT l.*, c.name AS client_name, c.phone FROM leads l JOIN clients c ON c.id = l.client_id
      ${filter ? 'WHERE l.status = ?' : "WHERE l.status != 'lost'"} ORDER BY l.updated_at DESC LIMIT 100`)
      .all(...(filter ? [filter] : []));
    const chips = LEAD_STATUSES.map((s) =>
      `<a class="${filter === s ? 'on' : ''}" href="/leads?status=${s}">${t('ls_' + s, lang)}</a>`).join('');
    const content = `
<div class="subtabs"><a class="${!filter ? 'on' : ''}" href="/leads">${t('view_all', lang)}</a>${chips}</div>
<div class="card"><div class="rowlist">
${rows.map((l) => `<a href="/leads/${l.id}">
  <div class="grow"><div class="title">${esc(l.client_name)}</div>
  <div class="sub">${esc(t('et_' + (l.event_type || 'other'), lang))} · ${esc(fmtDate(l.event_date, lang))} · ${l.guest_count || '?'} ${t('guests', lang)}</div></div>
  ${statusBadge(l.status, t('ls_' + l.status, lang))}</a>`).join('') || `<div class="muted">—</div>`}
</div></div>`;
    render(req, res, page({ lang, title: t('nav_enquiries', lang), active: '/leads', content, fab: { href: '/leads/new', label: t('new_enquiry', lang) } }));
  });

  router.get('/leads/new', (req, res) => {
    const lang = reqLang(req);
    const content = `
<div class="offline-note">${t('offline_note', lang)}</div>
<form method="post" action="/leads/new" data-draft="lead" class="card">
  <h2>${t('client', lang)}</h2>
  ${clientFields(lang)}
  <h2 style="margin-top:1rem">${t('event_details', lang)}</h2>
  <label>${t('lead_source', lang)}</label>
  <select name="source">${SOURCES.map((s) => `<option value="${s}">${t('src_' + s, lang)}</option>`).join('')}</select>
  ${eventFields(lang)}
  <button class="btn full">${t('save', lang)}</button>
</form>`;
    render(req, res, page({ lang, title: t('new_enquiry', lang), active: '/leads', backHref: '/leads', content }));
  });

  router.post('/leads/new', (req, res) => {
    const d = db();
    const clientId = upsertClient(d, req.body);
    const id = Number(d.prepare(`
      INSERT INTO leads (client_id, source, event_type, event_date, meal, guest_count, venue_text, notes, token)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(clientId, req.body.source || 'walk_in', req.body.event_type || null, req.body.event_date || null,
        req.body.meal || 'lunch', Number(req.body.guest_count) || null, req.body.venue_text || null,
        req.body.notes || null, token()).lastInsertRowid);
    redirect(res, `/leads/${id}`);
  });

  router.get('/leads/:id', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const l = d.prepare('SELECT l.*, c.name AS client_name, c.phone, c.whatsapp, c.lang AS client_lang FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = ?').get(req.params.id);
    if (!l) return render(req, res, page({ lang, title: '?', content: 'Not found' }), 404);
    const props = d.prepare('SELECT * FROM proposals WHERE lead_id = ? ORDER BY version DESC').all(l.id);
    const pkgs = d.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY tier').all();
    const addonDishes = d.prepare('SELECT * FROM dishes WHERE active = 1 AND addon_price_per_plate > 0 ORDER BY category, name_en').all();
    const comms = d.prepare('SELECT * FROM comm_logs WHERE lead_id = ? ORDER BY id DESC LIMIT 10').all(l.id);
    const ev = d.prepare('SELECT id FROM events WHERE lead_id = ?').get(l.id);

    const statusBtns = LEAD_STATUSES.map((s) => `
      <form method="post" action="/leads/${l.id}/status"><input type="hidden" name="status" value="${s}">
      <button class="btn sm ${l.status === s ? '' : 'ghost'}">${t('ls_' + s, lang)}</button></form>`).join('');

    const content = `
<div class="card">
  <div class="rowlist">
    <div><div class="grow"><div class="title">${esc(l.client_name)}</div>
      <div class="sub">${esc(l.phone || '')} · ${t('src_' + l.source, lang)}</div></div>
      ${statusBadge(l.status, t('ls_' + l.status, lang))}</div>
    <div><div class="grow sub">${t('et_' + (l.event_type || 'other'), lang)} · ${esc(fmtDate(l.event_date, lang))} · ${t('meal_' + (l.meal || 'lunch'), lang)}<br>
      ${l.guest_count || '?'} ${t('guests', lang)} · ${esc(l.venue_text || '—')}${l.notes ? `<br>📝 ${esc(l.notes)}` : ''}</div></div>
  </div>
  <div class="btnrow">${statusBtns}</div>
  ${ev ? `<div class="btnrow"><a class="btn full" href="/events/${ev.id}">📅 ${t('event', lang)} ›</a></div>` : ''}
</div>

<div class="card">
  <h2>${t('proposal', lang)}</h2>
  <div class="rowlist">
  ${props.map((p) => `<div>
    <div class="grow"><div class="title">v${p.version} · ${inr(p.per_plate_price)} ${t('per_plate', lang)}</div>
      <div class="sub">${t('total', lang)} ${inr(p.total)} · ${t('valid_until', lang)} ${fmtDate(p.valid_until, lang)}</div>
      <div class="btnrow">
        <a class="btn sm ghost" href="/proposals/${p.id}/print" target="_blank">${t('download_pdf', lang)}</a>
        ${p.status !== 'accepted' ? `<form method="post" action="/proposals/${p.id}/send"><button class="btn sm wa">📲 ${t('send_whatsapp', lang)}</button></form>` : ''}
      </div></div>
    ${statusBadge(p.status, p.status)}</div>`).join('') || ''}
  </div>
  ${l.status !== 'confirmed' ? `
  <form method="post" action="/leads/${l.id}/proposal" id="price-form" data-draft="proposal">
    <label>${t('choose_package', lang)}</label>
    <select name="package_id">${pkgs.map((p) => `<option value="${p.id}">${esc(locName(p, 'name', lang))} — ${inr(p.base_price_per_plate)}</option>`).join('')}</select>
    <label>${t('guest_count', lang)}</label>
    <input name="guest_count" type="number" min="1" inputmode="numeric" required value="${esc(l.guest_count || '')}">
    <label>${t('addons', lang)}</label>
    ${addonDishes.map((dd) => `<div class="checkline"><input type="checkbox" name="addon" value="${dd.id}" id="a${dd.id}">
      <label for="a${dd.id}" style="margin:0;flex:1;color:inherit">${esc(locName(dd, 'name', lang))}</label>
      <span class="muted">+${inr(dd.addon_price_per_plate)}</span></div>`).join('')}
    <div class="rowlist"><div><div class="grow">${t('price_per_plate', lang)} <span id="disc" class="badge green"></span></div><div class="right big" id="pp">—</div></div>
    <div><div class="grow">${t('estimated_total', lang)}</div><div class="right big" id="tt">—</div></div></div>
    <button class="btn full">${t('make_proposal', lang)}</button>
  </form>` : ''}
</div>

<div class="card"><h2>💬 WhatsApp / ${t('notes', lang)}</h2>
  <div class="rowlist">${comms.map((cm) => `<div><div class="grow sub">${esc(cm.body).slice(0, 160)}…<br><b>${cm.template_key || cm.channel}</b> · ${cm.created_at}</div></div>`).join('') || `<div class="muted">—</div>`}</div>
</div>`;
    render(req, res, page({ lang, title: `${t('lead', lang)} #${l.id}`, active: '/leads', backHref: '/leads', content }));
  });

  router.post('/leads/:id/status', (req, res) => {
    if (LEAD_STATUSES.includes(req.body.status)) {
      db().prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.status, req.params.id);
    }
    redirect(res, `/leads/${req.params.id}`);
  });

  router.post('/leads/:id/proposal', (req, res) => {
    const addons = [].concat(req.body.addon || []).map(Number).filter(Boolean);
    const p = proposals.createProposal(db(), {
      leadId: Number(req.params.id),
      packageId: Number(req.body.package_id) || null,
      guestCount: Number(req.body.guest_count) || 0,
      addonDishIds: addons,
    });
    redirect(res, `/leads/${req.params.id}`);
  });

  // Send proposal on WhatsApp: logs to comm_logs, then opens wa.me pre-filled.
  router.post('/proposals/:id/send', (req, res) => {
    const d = db();
    const p = proposals.markSent(d, Number(req.params.id));
    const l = d.prepare('SELECT l.*, c.name AS client_name, c.whatsapp, c.phone, c.lang AS client_lang, c.id AS cid FROM leads l JOIN clients c ON c.id = l.client_id WHERE l.id = ?').get(p.lead_id);
    const { link } = wa.sendTemplate(d, {
      templateKey: 'proposal_link', lang: l.client_lang,
      phone: l.whatsapp || l.phone, clientId: l.cid, leadId: l.id,
      vars: { name: l.client_name, url: `${baseUrl(req)}/p/${p.token}`, guests: p.guest_count, date: l.event_date, perPlate: p.per_plate_price },
    });
    redirect(res, link || `/leads/${p.lead_id}`);
  });
};
