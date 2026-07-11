'use strict';
// Labor pool management + per-person payout history.

const { get } = require('../db/db');
const { redirect } = require('../lib/router');
const { t, reqLang } = require('../i18n');
const { esc, inr, fmtDate } = require('../lib/util');
const { page, statusBadge } = require('../views/layout');
const { render } = require('./_common');

const ROLES = ['head_cook', 'cook', 'helper', 'server', 'driver'];

module.exports = function mount(router) {
  router.get('/staff', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const rows = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM staff_assignments a WHERE a.staff_id = s.id) AS jobs,
        (SELECT COALESCE(SUM(payout_amount),0) FROM staff_assignments a WHERE a.staff_id = s.id AND paid = 0 AND payout_amount IS NOT NULL) AS due
      FROM staff s WHERE s.active = 1 ORDER BY s.role, s.name`).all();
    const content = `
<div class="card"><div class="rowlist">
${rows.map((s) => `<a href="/staff/${s.id}">
  <div class="grow"><div class="title">${esc(s.name)}</div>
  <div class="sub">${t('r_' + s.role, lang)} · ${inr(s.day_rate)}/${t('day_rate', lang)} · ${s.jobs} ${t('events_count', lang)}</div></div>
  ${s.due > 0 ? `<span class="badge red">${inr(s.due)} ${t('unpaid', lang)}</span>` : ''}</a>`).join('')}
</div></div>
<form method="post" action="/staff/new" class="card" data-draft="staff">
  <h2>＋ ${t('add', lang)}</h2>
  <label>${t('name', lang)} *</label><input name="name" required>
  <div class="grid2">
    <div><label>${t('phone', lang)}</label><input name="phone" type="tel"></div>
    <div><label>${t('day_rate', lang)} *</label><input name="day_rate" type="number" inputmode="numeric" required></div>
  </div>
  <label>${t('role', lang)}</label>
  <select name="role">${ROLES.map((r) => `<option value="${r}">${t('r_' + r, lang)}</option>`).join('')}</select>
  <button class="btn full">${t('save', lang)}</button>
</form>`;
    render(req, res, page({ lang, title: t('labor_pool', lang), active: '/more', backHref: '/more', content }));
  });

  router.post('/staff/new', (req, res) => {
    get().prepare('INSERT INTO staff (name, phone, whatsapp, role, day_rate) VALUES (?,?,?,?,?)')
      .run(String(req.body.name || '').trim(), req.body.phone || null, req.body.phone || null,
        ROLES.includes(req.body.role) ? req.body.role : 'helper', Number(req.body.day_rate) || 0);
    redirect(res, '/staff');
  });

  router.get('/staff/:id', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const s = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!s) return redirect(res, '/staff');
    const history = db.prepare(`
      SELECT a.*, e.event_date, c.name AS client_name FROM staff_assignments a
      JOIN events e ON e.id = a.event_id JOIN clients c ON c.id = e.client_id
      WHERE a.staff_id = ? ORDER BY e.event_date DESC LIMIT 50`).all(s.id);
    const dueTotal = history.filter((h) => !h.paid && h.payout_amount).reduce((x, h) => x + h.payout_amount, 0);
    const content = `
<div class="card">
  <div class="title">${esc(s.name)}</div>
  <div class="sub">${t('r_' + s.role, lang)} · ${inr(s.day_rate)}/${t('day_rate', lang)} · ${esc(s.phone || '')}</div>
  ${dueTotal ? `<p style="margin-top:.4rem"><span class="badge red">${t('payout', lang)} ${t('unpaid', lang)}: ${inr(dueTotal)}</span></p>` : ''}
  <form method="post" action="/staff/${s.id}/edit">
    <div class="grid2">
      <div><label>${t('day_rate', lang)}</label><input name="day_rate" type="number" value="${s.day_rate}"></div>
      <div><label>${t('phone', lang)}</label><input name="phone" value="${esc(s.phone || '')}"></div>
    </div>
    <button class="btn full">${t('save', lang)}</button>
  </form>
</div>
<div class="card"><h2>${t('events_count', lang)}</h2><div class="rowlist">
${history.map((h) => `<a href="/events/${h.event_id}/staff">
  <div class="grow"><div class="title">${esc(h.client_name)}</div>
  <div class="sub">${fmtDate(h.event_date, lang)} · ${t('r_' + h.role, lang)} · ${inr(h.agreed_rate)}</div></div>
  <div class="right">${h.payout_amount != null ? inr(h.payout_amount) : ''}
  <div class="sub">${h.attendance ? t('att_' + h.attendance, lang) : t('as_' + h.status, lang)}${h.paid ? ' · ' + t('paid', lang) : ''}</div></div>
</a>`).join('') || `<div class="muted">—</div>`}
</div></div>`;
    render(req, res, page({ lang, title: esc(s.name), active: '/more', backHref: '/staff', content }));
  });

  router.post('/staff/:id/edit', (req, res) => {
    get().prepare('UPDATE staff SET day_rate = COALESCE(?, day_rate), phone = COALESCE(?, phone) WHERE id = ?')
      .run(Number(req.body.day_rate) || null, req.body.phone || null, req.params.id);
    redirect(res, `/staff/${req.params.id}`);
  });
};
