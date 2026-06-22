import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSIONS, deriveOverallBand, economicScreen, deriveSprintFit, registrableDomain
} from '../functions/_shared/domain.js';

// helper: build a dimensions array from 6 levels in DIMENSIONS order
const dims = (levels) => DIMENSIONS.map((name, i) => ({ name, level: levels[i], explanation: 'x', evidence: [] }));
const ALL = (lvl) => dims([lvl, lvl, lvl, lvl, lvl, lvl]);

test('deriveOverallBand: no usable sources → not_enough_evidence', () => {
  assert.equal(deriveOverallBand({ dimensions: ALL('clear') }, 0), 'not_enough_evidence');
});

test('deriveOverallBand: status insufficient → not_enough_evidence', () => {
  assert.equal(deriveOverallBand({ status: 'insufficient_evidence', dimensions: ALL('clear') }, 3), 'not_enough_evidence');
});

test('deriveOverallBand: fewer than 3 rated dimensions → not_enough_evidence', () => {
  const d = dims(['clear', 'clear', 'bogus', 'bogus', 'bogus', 'bogus']);
  assert.equal(deriveOverallBand({ dimensions: d }, 3), 'not_enough_evidence');
});

test('deriveOverallBand: all clear → clear', () => {
  assert.equal(deriveOverallBand({ dimensions: ALL('clear') }, 2), 'clear');
});

test('deriveOverallBand: 3+ weak/absent → fragmented', () => {
  const d = dims(['weak', 'weak', 'absent', 'clear', 'clear', 'clear']);
  assert.equal(deriveOverallBand({ dimensions: d }, 2), 'fragmented');
});

test('deriveOverallBand: material contradiction on a core dimension → fragmented', () => {
  const result = { dimensions: ALL('clear'), contradictions: [{ material: true, dimension: 'difference', evidence: [] }] };
  assert.equal(deriveOverallBand(result, 2), 'fragmented');
});

test('deriveOverallBand: one weak, none absent → emerging', () => {
  const d = dims(['clear', 'partial', 'weak', 'partial', 'clear', 'partial']);
  assert.equal(deriveOverallBand({ dimensions: d }, 2), 'emerging');
});

test('economicScreen', () => {
  // B2B SaaS floor 10; "Under $10M" = [0,10] → high<=floor → below
  assert.equal(economicScreen('B2B SaaS', 'Under $10M', 'Over $5M'), 'below');
  // B2B SaaS, $10M–$15M = [10,15] → low>=floor → clears
  assert.equal(economicScreen('B2B SaaS', '$10M–$15M', 'Under $250K'), 'clears');
  // Professional services floor 16, $15M–$20M = [15,20] straddles → depends on spend
  assert.equal(economicScreen('Professional services', '$15M–$20M', '$2M–$5M'), 'clears');
  assert.equal(economicScreen('Professional services', '$15M–$20M', '$250K–$750K'), 'below');
  // unknown revenue band → insufficient
  assert.equal(economicScreen('B2B SaaS', 'nope', 'Over $5M'), 'insufficient');
  // unknown company type falls back to floor 18
  assert.equal(economicScreen('Mystery Co', 'Over $75M', 'Under $250K'), 'clears');
});

test('deriveSprintFit: every route', () => {
  const base = { clarityBand: 'fragmented', preliminaryCase: 'strong_case', readiness: 'Yes', companyType: 'B2B SaaS', revenueBand: '$10M–$15M', spendBand: 'Over $5M' };
  assert.equal(deriveSprintFit({ ...base, clarityBand: 'not_enough_evidence' }), 'insufficient_evidence');
  assert.equal(deriveSprintFit({ ...base, clarityBand: 'clear' }), 'probably_unnecessary');
  assert.equal(deriveSprintFit({ ...base, preliminaryCase: 'limited_case' }), 'probably_unnecessary');
  assert.equal(deriveSprintFit({ ...base, readiness: 'No' }), 'wrong_timing');
  assert.equal(deriveSprintFit({ ...base, revenueBand: 'Under $10M' }), 'not_proportionate'); // economics below
  assert.equal(deriveSprintFit({ ...base, revenueBand: 'nope' }), 'insufficient_evidence');   // economics insufficient
  assert.equal(deriveSprintFit({ ...base, readiness: 'Probably' }), 'potential_fit');
  assert.equal(deriveSprintFit({ ...base, preliminaryCase: 'possible_case' }), 'potential_fit');
  assert.equal(deriveSprintFit(base), 'strong_fit');
});

test('registrableDomain', () => {
  assert.equal(registrableDomain('example.com'), 'example.com');
  assert.equal(registrableDomain('www.example.com'), 'example.com');
  assert.equal(registrableDomain('shop.www.example.com'), 'example.com');
  assert.equal(registrableDomain('foo.co.uk'), 'foo.co.uk');
  assert.equal(registrableDomain('a.foo.co.uk'), 'foo.co.uk');
  assert.equal(registrableDomain('foo.com.au'), 'foo.com.au');
});
