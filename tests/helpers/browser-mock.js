/**
 * Minimal browser API mocks for running app.js functions in Node.
 * Import this BEFORE extracting any function that uses localStorage/window/document.
 */

// ── localStorage ──────────────────────────────────────────────
const _store = new Map();
global.localStorage = {
  getItem:    (k) => _store.get(k) ?? null,
  setItem:    (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear:      () => _store.clear(),
  get length() { return _store.size; },
};

// ── window ────────────────────────────────────────────────────
global.window = global;

// ── document (stub — returns null for all queries) ────────────
global.document = {
  getElementById: () => null,
  querySelector:  () => null,
};

// ── fetch (stub — tests that need real fetch import node-fetch) 
if (!global.fetch) {
  global.fetch = async () => { throw new Error('fetch not mocked — use tests/helpers/fetch-mock.js'); };
}

// ── alert / confirm ───────────────────────────────────────────
global.alert   = (msg) => { global._lastAlert   = msg; };
global.confirm = ()    => true;

/** Reset all mocks between tests. */
function resetMocks() {
  _store.clear();
  global._lastAlert = undefined;
}

module.exports = { resetMocks };
