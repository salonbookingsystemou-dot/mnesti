/**
 * Unit tests — _extractJson
 * Verifies that the JSON extractor handles all the messy outputs Claude can produce:
 * code fences, typographic quotes, extra text before/after, partial wrapping, etc.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadUtils } = require('../helpers/extract');

const { _extractJson } = loadUtils('_extractJson');

describe('_extractJson — happy paths', () => {
  test('array JSON puro', () => {
    const result = _extractJson('[{"date":"2026-06-01","type":"studio"}]');
    assert.ok(Array.isArray(result));
    assert.equal(result[0].date, '2026-06-01');
  });

  test('oggetto JSON puro', () => {
    const result = _extractJson('{"key":"value"}');
    assert.equal(result.key, 'value');
  });

  test('array con code fence ```json', () => {
    const raw = '```json\n[{"date":"2026-06-01","type":"exam"}]\n```';
    const result = _extractJson(raw);
    assert.ok(Array.isArray(result));
    assert.equal(result[0].type, 'exam');
  });

  test('array con code fence ``` senza linguaggio', () => {
    const raw = '```\n[{"a":1}]\n```';
    assert.deepEqual(_extractJson(raw), [{ a: 1 }]);
  });

  test('array preceduto da testo introduttivo', () => {
    const raw = 'Ecco il piano:\n[{"date":"2026-06-01"}]';
    const result = _extractJson(raw);
    assert.ok(Array.isArray(result));
  });

  test('array seguito da testo conclusivo', () => {
    const raw = '[{"date":"2026-06-01"}]\nSpero che il piano ti sia utile.';
    assert.ok(Array.isArray(_extractJson(raw)));
  });

  test('virgolette tipografiche " " → ""', () => {
    const raw = '[\u007B\u201cdate\u201d:\u201c2026-06-01\u201d\u007D]';
    const result = _extractJson(raw);
    assert.equal(result[0].date, '2026-06-01');
  });

  test('virgolette tipografiche \u2018 \u2019 → apostrofi', () => {
    // Claude usa ' ' per valori stringa in alcuni edge case
    const raw = '[{"text":"L\u2019effetto cocktail party"}]';
    const result = _extractJson(raw);
    assert.equal(result[0].text, "L'effetto cocktail party");
  });
});

describe('_extractJson — partial recovery (streaming truncation)', () => {
  // Simulates what happens when max_tokens is hit mid-response.

  test('array troncato dopo ultimo },  → recupera oggetti completi', () => {
    const truncated = '```json\n[\n  {"date":"2026-06-01","type":"studio"},\n  {"date":"2026-06-02","type":"rest"},\n  {"date":"2026-06-03","type":"stu';
    const result = _extractJson(truncated);
    assert.ok(Array.isArray(result), 'deve restituire un array');
    assert.equal(result.length, 2, 'deve contenere 2 oggetti completi');
    assert.equal(result[0].date, '2026-06-01');
    assert.equal(result[1].type, 'rest');
  });

  test('array troncato subito dopo { → recupera almeno 1 oggetto', () => {
    const truncated = '[{"date":"2026-06-01","type":"exam","questions":[]},{"date":"2026-06-02","type":"stu';
    const result = _extractJson(truncated);
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 1);
    assert.equal(result[0].date, '2026-06-01');
  });

  test('array con code fence troncato → recupera oggetti', () => {
    const truncated = '```json\n[{"a":1},{"b":2},{"c":';
    const result = _extractJson(truncated);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
  });
});

describe('_extractJson — edge cases', () => {
  test('array multiriga con oggetti complessi', () => {
    const raw = JSON.stringify([
      { date: '2026-06-01', type: 'studio', questions: [{ text: 'Q1', type: 'definizione' }] },
      { date: '2026-06-02', type: 'rest',   questions: [] },
    ]);
    const result = _extractJson(raw);
    assert.equal(result.length, 2);
    assert.equal(result[0].questions[0].text, 'Q1');
  });

  test('stringa vuota → throw', () => {
    assert.throws(() => _extractJson(''), /JSON non valido/);
  });

  test('testo senza JSON → throw', () => {
    assert.throws(() => _extractJson('Non ho capito la richiesta.'), /JSON non valido/);
  });

  test('JSON rotto → throw', () => {
    assert.throws(() => _extractJson('[{unclosed'), /JSON non valido/);
  });

  test('array con whitespace attorno', () => {
    const result = _extractJson('   \n\n  [{"x":1}]  \n  ');
    assert.deepEqual(result, [{ x: 1 }]);
  });
});
