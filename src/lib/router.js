'use strict';
// Minimal HTTP router: method + path patterns with :params, body parsing,
// cookies, static files. Zero dependencies by design (see README: stack).

const fs = require('node:fs');
const path = require('node:path');
const querystring = require('node:querystring');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

class Router {
  constructor() {
    this.routes = [];
    this.staticDirs = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern
          .split('/')
          .map((seg) => {
            if (seg.startsWith(':')) {
              keys.push(seg.slice(1));
              return '([^/]+)';
            }
            return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/') +
        '/?$'
    );
    this.routes.push({ method, regex, keys, handler });
  }

  get(pattern, handler) { this.add('GET', pattern, handler); }
  post(pattern, handler) { this.add('POST', pattern, handler); }

  serveStatic(urlPrefix, dir) {
    this.staticDirs.push({ urlPrefix, dir });
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    req.path = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams);
    req.cookies = parseCookies(req.headers.cookie || '');

    for (const { urlPrefix, dir } of this.staticDirs) {
      if (req.method === 'GET' && req.path.startsWith(urlPrefix)) {
        return serveFile(res, dir, req.path.slice(urlPrefix.length));
      }
    }

    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = r.regex.exec(req.path);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));
      if (req.method === 'POST') req.body = await readBody(req);
      try {
        return await r.handler(req, res);
      } catch (err) {
        console.error(`[jucas] ${req.method} ${req.path}:`, err);
        return sendHtml(res, 500, errorPage(err));
      }
    }
    return sendHtml(res, 404, errorPage(new Error('Page not found / पृष्ठ सापडले नाही')));
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
      } else {
        resolve(querystring.parse(data));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, dir, rel) {
  const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function redirect(res, to, cookies) {
  const headers = { Location: to };
  if (cookies) headers['Set-Cookie'] = cookies;
  res.writeHead(302, headers);
  res.end();
}

function errorPage(err) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;padding:2rem;max-width:30rem;margin:auto;text-align:center">
<h2>⚠️ ${String(err.message).replace(/</g, '&lt;')}</h2>
<a href="/" style="display:inline-block;margin-top:1rem;padding:.8rem 1.6rem;background:#166534;color:#fff;border-radius:.5rem;text-decoration:none">← Home / मुख्यपृष्ठ</a></body>`;
}

module.exports = { Router, sendHtml, sendJson, redirect };
