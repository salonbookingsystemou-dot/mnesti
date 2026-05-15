/**
 * Unit tests — logica di costruzione del piano di studio
 * Testa date helper, skeleton date e regole post-processing sul piano generato.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadUtils } = require('../helpers/extract');

const { _isoDate, _dateRange, _formatDateLabel, _shortLabel } = loadUtils(
  '_isoDate', '_dateRange', '_formatDateLabel', '_shortLabel'
);

describe('_isoDate', () => {
  // _isoDate now uses local-time getters (getFullYear/getMonth/getDate)
  // so new Date(y, m, d) works correctly regardless of timezone.
  test('formato YYYY-MM-DD', () => {
    assert.equal(_isoDate(new Date(2026, 4, 15)), '2026-05-15'); // mese 0-indexed
  });

  test('padding mese e giorno', () => {
    assert.equal(_isoDate(new Date(2026, 0, 5)), '2026-01-05');
  });

  test('mezzanotte in UTC+2 → data locale corretta (no off-by-one)', () => {
    // new Date(2026, 4, 15) = 2026-05-15T00:00:00 ora locale
    // Con .toISOString() darebbe "2026-05-14" in UTC+2 — il bug che stiamo correggendo
    const midnight = new Date(2026, 4, 15);
    midnight.setHours(0, 0, 0, 0);
    assert.equal(_isoDate(midnight), '2026-05-15');
  });
});

describe('_formatDateLabel', () => {
  test('formato "Gio 15 mag"', () => {
    // 15 maggio 2026 è un venerdì
    assert.equal(_formatDateLabel(new Date(2026, 4, 15)), 'Ven 15 mag');
  });

  test('domenica', () => {
    assert.ok(_formatDateLabel(new Date(2026, 4, 17)).startsWith('Dom'));
  });
});

describe('_dateRange', () => {
  // _isoDate now uses local getters — standard new Date(y, m, d) works fine.
  test('include sia start che end', () => {
    const start = new Date(2026, 4, 15);
    const end   = new Date(2026, 4, 17);
    const range = _dateRange(start, end);
    assert.equal(range.length, 3);
    assert.equal(_isoDate(range[0]), '2026-05-15');
    assert.equal(_isoDate(range[2]), '2026-05-17');
  });

  test('stesso giorno → 1 elemento', () => {
    const d = new Date(2026, 5, 10);
    assert.equal(_dateRange(d, d).length, 1);
  });

  test('30 giorni → 31 elementi', () => {
    const start = new Date(2026, 4, 1);
    const end   = new Date(2026, 4, 31);
    assert.equal(_dateRange(start, end).length, 31);
  });
});

describe('Regole hard-validation del piano (post-processing)', () => {
  // Replica la logica di hard-validate da generateStudyPlan
  function hardValidate(planDays, examIso) {
    const days = planDays.map(d => ({ ...d }));

    const examInPlan = days.find(d => d.date === examIso);
    if (examInPlan) {
      examInPlan.type = 'exam';
      examInPlan.questions = [];
      days.forEach(d => { if (d.date !== examIso && d.type === 'exam') d.type = 'rest'; });
    }

    const examIdx = days.findIndex(d => d.date === examIso);
    if (examIdx > 0) {
      const dayBefore = days[examIdx - 1];
      if (dayBefore.type !== 'rest') { dayBefore.type = 'rest'; dayBefore.questions = []; }
    }
    return days;
  }

  test('forza type=exam sulla data esame esatta', () => {
    const plan = [
      { date: '2026-06-08', type: 'studio', questions: [{ text: 'Q1' }] },
      { date: '2026-06-09', type: 'studio', questions: [] },
      { date: '2026-06-10', type: 'studio', questions: [] }, // AI ha sbagliato
    ];
    const result = hardValidate(plan, '2026-06-10');
    assert.equal(result[2].type, 'exam');
    assert.equal(result[2].questions.length, 0);
  });

  test('forza type=rest sul giorno prima dell\'esame', () => {
    const plan = [
      { date: '2026-06-08', type: 'studio', questions: [] },
      { date: '2026-06-09', type: 'revisione', questions: [{ text: 'Q' }] },
      { date: '2026-06-10', type: 'exam', questions: [] },
    ];
    const result = hardValidate(plan, '2026-06-10');
    assert.equal(result[1].type, 'rest');
    assert.equal(result[1].questions.length, 0);
  });

  test('rimuove esami spurî su altre date', () => {
    const plan = [
      { date: '2026-06-08', type: 'exam',   questions: [] }, // AI ha sbagliato la data
      { date: '2026-06-09', type: 'rest',   questions: [] },
      { date: '2026-06-10', type: 'exam',   questions: [] }, // quella giusta
    ];
    const result = hardValidate(plan, '2026-06-10');
    assert.equal(result[0].type, 'rest'); // demoted
    assert.equal(result[2].type, 'exam'); // preserved
  });

  test('giorno prima già rest → non modificato', () => {
    const plan = [
      { date: '2026-06-09', type: 'rest', questions: [] },
      { date: '2026-06-10', type: 'exam', questions: [] },
    ];
    const result = hardValidate(plan, '2026-06-10');
    assert.equal(result[0].type, 'rest');
  });
});
