'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { memory } = require('../src/db/db');
const { seed } = require('../src/db/seed');
const pricing = require('../src/services/pricing');
const scaling = require('../src/services/scaling');
const proposals = require('../src/services/proposals');
const billing = require('../src/services/billing');
const staffing = require('../src/services/staffing');

function freshDb() {
  const db = memory();
  seed(db);
  return db;
}
const pkgByCode = (db, code) => db.prepare('SELECT * FROM packages WHERE code = ?').get(code);
const dishByName = (db, name) => db.prepare('SELECT * FROM dishes WHERE name_en = ?').get(name);

test('pricing: base package, no addons, below slab', () => {
  const db = freshDb();
  const pkg = pkgByCode(db, 'RAJWADI'); // ₹400
  const q = pricing.quote(db, { packageId: pkg.id, guestCount: 300 });
  assert.equal(q.perPlate, 400);
  assert.equal(q.total, 120000);
  assert.equal(q.discountPct, 0);
});

test('pricing: addons raise per-plate; slab discount applies at 1000 guests', () => {
  const db = freshDb();
  const pkg = pkgByCode(db, 'SAATVIK'); // ₹280
  const shrikhand = dishByName(db, 'Shrikhand'); // +30
  const q = pricing.quote(db, { packageId: pkg.id, guestCount: 1000, addonDishIds: [shrikhand.id] });
  // (280+30) × 0.95 = 294.5
  assert.equal(q.discountPct, 5);
  assert.equal(q.perPlate, 294.5);
  assert.equal(q.total, 294500);
});

test('pricing: 2000-guest slab (8%) beats lower slabs', () => {
  const db = freshDb();
  const pkg = pkgByCode(db, 'MAHARAJA'); // ₹550
  const q = pricing.quote(db, { packageId: pkg.id, guestCount: 2500 });
  assert.equal(q.perPlate, 506); // 550 × 0.92
});

test('scaling: single dish scales linearly with buyable rounding', () => {
  const db = freshDb();
  const rice = dishByName(db, 'Steamed Rice'); // 9 kg rice per 100
  const list = scaling.scaleMenu(db, [rice.id], 500);
  const riceRow = list.find((r) => r.name_en === 'Rice (Kolam)');
  assert.equal(riceRow.qty, 45); // 9 × 5
  assert.equal(riceRow.unit, 'kg');
  assert.ok(riceRow.est_cost > 0);
});

test('scaling: shared ingredients aggregate across dishes', () => {
  const db = freshDb();
  const chapati = dishByName(db, 'Chapati'); // wheat 8/100
  const puri = dishByName(db, 'Puri');       // wheat 7/100
  const list = scaling.scaleMenu(db, [chapati.id, puri.id], 200);
  const wheat = list.find((r) => r.name_en === 'Wheat flour');
  assert.equal(wheat.qty, 30); // (8+7) × 2
});

test('scaling: pcs ingredients round up to whole pieces', () => {
  const db = freshDb();
  const salad = dishByName(db, 'Green Salad'); // 80 lemons per 100
  const list = scaling.scaleMenu(db, [salad.id], 130);
  const lemon = list.find((r) => r.name_en === 'Lemon');
  assert.equal(lemon.qty, 104); // 80 × 1.3
});

