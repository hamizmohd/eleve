// AI features. Each one uses Claude when credentials are available and falls back
// to a deterministic local implementation otherwise, so the app always works.

const sdk = require('@anthropic-ai/sdk');

const Anthropic = sdk.default || sdk;
const MODEL = 'claude-opus-5-5';

let client = null;
try {
  // Resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profile.
  client = new Anthropic();
} catch (err) {
  console.log(`[ai] Claude unavailable (${err.message}); using built-in AI fallbacks.`);
}

// Verify credentials once at startup (model lookup uses no tokens). Network errors keep
// Claude enabled, since they may be transient; missing or rejected credentials disable it.
const ready = client
  ? client.models.retrieve(MODEL).then(
    () => true,
    (err) => {
      if (err instanceof Anthropic.APIConnectionError) return true;
      console.log(`[ai] Claude not available (${err.message.split('.')[0]}). Set ANTHROPIC_API_KEY to enable it; using built-in AI fallbacks.`);
      client = null;
      return false;
    }
  )
  : Promise.resolve(false);

const status = () => ({ claude: Boolean(client), model: client ? MODEL : null });

/** One structured-output call to Claude; returns the parsed JSON object. */
async function askClaude({ system, prompt, schema, effort = 'low' }) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request');
  if (res.stop_reason === 'max_tokens') throw new Error('Claude response was cut off');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no text');
  return JSON.parse(text);
}

/** Runs the Claude path, falling back to local on any failure. Disables Claude after auth errors. */
async function withFallback(name, claudeFn, localFn) {
  await ready;
  if (client) {
    try {
      return { ...(await claudeFn()), source: 'claude' };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        console.log('[ai] Claude credentials rejected; switching to built-in AI fallbacks.');
        client = null;
      } else {
        console.error(`[ai] ${name} failed, using fallback:`, err.message);
      }
    }
  }
  return { ...localFn(), source: 'local' };
}

const cache = new Map();
async function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const value = await fn();
  if (value.source === 'claude') cache.set(key, value);
  return value;
}

// ---------------------------------------------------------------------------
// 1. Smart search: natural language -> structured criteria
// ---------------------------------------------------------------------------

const FURNISHING = ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'];

function searchSchema(meta) {
  const str = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['listingType', 'city', 'localities', 'propertyTypes', 'bhk', 'minPrice', 'maxPrice', 'minArea', 'furnishing', 'readyToMove', 'amenities', 'summary'],
    properties: {
      listingType: { type: 'string', enum: ['sale', 'rent', 'any'] },
      city: { type: 'string', enum: ['', ...meta.cities.map((c) => c.id)] },
      localities: { type: 'array', items: str },
      propertyTypes: { type: 'array', items: { type: 'string', enum: meta.propertyTypes } },
      bhk: { type: 'array', items: { type: 'integer' } },
      minPrice: { type: 'integer' },
      maxPrice: { type: 'integer' },
      minArea: { type: 'integer' },
      furnishing: { type: 'string', enum: ['', ...FURNISHING] },
      readyToMove: { type: 'boolean' },
      amenities: { type: 'array', items: { type: 'string', enum: meta.amenities } },
      summary: str,
    },
  };
}

function searchSystem(meta) {
  const cities = meta.cities.map((c) => `- ${c.id} (${c.name}): ${c.localities.join(', ')}`).join('\n');
  return `You convert a home-seeker's free-text request into search criteria for an Indian real estate site.

Cities (id and the only localities we list):
${cities}

Property types: ${meta.propertyTypes.join(', ')}
Amenities: ${meta.amenities.join(', ')}

Rules:
- Prices are in rupees as plain integers. 1 lakh = 100000, 1 crore = 10000000, "50k" = 50000. Rent is monthly.
- listingType is "rent" for renting/leasing, "sale" for buying/investing, "any" if unclear. A monthly budget implies rent.
- If the user names a landmark, office park, college or area we don't list, pick the 1-3 nearest listed localities in that city (e.g. a tech park or metro station near a listed locality).
- "flat" means Apartment; "house"/"bungalow" means Independent House or Villa.
- Use 0, "", [] or false for anything not stated. Do not invent requirements.
- summary: one short sentence restating what they want, in plain English.`;
}

