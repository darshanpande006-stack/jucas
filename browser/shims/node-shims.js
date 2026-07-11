'use strict';
// Browser stand-ins for the handful of node:* builtins the app touches.
// Only what Jucas actually uses is implemented.

// node:crypto — util.token() needs randomBytes(n).toString('base64url')
const crypto_ = {
  randomBytes(n) {
    const buf = new Uint8Array(n);
    globalThis.crypto.getRandomValues(buf);
    return {
      toString(enc) {
        let bin = '';
        for (const b of buf) bin += String.fromCharCode(b);
        const b64 = btoa(bin);
        return enc === 'base64url'
          ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          : b64;
      },
    };
  },
};

// node:querystring — must keep repeated keys as arrays (routes rely on it)
const querystring_ = {
  parse(str) {
    const out = {};
    for (const [k, v] of new URLSearchParams(str)) {
      if (k in out) {
        if (Array.isArray(out[k])) out[k].push(v);
        else out[k] = [out[k], v];
      } else out[k] = v;
    }
    return out;
  },
};

// node:path / node:fs — only reached by router.serveStatic, which the
// browser boot never registers. Safe inert stubs.
const path_ = {
  join(...parts) { return parts.join('/').replace(/\/+/g, '/'); },
  extname(p) { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i); },
  normalize(p) { return p; },
  dirname(p) { return p.split('/').slice(0, -1).join('/') || '/'; },
};
const fs_ = {
  existsSync() { return false; },
  statSync() { return { isFile: () => false }; },
  mkdirSync() {},
  readFileSync() { throw new Error('fs not available in browser'); },
  createReadStream() { throw new Error('fs not available in browser'); },
};

module.exports = { crypto_, querystring_, path_, fs_ };
