export const DIMENSIONS = [
  'audience_boundary',
  'problem_trigger',
  'outcome_value',
  'difference',
  'proof_boundaries',
  'consistency'
];

export const LEVELS = ['clear', 'partial', 'weak', 'absent'];

export function deriveOverallBand(result, usableSourceCount) {
  const dimensions = Array.isArray(result?.dimensions) ? result.dimensions : [];
  const byName = new Map(dimensions.map((item) => [item.name, item.level]));
  const usable = DIMENSIONS.filter((name) => LEVELS.includes(byName.get(name)));

  if (usableSourceCount < 1 || usable.length < 3 || result?.status === 'insufficient_evidence') {
    return 'not_enough_evidence';
  }

  const levels = DIMENSIONS.map((name) => byName.get(name) || 'absent');
  const contradiction = (result.contradictions || []).some((item) =>
    item.material === true && ['audience_boundary', 'outcome_value', 'difference'].includes(item.dimension)
  );
  const weakOrAbsent = levels.filter((level) => level === 'weak' || level === 'absent').length;

  if (contradiction || weakOrAbsent >= 3) return 'fragmented';

  const clearCount = levels.filter((level) => level === 'clear').length;
  const allClearOrPartial = levels.every((level) => level === 'clear' || level === 'partial');
  if (
    allClearOrPartial &&
    clearCount >= 4 &&
    !['weak', 'absent'].includes(byName.get('proof_boundaries')) &&
    !['weak', 'absent'].includes(byName.get('consistency'))
  ) return 'clear';

  const absentCount = levels.filter((level) => level === 'absent').length;
  const weakCount = levels.filter((level) => level === 'weak').length;
  if (absentCount === 0 && weakCount <= 2) return 'emerging';

  return 'fragmented';
}

export const ECONOMIC_FLOORS = {
  'B2B SaaS': 10,
  'Consultancy / advisory': 14,
  'Professional services': 16,
  'Agency / services firm': 17,
  'Other B2B': 18
};

export const REVENUE_BANDS = {
  'Under $10M': [0, 10],
  '$10M–$15M': [10, 15],
  '$15M–$20M': [15, 20],
  '$20M–$35M': [20, 35],
  '$35M–$75M': [35, 75],
  'Over $75M': [75, Infinity]
};

const ADEQUATE_SPEND = new Set(['$750K–$2M', '$2M–$5M', 'Over $5M']);

export function economicScreen(companyType, revenueBand, spendBand) {
  const floor = ECONOMIC_FLOORS[companyType] ?? 18;
  const band = REVENUE_BANDS[revenueBand];
  if (!band) return 'insufficient';
  const [low, high] = band;
  if (low >= floor) return 'clears';
  if (high <= floor) return 'below';
  return ADEQUATE_SPEND.has(spendBand) ? 'clears' : 'below';
}

export function deriveSprintFit({ clarityBand, preliminaryCase, readiness, companyType, revenueBand, spendBand }) {
  if (clarityBand === 'not_enough_evidence') return 'insufficient_evidence';
  if (clarityBand === 'clear' || preliminaryCase === 'limited_case') return 'probably_unnecessary';
  if (readiness === 'No') return 'wrong_timing';
  const economics = economicScreen(companyType, revenueBand, spendBand);
  if (economics === 'below') return 'not_proportionate';
  if (economics === 'insufficient') return 'insufficient_evidence';
  if (readiness === 'Probably' || preliminaryCase === 'possible_case') return 'potential_fit';
  return 'strong_fit';
}

export function registrableDomain(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const commonSecondLevel = new Set(['co.uk', 'org.uk', 'com.au', 'net.au', 'co.nz', 'co.jp', 'com.br']);
  const suffix2 = parts.slice(-2).join('.');
  return commonSecondLevel.has(suffix2) ? parts.slice(-3).join('.') : suffix2;
}