const WORD_TYPES = [
  [/\b(flat|apartment|apt)s?\b/, 'Apartment'],
  [/\bvillas?\b/, 'Villa'],
  [/\b(independent house|bungalow|house)s?\b/, 'Independent House'],
  [/\bbuilder floor\b/, 'Builder Floor'],
  [/\b(plot|land)s?\b/, 'Plot'],
  [/\b(office|workspace|coworking)s?\b/, 'Office Space'],
  [/\b(shop|showroom|retail)s?\b/, 'Shop'],
];
const WORD_AMENITIES = [
  [/\bgym\b/, 'Gym'], [/\b(pool|swimming)\b/, 'Swimming Pool'], [/\bparking\b/, 'Car Parking'],
  [/\b(security|gated)\b/, '24x7 Security'], [/\bclub ?house\b/, 'Clubhouse'], [/\b(lift|elevator)\b/, 'Lift'],
  [/\b(power backup|backup)\b/, 'Power Backup'], [/\b(garden|green)\b/, 'Garden'], [/\b(kids|children|play area)\b/, "Children's Play Area"],
  [/\bjogging\b/, 'Jogging Track'], [/\bcctv\b/, 'CCTV'], [/\bgas pipeline\b/, 'Gas Pipeline'],
];

function formatINR(n) {
  if (n >= 1e7) return `₹${Number((n / 1e7).toFixed(2))} Cr`;
  if (n >= 1e5) return `₹${Number((n / 1e5).toFixed(2))} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function toRupees(num, unit) {
  const n = parseFloat(num);
  if (/^(cr|crore|crores)$/.test(unit)) return Math.round(n * 1e7);
  if (/^(l|lac|lacs|lakh|lakhs)$/.test(unit)) return Math.round(n * 1e5);
  if (/^(k|thousand)$/.test(unit)) return Math.round(n * 1e3);
  return Math.round(n);
}

/** Keyword/regex parser used when Claude isn't available. */
function parseSearchLocal(query, meta) {
  let t = ` ${query.toLowerCase().replace(/,/g, '').replace(/₹|rs\.?|inr/g, ' ')} `;
  const out = { listingType: 'any', city: '', localities: [], propertyTypes: [], bhk: [], minPrice: 0, maxPrice: 0, minArea: 0, furnishing: '', readyToMove: false, amenities: [] };

  for (const c of meta.cities) {
    const names = [c.name.toLowerCase(), c.id, ...(c.id === 'bengaluru' ? ['bangalore'] : []), ...(c.id === 'gurugram' ? ['gurgaon'] : []), ...(c.id === 'delhi' ? ['delhi'] : [])];
    if (names.some((n) => t.includes(n))) out.city = c.id;
    for (const l of c.localities) {
      if (t.includes(l.toLowerCase())) {
        out.localities.push(l);
        out.city = c.id;
        t = t.replace(l.toLowerCase(), ' ');
      }
    }
  }

  t = t.replace(/(\d)\s*(\+)?\s*bhk/g, (_, n) => { out.bhk.push(Number(n)); return ' '; });
  t = t.replace(/(\d+(?:\.\d+)?)\s*(sq\.? ?ft|sqft|square feet)/g, (_, n) => { out.minArea = Math.round(n); return ' '; });

  if (/\b(rent|rental|lease|tenant|per month|\/month|monthly|pg)\b/.test(t)) out.listingType = 'rent';
  else if (/\b(buy|purchase|sale|invest|own|resale)\b/.test(t)) out.listingType = 'sale';

  for (const [re, type] of WORD_TYPES) if (re.test(t) && !out.propertyTypes.includes(type)) out.propertyTypes.push(type);
  for (const [re, a] of WORD_AMENITIES) if (re.test(t)) out.amenities.push(a);
  if (/fully furnished/.test(t)) out.furnishing = 'Fully Furnished';
  else if (/semi[- ]?furnished/.test(t)) out.furnishing = 'Semi-Furnished';
  else if (/unfurnished/.test(t)) out.furnishing = 'Unfurnished';
  if (/ready to move|ready-to-move|immediate/.test(t)) out.readyToMove = true;

  const amt = '(\\d+(?:\\.\\d+)?)\\s*(cr|crores?|l|lacs?|lakhs?|k|thousand)?\\b';
  const range = t.match(new RegExp(`${amt}\\s*(?:-|to|and)\\s*${amt}`));
  if (range && (range[2] || range[4])) {
    out.minPrice = toRupees(range[1], range[2] || range[4]);
    out.maxPrice = toRupees(range[3], range[4] || range[2]);
  } else {
    const max = t.match(new RegExp(`(?:under|below|less than|max|upto|up to|within|budget(?: of)?|around)\\s*${amt}`));
    const min = t.match(new RegExp(`(?:above|over|more than|min|at least|from)\\s*${amt}`));
    if (max && (max[2] || Number(max[1]) >= 1000)) out.maxPrice = toRupees(max[1], max[2] || '');
    if (min && (min[2] || Number(min[1]) >= 1000)) out.minPrice = toRupees(min[1], min[2] || '');
  }
  if (out.listingType === 'any' && out.maxPrice && out.maxPrice < 500000) out.listingType = 'rent';

  const bits = [];
  if (out.bhk.length) bits.push(`${out.bhk.join('/')} BHK`);
  bits.push(out.propertyTypes.length ? out.propertyTypes.join(' or ') : 'property');
  bits.push(out.listingType === 'rent' ? 'to rent' : out.listingType === 'sale' ? 'to buy' : '');
  if (out.localities.length) bits.push(`in ${out.localities.join(', ')}`);
  else if (out.city) bits.push(`in ${meta.cities.find((c) => c.id === out.city).name}`);
  if (out.maxPrice) bits.push(`under ${formatINR(out.maxPrice)}`);
  if (out.amenities.length) bits.push(`with ${out.amenities.join(', ')}`);
  return { ...out, summary: `Looking for ${bits.filter(Boolean).join(' ')}.` };
}

function cleanCriteria(c, meta) {
  const city = meta.cities.find((x) => x.id === c.city);
  return {
    ...c,
    city: city ? city.id : '',
    localities: city ? c.localities.filter((l) => city.localities.includes(l)) : [],
    bhk: [...new Set(c.bhk.filter((b) => b >= 1 && b <= 10))],
    minPrice: Math.max(0, c.minPrice | 0),
    maxPrice: Math.max(0, c.maxPrice | 0),
  };
}

async function smartSearch(query, meta) {
  const result = await withFallback(
    'smartSearch',
    () => askClaude({ system: searchSystem(meta), prompt: query, schema: searchSchema(meta) }),
    () => parseSearchLocal(query, meta)
  );
  return { ...cleanCriteria(result, meta), summary: result.summary, source: result.source };
}

// ---------------------------------------------------------------------------
// 2. Property brief: highlights / considerations / questions to ask
// ---------------------------------------------------------------------------

const briefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'highlights', 'considerations', 'questionsToAsk', 'bestFor'],
  properties: {
    headline: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    considerations: { type: 'array', items: { type: 'string' } },
    questionsToAsk: { type: 'array', items: { type: 'string' } },
    bestFor: { type: 'string' },
  },
};

const BRIEF_SYSTEM = `You are a candid, experienced Indian real estate advisor writing a quick brief for a home-seeker looking at one listing.
Ground every point in the listing data and the price check provided. You may use widely known general facts about the locality (character, connectivity, typical buyers), but never invent specific numbers, distances or project names.
Write for a busy reader: each bullet under 18 words, concrete, no fluff.
- headline: one line verdict (max 12 words).
- highlights: 3 genuine strengths.
- considerations: 2-3 honest watch-outs (price vs market, age, floor, possession timeline, missing amenities, deposit, etc.).
- questionsToAsk: 3 specific questions to ask the agent before visiting.
- bestFor: who this suits, in under 12 words.`;

function briefLocal(p, insight) {
  const highlights = [];
  const considerations = [];
  if (insight?.verdict === 'great') highlights.push(`Priced about ${Math.abs(insight.diffPct)}% below comparable listings nearby.`);
  if (insight?.verdict === 'fair') highlights.push('Priced in line with the local market.');
  if (p.amenities.length >= 7) highlights.push(`Well-equipped: ${p.amenities.slice(0, 3).join(', ')} and more.`);
  if (p.status === 'Ready to Move') highlights.push('Ready to move in, so there is no construction risk.');
  if (p.ageYears !== null && p.ageYears <= 3) highlights.push('Recently built, so maintenance costs should be low.');
  if (p.furnishing === 'Fully Furnished') highlights.push('Fully furnished, which saves setup cost and time.');
  if (p.verified) highlights.push('Listing details have been verified.');
  if (insight && insight.diffPct > 5) considerations.push(`Asking price is ~${insight.diffPct}% above comparable listings, so negotiate.`);
  if (p.status === 'Under Construction') considerations.push(`Under construction, with possession by ${p.possession}. Check the builder's track record.`);
  if (p.ageYears >= 12) considerations.push(`${p.ageYears} years old, so budget for repairs and check structural health.`);
  if (p.totalFloors && p.floor === 0) considerations.push('Ground floor, so check ventilation, privacy and seepage.');
  if (p.deposit && p.deposit >= p.price * 6) considerations.push(`High deposit of ${Math.round(p.deposit / p.price)} months' rent.`);
  if (!p.amenities.includes('Power Backup') && p.propertyType !== 'Plot') considerations.push('Power backup is not listed.');
  if (!p.reraId && p.listingType === 'sale') considerations.push('No RERA ID listed, so verify approvals before paying a token amount.');
  const questions = p.listingType === 'rent'
    ? ['What does the maintenance charge include, and who pays it?', 'Is the deposit negotiable, and what is the lock-in period?', 'Are pets and visitors allowed by the society?']
    : ['Is the title clear, and are OC/CC certificates available?', 'What are the maintenance charges and pending society dues?', 'Is the price negotiable, and what are the parking costs?'];
  return {
    headline: insight?.verdict === 'great' ? 'Strong value for the area' : insight?.verdict === 'overpriced' ? 'Good home, but priced above market' : 'Solid option worth a visit',
    highlights: highlights.slice(0, 3),
    considerations: considerations.slice(0, 3),
    questionsToAsk: questions,
    bestFor: p.bhk >= 3 ? 'Families needing space' : p.bhk ? 'Young professionals and couples' : 'Investors and businesses',
  };
}

