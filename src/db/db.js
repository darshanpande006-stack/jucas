'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.JUCAS_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_PATH = process.env.JUCAS_DB || path.join(DATA_DIR, 'jucas.db');

let db;

function connect(dbPath = DB_PATH) {
  if (db) return db;
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}

// For tests: fresh isolated in-memory DB with schema applied.
function memory() {
  const m = new DatabaseSync(':memory:');
  m.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return m;
}

function get() {
  if (!db) connect();
  return db;
}

module.exports = { connect, get, memory, DB_PATH };
