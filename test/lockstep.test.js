import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// LEAD/READ note: Stage-2 economic + fit logic is duplicated in app.js (runs in the browser)
// and functions/_shared/domain.js (canonical, server-side). They MUST stay identical or a
// prospect's in-browser routing will diverge from the server's. This test fails on drift.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appJs = readFileSync(join(root, 'app.js'), 'utf8');
const domainJs = readFileSync(join(root, 'functions/_shared/domain.js'), 'utf8');

// Extract a full function by brace-matching (handles nested braces); normalize whitespace.
function extractFn(src, name) {
  const m = src.search(new RegExp('function\\s+' + name + '\\s*\\('));
  assert.notEqual(m, -1, `function ${name} not found`);
  let i = src.indexOf('{', m), depth = 0, j = i;
  for (; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) { j += 1; break; } }
  }
  return src.slice(m, j).replace(/\s+/g, ' ').trim();
}

// Extract a `const NAME = <literal>;` initializer, normalized.
function extractConst(src, name) {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\s\\S]*?);\\s*\\n'));
  assert.ok(m, `const ${name} not found`);
  return m[1].replace(/\s+/g, ' ').trim();
}

test('economicScreen is identical in app.js and domain.js', () => {
  assert.equal(extractFn(appJs, 'economicScreen'), extractFn(domainJs, 'economicScreen'));
});

test('deriveSprintFit is identical in app.js and domain.js', () => {
  assert.equal(extractFn(appJs, 'deriveSprintFit'), extractFn(domainJs, 'deriveSprintFit'));
});

test('economic constants are identical in app.js and domain.js', () => {
  for (const name of ['ECONOMIC_FLOORS', 'REVENUE_BANDS', 'ADEQUATE_SPEND']) {
    assert.equal(extractConst(appJs, name), extractConst(domainJs, name), `${name} drifted`);
  }
});
