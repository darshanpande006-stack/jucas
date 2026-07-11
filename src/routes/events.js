'use strict';
// Event operations hub: overview, menu+pricing, procurement, staffing, payments.

const { get } = require('../db/db');
const { redirect } = require('../lib/router');
const { t, reqLang, locName } = require('../i18n');
const { esc, inr, fmtDate, token, today } = require('../lib/util');
const { page, statusBadge } = require('../views/layout');
const { render, baseUrl } = require('./_common');
const pricing = require('../services/pricing');
const scaling = require('../services/scaling');
const staffing = require('../services/staffing');
const billing = require('../services/billing');
const wa = require('../services/whatsapp');
const { invoiceDoc } = require('../views/docs');

const TABS = [
  ['', 'tab_overview'], ['menu', 'tab_menu'], ['shopping', 'tab_shopping'],
  ['staff', 'tab_staff'], ['payments', 'tab_payments'],
];

function loadEvent(db, id) {
  return db.prepare(`
    SELECT e.*, c.name AS client_name, c.phone, c.whatsapp, c.lang AS client_lang,
           p.name_en AS pkg_en, p.name_hi AS pkg_hi, p.name_mr AS pkg_mr, v.name AS venue_name
    FROM events e JOIN clients c ON c.id = e.client_id
    LEFT JOIN packages p ON p.id = e.package_id LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.id = ?`).get(id);
}

function eventShell(req, res, ev, tab, inner) {
  const lang = reqLang(req);
  const tabs = TABS.map(([slug, key]) =>
    `<a class="${tab === slug ? 'on' : ''}" href="/events/${ev.id}${slug ? '/' + slug : ''}">${t(key, lang)}</a>`).join('');
  const content = `
<div class="card"><div class="rowlist"><div>
  <div class="grow"><div class="title">${esc(ev.client_name)} · ${t('et_' + (ev.event_type || 'other'), lang)}</div>
  <div class="sub">${fmtDate(ev.event_date, lang)} · ${t('meal_' + (ev.meal || 'lunch'), lang)} · ${ev.guest_count} ${t('guests', lang)} · ${esc(ev.venue_text || ev.venue_name || '—')}</div></div>
  ${statusBadge(ev.status, t('es_' + ev.status, lang))}
</div></div></div>
<div class="subtabs">${tabs}</div>
${inner}`;
  render(req, res, page({ lang, title: `${t('event', lang)} #${ev.id}`, active: '/events', backHref: '/events', content }));
}

