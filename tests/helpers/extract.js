/**
 * Extracts named functions from app.js and returns them as a JS object.
 *
 * Usage:
 *   const { _extractJson, _isoDate } = require('./extract');
 */

const fs   = require('fs');
const path = require('path');

const APP_JS = path.resolve(__dirname, '../../app.js');
const src    = fs.readFileSync(APP_JS, 'utf8');

/**
 * Extract a single top-level function definition from app.js by name.
 * Handles:
 * - Regular functions: function foo(...) { ... }
 * - Async functions:   async function foo(...) { ... }
 * - Destructured params: function foo({ a = 1, b } = {}) { ... }
 */
function extractFnText(name) {
  const startRe = new RegExp(`(?:^|\\n)((?:async )?function ${name}\\s*\\()`);
  const match   = startRe.exec(src);
  if (!match) throw new Error(`Function "${name}" not found in app.js`);

  let i = match.index;

  // ── Step 1: skip past the parameter list (find matching ')') ─
  // This correctly handles destructured params like ({ a = 1, b } = {})
  while (i < src.length && src[i] !== '(') i++;
  let parenDepth = 0;
  while (i < src.length) {
    if (src[i] === '(') parenDepth++;
    if (src[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }

  // ── Step 2: find the opening '{' of the function body ────────
  while (i < src.length && src[i] !== '{') i++;
  const bodyStart = i;

  // ── Step 3: count braces until the body closes ───────────────
  // Must skip string literals and regex literals to avoid counting
  // } inside strings (e.g. s.lastIndexOf('}') would fool a naive counter).
  let depth      = 0;
  let inStr      = false;
  let strChar    = '';

  while (i < src.length) {
    const ch   = src[i];
    const prev = i > 0 ? src[i - 1] : '';

    if (inStr) {
      // Escaped character — skip next char
      if (ch === '\\') { i += 2; continue; }
      // End of string
      if (ch === strChar) inStr = false;
      i++;
      continue;
    }

    // Start of string literal
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = true; strChar = ch; i++; continue;
    }

    // Skip single-line comments
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    // Skip block comments
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2; continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }

  return src.slice(match.index, i).trim();
}

/**
 * Compile and return a set of pure utility functions from app.js.
 * These functions must not depend on DOM or external state — only on their
 * arguments and possibly each other (all are included in the same scope).
 */
function loadUtils(...names) {
  const combined = names.map(extractFnText).join('\n\n');
  const exports  = names.map(n => n + ',').join(' ');
  // Build an IIFE that defines all functions in one scope and exports them
  const code = `(function() {\n${combined}\nreturn { ${exports} };\n})`;
  // new Function('return ' + code) → anon fn whose body returns the IIFE
  // ()  → calls the anon fn → gets the IIFE (a function, not yet called)
  // ()  → calls the IIFE → returns the { name: fn, ... } object
  return new Function('return ' + code)()();
}

/**
 * Load _buildWeightedSourceContext with getSources injected.
 * Avoids pulling in the entire localStorage/DOM dependency chain.
 */
function loadSourceContext(getSources) {
  const text    = extractFnText('_buildWeightedSourceContext');
  // Replace every getSources() call with the injected version
  const patched = text.replace(/\bgetSources\(\)/g, '__getSources()');
  // Build a factory function that takes __getSources and returns the function
  const code = `(function(__getSources) {\n${patched}\nreturn _buildWeightedSourceContext;\n})`;
  // ()  → calls the anon wrapper → gets the factory
  // (getSources) → calls the factory with the injected getSources
  const factory = new Function('return ' + code)();
  const fn      = factory(getSources);
  return { _buildWeightedSourceContext: fn };
}

module.exports = { loadUtils, loadSourceContext, extractFnText };
