'use strict';
const { t } = require('../i18n');
const { esc } = require('../lib/util');

// Admin app shell: header + content + bottom tab bar. lang switches via ?lang=
// (routes persist it to a cookie).
function page({ lang, title, active, content, backHref, fab }) {
  const nav = [
    ['/', 'nav_home', '🏠'],
    ['/events', 'nav_bookings', '📅'],
    ['/leads', 'nav_enquiries', '📞'],
    ['/money', 'nav_money', '💰'],
    ['/more', 'nav_reports', '☰'],
  ];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#166534">
<title>${esc(title)} · Jucas</title>
<link rel="stylesheet" href="/public/app.css">
<link rel="manifest" href="/public/manifest.webmanifest">
</head>
<body>
<header class="topbar">
  ${backHref ? `<a class="back" href="${esc(backHref)}">‹</a>` : `<span class="logo">🍛</span>`}
  <h1>${esc(title)}</h1>
  <nav class="langs">${['mr', 'hi', 'en'].map((l) =>
    `<a href="?lang=${l}" class="${l === lang ? 'on' : ''}">${l === 'mr' ? 'म' : l === 'hi' ? 'हि' : 'En'}</a>`).join('')}
  </nav>
</header>
<main>${content}</main>
${fab ? `<a class="fab" href="${esc(fab.href)}">＋ ${esc(fab.label)}</a>` : ''}
<nav class="tabbar">${nav.map(([href, key, icon]) =>
  `<a href="${href}" class="${active === href ? 'on' : ''}"><span>${icon}</span>${esc(t(key, lang))}</a>`).join('')}
</nav>
<script src="/public/app.js" defer></script>
</body></html>`;
}

// Public client-facing shell (portal, proposals): no admin nav.
function publicPage({ lang, title, content, currentPath = '/portal' }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#166534">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/public/app.css">
</head>
<body class="public">
<header class="topbar">
  <span class="logo">🍛</span>
  <h1>${esc(t('business_name', lang))}</h1>
  <nav class="langs">${['mr', 'hi', 'en'].map((l) =>
    `<a href="?lang=${l}" class="${l === lang ? 'on' : ''}">${l === 'mr' ? 'म' : l === 'hi' ? 'हि' : 'En'}</a>`).join('')}
  </nav>
</header>
<main>${content}</main>
<script src="/public/app.js" defer></script>
</body></html>`;
}

// ── small components ──
const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;

const STATUS_KIND = {
  new: 'blue', contacted: 'blue', proposal_sent: 'amber', confirmed: 'green', lost: 'gray',
  draft: 'gray', sent: 'blue', viewed: 'amber', accepted: 'green', rejected: 'gray', expired: 'gray',
  booked: 'green', in_prep: 'amber', completed: 'blue', cancelled: 'gray',
  invited: 'amber', declined: 'gray',
  unpaid: 'red', partial: 'amber', paid: 'green',
  present: 'green', half_day: 'amber', absent: 'red',
};
const statusBadge = (status, label) => badge(label, STATUS_KIND[status] || '');

module.exports = { page, publicPage, badge, statusBadge };
