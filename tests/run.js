#!/usr/bin/env node
/**
 * Mnesti test runner — entry point
 *
 * Esegui con:
 *   npm test              → tutti i test (unit + integration)
 *   npm run test:unit     → solo unit test (offline, veloci)
 *   npm run test:int      → solo integration test (richiede rete)
 *   TEST_USER_TOKEN=<jwt> npm test  → abilita test streaming autenticati
 *
 * Usa il test runner built-in di Node 18+ (node:test), zero dipendenze.
 */

const { run } = require('node:test');
const { tap }  = require('node:test/reporters');
const path     = require('node:path');
const { glob } = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');

const ROOT  = __dirname;
const SUITES = {
  unit:        path.join(ROOT, 'unit', '*.test.js'),
  integration: path.join(ROOT, 'integration', '*.test.js'),
};

const args   = process.argv.slice(2);
const filter = args[0]; // 'unit' | 'integration' | undefined (all)

(async () => {
  const patterns = filter
    ? [SUITES[filter]].filter(Boolean)
    : Object.values(SUITES);

  const files = [];
  for (const pattern of patterns) {
    for await (const f of glob(pattern)) files.push(f);
  }

  if (!files.length) {
    console.error('Nessun file di test trovato per pattern:', patterns);
    process.exit(1);
  }

  console.log(`\nMnesti Test Suite — ${files.length} file`);
  files.forEach(f => console.log('  » ' + path.relative(ROOT, f)));
  console.log('');

  const stream = run({ files, concurrency: true });
  await pipeline(stream, tap(), process.stdout);
})();
