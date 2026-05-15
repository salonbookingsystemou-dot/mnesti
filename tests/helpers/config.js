/**
 * Shared config for all test suites.
 */
module.exports = {
  SB_URL:    'https://olagntawajefdjrkkvcc.supabase.co',
  PROXY_URL: 'https://olagntawajefdjrkkvcc.supabase.co/functions/v1/claude-proxy',

  // Exam date always in the future relative to when tests run
  EXAM_DATE: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })(),

  // Enough text to be >100 chars and trigger the "usable source" path
  LONG_CONTENT: 'Capitolo 1 — Introduzione. '.repeat(10),
  // Too short to be usable
  SHORT_CONTENT: 'Kandel cap 4',
};
