// "Sell your property": a 5-step, server-enforced verification flow.
// The client is only ever told the current step number, never what comes next.
//   1 contact + phone OTP   2 identity (PAN)   3 property details
//   4 ownership documents   5 declarations + verification fee
// After submission the application is reviewed (simulated) and goes live as a listing.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { newTransaction } = require('./account');

const TOTAL_STEPS = 5;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const REVIEW_MS = Number(process.env.REVIEW_MS || 20000);
const LISTING_FEE = 499;
const BOOST_FEE = 999;
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const RESIDENTIAL = ['Apartment', 'Independent House', 'Villa', 'Builder Floor'];
const FURNISHING = ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'];
const FACING = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
const OWNERSHIP = { Individual: 'P', Joint: 'P', Company: 'C', HUF: 'H' };
const METHODS = { upi: 'UPI', netbanking: 'Net banking', card: 'Card' };
const DOCS = {
  titleDeed: { label: 'Sale deed / title document', required: true },
  taxReceipt: { label: 'Latest property tax receipt', required: true },
  encumbrance: { label: 'Encumbrance certificate', required: false },
  occupancy: { label: 'Occupancy / completion certificate', required: false },
};
const FILE_TYPES = {
  'application/pdf': { ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  'image/jpeg': { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47] },
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => new Date().toISOString();
const maskPhone = (p) => `${p.slice(0, 2)}XXXXXX${p.slice(-2)}`;

function publicApplication(a) {
  const { otp, documents, ...rest } = a;
  return {
    ...rest,
    totalSteps: TOTAL_STEPS,
    otpPending: Boolean(otp && !a.contact?.phoneVerified),
    documents: Object.fromEntries(Object.entries(documents || {}).map(([k, d]) => [k, { name: d.name, size: d.size, type: d.type, uploadedAt: d.uploadedAt }])),
  };
}

function registerSell(app, ctx) {
  const { db, persist, insights, priceInsight, cityById } = ctx;
  const timers = new Map();

  const find = (req, res) => {
    const a = db.applications.find((x) => x.id === req.params.id);
    if (!a) res.status(404).json({ error: 'Application not found' });
    return a;
  };
  const touch = (a, step) => {
    if (step) a.step = Math.max(a.step, step);
    a.updatedAt = now();
    persist();
  };
  const fail = (res, errors, status = 400) => res.status(status).json({ error: Object.values(errors)[0], errors });
  const requireDraft = (a, res, minStep) => {
    if (a.status !== 'draft') { fail(res, { status: 'This application has already been submitted.' }, 409); return false; }
    if (a.step < minStep) { fail(res, { step: 'Please complete the earlier steps first.' }, 409); return false; }
    return true;
  };

  // ---- create / read / delete ----

  app.post('/api/sell', (req, res) => {
    const a = {
      id: `app_${crypto.randomBytes(6).toString('hex')}`,
      status: 'draft',
      step: 1,
      createdAt: now(),
      updatedAt: now(),
      contact: {},
      identity: {},
      property: {},
      documents: {},
      timeline: [{ at: now(), label: 'Application started' }],
    };
    db.applications.push(a);
    persist();
    res.status(201).json(publicApplication(a));
  });

  app.get('/api/sell/:id', (req, res) => {
    const a = find(req, res);
    if (a) res.json(publicApplication(a));
  });

  app.delete('/api/sell/:id', (req, res) => {
    const a = find(req, res);
    if (!a) return;
    if (a.status !== 'draft') return fail(res, { status: 'Only drafts can be deleted.' }, 409);
    removeApplication(a);
    persist();
    res.json({ ok: true });
  });

  function removeApplication(a) {
    clearTimeout(timers.get(a.id));
    fs.rmSync(path.join(UPLOAD_DIR, a.id), { recursive: true, force: true });
    if (a.propertyId) {
      db.properties = db.properties.filter((p) => p.id !== a.propertyId);
      insights.delete(a.propertyId);
    }
    db.applications = db.applications.filter((x) => x.id !== a.id);
  }

  // ---- step 1: contact + phone OTP ----

  app.post('/api/sell/:id/contact', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 1)) return;
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const phone = String(req.body.phone || '').replace(/[\s-]/g, '').replace(/^\+91/, '');
    const errors = {};
    if (name.length < 2 || name.length > 60) errors.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number.';
    if (Object.keys(errors).length) return fail(res, errors);

    const sameVerifiedPhone = a.contact.phoneVerified && a.contact.phone === phone;
    a.contact = { name, email, phone, phoneVerified: sameVerifiedPhone };
    if (sameVerifiedPhone) {
      touch(a, 2);
      return res.json({ ...publicApplication(a), otpSent: false });
    }
    if (a.otp && Date.now() - a.otp.sentAt < OTP_RESEND_MS && a.otp.phone === phone) {
      return fail(res, { phone: 'Please wait a few seconds before requesting another code.' }, 429);
    }
    // No SMS gateway in this demo: the code is returned so the flow can be completed.
    const code = String(crypto.randomInt(100000, 1000000));
    a.otp = { hash: sha256(code), phone, sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };
    touch(a);
    res.json({ ...publicApplication(a), otpSent: true, demoOtp: code, resendIn: OTP_RESEND_MS / 1000, sentTo: maskPhone(phone) });
  });

  app.post('/api/sell/:id/verify-otp', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 1)) return;
    const code = String(req.body.code || '').trim();
    if (!a.otp) return fail(res, { code: 'Request a verification code first.' });
    if (Date.now() > a.otp.expiresAt) return fail(res, { code: 'This code has expired. Please request a new one.' });
    if (a.otp.attempts >= OTP_MAX_ATTEMPTS) return fail(res, { code: 'Too many attempts. Please request a new code.' }, 429);
    a.otp.attempts += 1;
    const ok = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(sha256(code)), Buffer.from(a.otp.hash));
    if (!ok) {
      touch(a);
      return fail(res, { code: `That code isn't right. ${OTP_MAX_ATTEMPTS - a.otp.attempts} attempts left.` });
    }
    delete a.otp;
    a.contact.phoneVerified = true;
    a.timeline.push({ at: now(), label: 'Phone number verified' });
    db.user.verification.phone = true;
    if (!db.user.phone) db.user.phone = a.contact.phone;
    if (!db.user.email) db.user.email = a.contact.email;
    if (db.user.name === 'Guest') db.user.name = a.contact.name;
    touch(a, 2);
    res.json(publicApplication(a));
  });

  // ---- step 2: identity ----

  app.post('/api/sell/:id/identity', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 2)) return;
    const pan = String(req.body.pan || '').trim().toUpperCase();
    const panName = String(req.body.panName || '').trim();
    const ownership = String(req.body.ownership || '');
    const dob = String(req.body.dob || '');
    const errors = {};
    if (!OWNERSHIP[ownership]) errors.ownership = 'Choose how the property is owned.';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) errors.pan = 'PAN should look like ABCDE1234F.';
    else if (OWNERSHIP[ownership] && pan[3] !== OWNERSHIP[ownership]) {
      errors.pan = ownership === 'Company' ? 'This looks like a personal PAN, not a company PAN.' : 'This PAN does not match the ownership type you selected.';
    }
    if (panName.length < 3 || panName.length > 80) errors.panName = 'Enter the name exactly as printed on the PAN card.';
    const birth = new Date(dob);
    const age = (Date.now() - birth) / (365.25 * 86400000);
    if (ownership !== 'Company' && (Number.isNaN(age) || age < 18 || age > 120)) errors.dob = 'Owners must be at least 18 years old.';
    if (Object.keys(errors).length) return fail(res, errors);

    // Only a masked PAN is stored.
    a.identity = { panMasked: `XXXXXX${pan.slice(6)}`, panName, ownership, dob: ownership === 'Company' ? '' : dob, verifiedAt: now() };
    if (!a.timeline.some((t) => t.label === 'Identity verified')) a.timeline.push({ at: now(), label: 'Identity verified' });
    db.user.verification.identity = true;
    touch(a, 3);
    res.json(publicApplication(a));
  });

  // ---- step 3: property details ----

  function validateProperty(b) {
    const errors = {};
    const city = cityById(b.city);
    const residential = RESIDENTIAL.includes(b.propertyType);
    const int = (v) => (v === '' || v === undefined || v === null ? NaN : Number(v));
    const p = {
      propertyType: b.propertyType,
      city: b.city,
      locality: b.locality,
      project: String(b.project || '').trim(),
      bhk: residential ? int(b.bhk) : null,
      bathrooms: b.propertyType === 'Plot' ? null : int(b.bathrooms),
      areaSqft: int(b.areaSqft),
      price: int(b.price),
      furnishing: b.propertyType === 'Plot' ? null : b.furnishing,
      floor: ['Plot', 'Villa', 'Independent House'].includes(b.propertyType) ? null : int(b.floor),
      totalFloors: b.propertyType === 'Plot' ? null : int(b.totalFloors),
      facing: b.facing,
      status: b.status,
      possession: b.status === 'Under Construction' ? String(b.possession || '').trim() : null,
      ageYears: b.status === 'Ready to Move' && b.propertyType !== 'Plot' ? int(b.ageYears) : null,
      amenities: Array.isArray(b.amenities) ? b.amenities.filter((x) => db.amenities.includes(x)) : [],
      reraId: String(b.reraId || '').trim().toUpperCase(),
      description: String(b.description || '').trim(),
    };
    if (!db.propertyTypes.includes(p.propertyType)) errors.propertyType = 'Choose a property type.';
    if (!city) errors.city = 'Choose a city.';
    else if (!city.localities.includes(p.locality)) errors.locality = 'Choose a locality.';
    if (residential && !(p.bhk >= 1 && p.bhk <= 10)) errors.bhk = 'Choose the number of bedrooms.';
    if (p.bathrooms !== null && !(p.bathrooms >= 0 && p.bathrooms <= 10)) errors.bathrooms = 'Enter bathrooms (0-10).';
    if (!(p.areaSqft >= 100 && p.areaSqft <= 100000)) errors.areaSqft = 'Enter the area in sq ft (100 - 1,00,000).';
    if (!(p.price >= 100000 && p.price <= 5e9)) errors.price = 'Enter an expected price between ₹1 lakh and ₹500 crore.';
    if (p.furnishing !== null && !FURNISHING.includes(p.furnishing)) errors.furnishing = 'Choose the furnishing status.';
    if (p.totalFloors !== null && !(p.totalFloors >= 1 && p.totalFloors <= 120)) errors.totalFloors = 'Enter total floors (1-120).';
    if (p.floor !== null && !(p.floor >= 0 && p.floor <= (p.totalFloors || 120))) errors.floor = 'Floor must be between ground (0) and the total floors.';
    if (!FACING.includes(p.facing)) errors.facing = 'Choose the facing direction.';
    if (!['Ready to Move', 'Under Construction'].includes(p.status)) errors.status = 'Choose the construction status.';
    if (p.status === 'Under Construction' && (p.possession.length < 4 || p.possession.length > 20)) errors.possession = 'Enter the expected possession, e.g. Dec 2027.';
    if (p.ageYears !== null && !(p.ageYears >= 0 && p.ageYears <= 100)) errors.ageYears = 'Enter the property age in years.';
    if (p.project.length > 80) errors.project = 'Keep the project / building name under 80 characters.';
    if (p.reraId && !/^[A-Z0-9/-]{6,40}$/.test(p.reraId)) errors.reraId = 'That does not look like a valid RERA ID.';
    if (p.description.length < 30 || p.description.length > 1500) errors.description = 'Describe the property in 30-1500 characters.';
    return { p, errors };
  }

  app.post('/api/sell/:id/property', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 3)) return;
    const { p, errors } = validateProperty(req.body || {});
    if (Object.keys(errors).length) return fail(res, errors);
    a.property = p;
    touch(a, 4);
    res.json(publicApplication(a));
  });

  app.get('/api/sell-estimate', (req, res) => {
    const { city, locality, propertyType } = req.query;
    const areaSqft = Number(req.query.areaSqft);
    if (!cityById(city) || !db.propertyTypes.includes(propertyType) || !(areaSqft >= 100)) return res.json({ estimate: null });
    const probe = { id: '__probe', city, locality, listingType: 'sale', propertyType, areaSqft, price: 1 };
    const i = priceInsight(probe, db.properties);
    if (!i) return res.json({ estimate: null });
    const result = { estimate: i.estimate, low: i.low, high: i.high, marketPsf: i.marketPsf, confidence: i.confidence };
    const price = Number(req.query.price);
    if (price > 0) result.diffPct = Math.round(((price - i.estimate) / i.estimate) * 100);
    res.json(result);
  });

  // ---- step 4: documents ----

  app.post('/api/sell/:id/documents/:kind', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 4)) return;
    const kind = req.params.kind;
    if (!DOCS[kind]) return fail(res, { file: 'Unknown document type.' });
    const { name, type, data } = req.body || {};
    const spec = FILE_TYPES[type];
    if (!spec) return fail(res, { file: 'Upload a PDF, JPG or PNG file.' });
    const buf = Buffer.from(String(data || ''), 'base64');
    if (!buf.length) return fail(res, { file: 'The file is empty.' });
    if (buf.length > MAX_FILE_BYTES) return fail(res, { file: 'Files must be 5 MB or smaller.' });
    if (!spec.magic.every((byte, i) => buf[i] === byte)) return fail(res, { file: 'The file contents do not match its type.' });

    const dir = path.join(UPLOAD_DIR, a.id);
    fs.mkdirSync(dir, { recursive: true });
    const old = a.documents[kind];
    if (old) fs.rmSync(path.join(dir, old.file), { force: true });
    const file = `${kind}${spec.ext}`;
    fs.writeFileSync(path.join(dir, file), buf);
    a.documents[kind] = { name: String(name || file).slice(0, 120), size: buf.length, type, file, uploadedAt: now() };
    touch(a);
    res.json(publicApplication(a));
  });

  app.delete('/api/sell/:id/documents/:kind', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 4)) return;
    const doc = a.documents[req.params.kind];
    if (doc) fs.rmSync(path.join(UPLOAD_DIR, a.id, doc.file), { force: true });
    delete a.documents[req.params.kind];
    touch(a);
    res.json(publicApplication(a));
  });

  app.post('/api/sell/:id/documents-complete', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 4)) return;
    const missing = Object.entries(DOCS).filter(([k, d]) => d.required && !a.documents[k]);
    if (missing.length) return fail(res, { file: `Please upload: ${missing.map(([, d]) => d.label).join(', ')}.` });
    if (!a.timeline.some((t) => t.label === 'Documents uploaded')) a.timeline.push({ at: now(), label: 'Documents uploaded' });
    touch(a, 5);
    res.json(publicApplication(a));
  });

  // ---- step 5: declarations + fee, then review ----

  app.post('/api/sell/:id/submit', (req, res) => {
    const a = find(req, res);
    if (!a || !requireDraft(a, res, 5)) return;
    const d = req.body?.declarations || {};
    const method = req.body?.method;
    const errors = {};
    if (!(d.owner && d.accurate && d.terms)) errors.declarations = 'Please confirm all three declarations.';
    if (!METHODS[method]) errors.method = 'Choose a payment method.';
    if (Object.keys(errors).length) return fail(res, errors);

    // Demo payment: always succeeds; no payment details are collected.
    const txn = newTransaction({
      type: 'listing_fee',
      description: `Listing verification fee · ${titleFor(a.property)}`,
      amount: LISTING_FEE,
      method: `${METHODS[method]} (demo)`,
      applicationId: a.id,
    });
    db.transactions.push(txn);
    a.payment = { transactionId: txn.id, ref: txn.ref, amount: LISTING_FEE };
    a.status = 'in_review';
    a.submittedAt = now();
    a.timeline.push({ at: now(), label: `Verification fee paid (${txn.ref})` }, { at: now(), label: 'Submitted for review' });
    touch(a);
    scheduleReview(a);
    res.json({ ...publicApplication(a), transaction: txn });
  });

  function titleFor(p) {
    return p.bhk ? `${p.bhk} BHK ${p.propertyType} in ${p.locality}` : `${p.propertyType} in ${p.locality}`;
  }

  function scheduleReview(a) {
    const wait = Math.max(0, new Date(a.submittedAt).getTime() + REVIEW_MS - Date.now());
    timers.set(a.id, setTimeout(() => approve(a.id), wait));
  }

  function approve(id) {
    const a = db.applications.find((x) => x.id === id);
    if (!a || a.status !== 'in_review') return;
    const p = a.property;
    const city = cityById(p.city);
    const [lat, lng] = city.localityCoords[p.locality];
    const jitter = () => (Math.random() - 0.5) * 0.012;
    const nextId = `p${Math.max(...db.properties.map((x) => Number(x.id.slice(1)) || 0)) + 1}`;
    const property = {
      id: nextId,
      lat: Number((lat + jitter()).toFixed(5)),
      lng: Number((lng + jitter()).toFixed(5)),
      title: titleFor(p),
      project: p.project || null,
      listingType: 'sale',
      propertyType: p.propertyType,
      bhk: p.bhk,
      bathrooms: p.bathrooms,
      balconies: null,
      areaSqft: p.areaSqft,
      price: p.price,
      deposit: null,
      pricePerSqft: Math.round(p.price / p.areaSqft),
      city: p.city,
      locality: p.locality,
      address: `${p.project ? `${p.project}, ` : ''}${p.locality}, ${city.name}`,
      furnishing: p.furnishing,
      floor: p.floor,
      totalFloors: p.totalFloors,
      facing: p.facing,
      status: p.status,
      possession: p.possession,
      ageYears: p.ageYears,
      amenities: p.amenities,
      reraId: p.reraId || null,
      postedOn: now(),
      verified: true,
      featured: false,
      views: 0,
      agentId: null,
      ownerListing: true,
      owner: { name: a.contact.name, phone: a.contact.phone },
      imageSeed: crypto.randomInt(0, 8),
      description: p.description,
    };
    db.properties.push(property);
    insights.set(property.id, priceInsight(property, db.properties));
    a.status = 'live';
    a.propertyId = property.id;
    a.liveAt = now();
    a.timeline.push({ at: now(), label: 'Documents verified' }, { at: now(), label: 'Listing is live' });
    persist();
  }

  // Resume reviews interrupted by a restart.
  for (const a of db.applications) if (a.status === 'in_review') scheduleReview(a);

  // ---- owner dashboard ----

  app.get('/api/me/listings', (req, res) => {
    const items = [...db.applications]
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
      .map((a) => {
        const property = a.propertyId && db.properties.find((p) => p.id === a.propertyId);
        return { ...publicApplication(a), title: a.property?.locality ? titleFor(a.property) : null, listing: property ? { id: property.id, views: property.views, featured: property.featured, featuredUntil: property.featuredUntil, insight: insights.get(property.id) } : null };
      });
    res.json({ items, reviewSeconds: REVIEW_MS / 1000 });
  });

  app.post('/api/me/listings/:id/boost', (req, res) => {
    const a = find(req, res);
    if (!a) return;
    const method = req.body?.method;
    if (a.status !== 'live') return fail(res, { status: 'Only live listings can be featured.' }, 409);
    if (!METHODS[method]) return fail(res, { method: 'Choose a payment method.' });
    const property = db.properties.find((p) => p.id === a.propertyId);
    if (property.featured && new Date(property.featuredUntil) > new Date()) return fail(res, { status: 'This listing is already featured.' }, 409);
    const txn = newTransaction({ type: 'boost', description: `Featured listing · 7 days · ${property.title}`, amount: BOOST_FEE, method: `${METHODS[method]} (demo)`, applicationId: a.id, propertyId: property.id });
    db.transactions.push(txn);
    property.featured = true;
    property.featuredUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    a.timeline.push({ at: now(), label: `Featured for 7 days (${txn.ref})` });
    touch(a);
    res.json({ ok: true, transaction: txn });
  });

  return { removeApplication, publicApplication, DOCS, LISTING_FEE };
}

module.exports = { registerSell, publicApplication, DOCS, LISTING_FEE, BOOST_FEE };
