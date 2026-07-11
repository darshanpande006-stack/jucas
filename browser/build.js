'use strict';
// Builds the self-contained browser demo of Jucas (dist/jucas-demo.html):
// the real server code bundled by esbuild, node builtins shimmed, SQLite as
// inlined WASM. Output is one HTML file with zero external requests.

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const css = read('public/app.css');
const appJs = read('public/app.js');
const wasmB64 = fs.readFileSync(path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm.wasm')).toString('base64');

const SHIMS = {
  'node:fs': 'browser/shims/fs.js', fs: 'browser/shims/fs.js',
  'node:path': 'browser/shims/path.js', path: 'browser/shims/path.js',
  'node:querystring': 'browser/shims/querystring.js',
  'node:crypto': 'browser/shims/crypto.js', crypto: 'browser/shims/crypto.js',
};

const shimPlugin = {
  name: 'jucas-shims',
  setup(build) {
    build.onResolve({ filter: /^(node:)?(fs|path|querystring|crypto)$/ }, (args) => ({
      path: path.join(ROOT, SHIMS[args.path]),
    }));
    // Redirect the real db module to the sql.js-backed shim
    build.onResolve({ filter: /(^|[/\\])db$|[/\\]db\/db(\.js)?$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path);
      if (resolved === path.join(ROOT, 'src/db/db') || resolved === path.join(ROOT, 'src/db/db.js')) {
        return { path: path.join(ROOT, 'browser/shims/db-shim.js') };
      }
      return null;
    });
  },
};

async function main() {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'browser/boot.js')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    minify: true,
    loader: { '.sql': 'text' },
    plugins: [shimPlugin],
    define: {
      __JUCAS_CSS__: JSON.stringify(css),
      __JUCAS_APPJS__: JSON.stringify(appJs),
      __JUCAS_WASM_B64__: JSON.stringify(wasmB64),
      'process.env.NODE_ENV': '"production"',
    },
  });
  const js = result.outputFiles[0].text;

  const html = `<title>Jucas — Shriram Caterers (live demo)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{height:100%;margin:0;background:#0e1512}
  .bar{display:flex;align-items:center;gap:.6rem;padding:.45rem .8rem;background:#0e1512;color:#9fb8a5;
       font:12px system-ui;position:sticky;top:0}
  .bar b{color:#e8f2e9}
  .bar button{margin-left:auto;background:none;border:1px solid #3a4f40;color:#9fb8a5;border-radius:6px;
       padding:.2rem .6rem;font:inherit;cursor:pointer}
  #wrap{height:calc(100% - 30px)}
  iframe{width:100%;height:100%;border:0;background:#f6f7f4}
  #boot-error{color:#ff9d9d;padding:1rem;font:14px system-ui}
</style>
<div class="bar">🍛 <b>Jucas</b> · live demo — runs entirely in your browser, data stays on this device
  <button id="reset">Reset data</button></div>
<div id="wrap"><iframe id="app" title="Jucas"></iframe></div>
<div id="boot-error"></div>
<script>${js}<\/script>
`;

  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  const out = path.join(ROOT, 'dist/jucas-demo.html');
  fs.writeFileSync(out, html);
  console.log(`built ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
