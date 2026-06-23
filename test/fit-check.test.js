import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, validEmail, validWebsite } from '../functions/api/fit-check.js';

test('validEmail', () => {
  for (const ok of ['a@b.com', 'tom+x@mediathink.com', 'a.b-c@sub.example.co.uk']) assert.equal(validEmail(ok), true, ok);
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'x@y.', 123, null, 'a@'.padEnd(260, 'z') + '.com']) assert.equal(validEmail(bad), false, String(bad));
});

test('validWebsite', () => {
  for (const ok of ['', undefined, null, 'https://example.com', 'http://x.io/path?q=1']) assert.equal(validWebsite(ok), true, String(ok));
  for (const bad of ['javascript:alert(1)', 'ftp://x.com', 'file:///etc/passwd', 'not a url', 123]) assert.equal(validWebsite(bad), false, String(bad));
});

test('validatePayload accepts a real clarity-check email submission', () => {
  assert.equal(validatePayload({
    email: 'lead@company.com', source: 'clarity-check', next_step_choice: 'email',
    company_website: 'https://company.com', company_type: 'B2B SaaS', result_band: 'fragmented',
    sprint_fit_band: 'strong_fit', revenue_band: '$10M–$15M', spend_band: '$2M–$5M'
  }), null);
});

test('validatePayload accepts a call submission', () => {
  assert.equal(validatePayload({ email: 'a@b.com', next_step_choice: 'call', company_website: 'https://b.com' }), null);
});

test('validatePayload accepts the legacy website form (partner_intro, empty email, array field)', () => {
  assert.equal(validatePayload({
    next_step_choice: 'partner_intro', email: '', company_website: '',
    core_inputs_available: ['Current homepage', 'Three best-fit customer examples'], stream_name: 'channel_partner'
  }), null);
});

test('validatePayload rejects bad inputs', () => {
  assert.equal(validatePayload(null), 'not_object');
  assert.equal(validatePayload([1, 2]), 'not_object');
  assert.equal(validatePayload({ email: 'not-an-email', next_step_choice: 'email' }), 'bad_email');
  assert.equal(validatePayload({ next_step_choice: 'sms' }), 'bad_next_step');
  assert.equal(validatePayload({ company_website: 'javascript:alert(1)' }), 'bad_website');
  assert.equal(validatePayload({ notes: 'x'.repeat(5001) }), 'field_too_long:notes');
  assert.equal(validatePayload({ meta: { nested: true } }), 'nested_object:meta');
  assert.equal(validatePayload({ tags: Array(31).fill('a') }), 'array_too_long:tags');
  assert.equal(validatePayload({ tags: [1, 2, 3] }), 'bad_array:tags');
});
