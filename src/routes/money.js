'use strict';
// Outstanding-balance dashboard — one of the three screens the least
// technical user touches daily. One glance: who owes what; one tap: remind.

const { get } = require('../db/db');
const { redirect } = require('../lib/router');
const { t, reqLang } = require('../i18n');
const { esc, inr, fmtDate } = require('../lib/util');
const { page } = require('../views/layout');
const { render } = require('./_common');
const { outstanding } = require('../services/reports');
const billing = require('../services/billing');
const wa = require('../services/whatsapp');

module.exports = function mount(router) {
  router.get('/money', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const rows = outstanding(db);
    const total = rows.reduce((s, r) => s + r.balance, 0);
    const collectedMonth = db.prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM payments WHERE strftime('%Y-%m', paid_on) = strftime('%Y-%m','now')").get().s;
    const laborDue = db.prepare(
      'SELECT COALESCE(SUM(payout_amount),0) s FROM staff_assignments WHERE paid = 0 AND payout_amount IS NOT NULL').get().s;

    const content = `
<div class="stats">
  <div class="stat"><b style="color:var(--red)">${inr(total)}</b><span>${t('outstanding', lang)}</span></div>
  <div class="stat"><b style="color:var(--green)">${inr(collectedMonth)}</b><span>${t('received', lang)} · ${t('this_month', lang)}</span></div>
  <div class="stat"><b>${inr(laborDue)}</b><span>${t('payout', lang)} ${t('unpaid', lang)}</span></div>
</div>
<div class="card"><h2>${t('outstanding', lang)}</h2><div class="rowlist">
${rows.map((r) => `<div>
  <a class="grow" style="display:block;text-decoration:none;color:inherit" href="/events/${r.event_id}/payments">
    <div class="title">${esc(r.client_name)}</div>
    <div class="sub">${fmtDate(r.event_date, lang)} · ${t('received', lang)} ${inr(r.paid)} / ${inr(r.contract_value)}</div>
  </a>
  <div class="right" style="color:var(--red)">${inr(r.balance)}</div>
  <form method="post" action="/events/${r.event_id}/payments/reminder"><button class="btn sm wa">📲</button></form>
</div>`).join('') || `<div class="muted">✅</div>`}
</div></div>`;
    render(req, res, page({ lang, title: t('nav_money', lang), active: '/money', content }));
  });
};
