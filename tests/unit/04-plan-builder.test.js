/**
 * Unit tests — logica di costruzione del piano di studio
 * Testa date helper, skeleton date e regole post-processing sul piano generato.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadUtils } = require('../helpers/extract');

const { _isoDate, _dateRange, _formatDateLabel, _shortLabel, _fillPlanGaps } = loadUtils(
  '_isoDate', '_dateRange', '_formatDateLabel', '_shortLabel', '_fillPlanGaps'
);

function skeletonRange(startIso, endIso) {
  const range = _dateRange(new Date(startIso + 'T00:00:00'), new Date(endIso + 'T00:00:00'));
  return range.map(_isoDate);
}

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

describe('_fillPlanGaps — safety net contro la troncatura AI', () => {
  test('AI tronca a metà: riempie le date mancanti fino all\'esame (no buco)', () => {
    // Esame il 21/07, piano creato il 07/06 → 45 date attese.
    // L'AI restituisce solo le prime 2 settimane (07→19 giu): il resto va riempito.
    const skeleton = skeletonRange('2026-06-07', '2026-07-21');
    const aiDays = skeletonRange('2026-06-07', '2026-06-19').map(d => ({
      date: d, type: 'studio', title: 'Lezione', questions: [{ text: 'Q' }]
    }));

    const filled = _fillPlanGaps(aiDays, skeleton, '2026-07-21');

    // Copre TUTTE le date, in ordine, senza salti.
    assert.equal(filled.length, skeleton.length);
    assert.equal(filled[0].date, '2026-06-07');
    assert.equal(filled[filled.length - 1].date, '2026-07-21');
    filled.forEach((d, i) => assert.equal(d.date, skeleton[i]));

    // Le date originali dell'AI sono conservate (non sovrascritte).
    assert.equal(filled[0].title, 'Lezione');
    // Le date mancanti diventano segnaposto di studio.
    const giu25 = filled.find(d => d.date === '2026-06-25');
    assert.equal(giu25.type, 'studio');
    assert.deepEqual(giu25.questions, []);
  });

  test('la data esame mancante viene aggiunta come type=exam', () => {
    const skeleton = skeletonRange('2026-06-07', '2026-06-10');
    const aiDays = [{ date: '2026-06-07', type: 'studio', questions: [] }];
    const filled = _fillPlanGaps(aiDays, skeleton, '2026-06-10');
    const exam = filled.find(d => d.date === '2026-06-10');
    assert.equal(exam.type, 'exam');
  });

  test('scarta le date fuori intervallo restituite dall\'AI', () => {
    const skeleton = skeletonRange('2026-06-07', '2026-06-09');
    const aiDays = [
      { date: '2026-06-07', type: 'studio', questions: [] },
      { date: '2026-08-01', type: 'studio', questions: [] }, // fuori intervallo
    ];
    const filled = _fillPlanGaps(aiDays, skeleton, '2026-06-09');
    assert.equal(filled.length, 3);
    assert.ok(!filled.some(d => d.date === '2026-08-01'));
  });

  test('piano completo → invariato (idempotente sulle date presenti)', () => {
    const skeleton = skeletonRange('2026-06-07', '2026-06-09');
    const aiDays = skeleton.map(d => ({ date: d, type: 'studio', questions: [] }));
    const filled = _fillPlanGaps(aiDays, skeleton, '2026-06-09');
    assert.equal(filled.length, 3);
    filled.forEach((d, i) => assert.equal(d.date, skeleton[i]));
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
