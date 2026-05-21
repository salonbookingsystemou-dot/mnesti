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

describe('_shortLabel', () => {
  test('formato D/M', () => {
    assert.equal(_shortLabel(new Date(2026, 4, 5)), '5/5');
  });

  test('mese doppia cifra', () => {
    assert.equal(_shortLabel(new Date(2026, 11, 31)), '31/12');
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

describe('Arricchimento client-side: label/shortLabel/weekStart', () => {
  // Replica la logica di normalizedDays in generateStudyPlan dopo le ottimizzazioni
  function enrichDays(planDays) {
    let weekNum = 0;
    let lastWeekKey = '';
    return planDays.map((d) => {
      const dateObj = new Date(d.date + 'T00:00:00');
      const dow = dateObj.getDay() || 7;
      const mon = new Date(dateObj);
      mon.setDate(dateObj.getDate() - (dow - 1));
      const weekKey = _isoDate(mon);
      let weekStart = null;
      if (weekKey !== lastWeekKey) {
        lastWeekKey = weekKey;
        weekNum++;
        weekStart = `Settimana ${weekNum}`;
      }
      return {
        ...d,
        id:         'ai-' + d.date.replace(/-/g, ''),
        label:      _formatDateLabel(dateObj),
        shortLabel: _shortLabel(dateObj),
        weekStart,
        questions:  d.questions || [],
      };
    });
  }

  test('label e shortLabel vengono popolati correttamente', () => {
    const days = enrichDays([
      { date: '2026-05-21', type: 'studio', questions: [] },
      { date: '2026-05-22', type: 'studio', questions: [] },
    ]);
    // 21 maggio 2026 = giovedì
    assert.equal(days[0].label, 'Gio 21 mag');
    assert.equal(days[0].shortLabel, '21/5');
    assert.equal(days[1].label, 'Ven 22 mag');
    assert.equal(days[1].shortLabel, '22/5');
  });

  test('id generato correttamente dal campo date', () => {
    const days = enrichDays([{ date: '2026-06-10', type: 'exam', questions: [] }]);
    assert.equal(days[0].id, 'ai-20260610');
  });

  test('weekStart = "Settimana 1" sul primo giorno, null sugli stessi giorni', () => {
    // Lunedì 18 maggio + martedì 19 maggio: stessa settimana ISO
    const days = enrichDays([
      { date: '2026-05-18', type: 'studio', questions: [] }, // lunedì
      { date: '2026-05-19', type: 'studio', questions: [] }, // martedì
    ]);
    assert.equal(days[0].weekStart, 'Settimana 1');
    assert.equal(days[1].weekStart, null);
  });

  test('weekStart avanza a "Settimana 2" al cambio settimana ISO', () => {
    // Venerdì 22 maggio → domenica 24 maggio (fine sett ISO) → lunedì 25 maggio (nuova sett)
    const days = enrichDays([
      { date: '2026-05-22', type: 'studio',  questions: [] }, // venerdì, sett 1
      { date: '2026-05-23', type: 'rest',    questions: [] }, // sabato,  sett 1
      { date: '2026-05-25', type: 'studio',  questions: [] }, // lunedì,  sett 2
      { date: '2026-05-26', type: 'studio',  questions: [] }, // martedì, sett 2
    ]);
    assert.equal(days[0].weekStart, 'Settimana 1');
    assert.equal(days[1].weekStart, null);
    assert.equal(days[2].weekStart, 'Settimana 2');
    assert.equal(days[3].weekStart, null);
  });

  test('questions mancanti nell\'output AI → normalizzate ad array vuoto', () => {
    const days = enrichDays([
      { date: '2026-06-01', type: 'rest' }, // nessun campo questions
    ]);
    assert.deepEqual(days[0].questions, []);
  });
});
