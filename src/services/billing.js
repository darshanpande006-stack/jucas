'use strict';
// Invoices + payments (cash / UPI / bank). Invoice.status is a cache derived
// from payments; refreshInvoiceStatus keeps it honest after every payment.

const { today } = require('../lib/util');

function nextInvoiceNumber(db) {
  const year = new Date().getFullYear();
  const prefix = `JUC-${year}-`;
  const last = db.prepare(
    "SELECT number FROM invoices WHERE number LIKE ? ORDER BY number DESC LIMIT 1"
  ).get(prefix + '%');
  const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

function createInvoiceForEvent(db, eventId, { dueDate } = {}) {
  const ev = db.prepare(`
    SELECT e.*, p.name_en AS pkg_en, p.name_hi AS pkg_hi, p.name_mr AS pkg_mr
    FROM events e LEFT JOIN packages p ON p.id = e.package_id WHERE e.id = ?`).get(eventId);
  if (!ev) throw new Error('event not found');
  if (!ev.per_plate_price) throw new Error('set the menu/price before invoicing');

  const subtotal = Math.round(ev.per_plate_price * ev.guest_count);
  const number = nextInvoiceNumber(db);
  const invoiceId = Number(db.prepare(`
    INSERT INTO invoices (event_id, number, issue_date, due_date, subtotal, discount, total)
    VALUES (?,?,?,?,?,0,?)`)
    .run(eventId, number, today(), dueDate || ev.event_date, subtotal, subtotal).lastInsertRowid);

  const desc = `Catering — ${ev.pkg_en || 'custom menu'} × ${ev.guest_count} plates`;
  db.prepare('INSERT INTO invoice_items (invoice_id, description, qty, rate, amount) VALUES (?,?,?,?,?)')
    .run(invoiceId, desc, ev.guest_count, ev.per_plate_price, subtotal);

  refreshInvoiceStatus(db, invoiceId); // picks up any advance recorded pre-invoice
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
}

function recordPayment(db, { eventId, invoiceId = null, amount, method, ref, paidOn, notes }) {
  if (!(amount > 0)) throw new Error('amount must be positive');
  if (!['cash', 'upi', 'bank'].includes(method)) throw new Error('invalid method');
  if (!invoiceId) {
    const inv = db.prepare("SELECT id FROM invoices WHERE event_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1").get(eventId);
    invoiceId = inv ? inv.id : null;
  }
  const id = Number(db.prepare(`
    INSERT INTO payments (invoice_id, event_id, amount, method, ref, paid_on, notes)
    VALUES (?,?,?,?,?,?,?)`)
    .run(invoiceId, eventId, amount, method, ref || null, paidOn || today(), notes || null).lastInsertRowid);
  if (invoiceId) refreshInvoiceStatus(db, invoiceId);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

function refreshInvoiceStatus(db, invoiceId) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv || inv.status === 'cancelled') return;
  // Payments count toward the invoice if linked to it, or recorded on the
  // event before the invoice existed (advances).
  const paid = db.prepare(
    'SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoice_id = ? OR (invoice_id IS NULL AND event_id = ?)'
  ).get(invoiceId, inv.event_id).s;
  const status = paid <= 0 ? 'unpaid' : paid + 0.005 >= inv.total ? 'paid' : 'partial';
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invoiceId);
}

// {contractValue, invoiced, paid, balance} for one event.
function eventBalance(db, eventId) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  const contractValue = ev && ev.per_plate_price ? Math.round(ev.per_plate_price * ev.guest_count) : 0;
  const invoiced = db.prepare(
    "SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE event_id = ? AND status != 'cancelled'"
  ).get(eventId).s;
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE event_id = ?').get(eventId).s;
  return { contractValue, invoiced, paid, balance: (invoiced || contractValue) - paid };
}

module.exports = { createInvoiceForEvent, recordPayment, refreshInvoiceStatus, eventBalance, nextInvoiceNumber };
