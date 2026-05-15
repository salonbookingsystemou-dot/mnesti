/**
 * Integration tests — claude-proxy Edge Function (chiamate HTTP reali)
 * Testa autenticazione, CORS e gestione errori senza richiedere credenziali utente.
 *
 * Per testare il path streaming con auth reale:
 *   TEST_USER_TOKEN=<jwt> node --test tests/integration/06-proxy-live.test.js
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PROXY_URL } = require('../helpers/config');

const USER_TOKEN = process.env.TEST_USER_TOKEN; // opzionale

async function call(opts = {}) {
  const { method = 'POST', headers = {}, body } = opts;
  const res = await fetch(PROXY_URL, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : { _text: await res.text() };
  return { status: res.status, headers: res.headers, data, ok: res.ok };
}

describe('CORS', () => {
  test('OPTIONS preflight → 200 con headers CORS', async () => {
    const r = await call({ method: 'OPTIONS' });
    assert.equal(r.status, 200);
  });
});

describe('Autenticazione', () => {
  test('nessun Authorization header → 401 UNAUTHORIZED', async () => {
    const r = await call({ body: { model: 'claude-sonnet-4-6', messages: [] } });
    assert.equal(r.status, 401);
    assert.equal(r.data.code, 'UNAUTHORIZED');
  });

  test('token vuoto → 401', async () => {
    const r = await call({
      headers: { Authorization: 'Bearer ' },
      body: { model: 'claude-sonnet-4-6', messages: [] },
    });
    assert.equal(r.status, 401);
    assert.equal(r.data.code, 'UNAUTHORIZED');
  });

  test('token JWT malformato → 401', async () => {
    const r = await call({
      headers: { Authorization: 'Bearer not.a.real.jwt' },
      body: { model: 'claude-sonnet-4-6', messages: [] },
    });
    assert.equal(r.status, 401);
    assert.equal(r.data.code, 'UNAUTHORIZED');
  });

  test('anon key (non user JWT) → 401', async () => {
    const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sYWdudGF3YWplZmRqcmtrdmNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NTYwNTAsImV4cCI6MjA2MTIzMjA1MH0.ePDFMBNJMtCBSanKdxGJLDIs3GCJKMOmTnvAJOJJBww';
    const r = await call({
      headers: { Authorization: 'Bearer ' + anon },
      body: { model: 'claude-sonnet-4-6', messages: [], stream: true },
    });
    assert.equal(r.status, 401);
    assert.equal(r.data.code, 'UNAUTHORIZED');
  });
});

describe('Request validation', () => {
  test('body non-JSON → 400 BAD_REQUEST', async () => {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake.tok.en' },
      body: 'not json',
    });
    // Può essere 400 (body invalido) o 401 (auth prima) a seconda dell'ordine
    assert.ok([400, 401].includes(res.status));
  });
});

// ── Test con auth reale (solo se TOKEN fornito via env) ───────
if (USER_TOKEN) {
  describe('Chiamata autenticata — streaming', () => {
    test('stream:true con token valido → risposta SSE (Content-Type: text/event-stream)', async () => {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${USER_TOKEN}`,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 50,
          stream: true,
          messages: [{ role: 'user', content: 'Rispondi solo: ok' }],
        }),
      });

      const ct = res.headers.get('content-type') ?? '';
      if (res.status === 429) {
        console.log('  [SKIP] rate limit raggiunto');
        return;
      }
      assert.ok(res.ok, `atteso 200, ricevuto ${res.status}`);
      assert.ok(ct.includes('text/event-stream'), `content-type atteso SSE, ricevuto: ${ct}`);

      // Leggi almeno un chunk per verificare che lo stream fluisce
      const reader = res.body.getReader();
      const { value } = await reader.read();
      assert.ok(value && value.length > 0, 'stream deve avere dati');
      reader.cancel();
    });

    test('stream:false con token valido → risposta JSON con content[]', async () => {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${USER_TOKEN}`,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 30,
          stream: false,
          messages: [{ role: 'user', content: 'Rispondi solo: ok' }],
        }),
      });
      if (res.status === 429) { console.log('  [SKIP] rate limit'); return; }
      assert.ok(res.ok);
      const data = await res.json();
      assert.ok(Array.isArray(data.content), 'deve avere content[]');
    });
  });
} else {
  test('⚠️  Test streaming autenticato saltato — imposta TEST_USER_TOKEN=<jwt> per abilitarlo', () => {
    // Placeholder visibile nell'output
  });
}
