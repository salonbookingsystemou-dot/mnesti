/**
 * Unit tests — generateStudyPlan pre-flight validation
 * Tests the field-level gate that prevents calling the API with missing data.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── replicate validation logic from generateStudyPlan ─────────
function preflight(info, sources) {
  const missing = [];
  if (!(info.subject || '').trim()) missing.push('Titolo materia');
  if (!info.date)                   missing.push('Data esame');
  return missing; // empty = OK to proceed
}

// ── replicate updateGenPlanBtn condition ──────────────────────
function canGeneratePlan(info) {
  return !!(info.subject || '').trim() && !!info.date;
}

// ── replicate exam date validation ────────────────────────────
function isExamDateValid(dateStr) {
  if (!dateStr) return false;
  const exam  = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((exam - today) / 86400000);
  return diff >= 3;
}

describe('Pre-flight validation (generateStudyPlan)', () => {

  test('blocca quando materia è vuota', () => {
    const m = preflight({ subject: '', date: '2026-07-01' }, []);
    assert.ok(m.includes('Titolo materia'));
    assert.equal(m.length, 1);
  });

  test('blocca quando materia è solo spazi', () => {
    const m = preflight({ subject: '   ', date: '2026-07-01' }, []);
    assert.ok(m.includes('Titolo materia'));
  });

  test('blocca quando data è assente', () => {
    const m = preflight({ subject: 'Psicologia', date: '' }, []);
    assert.ok(m.includes('Data esame'));
    assert.equal(m.length, 1);
  });

  test('elenca entrambi i campi mancanti', () => {
    const m = preflight({ subject: '', date: '' }, []);
    assert.equal(m.length, 2);
    assert.ok(m.includes('Titolo materia'));
    assert.ok(m.includes('Data esame'));
  });

  test('passa con materia e data valide', () => {
    const m = preflight({ subject: 'Psicologia Cognitiva', date: '2026-07-01' }, []);
    assert.equal(m.length, 0);
  });

  test('passa anche senza fonti (fonti sono opzionali)', () => {
    const m = preflight({ subject: 'Diritto Privato', date: '2026-07-01' }, []);
    assert.equal(m.length, 0);
  });
});

describe('updateGenPlanBtn condition', () => {
  test('disabled quando subject assente', () => {
    assert.equal(canGeneratePlan({ subject: '', date: '2026-07-01' }), false);
  });

  test('disabled quando date assente', () => {
    assert.equal(canGeneratePlan({ subject: 'Fisica', date: '' }), false);
  });

  test('enabled con subject + date', () => {
    assert.equal(canGeneratePlan({ subject: 'Fisica', date: '2026-07-01' }), true);
  });

  test('enabled indipendentemente dalla presenza di fonti', () => {
    assert.equal(canGeneratePlan({ subject: 'Chimica', date: '2026-08-15' }), true);
  });
});

describe('Validazione data esame', () => {
  test('data passata → non valida', () => {
    assert.equal(isExamDateValid('2020-01-01'), false);
  });

  test('domani → non valida (< 3 giorni)', () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    assert.equal(isExamDateValid(d.toISOString().slice(0, 10)), false);
  });

  test('tra 3 giorni → valida', () => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    assert.equal(isExamDateValid(d.toISOString().slice(0, 10)), true);
  });

  test('tra 30 giorni → valida', () => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    assert.equal(isExamDateValid(d.toISOString().slice(0, 10)), true);
  });

  test('stringa vuota → non valida', () => {
    assert.equal(isExamDateValid(''), false);
  });
});
