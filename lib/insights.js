// Price Check (fair-price estimate from comparable listings) and
// Match Score (how well a listing fits a buyer's/renter's criteria).

const psf = (p) => p.price / p.areaSqft;

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median of valueFn per key, keeping only groups with at least minCount members. */
function groupMedians(items, keyFn, valueFn, minCount = 2) {
  const groups = new Map();
  for (const x of items) {
    const k = keyFn(x);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(valueFn(x));
  }
  return new Map([...groups].filter(([, v]) => v.length >= minCount).map(([k, v]) => [k, median(v)]));
}

/**
 * Estimates a fair price with a multiplicative model fitted on the other listings
 * in the same city (the property itself is excluded):
 *   fair ₹/sq ft = baseline(buy|rent) × locality factor × property-type factor
 * Locality and type factors are fitted alternately with medians, which keeps the
 * fit robust to the outliers (deals / overpriced listings) we are trying to detect.
 * Buy and rent listings share locality factors, so sparse localities still get an estimate.
 */
function priceInsight(p, all) {
  const pool = all.filter((x) => x.id !== p.id && x.city === p.city);
  const base = {};
  for (const t of ['sale', 'rent']) {
    const same = pool.filter((x) => x.listingType === t);
    if (same.length >= 5) base[t] = median(same.map(psf));
  }
  if (!base[p.listingType]) return null;

  let loc = new Map();
  let type = new Map();
  const f = (m, k) => m.get(k) ?? 1;
  for (let i = 0; i < 5; i++) {
    type = groupMedians(pool, (x) => x.propertyType, (x) => psf(x) / (base[x.listingType] * f(loc, x.locality)));
    loc = groupMedians(pool, (x) => x.locality, (x) => psf(x) / (base[x.listingType] * f(type, x.propertyType)));
    for (const [t, m] of groupMedians(pool, (x) => x.listingType, (x) => psf(x) / (f(loc, x.locality) * f(type, x.propertyType)), 5)) base[t] = m;
  }

  // Without other listings of the same type there's no type factor, so no honest estimate.
  const sameType = pool.filter((x) => x.propertyType === p.propertyType).length;
  if (sameType < 2) return null;
  const comps = pool.filter((x) => x.locality === p.locality);
  const scope = loc.has(p.locality) ? 'locality' : 'city';
  const estPsf = base[p.listingType] * f(loc, p.locality) * f(type, p.propertyType);
  const estimate = estPsf * p.areaSqft;
  const diffPct = Math.round(((p.price - estimate) / estimate) * 100);
  let verdict;
  if (diffPct <= -10) verdict = 'great';
  else if (diffPct <= 5) verdict = 'fair';
  else if (diffPct <= 15) verdict = 'high';
  else verdict = 'overpriced';

  return {
    verdict,
    label: { great: 'Great deal', fair: 'Fair price', high: 'Slightly high', overpriced: 'Overpriced' }[verdict],
    diffPct,
    estimate: Math.round(estimate),
    low: Math.round(estimate * 0.92),
    high: Math.round(estimate * 1.08),
    marketPsf: Math.round(estPsf),
    comps: comps.length,
    scope,
    confidence: scope === 'city' || sameType < 4 ? 'low' : comps.length >= 5 ? 'high' : 'medium',
  };
}

/**
 * Scores a property against search criteria (0-100) and explains why.
 * Criteria: { localities[], propertyTypes[], bhk[], minPrice, maxPrice, minArea, furnishing, readyToMove, amenities[] }
 * City and listingType are applied as hard filters by the caller.
 */
function matchScore(p, c) {
  let earned = 0;
  let possible = 0;
  const hits = [];
  const misses = [];
  const rule = (weight, ok, partial, hitText, missText) => {
    possible += weight;
    const credit = ok ? 1 : partial || 0;
    earned += weight * credit;
    if (ok) hits.push(hitText);
    else misses.push(missText);
  };

  if (c.propertyTypes?.length) {
    rule(20, c.propertyTypes.includes(p.propertyType), 0, p.propertyType, `${p.propertyType}, not ${c.propertyTypes.join('/')}`);
  }
  if (c.bhk?.length) {
    const ok = p.bhk && c.bhk.some((b) => (b >= 5 ? p.bhk >= 5 : p.bhk === b));
    const near = p.bhk && c.bhk.some((b) => Math.abs(p.bhk - b) === 1);
    rule(20, ok, near ? 0.4 : 0, `${p.bhk} BHK`, p.bhk ? `${p.bhk} BHK instead of ${c.bhk.join('/')} BHK` : 'No BHK configuration');
  }
  if (c.maxPrice || c.minPrice) {
    const max = c.maxPrice || Infinity;
    const min = c.minPrice || 0;
    const ok = p.price <= max && p.price >= min;
    const over = p.price > max ? (p.price - max) / max : 0;
    const partial = over && over <= 0.1 ? 0.6 : over && over <= 0.2 ? 0.3 : 0;
    rule(25, ok, partial, 'Within budget', over ? `${Math.round(over * 100)}% over budget` : 'Below your minimum budget');
  }
  if (c.localities?.length) {
    rule(15, c.localities.includes(p.locality), 0, `In ${p.locality}`, `In ${p.locality}, not ${c.localities.join('/')}`);
  }
  if (c.amenities?.length) {
    const have = c.amenities.filter((a) => p.amenities.includes(a));
    const missing = c.amenities.filter((a) => !p.amenities.includes(a));
    possible += 10;
    earned += 10 * (have.length / c.amenities.length);
    if (have.length) hits.push(`Has ${have.join(', ')}`);
    if (missing.length) misses.push(`No ${missing.join(', ')}`);
  }
  if (c.furnishing) {
    rule(5, p.furnishing === c.furnishing, 0, p.furnishing, `${p.furnishing || 'Furnishing n/a'}`);
  }
  if (c.readyToMove) {
    rule(5, p.status === 'Ready to Move', 0, 'Ready to move', `Possession ${p.possession}`);
  }
  if (c.minArea) {
    const ok = p.areaSqft >= c.minArea;
    rule(5, ok, p.areaSqft >= c.minArea * 0.9 ? 0.5 : 0, `${p.areaSqft} sq ft`, `Only ${p.areaSqft} sq ft`);
  }

  const score = possible ? Math.round((earned / possible) * 100) : 100;
  return { score, hits, misses };
}

module.exports = { priceInsight, matchScore };
