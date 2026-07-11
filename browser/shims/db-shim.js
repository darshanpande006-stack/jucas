'use strict';
// Drop-in replacement for src/db/db.js in the browser build.
// Wraps sql.js (SQLite → WASM) behind the node:sqlite DatabaseSync surface
// the app uses: prepare().get/.all/.run, exec. Persists to localStorage.

const initSqlJs = require('sql.js/dist/sql-wasm.js');
const schemaSql = require('../../src/db/schema.sql'); // bundled as text

const LS_KEY = 'jucas-db-v1';
let SQL = null;
let db = null;

class Stmt {
  constructor(raw, sql) { this.raw = raw; this.sql = sql; }
  _fresh() { return this.raw.prepare(this.sql); }
  get(...params) {
    const st = this._fresh();
    try {
      st.bind(params.map(nullify));
      if (!st.step()) return undefined;
      return st.getAsObject();
    } finally { st.free(); }
  }
  all(...params) {
    const st = this._fresh();
    const out = [];
    try {
      st.bind(params.map(nullify));
      while (st.step()) out.push(st.getAsObject());
    } finally { st.free(); }
    return out;
  }
  run(...params) {
    const st = this._fresh();
    try { st.bind(params.map(nullify)); st.step(); } finally { st.free(); }
    const r = this.raw.exec('SELECT last_insert_rowid() AS v');
    return {
      lastInsertRowid: r.length ? r[0].values[0][0] : 0,
      changes: this.raw.getRowsModified(),
    };
  }
}

function nullify(v) { return v === undefined ? null : v; }

class BrowserDb {
  constructor(raw) { this.raw = raw; }
  prepare(sql) { return new Stmt(this.raw, sql); }
  exec(sql) { this.raw.exec(sql); }
  export() { return this.raw.export(); }
}

// Async boot (WASM init) — called once by browser/boot.js before any route runs.
async function init({ wasmBinary }) {
  if (db) return db;
  SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});
  let raw = null;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const bin = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
      raw = new SQL.Database(bin);
    }
  } catch { raw = null; }
  if (!raw) raw = new SQL.Database();
  db = new BrowserDb(raw);
  db.exec(schemaSql.replace(/PRAGMA journal_mode = WAL;/, '')); // WAL is meaningless in-memory
  return db;
}

function persist() {
  if (!db) return;
  try {
    const bytes = db.export();
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    localStorage.setItem(LS_KEY, btoa(bin));
  } catch { /* quota exceeded → demo keeps running in-memory */ }
}

function reset() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// node:sqlite-compatible surface used by the app
function connect() { return get(); }
function get() {
  if (!db) throw new Error('db not initialised — boot.js must call init() first');
  return db;
}
function memory() { throw new Error('memory() is test-only'); }

module.exports = { connect, get, memory, init, persist, reset, DB_PATH: ':browser:' };
