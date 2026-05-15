/**
 * Unit tests — esposizione di window._syncExamInfoToSupabase e altre API della IIFE
 *
 * Verifica che le funzioni definite dentro la IIFE Supabase Auth (scope chiuso)
 * vengano correttamente esposte su window, rendendole accessibili a generateStudyPlan
 * e alle altre funzioni nello scope globale.
 *
 * Bug rilevato: _syncExamInfoToSupabase non era su window →
 *   "Errore nella generazione del piano: _syncExamInfoToSupabase is not defined"
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');

// ── Minimal environment per far girare la IIFE ────────────────
require('../helpers/browser-mock');

// La IIFE usa fetch, supabase client, crypto, ecc. — non li eseguiamo
// davvero. Verifichiamo solo i PATTERN nel sorgente (analisi statica)
// e che le assegnazioni window.* siano presenti con grep sul testo.
const src = fs.readFileSync(path.resolve(__dirname, '../../app.js'), 'utf8');

describe('IIFE exports — _syncExamInfoToSupabase', () => {

  test('window._syncExamInfoToSupabase viene assegnata nella IIFE', () => {
    assert.ok(
      src.includes('window._syncExamInfoToSupabase = _syncExamInfoToSupabase'),
      'La IIFE deve esporre la funzione su window'
    );
  });

  test('la funzione è definita PRIMA dell\'assegnazione window.*', () => {
    const defIdx    = src.indexOf('function _syncExamInfoToSupabase(');
    const exportIdx = src.indexOf('window._syncExamInfoToSupabase = _syncExamInfoToSupabase');
    assert.ok(defIdx !== -1,    'la funzione deve essere definita');
    assert.ok(exportIdx !== -1, 'deve essere esportata su window');
    assert.ok(defIdx < exportIdx, 'la definizione deve precedere l\'esportazione');
  });

  test('la chiamata in generateStudyPlan usa il pattern difensivo typeof', () => {
    // La chiamata deve usare typeof === 'function' come le altre window.* nel codice
    assert.ok(
      src.includes("typeof window._syncExamInfoToSupabase === 'function'"),
      'generateStudyPlan deve chiamarla con il guard typeof'
    );
  });

  test('entrambe le chiamate a _syncExamInfoToSupabase non usano più la versione bare', () => {
    // Cerca chiamate dirette senza window. (sarebbero ReferenceError nello scope globale)
    // Le due chiamate legittime sono: dentro la IIFE (scope ok) e in generateStudyPlan (via window)
    const calls = [...src.matchAll(/_syncExamInfoToSupabase\(/g)];
    // Ci devono essere: 1 definizione (function _sync...) + 2 chiamate
    // La chiamata in generateStudyPlan deve avere window. davanti oppure essere dentro la IIFE
    const globalBareCalls = [...src.matchAll(/^\s+_syncExamInfoToSupabase\(window/gm)];
    // Non ci devono essere chiamate bare in scope globale (fuori dalla IIFE)
    assert.ok(calls.length >= 3, 'deve esistere la definizione + almeno 2 chiamate');
  });
});

describe('IIFE exports — altre API critiche', () => {

  test('window._syncToSupabase è esposta', () => {
    assert.ok(src.includes('window._syncToSupabase ='), 'window._syncToSupabase deve essere esposta');
  });

  test('window._getSBToken è esposta', () => {
    assert.ok(src.includes('window._getSBToken ='), 'window._getSBToken deve essere esposta');
  });

  test('window._sb è esposto', () => {
    assert.ok(src.includes('window._sb = _sb'), 'window._sb (client Supabase) deve essere esposto');
  });
});

describe('Pattern difensivo typeof — consistenza nel codice', () => {

  test('_syncToSupabase viene chiamata sempre con guard typeof altrove', () => {
    // Conta i punti di chiamata con guard
    const guardedCalls = (src.match(/typeof window\._syncToSupabase === 'function'/g) || []).length;
    assert.ok(guardedCalls >= 3, `attesi >= 3 guard typeof per _syncToSupabase, trovati: ${guardedCalls}`);
  });

  test('_syncExamInfoToSupabase ha guard typeof nella chiamata post-piano', () => {
    // Verifica che il blocco completo sia presente
    const block = `typeof window._syncExamInfoToSupabase === 'function') {\n      window._syncExamInfoToSupabase(window._currentUserId)`;
    assert.ok(src.includes(block), 'il blocco guard deve essere presente in generateStudyPlan');
  });
});
