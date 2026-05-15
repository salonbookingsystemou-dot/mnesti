/**
 * Unit tests — _buildWeightedSourceContext
 * Verifica il sistema di selezione e pesatura delle fonti usato da tutti i prompt AI.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadSourceContext } = require('../helpers/extract');

// ── Fixtures ──────────────────────────────────────────────────
const LONG = 'Capitolo 1 — Introduzione alla materia. Concetti fondamentali e autori chiave. '.repeat(8); // ~600 chars
const SPARSE = 'Titolo breve.'; // <100 chars

function makeSource(id, content, type = 'text') {
  return { id, title: 'Fonte ' + id, content, type, addedAt: Date.now() };
}

describe('_buildWeightedSourceContext — fonti vuote', () => {
  test('nessuna fonte → context vuoto', () => {
    const { _buildWeightedSourceContext } = loadSourceContext(() => []);
    const r = _buildWeightedSourceContext();
    assert.equal(r.context, '');
    assert.equal(r.hasPrimary, false);
  });

  test('fonti con contenuto troppo corto (<100 chars) → context vuoto', () => {
    const { _buildWeightedSourceContext } = loadSourceContext(() => [makeSource('a', SPARSE)]);
    const r = _buildWeightedSourceContext();
    assert.equal(r.context, '');
  });
});

describe('_buildWeightedSourceContext — fonti primarie', () => {
  test('una fonte primaria usabile → hasPrimary=true', () => {
    const { _buildWeightedSourceContext } = loadSourceContext(() => [makeSource('a', LONG)]);
    const r = _buildWeightedSourceContext();
    assert.equal(r.hasPrimary, true);
    assert.ok(r.context.includes('FONTE PRIMARIA'));
    assert.ok(r.context.includes('Capitolo 1'));
  });

  test('più fonti primarie → tutte incluse nel context', () => {
    const sources = [
      makeSource('syl', LONG, 'text'),
      makeSource('pdf', LONG + ' Dispense.', 'text'),
    ];
    const { _buildWeightedSourceContext } = loadSourceContext(() => sources);
    const r = _buildWeightedSourceContext();
    assert.equal(r.primaryCount, 2);
    assert.ok(r.context.includes('Fonte syl'));
    assert.ok(r.context.includes('Fonte pdf'));
  });

  test('primaryIsUsable=true quando totalPrimaryChars >= 3000', () => {
    const bigContent = LONG.repeat(5); // ~3000+ chars
    const { _buildWeightedSourceContext } = loadSourceContext(() => [makeSource('a', bigContent)]);
    const r = _buildWeightedSourceContext();
    assert.equal(r.primaryIsUsable, true);
  });

  test('primaryIsUsable=false quando totalPrimaryChars < 3000 (PDF sparso)', () => {
    const sparseButOver100 = 'x'.repeat(200); // 200 chars > 100 ma < 3000 totali
    const { _buildWeightedSourceContext } = loadSourceContext(() => [makeSource('a', sparseButOver100)]);
    const r = _buildWeightedSourceContext();
    assert.equal(r.primaryIsUsable, false);
  });
});

describe('_buildWeightedSourceContext — secondarie (textbook-ref)', () => {
  test('fonte secondaria inclusa quando non ci sono primarie', () => {
    const secondary = makeSource('tb', LONG, 'textbook-ref');
    const { _buildWeightedSourceContext } = loadSourceContext(() => [secondary]);
    const r = _buildWeightedSourceContext();
    assert.ok(r.context.includes('FONTE SECONDARIA'));
    assert.equal(r.hasPrimary, false);
    assert.equal(r.hasSecondary, true);
  });

  test('primaryOnly=true + primarie usabili → secondarie escluse', () => {
    const bigContent = LONG.repeat(5);
    const sources = [
      makeSource('pdf', bigContent, 'text'),
      makeSource('tb',  LONG, 'textbook-ref'),
    ];
    const { _buildWeightedSourceContext } = loadSourceContext(() => sources);
    const r = _buildWeightedSourceContext({ primaryOnly: true });
    assert.ok(!r.context.includes('FONTE SECONDARIA'), 'secondaria non deve apparire');
    assert.ok(r.context.includes('FONTE PRIMARIA'));
  });

  test('primaryOnly=true + primarie NON usabili → secondarie incluse come fallback', () => {
    const sources = [
      makeSource('pdf', 'x'.repeat(200), 'text'),   // primaria ma sparse
      makeSource('tb',  LONG, 'textbook-ref'),        // secondaria
    ];
    const { _buildWeightedSourceContext } = loadSourceContext(() => sources);
    const r = _buildWeightedSourceContext({ primaryOnly: true });
    assert.ok(r.context.includes('FONTE SECONDARIA'), 'secondaria deve apparire come fallback');
  });
});

describe('_buildWeightedSourceContext — limiti caratteri', () => {
  test('rispetta primaryMax troncando il contenuto', () => {
    const huge = 'A'.repeat(20000);
    const { _buildWeightedSourceContext } = loadSourceContext(() => [makeSource('a', huge)]);
    const r = _buildWeightedSourceContext({ primaryMax: 500, totalMax: 50000 });
    // Il context non deve superare primaryMax + header chars
    assert.ok(r.context.length < 600);
  });

  test('non aggiunge ulteriori fonti dopo aver raggiunto totalMax', () => {
    // totalMax = 200 → solo la prima fonte (fino a primaryMax) viene inclusa;
    // le fonti successive vengono saltate (guard "if totalChars >= totalMax → break").
    // Il context può superare totalMax perché il check avviene PRIMA di aggiungere,
    // quindi esattamente 1 fonte può eccedere il limite.
    const sources = Array.from({ length: 5 }, (_, i) => makeSource('s' + i, LONG));
    const { _buildWeightedSourceContext } = loadSourceContext(() => sources);
    const r = _buildWeightedSourceContext({ primaryMax: 200, totalMax: 200 });
    // Con primaryMax=200 ogni fonte viene troncata a 200 chars.
    // Solo la fonte 0 viene aggiunta (total=0 < 200 → aggiunta, total→200).
    // Fonte 1: total >= 200 → skip. Quindi il context contiene solo s0.
    assert.ok(!r.context.includes('Fonte s1'), 'fonte s1 non deve essere inclusa');
    assert.ok(r.context.includes('Fonte s0'),  'fonte s0 deve essere inclusa');
  });
});