test('full flow: lead → proposal → accept → event with menu → procurement → invoice → payments', () => {
  const db = freshDb();
  const clientId = Number(db.prepare(
    "INSERT INTO clients (name, phone, whatsapp, lang) VALUES ('Deshmukh Family','9876543210','9876543210','mr')"
  ).run().lastInsertRowid);
  const leadId = Number(db.prepare(
    "INSERT INTO leads (client_id, source, event_type, event_date, meal, guest_count, venue_text, token) VALUES (?, 'phone', 'wedding', '2026-12-10', 'lunch', 800, 'Sai Lawns', 'tok-lead-1')"
  ).run(clientId).lastInsertRowid);

  const pkg = pkgByCode(db, 'RAJWADI');
  const solkadhi = dishByName(db, 'Solkadhi'); // +15 addon
  const prop = proposals.createProposal(db, {
    leadId, packageId: pkg.id, guestCount: 800, addonDishIds: [solkadhi.id],
  });
  // (400+15) × 0.97 (500-slab) = 402.55
  assert.equal(prop.per_plate_price, 402.55);
  assert.equal(prop.total, 322040);
  assert.equal(prop.status, 'draft');

  proposals.markSent(db, prop.id);
  assert.equal(db.prepare('SELECT status FROM leads WHERE id = ?').get(leadId).status, 'proposal_sent');

  const ev = proposals.acceptProposal(db, prop.id, { name: 'Anil Deshmukh', phone: '9876543210' });
  assert.equal(ev.status, 'booked');
  assert.equal(ev.guest_count, 800);
  assert.equal(ev.per_plate_price, 402.55);
  const menuCount = db.prepare('SELECT COUNT(*) c FROM event_menu_items WHERE event_id = ?').get(ev.id).c;
  assert.equal(menuCount, 16); // 15 package dishes + 1 addon
  // accepting twice is idempotent
  const ev2 = proposals.acceptProposal(db, prop.id, { name: 'X' });
  assert.equal(ev2.id, ev.id);

  // procurement
  const list = scaling.generateProcurement(db, ev.id);
  assert.ok(list.length > 25);
  const stored = db.prepare('SELECT COUNT(*) c FROM procurement_items WHERE event_id = ?').get(ev.id).c;
  assert.equal(stored, list.length);
  // regenerating preserves purchased flags
  const first = db.prepare('SELECT * FROM procurement_items WHERE event_id = ? LIMIT 1').get(ev.id);
  db.prepare('UPDATE procurement_items SET purchased = 1 WHERE id = ?').run(first.id);
  scaling.generateProcurement(db, ev.id);
  const again = db.prepare('SELECT purchased FROM procurement_items WHERE event_id = ? AND ingredient_id = ?')
    .get(ev.id, first.ingredient_id);
  assert.equal(again.purchased, 1);

  // billing: advance before invoice, then invoice picks it up
  billing.recordPayment(db, { eventId: ev.id, amount: 160000, method: 'upi', ref: 'UPI123' });
  const inv = billing.createInvoiceForEvent(db, ev.id);
  assert.equal(inv.total, 322040);
  assert.equal(inv.status, 'partial');
  billing.recordPayment(db, { eventId: ev.id, invoiceId: inv.id, amount: 162040, method: 'cash' });
  assert.equal(db.prepare('SELECT status FROM invoices WHERE id = ?').get(inv.id).status, 'paid');
  const bal = billing.eventBalance(db, ev.id);
  assert.equal(bal.balance, 0);
  assert.equal(bal.paid, 322040);
});

test('staffing: assign → confirm → attendance → payout math', () => {
  const db = freshDb();
  const clientId = Number(db.prepare("INSERT INTO clients (name) VALUES ('c')").run().lastInsertRowid);
  const evId = Number(db.prepare(
    "INSERT INTO events (client_id, event_date, guest_count, token) VALUES (?, '2026-12-01', 500, 'tok-ev-s')"
  ).run(clientId).lastInsertRowid);

  const cook = db.prepare("SELECT * FROM staff WHERE role = 'cook' LIMIT 1").get();
  const server = db.prepare("SELECT * FROM staff WHERE role = 'server' LIMIT 1").get();
  staffing.assign(db, { eventId: evId, staffId: cook.id });                    // pool defaults
  staffing.assign(db, { eventId: evId, staffId: server.id, rate: 650 });       // negotiated rate
  // re-assign updates instead of duplicating
  staffing.assign(db, { eventId: evId, staffId: server.id, rate: 700 });

  const rows = db.prepare('SELECT * FROM staff_assignments WHERE event_id = ? ORDER BY id').all(evId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].agreed_rate, cook.day_rate);
  assert.equal(rows[1].agreed_rate, 700);

  staffing.setStatus(db, rows[0].id, 'confirmed');
  assert.equal(staffing.setAttendance(db, rows[0].id, 'present'), cook.day_rate);
  assert.equal(staffing.setAttendance(db, rows[1].id, 'half_day'), 350);
  staffing.markPaid(db, rows[0].id);

  const sum = staffing.eventLaborSummary(db, evId);
  assert.equal(sum.headcount, 2);
  assert.equal(sum.payout_total, cook.day_rate + 350);
  assert.equal(sum.paid_total, cook.day_rate);
});
