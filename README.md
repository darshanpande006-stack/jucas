# Jucas 🍛

Catering management platform for **Shriram Caterers & Events** (Shrirampur, Ahilya Nagar) — pure-veg Maharashtrian catering, contract-labor model, 100% fresh on-site cooking, 100–3,000+ guests. Built for our own operations first; designed to extend to other Tier-2/Tier-3 Indian caterers.

## Quick start

```bash
# Requires Node.js >= 22.5 — nothing else. No npm install.
npm run seed    # first time only: loads the catalog (also runs on first boot)
npm start       # → http://localhost:3000
npm test        # engine tests (pricing, scaling, full workflow, payouts)
```

- **Admin app:** `http://localhost:3000` (Marathi UI by default; हिं/En toggle top-right)
- **Client portal:** `http://localhost:3000/portal`
- Data lives in a single SQLite file at `data/jucas.db` — back it up by copying the file.

## Stack decision

Zero-dependency Node.js: `node:http` + a ~150-line router, server-rendered HTML views (plain JS template functions), `node:sqlite` for storage, and a thin layer of vanilla JS + a service worker on the client. Chosen because the deployment target is a cheap India-region VPS (₹300–500/mo) serving phones on patchy rural connectivity: server-rendered pages are tiny and every screen works with JavaScript disabled (JS only adds live price recalculation and offline draft autosave); there is no build step, no native modules, and no `npm install`, so deploys are `git pull && systemctl restart jucas`; SQLite comfortably handles a single caterer's volume and is one file to back up. The service/route separation leaves clean seams for Postgres + multi-tenancy later.

## What's built (and verified)

Each slice is working end-to-end, exercised over real HTTP and covered by `npm test`:

1. **Lead → proposal → e-sign → booked event** — lead capture (admin or portal), trilingual branded quotation with menu snapshot and volume-slab pricing, WhatsApp send, public proposal link, typed-name acceptance (name + timestamp + phone recorded) that auto-creates the booked event with its menu.
2. **Menu → ingredient scaling → procurement** — dish catalog (42 Maharashtrian dishes with per-100-plate recipes over 68 ingredients), per-event menu editing with live per-plate recalculation, one-tap shopping list in kg/L/pcs with buyable rounding, estimated market cost, purchase check-off, and a WhatsApp-shareable list for the market runner. Recipes/rates are editable in **Menu & Rates** so the defaults can be tuned to real quantities; the full 321-item ingredient master can be entered there or added to `src/db/seed.js`.
3. **Contract-labor staffing** — pool of day-rate cooks/servers/helpers, per-event assignment with negotiated rates, WhatsApp work invites (Marathi), invited/confirmed/declined tracking, attendance (present/half-day/absent) → automatic payout calculation, mark-paid, per-person dues across events.
4. **Billing** — invoice generation (JUC-YYYY-NNNN), cash/UPI/bank payment recording (advances before invoicing are picked up), printable invoice, WhatsApp receipts and payment reminders, and the **Money** screen: every outstanding balance, one tap to remind.
5. **Client self-service** — public trilingual portal: browse the three thali tiers with full menus, request a quote (creates a lead), track status by private link; every step mirrored on WhatsApp.
6. **Reports** — bookings by month, revenue by package tier, top dishes, labor cost vs revenue per event, repeat-client rate.
7. **Pricing engine** — three-tier thali structure (Saatvik ₹280 / Rajwadi ₹400 / Maharaja ₹550 per plate), add-on dishes priced per plate, volume slabs (3% ≥500, 5% ≥1000, 8% ≥2000 guests), automatic recalculation on any guest-count or menu change.

**Trilingual (en/hi/mr) throughout** — one dictionary (`src/i18n/strings.js`) drives the admin UI, portal, proposals, invoices, and all six WhatsApp message templates; each client has a preferred language used for everything sent to them.

**Offline tolerance** — forms autosave drafts to the phone (`data-draft`), an offline banner reassures the user nothing is lost, and a service worker caches the shell.

### What's stubbed / by design not yet real

- **WhatsApp sending** uses a logged `wa.me` handoff: every message is composed from a trilingual template, written to `comm_logs`, and opened in WhatsApp pre-filled for one-tap manual send. The adapter interface in `src/services/whatsapp.js` is where the Business Cloud API plugs in — nothing else changes.
- **E-signature** is typed-name + timestamp + phone (adequate for booking confirmations; a formal e-sign provider can replace it later).
- **PDF export** is print-optimized HTML (browser print-to-PDF); a server-side PDF pipeline is a next step.
- **No authentication yet** (deliberate, per scope). Run on a private network or behind reverse-proxy basic auth until the auth slice lands.
- **No payment gateway** — payments are recorded manually (cash/UPI ref/bank), which matches current operations.

## Project structure

```
src/
  server.js            wiring + boot
  lib/                 router, html/util helpers (zero-dep infrastructure)
  db/                  schema.sql, connection, seed catalog
  i18n/                trilingual dictionary + helpers
  services/            the engines: pricing, scaling, proposals, billing,
                       staffing, whatsapp (adapter), reports
  routes/              one module per feature area (leads, events, staff,
                       money, reports, catalog, portal, api)
  views/               layout/shell + printable documents
public/                app.css, app.js, sw.js (all < 15 KB combined)
test/                  engine + workflow tests (node:test)
```

## What's next (prioritized)

1. **Authentication + roles** — simple PIN login first (owner / manager / view-only), so it can leave the private network.
2. **WhatsApp Business Cloud API adapter** — real template sends + inbound message webhook into `comm_logs` (the "reply YES to confirm" staff flow becomes automatic). *Needs a decision: Meta Cloud API direct vs a BSP (Gupshup/Twilio/AiSensy) — cost and approval trade-offs.*
3. **Full 321-item ingredient master + tuned recipes** — bulk CSV import screen, then a week of tuning per-100-plate quantities against real events.
4. **UPI payment links / gateway** — deep links (`upi://pay`) on invoices and reminders are nearly free to add; a gateway (Razorpay/Cashfree) *needs your decision on fees and settlement*.
5. **Server-side PDF generation** for proposals/invoices (identical layout, attachable to WhatsApp).
6. **Event-day production sheet** — per-dish cooking quantities and counter plan for the head cook (data already exists).
7. **Multi-tenant mode** — org table + row scoping + Postgres migration, for offering Jucas to other caterers.
8. **Backups** — nightly copy of `data/jucas.db` to object storage.