module.exports = function mount(router) {
  const db = () => get();

  // ── List ──
  router.get('/events', (req, res) => {
    const lang = reqLang(req);
    const rows = db().prepare(`
      SELECT e.*, c.name AS client_name FROM events e JOIN clients c ON c.id = e.client_id
      WHERE e.status != 'cancelled' ORDER BY e.event_date DESC LIMIT 200`).all();
    const byMonth = {};
    for (const e of rows) (byMonth[e.event_date.slice(0, 7)] ||= []).push(e);
    const content = Object.entries(byMonth).map(([m, evs]) => `
<div class="card"><h2>${fmtDate(m + '-01', lang).replace(/^\S+ /, '')}</h2><div class="rowlist">
${evs.map((e) => `<a href="/events/${e.id}">
  <div class="grow"><div class="title">${esc(e.client_name)}</div>
  <div class="sub">${fmtDate(e.event_date, lang)} · ${e.guest_count} ${t('guests', lang)} · ${e.per_plate_price ? inr(e.per_plate_price) + ' ' + t('per_plate', lang) : '—'}</div></div>
  ${statusBadge(e.status, t('es_' + e.status, lang))}</a>`).join('')}
</div></div>`).join('') || `<div class="card muted">—</div>`;
    render(req, res, page({ lang, title: t('nav_bookings', lang), active: '/events', content, fab: { href: '/events/new', label: t('new_booking', lang) } }));
  });

  // ── Direct booking (phone bookings: no proposal round-trip) ──
  router.get('/events/new', (req, res) => {
    const lang = reqLang(req);
    const pkgs = db().prepare('SELECT * FROM packages WHERE active = 1 ORDER BY tier').all();
    const content = `
<div class="offline-note">${t('offline_note', lang)}</div>
<form method="post" action="/events/new" data-draft="booking" class="card">
  <h2>${t('client', lang)}</h2>
  <label>${t('name', lang)} *</label><input name="client_name" required>
  <label>${t('phone', lang)} *</label><input name="client_phone" type="tel" required>
  <h2 style="margin-top:1rem">${t('event_details', lang)}</h2>
  <div class="grid2">
    <div><label>${t('date', lang)} *</label><input name="event_date" type="date" required></div>
    <div><label>${t('guest_count', lang)} *</label><input name="guest_count" type="number" min="1" inputmode="numeric" required></div>
  </div>
  <div class="grid2">
    <div><label>${t('event_type', lang)}</label>
      <select name="event_type">${['wedding', 'engagement', 'thread_ceremony', 'birthday', 'corporate', 'religious', 'other'].map((et) => `<option value="${et}">${t('et_' + et, lang)}</option>`).join('')}</select></div>
    <div><label>${t('meal', lang)}</label>
      <select name="meal">${['lunch', 'dinner', 'breakfast'].map((m) => `<option value="${m}">${t('meal_' + m, lang)}</option>`).join('')}</select></div>
  </div>
  <label>${t('venue', lang)}</label><input name="venue_text">
  <label>${t('package', lang)}</label>
  <select name="package_id"><option value="">—</option>${pkgs.map((p) => `<option value="${p.id}">${esc(locName(p, 'name', lang))} — ${inr(p.base_price_per_plate)}</option>`).join('')}</select>
  <button class="btn full">${t('save', lang)}</button>
</form>`;
    render(req, res, page({ lang, title: t('new_booking', lang), active: '/events', backHref: '/events', content }));
  });

  router.post('/events/new', (req, res) => {
    const d = db();
    const phone = String(req.body.client_phone || '').trim();
    let client = phone ? d.prepare('SELECT * FROM clients WHERE phone = ?').get(phone) : null;
    const clientId = client ? client.id : Number(d.prepare(
      'INSERT INTO clients (name, phone, whatsapp) VALUES (?,?,?)')
      .run(String(req.body.client_name || '').trim(), phone, phone).lastInsertRowid);
    const pkgId = Number(req.body.package_id) || null;
    const id = Number(d.prepare(`
      INSERT INTO events (client_id, event_type, event_date, meal, venue_text, guest_count, package_id, token)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(clientId, req.body.event_type || null, req.body.event_date, req.body.meal || 'lunch',
        req.body.venue_text || null, Number(req.body.guest_count), pkgId, token()).lastInsertRowid);
    if (pkgId) {
      const ins = d.prepare('INSERT INTO event_menu_items (event_id, dish_id, from_package, price_delta) VALUES (?,?,1,0)');
      for (const r of d.prepare('SELECT dish_id FROM package_dishes WHERE package_id = ?').all(pkgId)) ins.run(id, r.dish_id);
      pricing.repriceEvent(d, id);
    }
    redirect(res, `/events/${id}/menu`);
  });

  // ── Overview ──
  router.get('/events/:id', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const ev = loadEvent(d, req.params.id);
    if (!ev) return render(req, res, page({ lang, title: '?', content: 'Not found' }), 404);
    const bal = billing.eventBalance(d, ev.id);
    const labor = staffing.eventLaborSummary(d, ev.id);
    const statuses = ['booked', 'in_prep', 'completed', 'cancelled'];
    const inner = `
<div class="stats">
  <div class="stat"><b>${ev.per_plate_price ? inr(ev.per_plate_price) : '—'}</b><span>${t('price_per_plate', lang)}</span></div>
  <div class="stat"><b>${inr(bal.contractValue)}</b><span>${t('estimated_total', lang)}</span></div>
  <div class="stat"><b style="color:${bal.balance > 0 ? 'var(--red)' : 'var(--green)'}">${inr(bal.balance)}</b><span>${t('balance_due', lang)}</span></div>
  <div class="stat"><b>${labor.headcount}</b><span>${t('tab_staff', lang)} (${labor.confirmed} ${t('as_confirmed', lang)})</span></div>
</div>
<div class="card"><h2>${t('status', lang)}</h2><div class="btnrow">
${statuses.map((s) => `<form method="post" action="/events/${ev.id}/status"><input type="hidden" name="status" value="${s}">
  <button class="btn sm ${ev.status === s ? '' : 'ghost'}">${t('es_' + s, lang)}</button></form>`).join('')}
</div></div>
<div class="card"><h2>${t('client', lang)}</h2>
  <div class="title">${esc(ev.client_name)}</div><div class="sub">${esc(ev.phone || '')}</div>
  <div class="btnrow">
    <a class="btn sm wa" href="https://wa.me/91${esc((ev.whatsapp || ev.phone || '').replace(/\D/g, '').slice(-10))}" target="_blank">📲 WhatsApp</a>
    <a class="btn sm ghost" href="tel:${esc(ev.phone || '')}">📞 ${t('phone', lang)}</a>
  </div>
</div>
${ev.notes ? `<div class="card"><h2>${t('notes', lang)}</h2><p>${esc(ev.notes)}</p></div>` : ''}`;
    eventShell(req, res, ev, '', inner);
  });

  router.post('/events/:id/status', (req, res) => {
    if (['booked', 'in_prep', 'completed', 'cancelled'].includes(req.body.status)) {
      db().prepare("UPDATE events SET status = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.status, req.params.id);
    }
    redirect(res, `/events/${req.params.id}`);
  });

  // ── Menu & pricing ──
  router.get('/events/:id/menu', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const ev = loadEvent(d, req.params.id);
    if (!ev) return redirect(res, '/events');
    const pkgs = d.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY tier').all();
    const pkgDishIds = ev.package_id
      ? new Set(d.prepare('SELECT dish_id FROM package_dishes WHERE package_id = ?').all(ev.package_id).map((r) => r.dish_id))
      : new Set();
    const menu = new Map(d.prepare('SELECT * FROM event_menu_items WHERE event_id = ?').all(ev.id).map((m) => [m.dish_id, m]));
    const dishes = d.prepare('SELECT * FROM dishes WHERE active = 1 ORDER BY category, name_en').all();
    const q = pricing.quote(d, {
      packageId: ev.package_id, guestCount: ev.guest_count,
      addonDishIds: [...menu.values()].filter((m) => !m.from_package).map((m) => m.dish_id),
    });

    const byCat = {};
    for (const dd of dishes) (byCat[dd.category] ||= []).push(dd);
    const dishRows = Object.entries(byCat).map(([cat, ds]) => `
<h2 style="margin-top:.8rem">${esc(cat)}</h2>
${ds.map((dd) => {
      const inPkg = pkgDishIds.has(dd.id);
      const checked = menu.has(dd.id);
      return `<div class="checkline">
  <input type="checkbox" name="${inPkg ? 'pkgdish' : 'addon'}" value="${dd.id}" id="d${dd.id}" ${checked ? 'checked' : ''}>
  <label for="d${dd.id}" style="margin:0;flex:1;color:inherit">${esc(locName(dd, 'name', lang))}</label>
  ${inPkg ? `<span class="badge green">${t('package', lang)}</span>` : `<span class="muted">+${inr(dd.addon_price_per_plate)}</span>`}
</div>`;
    }).join('')}`).join('');

    const inner = `
<form method="post" action="/events/${ev.id}/menu" id="price-form" class="card">
  <label>${t('choose_package', lang)}</label>
  <select name="package_id"><option value="">—</option>
    ${pkgs.map((p) => `<option value="${p.id}" ${ev.package_id === p.id ? 'selected' : ''}>${esc(locName(p, 'name', lang))} — ${inr(p.base_price_per_plate)}</option>`).join('')}
  </select>
  <label>${t('guest_count', lang)}</label>
  <input name="guest_count" type="number" min="1" inputmode="numeric" value="${ev.guest_count}">
  ${dishRows}
  <div class="rowlist" style="margin-top:.7rem">
    <div><div class="grow">${t('price_per_plate', lang)} <span id="disc" class="badge green">${q.discountPct ? '−' + q.discountPct + '%' : ''}</span></div><div class="right big" id="pp">${inr(q.perPlate)}</div></div>
    <div><div class="grow">${t('estimated_total', lang)}</div><div class="right big" id="tt">${inr(q.total)}</div></div>
  </div>
  <button class="btn full">${t('save', lang)}</button>
  <p class="muted center" style="margin-top:.5rem">${t('shopping_empty', lang)}</p>
</form>`;
    eventShell(req, res, ev, 'menu', inner);
  });

  router.post('/events/:id/menu', (req, res) => {
    const d = db();
    const evId = Number(req.params.id);
    const pkgId = Number(req.body.package_id) || null;
    const guests = Number(req.body.guest_count) || null;
    const pkgKeep = new Set([].concat(req.body.pkgdish || []).map(Number));
    const addons = [].concat(req.body.addon || []).map(Number);

    // If the package changed, the submitted checkboxes belong to the OLD
    // package — start the new package with its full dish list instead.
    const prevPkgId = d.prepare('SELECT package_id FROM events WHERE id = ?').get(evId).package_id;
    const switched = pkgId !== prevPkgId;
    d.prepare("UPDATE events SET package_id = ?, guest_count = COALESCE(?, guest_count), updated_at = datetime('now') WHERE id = ?")
      .run(pkgId, guests, evId);
    d.prepare('DELETE FROM event_menu_items WHERE event_id = ?').run(evId);
    const ins = d.prepare('INSERT OR IGNORE INTO event_menu_items (event_id, dish_id, from_package, price_delta) VALUES (?,?,?,?)');
    if (pkgId) {
      const pkgDishes = d.prepare('SELECT dish_id FROM package_dishes WHERE package_id = ?').all(pkgId).map((r) => r.dish_id);
      for (const id of pkgDishes) if (switched || pkgKeep.has(id)) ins.run(evId, id, 1, 0);
    }
    const rates = new Map(d.prepare('SELECT id, addon_price_per_plate FROM dishes').all().map((r) => [r.id, r.addon_price_per_plate]));
    for (const id of addons) ins.run(evId, id, 0, rates.get(id) || 0);
    pricing.repriceEvent(d, evId);
    redirect(res, `/events/${evId}/menu`);
  });

  // ── Procurement / shopping list ──
  router.get('/events/:id/shopping', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const ev = loadEvent(d, req.params.id);
    if (!ev) return redirect(res, '/events');
    const items = d.prepare(`
      SELECT pi.*, i.name_en, i.name_hi, i.name_mr, i.category FROM procurement_items pi
      JOIN ingredients i ON i.id = pi.ingredient_id WHERE pi.event_id = ?
      ORDER BY i.category, i.name_en`).all(ev.id);
    const byCat = {};
    for (const it of items) (byCat[it.category] ||= []).push(it);
    const estTotal = items.reduce((s, i) => s + (i.est_cost || 0), 0);
    const bought = items.filter((i) => i.purchased).length;

    // WhatsApp-shareable text of the whole list (for the market runner)
    const waText = encodeURIComponent(
      `🛒 ${t('tab_shopping', lang)} — ${fmtDate(ev.event_date, lang)} (${ev.guest_count} ${t('guests', lang)})\n` +
      Object.entries(byCat).map(([cat, its]) =>
        `\n*${t('ic_' + cat, lang)}*\n` + its.map((i) => `• ${locName(i, 'name', lang)} — ${i.qty} ${i.unit}`).join('\n')).join('\n'));

    const inner = `
<div class="card">
  <div class="btnrow">
    <form method="post" action="/events/${ev.id}/shopping/generate" style="flex:1">
      <button class="btn full" style="margin-top:0">${items.length ? '🔄 ' + t('regenerate_list', lang) : '🛒 ' + t('generate_list', lang)}</button>
    </form>
    ${items.length ? `<a class="btn wa" target="_blank" href="https://wa.me/?text=${waText}">📲 ${t('send_whatsapp', lang)}</a>` : ''}
  </div>
  ${items.length ? `<p class="muted" style="margin-top:.6rem">${bought}/${items.length} ${t('purchased', lang)} · ${t('est_cost', lang)}: <b>${inr(estTotal)}</b></p>` : `<p class="muted" style="margin-top:.6rem">${t('shopping_empty', lang)}</p>`}
</div>
${Object.entries(byCat).map(([cat, its]) => `
<div class="card"><h2>${t('ic_' + cat, lang)}</h2>
${its.map((i) => `
<form method="post" action="/events/${ev.id}/shopping/${i.id}/toggle" class="checkline">
  <input type="checkbox" ${i.purchased ? 'checked' : ''} onchange="this.form.submit()">
  <span style="flex:1;${i.purchased ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(locName(i, 'name', lang))}</span>
  <b>${i.qty} ${i.unit}</b>
  <span class="muted">${i.est_cost ? inr(i.est_cost) : ''}</span>
  <noscript><button class="btn sm ghost">✓</button></noscript>
</form>`).join('')}
</div>`).join('')}`;
    eventShell(req, res, ev, 'shopping', inner);
  });

  router.post('/events/:id/shopping/generate', (req, res) => {
    scaling.generateProcurement(db(), Number(req.params.id));
    redirect(res, `/events/${req.params.id}/shopping`);
  });

  router.post('/events/:id/shopping/:itemId/toggle', (req, res) => {
    db().prepare('UPDATE procurement_items SET purchased = 1 - purchased WHERE id = ? AND event_id = ?')
      .run(Number(req.params.itemId), Number(req.params.id));
    redirect(res, `/events/${req.params.id}/shopping`);
  });

  // ── Staffing ──
  router.get('/events/:id/staff', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const ev = loadEvent(d, req.params.id);
    if (!ev) return redirect(res, '/events');
    const assigned = d.prepare(`
      SELECT a.*, s.name, s.phone, s.whatsapp FROM staff_assignments a
      JOIN staff s ON s.id = a.staff_id WHERE a.event_id = ? ORDER BY a.role, s.name`).all(ev.id);
    const pool = d.prepare(`
      SELECT * FROM staff WHERE active = 1 AND id NOT IN
      (SELECT staff_id FROM staff_assignments WHERE event_id = ?) ORDER BY role, name`).all(ev.id);
    const sum = staffing.eventLaborSummary(d, ev.id);

    const inner = `
<div class="stats">
  <div class="stat"><b>${sum.headcount}</b><span>${t('tab_staff', lang)}</span></div>
  <div class="stat"><b>${sum.confirmed}</b><span>${t('as_confirmed', lang)}</span></div>
  <div class="stat"><b>${inr(sum.payout_total)}</b><span>${t('total_labor_cost', lang)}</span></div>
  <div class="stat"><b>${inr(sum.payout_total - sum.paid_total)}</b><span>${t('payout', lang)} ${t('unpaid', lang)}</span></div>
</div>

<div class="card"><h2>${t('assign_staff', lang)}</h2>
<form method="post" action="/events/${ev.id}/staff/assign">
  <select name="staff_id" required>
    <option value="">—</option>
    ${pool.map((s) => `<option value="${s.id}">${esc(s.name)} · ${t('r_' + s.role, lang)} · ${inr(s.day_rate)}</option>`).join('')}
  </select>
  <div class="grid2">
    <div><label>${t('role', lang)}</label>
      <select name="role"><option value="">(pool)</option>${['head_cook', 'cook', 'helper', 'server', 'driver'].map((r) => `<option value="${r}">${t('r_' + r, lang)}</option>`).join('')}</select></div>
    <div><label>${t('day_rate', lang)}</label><input name="rate" type="number" inputmode="numeric" placeholder="(pool)"></div>
  </div>
  <button class="btn full">${t('assign_staff', lang)}</button>
</form></div>

<div class="card"><div class="rowlist">
${assigned.map((a) => `
<div>
  <div class="grow">
    <div class="title">${esc(a.name)} <span class="muted">· ${t('r_' + a.role, lang)} · ${inr(a.agreed_rate)}</span></div>
    <div class="btnrow">
      ${['invited', 'confirmed', 'declined'].map((s) => `
        <form method="post" action="/events/${ev.id}/staff/${a.id}/status"><input type="hidden" name="status" value="${s}">
        <button class="btn sm ${a.status === s ? '' : 'ghost'}">${t('as_' + s, lang)}</button></form>`).join('')}
      <form method="post" action="/events/${ev.id}/staff/${a.id}/invite"><button class="btn sm wa">📲</button></form>
    </div>
    ${a.status !== 'declined' ? `<div class="btnrow">
      ${['present', 'half_day', 'absent'].map((at) => `
        <form method="post" action="/events/${ev.id}/staff/${a.id}/attendance"><input type="hidden" name="attendance" value="${at}">
        <button class="btn sm ${a.attendance === at ? '' : 'ghost'}">${t('att_' + at, lang)}</button></form>`).join('')}
    </div>` : ''}
  </div>
  <div class="right">
    ${a.payout_amount != null ? `${inr(a.payout_amount)}<br>${a.paid
      ? `<span class="badge green">${t('paid', lang)}</span>`
      : `<form method="post" action="/events/${ev.id}/staff/${a.id}/paid"><button class="btn sm">${t('mark_paid', lang)}</button></form>`}`
      : statusBadge(a.status, t('as_' + a.status, lang))}
  </div>
</div>`).join('') || `<div class="muted">—</div>`}
</div></div>`;
    eventShell(req, res, ev, 'staff', inner);
  });

  router.post('/events/:id/staff/assign', (req, res) => {
    if (req.body.staff_id) {
      staffing.assign(db(), {
        eventId: Number(req.params.id), staffId: Number(req.body.staff_id),
        role: req.body.role || null, rate: req.body.rate,
      });
    }
    redirect(res, `/events/${req.params.id}/staff`);
  });

  router.post('/events/:id/staff/:aid/status', (req, res) => {
    staffing.setStatus(db(), Number(req.params.aid), req.body.status);
    redirect(res, `/events/${req.params.id}/staff`);
  });

  router.post('/events/:id/staff/:aid/attendance', (req, res) => {
    staffing.setAttendance(db(), Number(req.params.aid), req.body.attendance);
    redirect(res, `/events/${req.params.id}/staff`);
  });

  router.post('/events/:id/staff/:aid/paid', (req, res) => {
    staffing.markPaid(db(), Number(req.params.aid));
    redirect(res, `/events/${req.params.id}/staff`);
  });

  // WhatsApp work invite to one laborer (logged + wa.me handoff)
  router.post('/events/:id/staff/:aid/invite', (req, res) => {
    const d = db();
    const ev = loadEvent(d, req.params.id);
    const a = d.prepare('SELECT a.*, s.name, s.phone, s.whatsapp FROM staff_assignments a JOIN staff s ON s.id = a.staff_id WHERE a.id = ?').get(req.params.aid);
    const lang = reqLang(req);
    const { link } = wa.sendTemplate(d, {
      templateKey: 'staff_invite', lang: 'mr', // labor pool speaks Marathi
      phone: a.whatsapp || a.phone, staffId: a.staff_id, eventId: ev.id,
      vars: { name: a.name, date: ev.event_date, meal: t('meal_' + (ev.meal || 'lunch'), 'mr'), venue: ev.venue_text || ev.venue_name, role: t('r_' + a.role, 'mr'), rate: a.agreed_rate, guests: ev.guest_count },
    });
    redirect(res, link || `/events/${ev.id}/staff`);
  });

  // ── Payments ──
  router.get('/events/:id/payments', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const ev = loadEvent(d, req.params.id);
    if (!ev) return redirect(res, '/events');
    const bal = billing.eventBalance(d, ev.id);
    const invoices = d.prepare('SELECT * FROM invoices WHERE event_id = ? ORDER BY id DESC').all(ev.id);
    const pays = d.prepare('SELECT * FROM payments WHERE event_id = ? ORDER BY paid_on DESC, id DESC').all(ev.id);

    const inner = `
<div class="stats">
  <div class="stat"><b>${inr(bal.contractValue)}</b><span>${t('total', lang)}</span></div>
  <div class="stat"><b>${inr(bal.paid)}</b><span>${t('received', lang)}</span></div>
  <div class="stat"><b style="color:${bal.balance > 0 ? 'var(--red)' : 'var(--green)'}">${inr(bal.balance)}</b><span>${t('balance_due', lang)}</span></div>
</div>

<div class="card"><h2>${t('record_payment', lang)}</h2>
<form method="post" action="/events/${ev.id}/payments/record" data-draft="payment">
  <div class="grid2">
    <div><label>${t('amount', lang)} *</label><input name="amount" type="number" min="1" step="0.01" inputmode="numeric" required></div>
    <div><label>${t('date', lang)}</label><input name="paid_on" type="date" value="${today()}"></div>
  </div>
  <label>${t('method', lang)}</label>
  <select name="method">${['cash', 'upi', 'bank'].map((m) => `<option value="${m}">${t('pm_' + m, lang)}</option>`).join('')}</select>
  <label>${t('reference', lang)}</label><input name="ref">
  <button class="btn full">${t('save', lang)}</button>
</form></div>

<div class="card"><h2>${t('invoice', lang)}</h2>
  <div class="rowlist">
  ${invoices.map((i) => `<div>
    <div class="grow"><div class="title">${esc(i.number)}</div><div class="sub">${fmtDate(i.issue_date, lang)} · ${inr(i.total)}</div></div>
    ${statusBadge(i.status, t('is_' + i.status, lang))}
    <a class="btn sm ghost" href="/invoices/${i.id}/print" target="_blank">🖨️</a></div>`).join('') || ''}
  </div>
  ${ev.per_plate_price ? `<form method="post" action="/events/${ev.id}/payments/invoice"><button class="btn full ghost">🧾 ${t('create_invoice', lang)}</button></form>`
      : `<p class="muted">${t('shopping_empty', lang)}</p>`}
</div>

<div class="card"><h2>${t('tab_payments', lang)}</h2><div class="rowlist">
${pays.map((p) => `<div>
  <div class="grow"><div class="title">${inr(p.amount)} <span class="badge">${t('pm_' + p.method, lang)}</span></div>
  <div class="sub">${fmtDate(p.paid_on, lang)}${p.ref ? ' · ' + esc(p.ref) : ''}</div></div>
  <form method="post" action="/events/${ev.id}/payments/${p.id}/receipt"><button class="btn sm wa">📲 ${t('send_receipt', lang)}</button></form>
</div>`).join('') || `<div class="muted">—</div>`}
</div>
${bal.balance > 0 ? `<form method="post" action="/events/${ev.id}/payments/reminder"><button class="btn full wa">📲 ${t('send_reminder', lang)} (${inr(bal.balance)})</button></form>` : ''}
</div>`;
    eventShell(req, res, ev, 'payments', inner);
  });

  router.post('/events/:id/payments/invoice', (req, res) => {
    billing.createInvoiceForEvent(db(), Number(req.params.id));
    redirect(res, `/events/${req.params.id}/payments`);
  });

  router.post('/events/:id/payments/record', (req, res) => {
    billing.recordPayment(db(), {
      eventId: Number(req.params.id), amount: Number(req.body.amount),
      method: req.body.method, ref: req.body.ref, paidOn: req.body.paid_on,
    });
    redirect(res, `/events/${req.params.id}/payments`);
  });

  router.post('/events/:id/payments/:pid/receipt', (req, res) => {
    const d = db();
    const ev = loadEvent(d, req.params.id);
    const p = d.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.pid);
    const bal = billing.eventBalance(d, ev.id);
    const { link } = wa.sendTemplate(d, {
      templateKey: 'payment_receipt', lang: ev.client_lang, phone: ev.whatsapp || ev.phone,
      clientId: ev.client_id, eventId: ev.id,
      vars: { name: ev.client_name, amount: p.amount, method: t('pm_' + p.method, ev.client_lang), date: p.paid_on, balance: bal.balance },
    });
    redirect(res, link || `/events/${ev.id}/payments`);
  });

  router.post('/events/:id/payments/reminder', (req, res) => {
    const d = db();
    const ev = loadEvent(d, req.params.id);
    const bal = billing.eventBalance(d, ev.id);
    const upi = (d.prepare("SELECT value FROM settings WHERE key = 'business_upi'").get() || {}).value || '';
    const { link } = wa.sendTemplate(d, {
      templateKey: 'payment_reminder', lang: ev.client_lang, phone: ev.whatsapp || ev.phone,
      clientId: ev.client_id, eventId: ev.id,
      vars: { name: ev.client_name, balance: bal.balance, date: ev.event_date, upi },
    });
    redirect(res, link || `/events/${ev.id}/payments`);
  });

  // Printable invoice
  router.get('/invoices/:id/print', (req, res) => {
    const d = db();
    const lang = reqLang(req);
    const inv = d.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) return redirect(res, '/events');
    const ev = loadEvent(d, inv.event_id);
    const items = d.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
    const pays = d.prepare('SELECT * FROM payments WHERE invoice_id = ? OR (invoice_id IS NULL AND event_id = ?) ORDER BY paid_on').all(inv.id, inv.event_id);
    const paid = pays.reduce((s, p) => s + p.amount, 0);
    render(req, res, invoiceDoc({
      lang, invoice: inv, items, event: ev,
      client: { name: ev.client_name, phone: ev.phone },
      payments: pays, balance: inv.total - paid,
    }));
  });
};
