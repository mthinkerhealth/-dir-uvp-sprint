import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Deployment guard (brief 5.1): /app.js is served with a long edge cache, so index.html busts
// it with ?v=<hash>. This test fails if app.js changed without updating that hash — i.e. it
// catches the "fixed app.js but forgot to bump the cache version" trap, and prints the value to set.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = createHash('sha1').update(readFileSync(join(root, 'app.js'))).digest('hex').slice(0, 8);
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('index.html app.js ?v= matches current app.js content hash', () => {
  const m = html.match(/app\.js\?v=([a-z0-9]+)/i);
  assert.ok(m, 'app.js?v= reference not found in index.html');
  assert.equal(m[1], hash, `app.js changed — update index.html to: app.js?v=${hash}`);
});
