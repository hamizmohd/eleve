const fs = require('fs');
const path = require('path');
const express = require('express');
const { ensureDb, DB_PATH } = require('./data/seed');
const { priceInsight, matchScore } = require('./lib/insights');
const ai = require('./lib/ai');
const { registerAccount } = require('./lib/account');
const { registerSell, DOCS, LISTING_FEE, BOOST_FEE } = require('./lib/sell');

ensureDb();
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
if (!db.properties[0]?.lat) {
  console.warn('data/db.json is from an older version (no map coordinates). Run `npm run seed` to regenerate it.');
}

// Prices don't change at runtime, so price insights are computed once.
const insights = new Map(db.properties.map((p) => [p.id, priceInsight(p, db.properties)]));

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), (err) => {
      if (err) console.error('Failed to save db:', err.message);
    });
  }, 200);
}

const app = express();
// The Android/iOS app (Capacitor) loads the frontend from its own origin and calls the API cross-origin.
const APP_ORIGINS = ['capacitor://localhost', 'http://localhost', 'https://localhost'];
app.use('/api', (req, res, next) => {
  if (APP_ORIGINS.includes(req.headers.origin)) {
    res.set({
      'Access-Control-Allow-Origin': req.headers.origin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
// Document uploads arrive as base64 JSON (<= 5 MB files); everything else stays small.
const smallJson = express.json({ limit: '20kb' });
const uploadJson = express.json({ limit: '8mb' });
app.use((req, res, next) => (/^\/api\/sell\/[^/]+\/documents\//.test(req.path) ? uploadJson : smallJson)(req, res, next));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------

const cityById = (id) => db.cities.find((c) => c.id === id);
const agentById = (id) => db.agents.find((a) => a.id === id);
const meta = () => ({ cities: db.cities, propertyTypes: db.propertyTypes, amenities: db.amenities });

function agentStats(agent) {
  const count = agent.reviews.length;
  const rating = count ? agent.reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({ star, count: agent.reviews.filter((r) => r.rating === star).length }));
  const listings = db.properties.filter((p) => p.agentId === agent.id);
  return {
    rating: Math.round(rating * 10) / 10,
    reviewCount: count,
    ratingBreakdown: breakdown,
    activeListings: listings.length,
    forSale: listings.filter((p) => p.listingType === 'sale').length,
    forRent: listings.filter((p) => p.listingType === 'rent').length,
  };
}

function agentSummary(agent) {
  const { reviews, ...rest } = agent;
  return { ...rest, cityName: cityById(agent.city)?.name, ...agentStats(agent) };
}

function propertyCard(p) {
  const agent = agentById(p.agentId);
  const { owner, ...rest } = p;
  return {
    ...rest,
    // The owner's phone is only shared after an enquiry; their name only if they allow it.
    owner: owner && { name: db.user?.settings?.privacy?.profileVisible === false ? 'Verified owner' : owner.name },
    cityName: cityById(p.city)?.name,
    insight: insights.get(p.id),
    agent: agent && { id: agent.id, name: agent.name, agency: agent.agency, verified: agent.verified, rating: agentStats(agent).rating },
  };
}

const num = (v) => (v === undefined || v === '' ? undefined : Number(v));

function paginate(items, page, limit) {
  const size = Math.min(Math.max(num(limit) || 12, 1), 60);
  const total = items.length;
  const pages = Math.max(Math.ceil(total / size), 1);
  const current = Math.min(Math.max(num(page) || 1, 1), pages);
  return { total, page: current, pages, limit: size, items: items.slice((current - 1) * size, current * size) };
}

function parseCriteria(raw) {
  try {
    const c = JSON.parse(raw);
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

// ---------- meta ----------

app.get('/api/meta', (req, res) => {
  const cities = db.cities.map((c) => {
    const props = db.properties.filter((p) => p.city === c.id);
    const sale = props.filter((p) => p.listingType === 'sale' && p.pricePerSqft && !['Shop', 'Office Space', 'Plot'].includes(p.propertyType));
    const avgPsf = sale.length ? Math.round(sale.reduce((s, p) => s + p.pricePerSqft, 0) / sale.length) : null;
    return {
      ...c,
      counts: {
        sale: props.filter((p) => p.listingType === 'sale').length,
        rent: props.filter((p) => p.listingType === 'rent').length,
        agents: db.agents.filter((a) => a.city === c.id).length,
      },
      avgPricePerSqft: avgPsf,
    };
  });
  res.json({
    cities,
    propertyTypes: db.propertyTypes,
    amenities: db.amenities,
    ai: ai.status(),
    sell: { steps: 5, fee: LISTING_FEE, boostFee: BOOST_FEE, documents: DOCS },
    totals: { properties: db.properties.length, agents: db.agents.length, cities: db.cities.length },
  });
});

// ---------- properties ----------

app.get('/api/properties', (req, res) => {
  const q = req.query;
  let items = db.properties;

  if (q.ids) {
    const ids = new Set(String(q.ids).split(','));
    items = items.filter((p) => ids.has(p.id));
  }
  if (q.listingType) items = items.filter((p) => p.listingType === q.listingType);
  if (q.city) items = items.filter((p) => p.city === q.city);
  if (q.locality) items = items.filter((p) => p.locality === q.locality);
  if (q.propertyType) {
    const types = String(q.propertyType).split(',');
    items = items.filter((p) => types.includes(p.propertyType));
  }
  if (q.bhk) {
    const wanted = String(q.bhk).split(',').map(Number);
    // "5" means 5+ BHK
    items = items.filter((p) => p.bhk && wanted.some((b) => (b >= 5 ? p.bhk >= 5 : p.bhk === b)));
  }
  if (q.furnishing) items = items.filter((p) => p.furnishing === q.furnishing);
  if (q.status) items = items.filter((p) => p.status === q.status);
  if (q.agentId) items = items.filter((p) => p.agentId === q.agentId);
  if (q.verified === 'true') items = items.filter((p) => p.verified);
  if (q.deal) items = items.filter((p) => insights.get(p.id)?.verdict === 'great');
  if (q.amenities) {
    const wanted = String(q.amenities).split(',');
    items = items.filter((p) => wanted.every((a) => p.amenities.includes(a)));
  }
  const min = num(q.minPrice);
  const max = num(q.maxPrice);
  if (min !== undefined) items = items.filter((p) => p.price >= min);
  if (max !== undefined) items = items.filter((p) => p.price <= max);
  const minArea = num(q.minArea);
  if (minArea !== undefined) items = items.filter((p) => p.areaSqft >= minArea);
  if (q.q) {
    const term = String(q.q).toLowerCase();
    items = items.filter((p) =>
      [p.title, p.locality, p.address, p.project, cityById(p.city)?.name].some((f) => f && f.toLowerCase().includes(term))
    );
  }

  const sorters = {
    newest: (a, b) => b.postedOn.localeCompare(a.postedOn),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    areaDesc: (a, b) => b.areaSqft - a.areaSqft,
    popular: (a, b) => b.views - a.views,
    value: (a, b) => (insights.get(a.id)?.diffPct ?? 99) - (insights.get(b.id)?.diffPct ?? 99),
    relevance: (a, b) => Number(b.featured) - Number(a.featured) || Number(b.verified) - Number(a.verified) || b.postedOn.localeCompare(a.postedOn),
  };

  // Smart-search mode: soft-match against AI-parsed criteria and rank by match score.
  const criteria = q.match ? parseCriteria(q.match) : null;
  const scores = new Map();
  if (criteria) {
    if (criteria.city) items = items.filter((p) => p.city === criteria.city);
    if (criteria.listingType && criteria.listingType !== 'any') items = items.filter((p) => p.listingType === criteria.listingType);
    for (const p of items) scores.set(p.id, matchScore(p, criteria));
    items = items.filter((p) => scores.get(p.id).score >= 60);
    items = [...items].sort((a, b) => scores.get(b.id).score - scores.get(a.id).score || sorters.relevance(a, b));
    if (q.sort && sorters[q.sort]) items.sort(sorters[q.sort]);
  } else {
    items = [...items].sort(sorters[q.sort] || sorters.relevance);
  }

  const markers = q.markers ? items.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, price: p.price, listingType: p.listingType })) : undefined;
  const result = paginate(items, q.page, q.limit);
  res.json({
    ...result,
    markers,
    items: result.items.map((p) => ({ ...propertyCard(p), match: scores.get(p.id) })),
  });
});

app.get('/api/properties/:id', (req, res) => {
  const p = db.properties.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Property not found' });
  p.views += 1;
  persist();
  const agent = agentById(p.agentId);
  const similar = db.properties
    .filter((x) => x.id !== p.id && x.city === p.city && x.listingType === p.listingType && x.propertyType === p.propertyType)
    .sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price))
    .slice(0, 4)
    .map(propertyCard);
  res.json({ ...propertyCard(p), agent: agent && agentSummary(agent), similar });
});

// ---------- agents ----------

app.get('/api/agents', (req, res) => {
  const q = req.query;
  let items = db.agents.map(agentSummary);
  if (q.city) items = items.filter((a) => a.city === q.city);
  if (q.locality) items = items.filter((a) => a.localities.includes(q.locality));
  if (q.specialization) items = items.filter((a) => a.specializations.includes(q.specialization));
  if (q.language) items = items.filter((a) => a.languages.includes(q.language));
  if (q.verified === 'true') items = items.filter((a) => a.verified);
  const minRating = num(q.minRating);
  if (minRating !== undefined) items = items.filter((a) => a.rating >= minRating);
  if (q.q) {
    const term = String(q.q).toLowerCase();
    items = items.filter((a) => [a.name, a.agency, ...a.localities].some((f) => f.toLowerCase().includes(term)));
  }
  const sorters = {
    rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
    reviews: (a, b) => b.reviewCount - a.reviewCount,
    experience: (a, b) => b.experienceYears - a.experienceYears,
    deals: (a, b) => b.dealsClosed - a.dealsClosed,
    listings: (a, b) => b.activeListings - a.activeListings,
  };
  items.sort(sorters[q.sort] || sorters.rating);
  res.json(paginate(items, q.page, q.limit || 12));
});

app.get('/api/agents/:id', (req, res) => {
  const agent = agentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const listings = db.properties.filter((p) => p.agentId === agent.id).map(propertyCard);
  res.json({ ...agentSummary(agent), reviews: agent.reviews, listings });
});

app.post('/api/agents/:id/reviews', (req, res) => {
  const agent = agentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const author = String(req.body.author || '').trim();
  const comment = String(req.body.comment || '').trim();
  const rating = Number(req.body.rating);
  const errors = {};
  if (author.length < 2 || author.length > 60) errors.author = 'Please enter your name (2-60 characters).';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Please pick a rating from 1 to 5 stars.';
  if (comment.length < 10 || comment.length > 1000) errors.comment = 'Review should be 10-1000 characters.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', errors });

  const review = { id: `r${agent.id.slice(1)}-${Date.now()}`, author, rating, comment, date: new Date().toISOString() };
  agent.reviews.unshift(review);
  persist();
  res.status(201).json({ review, ...agentStats(agent) });
});

// ---------- enquiries ----------

app.post('/api/enquiries', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').replace(/[\s-]/g, '');
  const email = String(b.email || '').trim();
  const message = String(b.message || '').trim();
  const errors = {};
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!/^(\+91)?[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (message.length > 1000) errors.message = 'Message is too long.';
  const property = b.propertyId ? db.properties.find((p) => p.id === b.propertyId) : null;
  const agent = agentById(b.agentId || property?.agentId);
  const owner = !agent && property?.ownerListing ? property.owner : null;
  if (!agent && !owner) errors.agentId = 'Unknown agent.';
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });

  const enquiry = {
    id: `e${Date.now()}`,
    propertyId: property?.id || null,
    agentId: agent?.id || null,
    name, phone, email, message,
    wantsVisit: Boolean(b.wantsVisit),
    createdAt: new Date().toISOString(),
  };
  db.enquiries.push(enquiry);
  persist();
  const contact = agent
    ? { name: agent.name, phone: agent.phone, responseTime: agent.responseTime }
    : { name: owner.name, phone: `+91 ${owner.phone}`, responseTime: 'Within a day' };
  res.status(201).json({ ok: true, enquiry, agent: contact });
});

// ---------- AI ----------

app.post('/api/ai/search', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (query.length < 3 || query.length > 300) return res.status(400).json({ error: 'Describe what you are looking for (3-300 characters).' });
  res.json(await ai.smartSearch(query, meta()));
});

app.get('/api/ai/property-brief/:id', async (req, res) => {
  const p = db.properties.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Property not found' });
  res.json(await ai.propertyBrief(p, insights.get(p.id), cityById(p.city)?.name));
});

app.get('/api/ai/agent-summary/:id', async (req, res) => {
  const agent = agentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(await ai.agentSummary(agent, agentStats(agent)));
});

// ---------- account, selling, transactions ----------

db.applications ||= [];
const sell = registerSell(app, { db, persist, insights, priceInsight, cityById });
registerAccount(app, { db, persist, cityIds: db.cities.map((c) => c.id), removeApplication: sell.removeApplication, publicApplication: sell.publicApplication });

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Elevé running at http://localhost:${PORT}`);
  await ai.ready;
  console.log(ai.status().claude ? `[ai] Claude enabled (${ai.status().model})` : '[ai] Using built-in AI fallbacks');
});
