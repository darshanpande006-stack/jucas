'use strict';
// Reporting queries. "Revenue" = contract value (per-plate × guests) of
// non-cancelled events; "collected" = actual payments received.

function bookingsByMonth(db, monthsBack = 12) {
  return db.prepare(`
    SELECT strftime('%Y-%m', event_date) AS month,
           COUNT(*) AS events,
           COALESCE(SUM(per_plate_price * guest_count), 0) AS revenue,
           COALESCE(SUM(guest_count), 0) AS guests
    FROM events
    WHERE status != 'cancelled' AND event_date >= date('now', ?)
    GROUP BY month ORDER BY month`).all(`-${monthsBack} months`);
}

function revenueByPackage(db) {
  return db.prepare(`
    SELECT COALESCE(p.name_en, 'Custom') AS name_en, COALESCE(p.name_hi, p.name_en, 'Custom') AS name_hi,
           COALESCE(p.name_mr, p.name_en, 'Custom') AS name_mr, p.tier,
           COUNT(*) AS events,
           COALESCE(SUM(e.per_plate_price * e.guest_count), 0) AS revenue
    FROM events e LEFT JOIN packages p ON p.id = e.package_id
    WHERE e.status != 'cancelled'
    GROUP BY e.package_id ORDER BY revenue DESC`).all();
}

function topDishes(db, limit = 15) {
  return db.prepare(`
    SELECT d.name_en, d.name_hi, d.name_mr, d.category, COUNT(*) AS times_ordered,
           COALESCE(SUM(e.guest_count), 0) AS plates
    FROM event_menu_items m
    JOIN dishes d ON d.id = m.dish_id
    JOIN events e ON e.id = m.event_id AND e.status != 'cancelled'
    GROUP BY m.dish_id ORDER BY times_ordered DESC, plates DESC LIMIT ?`).all(limit);
}

function laborVsRevenue(db, limit = 25) {
  return db.prepare(`
    SELECT e.id, e.event_date, c.name AS client_name, e.guest_count,
           COALESCE(e.per_plate_price * e.guest_count, 0) AS revenue,
           COALESCE((SELECT SUM(payout_amount) FROM staff_assignments a
                     WHERE a.event_id = e.id AND a.status != 'declined'), 0) AS labor_cost
    FROM events e JOIN clients c ON c.id = e.client_id
    WHERE e.status != 'cancelled'
    ORDER BY e.event_date DESC LIMIT ?`).all(limit)
    .map((r) => ({ ...r, labor_pct: r.revenue ? Math.round((r.labor_cost / r.revenue) * 1000) / 10 : null }));
}

function repeatClientRate(db) {
  const row = db.prepare(`
    SELECT COUNT(*) AS clients,
           SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) AS repeat_clients
    FROM (SELECT client_id, COUNT(*) AS n FROM events WHERE status != 'cancelled' GROUP BY client_id)`).get();
  return {
    clients: row.clients || 0,
    repeat_clients: row.repeat_clients || 0,
    rate_pct: row.clients ? Math.round(((row.repeat_clients || 0) / row.clients) * 1000) / 10 : 0,
  };
}

function outstanding(db) {
  return db.prepare(`
    SELECT e.id AS event_id, e.event_date, c.name AS client_name, c.whatsapp, c.phone, c.lang,
           COALESCE(e.per_plate_price * e.guest_count, 0) AS contract_value,
           COALESCE((SELECT SUM(amount) FROM payments p WHERE p.event_id = e.id), 0) AS paid
    FROM events e JOIN clients c ON c.id = e.client_id
    WHERE e.status IN ('booked','in_prep','completed')
    ORDER BY e.event_date`).all()
    .map((r) => ({ ...r, balance: r.contract_value - r.paid }))
    .filter((r) => r.balance > 0.5);
}

module.exports = { bookingsByMonth, revenueByPackage, topDishes, laborVsRevenue, repeatClientRate, outstanding };
