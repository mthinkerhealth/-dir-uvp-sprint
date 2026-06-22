import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePublicUrl, isPrivateIPv4, hasPdfSignature, extractVisibleText
} from '../functions/api/uvp-clarity-check.js';

test('validatePublicUrl rejects unsafe URLs (SSRF matrix)', () => {
  const reject = [
    'http://example.com',                 // not https
    'https://user:pass@example.com',      // userinfo
    'https://example.com:8080',           // explicit port
    'https://localhost',
    'https://intranet',                   // no dot
    'https://127.0.0.1',
    'https://169.254.169.254',            // cloud metadata
    'https://10.0.0.5',
    'https://192.168.1.1',
    'https://foo.internal',
    'https://foo.local',
    'https://[::1]',                      // IPv6 loopback
    'https://0177.0.0.1',                 // octal-encoded IP
    'https://0x7f.0.0.1'                  // hex-encoded IP
  ];
  for (const u of reject) assert.throws(() => validatePublicUrl(u), new RegExp('.'), `should reject ${u}`);
});

test('validatePublicUrl accepts normal public https URLs', () => {
  for (const u of ['https://example.com', 'https://www.example.com/', 'https://sub.example.co.uk/path?q=1']) {
    assert.doesNotThrow(() => validatePublicUrl(u), `should accept ${u}`);
  }
});

test('isPrivateIPv4', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '100.64.0.1', '224.0.0.1', '0.0.0.0', '999.1.1.1', 'garbage']) {
    assert.equal(isPrivateIPv4(ip), true, `${ip} should be private/unsafe`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '93.184.216.34']) {
    assert.equal(isPrivateIPv4(ip), false, `${ip} should be public`);
  }
});

test('hasPdfSignature', async () => {
  const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])]); // %PDF-1.7
  const notPdf = new Blob([new TextEncoder().encode('hello, not a pdf at all')]);
  assert.equal(await hasPdfSignature(pdf), true);
  assert.equal(await hasPdfSignature(notPdf), false);
});

test('extractVisibleText strips scripts/styles and decodes entities', () => {
  const html = '<html><head><title>Acme &amp; Co</title></head><body><script>evil()</script><style>.x{}</style><p>We help teams ship faster &amp; cheaper.</p></body></html>';
  const { title, text } = extractVisibleText(html);
  assert.equal(title, 'Acme & Co');
  assert.ok(text.includes('We help teams ship faster & cheaper.'));
  assert.ok(!text.includes('evil()'));
});

test('extractVisibleText falls back to og: tags', () => {
  const html = '<html><head><meta property="og:title" content="OG Title"><meta property="og:description" content="OG description text"></head><body></body></html>';
  const { title, description } = extractVisibleText(html);
  assert.equal(title, 'OG Title');
  assert.equal(description, 'OG description text');
});

test('extractVisibleText survives >1MB input and caps text at 45k', () => {
  const big = '<p>Lorem ipsum dolor sit amet. </p>'.repeat(60000); // ~2MB
  const { text } = extractVisibleText('<html><body>' + big + '</body></html>');
  assert.ok(text.length > 0);
  assert.ok(text.length <= 45000, `text length ${text.length} should be capped`);
});