function propertyBrief(p, insight, cityName) {
  const facts = {
    title: p.title, city: cityName, locality: p.locality, listingType: p.listingType, propertyType: p.propertyType,
    bhk: p.bhk, areaSqft: p.areaSqft, price: p.price, deposit: p.deposit, furnishing: p.furnishing,
    floor: p.floor, totalFloors: p.totalFloors, facing: p.facing, status: p.status, possession: p.possession,
    ageYears: p.ageYears, amenities: p.amenities, reraId: Boolean(p.reraId), verified: p.verified,
  };
  return cached(`brief:${p.id}:${p.price}`, () => withFallback(
    'propertyBrief',
    () => askClaude({
      system: BRIEF_SYSTEM,
      prompt: `Listing:\n${JSON.stringify(facts, null, 2)}\n\nPrice check:\n${JSON.stringify(insight, null, 2)}`,
      schema: briefSchema,
      effort: 'medium',
    }),
    () => briefLocal(p, insight)
  ));
}

// ---------------------------------------------------------------------------
// 3. Agent review summary
// ---------------------------------------------------------------------------

const agentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'strengths', 'concerns', 'bestFor'],
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    bestFor: { type: 'string' },
  },
};

const AGENT_SYSTEM = `You summarise client reviews of a real estate agent for someone deciding whether to hire them.
Be balanced and specific; only use what the reviews and profile say.
- summary: 1-2 sentences, max 40 words.
- strengths: up to 3 short phrases (max 6 words each) clients repeatedly praise.
- concerns: up to 2 short phrases about recurring complaints; empty if there are none worth noting.
- bestFor: who should hire this agent, max 10 words.`;

