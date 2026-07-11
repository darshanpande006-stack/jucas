'use strict';
const crypto = require('node:crypto');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function token(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// ₹ formatting, Indian digit grouping (1,00,000)
function inr(n, decimals = 0) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 2) });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// "2026-11-24" -> "24 Nov 2026"
function fmtDate(iso, lang = 'en') {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  const locale = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Round market quantities to buyable amounts: 23.37 kg -> 23.5 kg, 0.128 kg -> 0.15 kg
function roundQty(q) {
  if (q >= 20) return Math.ceil(q);
  if (q >= 2) return Math.ceil(q * 2) / 2;      // nearest 0.5
  if (q >= 0.5) return Math.ceil(q * 4) / 4;     // nearest 0.25
  return Math.ceil(q * 20) / 20;                 // nearest 0.05
}

// Normalise Indian phone numbers to digits with country code for wa.me links
function waPhone(phone) {
  let p = String(phone || '').replace(/[^\d]/g, '');
  if (p.length === 10) p = '91' + p;
  return p;
}

module.exports = { esc, token, inr, today, fmtDate, roundQty, waPhone };
