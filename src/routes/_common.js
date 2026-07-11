'use strict';
const { sendHtml, redirect } = require('../lib/router');
const { reqLang } = require('../i18n');

// Render HTML; if the user just switched language (?lang=xx) persist it.
function render(req, res, html, status = 200) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (req.query.lang) {
    headers['Set-Cookie'] = `lang=${reqLang(req)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  res.writeHead(status, headers);
  res.end(html);
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host || 'localhost:3000'}`;
}

function back(res, req, fallback) {
  redirect(res, req.headers.referer && req.headers.referer.startsWith(baseUrl(req))
    ? req.headers.referer : fallback);
}

module.exports = { render, baseUrl, back };
