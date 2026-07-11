'use strict';
const strings = require('./strings');

const LANGS = ['en', 'hi', 'mr'];
const LANG_LABELS = { en: 'English', hi: 'हिंदी', mr: 'मराठी' };

function normLang(l) {
  return LANGS.includes(l) ? l : 'mr'; // Marathi default: primary audience
}

// t('save', 'mr') -> 'जतन करा'. Optional {placeholders} interpolation.
function t(key, lang, vars) {
  const entry = strings[key];
  let s = entry ? (entry[lang] || entry.en) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

// Pick the localised column from a row: locName(dish, 'name', 'mr') -> row.name_mr
function locName(row, base, lang) {
  return row[`${base}_${normLang(lang)}`] || row[`${base}_en`] || '';
}

// Language for a request: ?lang= wins (and is set as cookie by routes), else cookie, else Marathi.
function reqLang(req) {
  return normLang(req.query.lang || req.cookies.lang);
}

module.exports = { LANGS, LANG_LABELS, t, locName, reqLang, normLang };
