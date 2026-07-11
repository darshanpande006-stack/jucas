'use strict';
// Menu & rates admin: packages (read), dishes (add / addon price), ingredients
// (market-rate edit, add), per-dish recipe editor so scaling defaults can be
// tuned to the business's real quantities.

const { get } = require('../db/db');
const { redirect } = require('../lib/router');
const { t, reqLang, locName } = require('../i18n');
const { esc, inr } = require('../lib/util');
const { page } = require('../views/layout');
const { render } = require('./_common');

const DISH_CATS = ['sweet', 'main', 'dal', 'rice', 'bread', 'snack', 'salad', 'condiment', 'beverage'];
const ING_CATS = ['grain', 'pulse', 'vegetable', 'fruit', 'dairy', 'oil', 'spice', 'dry_fruit', 'sweetener', 'other'];

module.exports = function mount(router) {
  router.get('/catalog', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const tab = req.query.tab || 'packages';
    const tabs = ['packages', 'dishes', 'ingredients'].map((tb) =>
      `<a class="${tab === tb ? 'on' : ''}" href="/catalog?tab=${tb}">${{ packages: t('package', lang), dishes: t('menu', lang), ingredients: t('ingredient', lang) }[tb]}</a>`).join('');

    let body = '';
    if (tab === 'packages') {
      const pkgs = db.prepare('SELECT * FROM packages ORDER BY tier').all();
      body = pkgs.map((p) => {
        const ds = db.prepare('SELECT d.* FROM package_dishes pd JOIN dishes d ON d.id = pd.dish_id WHERE pd.package_id = ? ORDER BY d.category').all(p.id);
        return `<div class="pkg t${p.tier}">
  <div style="display:flex;justify-content:space-between;align-items:baseline">
    <b>${esc(locName(p, 'name', lang))}</b>
    <span class="price">${inr(p.base_price_per_plate)}<span class="muted" style="font-size:.8rem"> ${t('per_plate', lang)}</span></span>
  </div>
  <div class="muted">${esc(locName(p, 'desc', lang))} · ${t('min_guests_note', lang)} ${p.min_guests}</div>
  <div class="dishes">${ds.map((d) => esc(locName(d, 'name', lang))).join(' · ')}</div>
</div>`;
      }).join('');
    } else if (tab === 'dishes') {
      const dishes = db.prepare('SELECT * FROM dishes WHERE active = 1 ORDER BY category, name_en').all();
      body = `<div class="card"><div class="rowlist">
${dishes.map((d) => `<a href="/catalog/dishes/${d.id}">
  <div class="grow"><div class="title">${esc(locName(d, 'name', lang))}</div><div class="sub">${esc(d.category)}</div></div>
  <div class="right">+${inr(d.addon_price_per_plate)}</div></a>`).join('')}
</div></div>
<form method="post" action="/catalog/dishes/new" class="card">
  <h2>＋ ${t('add', lang)}</h2>
  <label>${t('name', lang)} (English) *</label><input name="name_en" required>
  <div class="grid2">
    <div><label>हिंदी</label><input name="name_hi"></div>
    <div><label>मराठी</label><input name="name_mr"></div>
  </div>
  <div class="grid2">
    <div><label>${t('event_type', lang)}</label>
      <select name="category">${DISH_CATS.map((c) => `<option>${c}</option>`).join('')}</select></div>
    <div><label>${t('addons', lang)} ₹/${t('per_plate', lang)}</label><input name="addon_price" type="number" step="0.01" value="0"></div>
  </div>
  <button class="btn full">${t('save', lang)}</button>
</form>`;
    } else {
      const ings = db.prepare('SELECT * FROM ingredients ORDER BY category, name_en').all();
      body = `<div class="card"><div class="scrollx"><table class="tbl">
  <tr><th>${t('ingredient', lang)}</th><th></th><th class="num">₹/unit</th><th></th></tr>
  ${ings.map((i) => `<tr><td>${esc(locName(i, 'name', lang))}<br><span class="muted">${t('ic_' + i.category, lang)}</span></td>
    <td>${i.unit}</td>
    <td class="num">
      <form method="post" action="/catalog/ingredients/${i.id}/rate" style="display:flex;gap:.3rem">
        <input name="rate" type="number" step="0.5" value="${i.market_rate ?? ''}" style="width:5.2rem;min-height:2.2rem;padding:.3rem">
        <button class="btn sm">✓</button>
      </form></td><td></td></tr>`).join('')}
</table></div></div>
<form method="post" action="/catalog/ingredients/new" class="card">
  <h2>＋ ${t('add', lang)}</h2>
  <label>${t('name', lang)} (English) *</label><input name="name_en" required>
  <div class="grid2">
    <div><label>हिंदी</label><input name="name_hi"></div>
    <div><label>मराठी</label><input name="name_mr"></div>
  </div>
  <div class="grid2">
    <div><label>Unit</label><select name="unit"><option>kg</option><option>L</option><option>pcs</option></select></div>
    <div><label>₹/unit</label><input name="rate" type="number" step="0.5"></div>
  </div>
  <label>${t('lead_source', lang)}</label>
  <select name="category">${ING_CATS.map((c) => `<option value="${c}">${t('ic_' + c, lang)}</option>`).join('')}</select>
  <button class="btn full">${t('save', lang)}</button>
</form>`;
    }

    render(req, res, page({
      lang, title: t('nav_catalog', lang), active: '/more', backHref: '/more',
      content: `<div class="subtabs">${tabs}</div>${body}`,
    }));
  });

  router.post('/catalog/dishes/new', (req, res) => {
    const en = String(req.body.name_en || '').trim();
    if (en) {
      get().prepare('INSERT INTO dishes (name_en,name_hi,name_mr,category,addon_price_per_plate) VALUES (?,?,?,?,?)')
        .run(en, req.body.name_hi || en, req.body.name_mr || en,
          DISH_CATS.includes(req.body.category) ? req.body.category : 'main',
          Number(req.body.addon_price) || 0);
    }
    redirect(res, '/catalog?tab=dishes');
  });

  // Per-dish recipe editor
  router.get('/catalog/dishes/:id', (req, res) => {
    const db = get();
    const lang = reqLang(req);
    const d = db.prepare('SELECT * FROM dishes WHERE id = ?').get(req.params.id);
    if (!d) return redirect(res, '/catalog?tab=dishes');
    const recipe = db.prepare(`
      SELECT r.*, i.name_en, i.name_hi, i.name_mr, i.unit FROM recipe_items r
      JOIN ingredients i ON i.id = r.ingredient_id WHERE r.dish_id = ? ORDER BY i.name_en`).all(d.id);
    const others = db.prepare(`
      SELECT * FROM ingredients WHERE id NOT IN (SELECT ingredient_id FROM recipe_items WHERE dish_id = ?)
      ORDER BY name_en`).all(d.id);
    const content = `
<div class="card">
  <div class="title">${esc(locName(d, 'name', lang))}</div>
  <div class="sub">${esc(d.category)} · ${t('addons', lang)}: +${inr(d.addon_price_per_plate)} ${t('per_plate', lang)}</div>
  <form method="post" action="/catalog/dishes/${d.id}/price">
    <label>${t('addons', lang)} ₹/${t('per_plate', lang)}</label>
    <div style="display:flex;gap:.4rem"><input name="addon_price" type="number" step="0.01" value="${d.addon_price_per_plate}">
    <button class="btn">✓</button></div>
  </form>
</div>
<div class="card"><h2>${t('ingredient', lang)} / 100 ${t('guests', lang)}</h2>
${recipe.map((r) => `
<form method="post" action="/catalog/dishes/${d.id}/recipe/${r.id}" class="checkline">
  <span style="flex:1">${esc(locName(r, 'name', lang))}</span>
  <input name="qty" type="number" step="0.01" value="${r.qty_per_100}" style="width:5.5rem;min-height:2.2rem;padding:.3rem">
  <span class="muted">${r.unit}</span>
  <button class="btn sm">✓</button>
  <button class="btn sm ghost" name="del" value="1">✕</button>
</form>`).join('') || `<div class="muted">—</div>`}
<form method="post" action="/catalog/dishes/${d.id}/recipe" style="margin-top:.6rem">
  <div style="display:flex;gap:.4rem">
    <select name="ingredient_id" style="flex:2">${others.map((i) => `<option value="${i.id}">${esc(locName(i, 'name', lang))} (${i.unit})</option>`).join('')}</select>
    <input name="qty" type="number" step="0.01" placeholder="qty/100" style="flex:1">
    <button class="btn">＋</button>
  </div>
</form></div>`;
    render(req, res, page({ lang, title: esc(locName(d, 'name', lang)), active: '/more', backHref: '/catalog?tab=dishes', content }));
  });

  router.post('/catalog/dishes/:id/price', (req, res) => {
    get().prepare('UPDATE dishes SET addon_price_per_plate = ? WHERE id = ?')
      .run(Number(req.body.addon_price) || 0, req.params.id);
    redirect(res, `/catalog/dishes/${req.params.id}`);
  });

  router.post('/catalog/dishes/:id/recipe', (req, res) => {
    const qty = Number(req.body.qty);
    if (qty > 0 && req.body.ingredient_id) {
      get().prepare(`INSERT INTO recipe_items (dish_id, ingredient_id, qty_per_100) VALUES (?,?,?)
        ON CONFLICT (dish_id, ingredient_id) DO UPDATE SET qty_per_100 = excluded.qty_per_100`)
        .run(req.params.id, Number(req.body.ingredient_id), qty);
    }
    redirect(res, `/catalog/dishes/${req.params.id}`);
  });

  router.post('/catalog/dishes/:id/recipe/:rid', (req, res) => {
    const db = get();
    if (req.body.del) {
      db.prepare('DELETE FROM recipe_items WHERE id = ? AND dish_id = ?').run(req.params.rid, req.params.id);
    } else if (Number(req.body.qty) > 0) {
      db.prepare('UPDATE recipe_items SET qty_per_100 = ? WHERE id = ? AND dish_id = ?')
        .run(Number(req.body.qty), req.params.rid, req.params.id);
    }
    redirect(res, `/catalog/dishes/${req.params.id}`);
  });

  router.post('/catalog/ingredients/new', (req, res) => {
    const en = String(req.body.name_en || '').trim();
    if (en) {
      get().prepare('INSERT INTO ingredients (name_en,name_hi,name_mr,unit,category,market_rate) VALUES (?,?,?,?,?,?)')
        .run(en, req.body.name_hi || en, req.body.name_mr || en,
          ['kg', 'L', 'pcs'].includes(req.body.unit) ? req.body.unit : 'kg',
          ING_CATS.includes(req.body.category) ? req.body.category : 'other',
          Number(req.body.rate) || null);
    }
    redirect(res, '/catalog?tab=ingredients');
  });

  router.post('/catalog/ingredients/:id/rate', (req, res) => {
    get().prepare('UPDATE ingredients SET market_rate = ? WHERE id = ?')
      .run(Number(req.body.rate) || null, req.params.id);
    redirect(res, '/catalog?tab=ingredients');
  });
};
