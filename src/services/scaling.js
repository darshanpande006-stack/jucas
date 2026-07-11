'use strict';
// Ingredient-scaling engine: dish selection + guest count → market shopping
// list in kg / L / pcs. Quantities are stored per 100 plates and aggregated
// across the whole menu, then rounded up to buyable amounts.

const { roundQty } = require('../lib/util');

// dishIds + guestCount → [{ingredient_id, name_*, unit, category, qty, est_cost}]
function scaleMenu(db, dishIds, guestCount) {
  if (!dishIds.length || !guestCount) return [];
  const rows = db.prepare(`
    SELECT i.id AS ingredient_id, i.name_en, i.name_hi, i.name_mr, i.unit, i.category, i.market_rate,
           SUM(r.qty_per_100) AS qty_per_100
    FROM recipe_items r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.dish_id IN (${dishIds.map(() => '?').join(',')})
    GROUP BY i.id
    ORDER BY i.category, i.name_en`).all(...dishIds);

  return rows.map((r) => {
    const raw = (r.qty_per_100 * guestCount) / 100;
    const qty = r.unit === 'pcs' ? Math.ceil(raw) : roundQty(raw);
    return {
      ingredient_id: r.ingredient_id,
      name_en: r.name_en, name_hi: r.name_hi, name_mr: r.name_mr,
      unit: r.unit, category: r.category,
      qty,
      est_cost: r.market_rate ? Math.round(qty * r.market_rate) : null,
    };
  });
}

// Regenerate the persisted procurement snapshot for an event.
// Preserves purchased/actual_cost/vendor for ingredients still on the list.
function generateProcurement(db, eventId) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!ev) throw new Error('event not found');
  const dishIds = db.prepare('SELECT dish_id FROM event_menu_items WHERE event_id = ?')
    .all(eventId).map((r) => r.dish_id);
  const list = scaleMenu(db, dishIds, ev.guest_count);

  const existing = new Map(
    db.prepare('SELECT * FROM procurement_items WHERE event_id = ?').all(eventId)
      .map((r) => [r.ingredient_id, r])
  );
  db.prepare('DELETE FROM procurement_items WHERE event_id = ?').run(eventId);
  const ins = db.prepare(`INSERT INTO procurement_items
    (event_id, ingredient_id, qty, unit, est_cost, purchased, actual_cost, vendor_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const item of list) {
    const old = existing.get(item.ingredient_id);
    ins.run(eventId, item.ingredient_id, item.qty, item.unit, item.est_cost,
      old ? old.purchased : 0, old ? old.actual_cost : null, old ? old.vendor_id : null);
  }
  return list;
}

module.exports = { scaleMenu, generateProcurement };
