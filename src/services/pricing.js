'use strict';
// Pricing engine.
// per-plate = (package base + Σ add-on deltas) × (1 − slab discount%)
// Slabs: the highest min_guests ≤ guest_count wins; a package-specific slab
// beats a global (package_id NULL) slab at the same threshold.

function slabFor(db, packageId, guestCount) {
  return db.prepare(`
    SELECT min_guests, discount_pct FROM price_slabs
    WHERE min_guests <= ? AND (package_id IS NULL OR package_id = ?)
    ORDER BY min_guests DESC, (package_id IS NOT NULL) DESC
    LIMIT 1`).get(guestCount, packageId ?? -1);
}

// addonDishIds: dishes on the menu that are NOT part of the package.
function quote(db, { packageId, guestCount, addonDishIds = [] }) {
  const pkg = packageId
    ? db.prepare('SELECT * FROM packages WHERE id = ?').get(packageId)
    : null;
  const base = pkg ? pkg.base_price_per_plate : 0;

  let addonsPerPlate = 0;
  const addonLines = [];
  if (addonDishIds.length) {
    const rows = db.prepare(
      `SELECT id, name_en, name_hi, name_mr, addon_price_per_plate FROM dishes
       WHERE id IN (${addonDishIds.map(() => '?').join(',')})`
    ).all(...addonDishIds);
    for (const d of rows) {
      addonsPerPlate += d.addon_price_per_plate;
      addonLines.push({ dishId: d.id, name_en: d.name_en, name_hi: d.name_hi, name_mr: d.name_mr, perPlate: d.addon_price_per_plate });
    }
  }

  const slab = guestCount ? slabFor(db, packageId, guestCount) : null;
  const discountPct = slab ? slab.discount_pct : 0;
  const gross = base + addonsPerPlate;
  const perPlate = Math.round(gross * (1 - discountPct / 100) * 100) / 100;
  const total = Math.round(perPlate * (guestCount || 0));

  return {
    package: pkg ? { id: pkg.id, code: pkg.code, base } : null,
    guestCount: guestCount || 0,
    basePerPlate: base,
    addonsPerPlate,
    addonLines,
    discountPct,
    perPlate,
    total,
  };
}

// Recompute + cache an event's per-plate price from its stored menu.
function repriceEvent(db, eventId) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!ev) throw new Error('event not found');
  const addons = db.prepare(
    'SELECT dish_id FROM event_menu_items WHERE event_id = ? AND from_package = 0'
  ).all(eventId).map((r) => r.dish_id);
  const q = quote(db, { packageId: ev.package_id, guestCount: ev.guest_count, addonDishIds: addons });
  db.prepare("UPDATE events SET per_plate_price = ?, updated_at = datetime('now') WHERE id = ?")
    .run(q.perPlate, eventId);
  return q;
}

module.exports = { quote, repriceEvent, slabFor };
