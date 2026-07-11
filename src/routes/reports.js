'use strict';
// Reporting dashboard: the five required reports as scannable tables.

const { get } = require('../db/db');
const { t, reqLang, locName } = require('../i18n');
const { esc, inr, fmtDate } = require('../lib/util');
const { page } = require('../views/layout');
const { render } = require('./_common');
const reports = require('../services/reports');

module.exports = function mount(router) {
  router.get('/reports', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const byMonth = reports.bookingsByMonth(db);
    const byPkg = reports.revenueByPackage(db);
    const dishes = reports.topDishes(db);
    const labor = reports.laborVsRevenue(db);
    const repeat = reports.repeatClientRate(db);

    const content = `
<div class="card"><h2>📅 ${t('rpt_bookings_month', lang)}</h2><div class="scrollx"><table class="tbl">
  <tr><th>${t('date', lang)}</th><th class="num">${t('events_count', lang)}</th><th class="num">${t('guests', lang)}</th><th class="num">${t('revenue', lang)}</th></tr>
  ${byMonth.map((m) => `<tr><td>${esc(m.month)}</td><td class="num">${m.events}</td><td class="num">${m.guests}</td><td class="num">${inr(m.revenue)}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}
</table></div></div>

<div class="card"><h2>🍛 ${t('rpt_revenue_tier', lang)}</h2><table class="tbl">
  <tr><th>${t('package', lang)}</th><th class="num">${t('events_count', lang)}</th><th class="num">${t('revenue', lang)}</th></tr>
  ${byPkg.map((p) => `<tr><td>${esc(locName(p, 'name', lang))}</td><td class="num">${p.events}</td><td class="num">${inr(p.revenue)}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}
</table></div>

<div class="card"><h2>⭐ ${t('rpt_top_dishes', lang)}</h2><table class="tbl">
  <tr><th>${t('menu', lang)}</th><th class="num">${t('times_ordered', lang)}</th><th class="num">${t('guests', lang)}</th></tr>
  ${dishes.map((d) => `<tr><td>${esc(locName(d, 'name', lang))}</td><td class="num">${d.times_ordered}</td><td class="num">${d.plates}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}
</table></div>

<div class="card"><h2>👨‍🍳 ${t('rpt_labor_vs_revenue', lang)}</h2><div class="scrollx"><table class="tbl">
  <tr><th>${t('event', lang)}</th><th class="num">${t('revenue', lang)}</th><th class="num">${t('labor_cost', lang)}</th><th class="num">%</th></tr>
  ${labor.map((l) => `<tr><td><a href="/events/${l.id}">${esc(l.client_name)}</a><br><span class="muted">${fmtDate(l.event_date, lang)}</span></td>
    <td class="num">${inr(l.revenue)}</td><td class="num">${inr(l.labor_cost)}</td>
    <td class="num">${l.labor_pct != null ? l.labor_pct + '%' : '—'}</td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}
</table></div></div>

<div class="card"><h2>🔁 ${t('rpt_repeat_rate', lang)}</h2>
  <p><span class="big">${repeat.rate_pct}%</span>
  <span class="muted">(${repeat.repeat_clients} / ${repeat.clients} ${t('client', lang)})</span></p>
</div>`;
    render(req, res, page({ lang, title: t('nav_reports', lang), active: '/more', backHref: '/more', content }));
  });
};
