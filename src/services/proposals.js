'use strict';
// Proposal lifecycle: draft → sent → viewed → accepted (typed-name e-sign)
// → auto-converts the lead into a booked event with the proposed menu.

const { quote } = require('./pricing');
const { token, today } = require('../lib/util');

function createProposal(db, { leadId, packageId, guestCount, addonDishIds = [], advancePct = 50, validDays = 15 }) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) throw new Error('lead not found');
  const q = quote(db, { packageId, guestCount, addonDishIds });
  const pkg = packageId ? db.prepare('SELECT * FROM packages WHERE id = ?').get(packageId) : null;
  const pkgDishes = packageId
    ? db.prepare(`SELECT d.id, d.name_en, d.name_hi, d.name_mr, d.category FROM package_dishes pd
                  JOIN dishes d ON d.id = pd.dish_id WHERE pd.package_id = ? ORDER BY d.category`).all(packageId)
    : [];

  const items = {
    package: pkg ? { id: pkg.id, name_en: pkg.name_en, name_hi: pkg.name_hi, name_mr: pkg.name_mr, base: pkg.base_price_per_plate } : null,
    packageDishes: pkgDishes,
    addons: q.addonLines,
    discountPct: q.discountPct,
  };

  const version = db.prepare('SELECT COUNT(*) AS c FROM proposals WHERE lead_id = ?').get(leadId).c + 1;
  const validUntil = new Date(Date.now() + validDays * 864e5).toISOString().slice(0, 10);
  const tok = token();
  const id = Number(db.prepare(`
    INSERT INTO proposals (lead_id, version, package_id, guest_count, per_plate_price, items_json, total, advance_pct, valid_until, token)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(leadId, version, packageId ?? null, guestCount, q.perPlate, JSON.stringify(items), q.total, advancePct, validUntil, tok)
    .lastInsertRowid);
  return db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
}

function markSent(db, proposalId) {
  db.prepare("UPDATE proposals SET status = 'sent', sent_at = datetime('now') WHERE id = ? AND status = 'draft'").run(proposalId);
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId);
  db.prepare("UPDATE leads SET status = 'proposal_sent', updated_at = datetime('now') WHERE id = ? AND status IN ('new','contacted')").run(p.lead_id);
  return p;
}

function markViewed(db, proposalId) {
  db.prepare("UPDATE proposals SET status = 'viewed', viewed_at = datetime('now') WHERE id = ? AND status = 'sent'").run(proposalId);
}

// Typed-name acceptance = the e-signature record. Creates the booked event.
function acceptProposal(db, proposalId, { name, phone }) {
  const p = db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId);
  if (!p) throw new Error('proposal not found');
  if (p.status === 'accepted') return db.prepare('SELECT * FROM events WHERE lead_id = ?').get(p.lead_id);
  if (!name || !name.trim()) throw new Error('signature name required');

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(p.lead_id);
  const items = JSON.parse(p.items_json);

  db.prepare(`UPDATE proposals SET status = 'accepted', accepted_at = datetime('now'), accepted_name = ?, accepted_phone = ? WHERE id = ?`)
    .run(name.trim(), phone || null, proposalId);
  db.prepare("UPDATE leads SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(p.lead_id);

  const eventId = Number(db.prepare(`
    INSERT INTO events (lead_id, client_id, title, event_type, event_date, meal, venue_id, venue_text, guest_count, package_id, per_plate_price, status, token)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'booked', ?)`)
    .run(p.lead_id, lead.client_id, null, lead.event_type, lead.event_date || today(), lead.meal,
      lead.venue_id ?? null, lead.venue_text ?? null, p.guest_count, p.package_id ?? null, p.per_plate_price, token())
    .lastInsertRowid);

  const insMenu = db.prepare('INSERT OR IGNORE INTO event_menu_items (event_id, dish_id, from_package, price_delta) VALUES (?,?,?,?)');
  for (const d of items.packageDishes || []) insMenu.run(eventId, d.id, 1, 0);
  for (const a of items.addons || []) insMenu.run(eventId, a.dishId, 0, a.perPlate);

  return db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
}

module.exports = { createProposal, markSent, markViewed, acceptProposal };
