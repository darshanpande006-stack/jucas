'use strict';
// Branded printable documents: proposal/quotation and invoice.
// "Download PDF" = the browser's print-to-PDF on this page (works offline,
// no PDF library). A dedicated PDF pipeline is a listed next step.

const { t, locName } = require('../i18n');
const { esc, inr, fmtDate } = require('../lib/util');

function docShell(lang, title, body) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/public/app.css"></head>
<body class="public"><div class="doc">${body}</div>
<div class="no-print center" style="padding:1rem">
  <button class="btn" onclick="print()">🖨️ ${t('download_pdf', lang)}</button>
</div></body></html>`;
}

function brandHead(lang, docType, number) {
  return `<div class="doc-head">
  <div><h1>🍛 ${t('business_name', lang)}</h1>
    <div class="muted">${t('portal_tagline', lang)}</div>
    <div class="muted">Shrirampur, Ahilya Nagar, Maharashtra</div></div>
  <div style="text-align:right"><b>${esc(docType)}</b><br><span class="muted">${esc(number || '')}</span><br>
    <span class="muted">${fmtDate(new Date().toISOString().slice(0, 10), lang)}</span></div>
</div>`;
}

// items = parsed proposals.items_json
function proposalDoc({ lang, proposal, lead, client, acceptUrl }) {
  const items = JSON.parse(proposal.items_json);
  const dishByCat = {};
  for (const d of items.packageDishes || []) (dishByCat[d.category] ||= []).push(d);

  const menuHtml = Object.entries(dishByCat).map(([cat, ds]) =>
    `<tr><td class="muted">${esc(cat)}</td><td>${ds.map((d) => esc(locName(d, 'name', lang))).join(', ')}</td></tr>`).join('');
  const addonsHtml = (items.addons || []).map((a) =>
    `<tr><td>${esc(locName(a, 'name', lang))}</td><td class="num">+${inr(a.perPlate)} ${t('per_plate', lang)}</td></tr>`).join('');

  const advance = Math.round(proposal.total * proposal.advance_pct / 100);
  const body = `
${brandHead(lang, t('proposal', lang), `#${proposal.id} · v${proposal.version}`)}
<h2>${t('proposal_for', lang)} ${esc(client.name)}</h2>
<table class="tbl">
  <tr><td class="muted">${t('event_type', lang)}</td><td>${t('et_' + (lead.event_type || 'other'), lang)}</td></tr>
  <tr><td class="muted">${t('date', lang)}</td><td>${fmtDate(lead.event_date, lang)} · ${t('meal_' + (lead.meal || 'lunch'), lang)}</td></tr>
  <tr><td class="muted">${t('venue', lang)}</td><td>${esc(lead.venue_text || '—')}</td></tr>
  <tr><td class="muted">${t('guest_count', lang)}</td><td>${proposal.guest_count}</td></tr>
</table>

${items.package ? `<h2>${t('package', lang)}: ${esc(locName(items.package, 'name', lang))}</h2>
<table class="tbl">${menuHtml}</table>` : ''}
${addonsHtml ? `<h2>${t('addons', lang)}</h2><table class="tbl">${addonsHtml}</table>` : ''}

<h2>${t('total', lang)}</h2>
<table class="tbl">
  <tr><td>${t('price_per_plate', lang)}${items.discountPct ? ` <span class="badge green">${t('volume_discount', lang)} −${items.discountPct}%</span>` : ''}</td>
      <td class="num">${inr(proposal.per_plate_price, 2)}</td></tr>
  <tr><td><b>${t('total', lang)} (${proposal.guest_count} × ${inr(proposal.per_plate_price, 2)})</b></td>
      <td class="num"><b>${inr(proposal.total)}</b></td></tr>
  <tr><td>${t('advance', lang)} (${proposal.advance_pct}%)</td><td class="num">${inr(advance)}</td></tr>
</table>

<h2>${t('terms_title', lang)}</h2>
<p class="muted">${t('terms_body', lang)}</p>
<p class="muted">${t('valid_until', lang)}: <b>${fmtDate(proposal.valid_until, lang)}</b></p>

${proposal.status === 'accepted'
    ? `<div class="ok-note">✅ ${t('accepted_by', lang)}: ${esc(proposal.accepted_name)} · ${proposal.accepted_at}</div>`
    : acceptUrl ? `
<div class="no-print card" style="margin-top:1rem">
  <h2>${t('accept_proposal', lang)}</h2>
  <form method="post" action="${esc(acceptUrl)}">
    <label>${t('accept_name_hint', lang)} *</label>
    <input name="name" required>
    <label>${t('phone', lang)}</label>
    <input name="phone" type="tel" value="${esc(client.phone || '')}">
    <button class="btn full">✅ ${t('accept_proposal', lang)}</button>
  </form>
</div>` : ''}`;
  return docShell(lang, `${t('proposal', lang)} — ${client.name}`, body);
}

function invoiceDoc({ lang, invoice, items, event, client, payments, balance }) {
  const body = `
${brandHead(lang, t('invoice', lang), invoice.number)}
<h2>${esc(client.name)}</h2>
<div class="muted">${esc(client.phone || '')} · ${t('event', lang)}: ${fmtDate(event.event_date, lang)} · ${esc(event.venue_text || '')}</div>
<h2>${t('invoice', lang)}</h2>
<table class="tbl">
  <tr><th></th><th class="num">${t('quantity', lang)}</th><th class="num">₹</th><th class="num">${t('amount', lang)}</th></tr>
  ${items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${inr(i.rate, 2)}</td><td class="num">${inr(i.amount)}</td></tr>`).join('')}
  <tr><td colspan="3"><b>${t('total', lang)}</b></td><td class="num"><b>${inr(invoice.total)}</b></td></tr>
</table>
<h2>${t('tab_payments', lang)}</h2>
<table class="tbl">
  ${payments.map((p) => `<tr><td>${fmtDate(p.paid_on, lang)}</td><td>${t('pm_' + p.method, lang)}${p.ref ? ' · ' + esc(p.ref) : ''}</td><td class="num">${inr(p.amount)}</td></tr>`).join('') || `<tr><td class="muted">—</td></tr>`}
  <tr><td colspan="2"><b>${t('balance_due', lang)}</b></td><td class="num"><b>${inr(balance)}</b></td></tr>
</table>
<p class="muted">${t('terms_body', lang)}</p>`;
  return docShell(lang, `${invoice.number} — ${client.name}`, body);
}

module.exports = { proposalDoc, invoiceDoc };
