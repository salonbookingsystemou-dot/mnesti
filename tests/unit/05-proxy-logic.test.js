/**
 * Unit tests — logica interna del claude-proxy (streaming detection, payload handling)
 * Simula il comportamento del proxy senza fare chiamate HTTP reali.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Replica esatta della logica di routing del proxy ─────────
function proxyStreamingDecision(payload, anthropicResponseHeaders) {
  const p = payload;
  const wantsStream     = p.stream === true;
  const getHeader       = (h) => (anthropicResponseHeaders[h.toLowerCase()] ?? '');
  const anthropicIsStream = getHeader('content-type').includes('text/event-stream');
  return { wantsStream, anthropicIsStream, useStream: wantsStream || anthropicIsStream };
}

function proxyRoute(payload, anthropicRes) {
  const { useStream } = proxyStreamingDecision(payload, anthropicRes.headers);

  if (useStream) {
    if (!anthropicRes.ok) return { out: 'error', code: 'ANTHROPIC_ERROR', status: 502 };
    return { out: 'stream' };
  }

  // Non-streaming: try JSON parse
  try {
    const data = JSON.parse(anthropicRes.body);
    return { out: 'json', data };
  } catch {
    return {
      out: 'error',
      error: `Errore Anthropic (${anthropicRes.status}) — risposta non valida`,
      status: 502,
    };
  }
}

const SSE_HEADERS  = { 'content-type': 'text/event-stream' };
const JSON_HEADERS = { 'content-type': 'application/json' };
const SSE_BODY     = 'data: {"type":"message_start"}\n\ndata: {"type":"message_stop"}\n\n';
const JSON_BODY    = JSON.stringify({ content: [{ text: 'ok' }], usage: {} });

describe('streaming detection — proxyStreamingDecision', () => {
  test('stream:true → wantsStream=true', () => {
    const r = proxyStreamingDecision({ stream: true }, SSE_HEADERS);
    assert.equal(r.wantsStream, true);
    assert.equal(r.useStream, true);
  });

  test('stream:false → wantsStream=false', () => {
    const r = proxyStreamingDecision({ stream: false }, JSON_HEADERS);
    assert.equal(r.wantsStream, false);
    assert.equal(r.useStream, false);
  });

  test('stream assente → wantsStream=false', () => {
    const r = proxyStreamingDecision({}, JSON_HEADERS);
    assert.equal(r.wantsStream, false);
  });

  test('stream:1 (non booleano) → wantsStream=false ma anthropicIsStream=true salva', () => {
    const r = proxyStreamingDecision({ stream: 1 }, SSE_HEADERS);
    assert.equal(r.wantsStream, false);      // flag non booleano
    assert.equal(r.anthropicIsStream, true); // Content-Type lo rileva
    assert.equal(r.useStream, true);         // fallback funziona
  });

  test('stream assente ma Anthropic risponde SSE → useStream=true (doppia garanzia)', () => {
    const r = proxyStreamingDecision({}, SSE_HEADERS);
    assert.equal(r.wantsStream, false);
    assert.equal(r.anthropicIsStream, true);
    assert.equal(r.useStream, true);
  });
});

describe('proxyRoute — routing corretto', () => {
  test('stream:true + SSE → out=stream', () => {
    const res = { ok: true, status: 200, headers: SSE_HEADERS, body: SSE_BODY };
    assert.equal(proxyRoute({ stream: true }, res).out, 'stream');
  });

  test('stream:true + errore Anthropic (401) → out=error', () => {
    const res = { ok: false, status: 401, headers: SSE_HEADERS, body: '{"error":"unauth"}' };
    const r = proxyRoute({ stream: true }, res);
    assert.equal(r.out, 'error');
    assert.equal(r.status, 502);
  });

  test('no stream + JSON valido → out=json', () => {
    const res = { ok: true, status: 200, headers: JSON_HEADERS, body: JSON_BODY };
    const r = proxyRoute({}, res);
    assert.equal(r.out, 'json');
    assert.ok(r.data.content);
  });

  test('BUG VECCHIO: no stream + SSE body → out=error "risposta non valida"', () => {
    // Questo era il bug originale: stream:true nel payload ma check falliva
    // Simulato qui come stream:false con body SSE
    const res = { ok: true, status: 200, headers: JSON_HEADERS, body: SSE_BODY };
    const r = proxyRoute({ stream: false }, res);
    assert.equal(r.out, 'error');
    assert.ok(r.error.includes('risposta non valida'));
  });

  test('FIX: stream:1 + SSE headers → ora gestito correttamente', () => {
    const res = { ok: true, status: 200, headers: SSE_HEADERS, body: SSE_BODY };
    const r = proxyRoute({ stream: 1 }, res);
    assert.equal(r.out, 'stream', 'il fix via Content-Type deve intercettare SSE');
  });
});
