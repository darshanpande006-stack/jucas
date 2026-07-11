'use strict';
// JSON API — powers the live pricing preview and gives future clients
// (mobile app, WhatsApp bot) a machine interface to the same engines.

const { get } = require('../db/db');
const { sendJson } = require('../lib/router');
const pricing = require('../services/pricing');
const scaling = require('../services/scaling');

module.exports = function mount(router) {
  // GET /api/pricing/quote?package_id=2&guest_count=800&addons=5,12
  router.get('/api/pricing/quote', (req, res) => {
    const q = pricing.quote(get(), {
      packageId: Number(req.query.package_id) || null,
      guestCount: Number(req.query.guest_count) || 0,
      addonDishIds: String(req.query.addons || '').split(',').map(Number).filter(Boolean),
    });
    sendJson(res, 200, q);
  });

  // GET /api/scaling/preview?dishes=1,2,3&guest_count=500
  router.get('/api/scaling/preview', (req, res) => {
    const list = scaling.scaleMenu(get(),
      String(req.query.dishes || '').split(',').map(Number).filter(Boolean),
      Number(req.query.guest_count) || 0);
    sendJson(res, 200, { items: list, est_total: list.reduce((s, i) => s + (i.est_cost || 0), 0) });
  });

  // GET /api/events/:id/procurement — current stored list
  router.get('/api/events/:id/procurement', (req, res) => {
    const rows = get().prepare(`
      SELECT pi.*, i.name_en, i.name_mr, i.category FROM procurement_items pi
      JOIN ingredients i ON i.id = pi.ingredient_id WHERE pi.event_id = ? ORDER BY i.category`).all(req.params.id);
    sendJson(res, 200, { items: rows });
  });
};