const THEMES = [
  [/negotiat/, 'Strong negotiator'], [/paperwork|documentation|registration/, 'Handles paperwork'],
  [/transparent|honest|never pushed/, 'Transparent and no pressure'], [/locality|knows/, 'Deep local knowledge'],
  [/responsive|quickly|whatsapp/, 'Responsive'], [/patient|professional/, 'Professional and patient'],
];
const CONCERNS = [
  [/slow|follow-?ups?/, 'Slow follow-ups'], [/rescheduled|inconsistent/, 'Inconsistent communication'],
  [/above our stated budget/, 'Shows options above budget'], [/did not respond/, 'Can go unresponsive'], [/longer than expected/, 'Paperwork delays'],
];

function agentLocal(agent, stats) {
  const text = agent.reviews.map((r) => r.comment.toLowerCase()).join(' ');
  const count = (re) => (text.match(new RegExp(re.source, 'g')) || []).length;
  const strengths = THEMES.map(([re, label]) => [label, count(re)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);
  const concerns = CONCERNS.map(([re, label]) => [label, count(re)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l);
  const tone = stats.rating >= 4.5 ? 'Clients consistently rate' : stats.rating >= 4 ? 'Most clients are happy with' : stats.rating >= 3 ? 'Clients have mixed experiences with' : 'Several clients were unhappy with';
  return {
    summary: `${tone} ${agent.name.split(' ')[0]} (${stats.rating}★ from ${stats.reviewCount} reviews)${strengths.length ? `, often mentioning ${strengths.slice(0, 2).join(' and ').toLowerCase()}` : ''}.`,
    strengths,
    concerns,
    bestFor: agent.specializations.slice(0, 2).join(' and ') + ` in ${agent.localities.slice(0, 2).join(', ')}`,
  };
}

function agentSummary(agent, stats) {
  return cached(`agent:${agent.id}:${agent.reviews.length}`, () => withFallback(
    'agentSummary',
    () => askClaude({
      system: AGENT_SYSTEM,
      prompt: `Agent: ${agent.name}, ${agent.agency}. ${agent.experienceYears} yrs, specialises in ${agent.specializations.join(', ')}. Average rating ${stats.rating} from ${stats.reviewCount} reviews.\n\nReviews:\n${agent.reviews.map((r) => `- ${r.rating}★: ${r.comment}`).join('\n')}`,
      schema: agentSchema,
    }),
    () => agentLocal(agent, stats)
  ));
}

module.exports = { ready, status, smartSearch, propertyBrief, agentSummary };
