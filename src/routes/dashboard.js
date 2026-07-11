'use strict';
// Home screen — built for the least technical user in the business.
// Everything he needs is one glance + one tap: today's events, upcoming
// events, money due, and a big "new" button.

const { get } = require('../db/db');
const { t, reqLang } = require('../i18n');
const { esc, inr, fmtDate, today } = require('../lib/util');
const { page, statusBadge } = require('../views/layout');
const { render } = require('./_common');
const { outstanding } = require('../services/reports');

function eventRow(ev, lang) {
  return `<a href="/events/${ev.id}">
    <div class="grow">
      <div class="title">${esc(ev.client_name)}</div>
      <div class="sub">${esc(fmtDate(ev.event_date, lang))} · ${esc(t('meal_' + (ev.meal || 'lunch'), lang))} · ${esc(ev.venue_text || ev.venue_name || '')}</div>
    </div>
    <div class="right">${ev.guest_count} <div class="sub">${t('guests', lang)}</div></div>
  </a>`;
}

module.exports = function mount(router) {
  router.get('/', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const td = today();

    const todays = db.prepare(`
      SELECT e.*, c.name AS client_name, v.name AS venue_name FROM events e
      JOIN clients c ON c.id = e.client_id LEFT JOIN venues v ON v.id = e.venue_id
      WHERE e.event_date = ? AND e.status != 'cancelled' ORDER BY e.meal`).all(td);
    const upcoming = db.prepare(`
      SELECT e.*, c.name AS client_name, v.name AS venue_name FROM events e
      JOIN clients c ON c.id = e.client_id LEFT JOIN venues v ON v.id = e.venue_id
      WHERE e.event_date > ? AND e.status IN ('booked','in_prep') ORDER BY e.event_date LIMIT 6`).all(td);
    const openLeads = db.prepare("SELECT COUNT(*) c FROM leads WHERE status IN ('new','contacted','proposal_sent')").get().c;
    const monthEvents = db.prepare(
      "SELECT COUNT(*) c FROM events WHERE strftime('%Y-%m', event_date) = strftime('%Y-%m','now') AND status != 'cancelled'").get().c;
    const due = outstanding(db);
    const dueTotal = due.reduce((s, r) => s + r.balance, 0);

    const content = `
<div class="offline-note">${t('offline_note', lang)}</div>
<div class="stats">
  <a class="stat" href="/events"><b>${monthEvents}</b><span>${t('this_month', lang)} · ${t('events_count', lang)}</span></a>
  <a class="stat" href="/leads"><b>${openLeads}</b><span>${t('open_enquiries', lang)}</span></a>
  <a class="stat" href="/money"><b>${inr(dueTotal)}</b><span>${t('pending_payments', lang)}</span></a>
</div>

<div class="card">
  <h2>${t('todays_events', lang)}</h2>
  <div class="rowlist">${todays.length ? todays.map((e) => eventRow(e, lang)).join('') : `<div class="muted">${t('no_events_today', lang)}</div>`}</div>
</div>

<div class="card">
  <h2>${t('upcoming_events', lang)} <a href="/events">${t('view_all', lang)} ›</a></h2>
  <div class="rowlist">${upcoming.map((e) => eventRow(e, lang)).join('') || `<div class="muted">—</div>`}</div>
</div>

<div class="btnrow">
  <a class="btn" style="flex:1" href="/leads/new">📞 ${t('new_enquiry', lang)}</a>
  <a class="btn ghost" style="flex:1" href="/events/new">📅 ${t('new_booking', lang)}</a>
</div>`;

    render(req, res, page({ lang, title: t('business_name', lang), active: '/', content }));
  });

  // "More" tab: staff, reports, catalog, portal link
  router.get('/more', (req, res) => {
    const lang = reqLang(req);
    const items = [
      ['/staff', '👨‍🍳', t('nav_staff', lang)],
      ['/reports', '📊', t('nav_reports', lang)],
      ['/catalog', '📖', t('nav_catalog', lang)],
      ['/portal', '🌐', t('request_quote', lang) + ' (client site)'],
    ];
    const content = `<div class="card"><div class="rowlist">
      ${items.map(([href, icon, label]) => `<a href="${href}"><span style="font-size:1.4rem">${icon}</span><div class="grow title">${esc(label)}</div><span>›</span></a>`).join('')}
    </div></div>`;
    render(req, res, page({ lang, title: t('nav_reports', lang), active: '/more', content }));
  });
};
