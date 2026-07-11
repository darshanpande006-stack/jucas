'use strict';
// Jucas server. Zero-dependency: node:http + node:sqlite.
//   npm run seed   (first time)
//   npm start      → http://localhost:3000
//
// NOTE: no authentication yet, by design (see README). Run it on a private
// network / behind a reverse-proxy with basic auth until the auth slice lands.

const http = require('node:http');
const path = require('node:path');
const { Router } = require('./lib/router');
const { connect } = require('./db/db');
const { seed } = require('./db/seed');

connect();
seed(); // idempotent: fills the catalog on first boot only

const router = new Router();
router.serveStatic('/public/', path.join(__dirname, '..', 'public'));
// service worker must live at the root to control the whole app
router.get('/sw.js', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
  require('node:fs').createReadStream(path.join(__dirname, '..', 'public', 'sw.js')).pipe(res);
});

require('./routes/dashboard')(router);
require('./routes/leads')(router);
require('./routes/events')(router);
require('./routes/staff')(router);
require('./routes/money')(router);
require('./routes/reports')(router);
require('./routes/catalog')(router);
require('./routes/portal')(router);
require('./routes/api')(router);

const PORT = Number(process.env.PORT || 3000);
http.createServer((req, res) => router.handle(req, res))
  .listen(PORT, () => console.log(`Jucas running → http://localhost:${PORT}  (portal: /portal)`));
