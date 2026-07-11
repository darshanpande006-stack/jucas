'use strict';
// Contract-labor module: assign from the pool, track confirmation and
// attendance, compute payouts. attendance → payout: present = agreed rate,
// half_day = 50%, absent = 0.

const PAYOUT_FACTOR = { present: 1, half_day: 0.5, absent: 0 };

function assign(db, { eventId, staffId, role, rate }) {
  const s = db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId);
  if (!s) throw new Error('staff not found');
  db.prepare(`INSERT INTO staff_assignments (event_id, staff_id, role, agreed_rate)
              VALUES (?,?,?,?)
              ON CONFLICT (event_id, staff_id) DO UPDATE SET role = excluded.role, agreed_rate = excluded.agreed_rate`)
    .run(eventId, staffId, role || s.role, rate != null && rate !== '' ? Number(rate) : s.day_rate);
}

function setStatus(db, assignmentId, status) {
  if (!['invited', 'confirmed', 'declined'].includes(status)) throw new Error('bad status');
  db.prepare('UPDATE staff_assignments SET status = ? WHERE id = ?').run(status, assignmentId);
}

function setAttendance(db, assignmentId, attendance) {
  if (!(attendance in PAYOUT_FACTOR)) throw new Error('bad attendance');
  const a = db.prepare('SELECT * FROM staff_assignments WHERE id = ?').get(assignmentId);
  if (!a) throw new Error('assignment not found');
  const payout = Math.round(a.agreed_rate * PAYOUT_FACTOR[attendance]);
  db.prepare('UPDATE staff_assignments SET attendance = ?, payout_amount = ? WHERE id = ?')
    .run(attendance, payout, assignmentId);
  return payout;
}

function markPaid(db, assignmentId) {
  db.prepare("UPDATE staff_assignments SET paid = 1, paid_at = datetime('now') WHERE id = ? AND payout_amount IS NOT NULL")
    .run(assignmentId);
}

function eventLaborSummary(db, eventId) {
  return db.prepare(`
    SELECT COUNT(*) AS headcount,
           COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END),0) AS confirmed,
           COALESCE(SUM(payout_amount),0) AS payout_total,
           COALESCE(SUM(CASE WHEN paid = 1 THEN payout_amount ELSE 0 END),0) AS paid_total
    FROM staff_assignments WHERE event_id = ? AND status != 'declined'`).get(eventId);
}

module.exports = { assign, setStatus, setAttendance, markPaid, eventLaborSummary, PAYOUT_FACTOR };
