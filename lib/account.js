// The signed-in user (single demo account), their settings and transactions.

const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  notifications: { newMatches: true, priceDrops: true, agentReplies: true, listingUpdates: true, receipts: true, newsletter: false },
  channels: { email: true, sms: true, whatsapp: false, push: true },
  theme: 'system',
  textSize: 'medium',
  priceFormat: 'short',
  defaultCity: '',
  defaultMode: 'ai',
  reduceMotion: false,
  privacy: { showPhoneToAgents: true, personalised: true, profileVisible: true },
  payments: { upiIds: [], defaultMethod: 'upi' },
};

const ENUMS = {
  theme: ['system', 'light', 'dark'],
  textSize: ['small', 'medium', 'large'],
  priceFormat: ['short', 'full'],
  defaultMode: ['ai', 'sale', 'rent', 'agents'],
  defaultMethod: ['upi', 'netbanking', 'card'],
};
const ROLES = ['Buyer', 'Tenant', 'Owner', 'Investor', 'Agent'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const UPI_RE = /^[\w.-]{2,64}@[a-zA-Z]{2,32}$/;

function defaultUser() {
  return {
    id: 'u1',
    name: 'Guest',
    email: '',
    phone: '',
    city: '',
    role: 'Buyer',
    about: '',
    createdAt: new Date().toISOString(),
    verification: { phone: false, identity: false },
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

function txnRef(date = new Date()) {
  const d = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `GB${d}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function newTransaction(fields) {
  const createdAt = fields.createdAt || new Date().toISOString();
  return {
    id: `t${crypto.randomBytes(5).toString('hex')}`,
    ref: txnRef(new Date(createdAt)),
    direction: 'debit',
    status: 'success',
    method: 'UPI',
    sample: false,
    ...fields,
    createdAt,
  };
}

/** Example history so the Transactions page isn't empty on a fresh install (marked as samples). */
function sampleTransactions() {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  return [
    newTransaction({ type: 'listing_fee', description: 'Listing verification fee · 2 BHK Apartment in Baner', amount: 499, method: 'UPI · ananya@okhdfc', createdAt: daysAgo(64), sample: true }),
    newTransaction({ type: 'boost', description: 'Featured listing · 7 days · 2 BHK Apartment in Baner', amount: 999, method: 'Net banking · HDFC Bank', createdAt: daysAgo(60), sample: true }),
    newTransaction({ type: 'visit_deposit', description: 'Site visit booking deposit · 3 BHK Villa in Kokapet', amount: 2000, method: 'Card · Visa ••4242', createdAt: daysAgo(41), sample: true }),
    newTransaction({ type: 'refund', description: 'Refund · Site visit booking deposit', amount: 2000, direction: 'credit', method: 'Card · Visa ••4242', createdAt: daysAgo(38), sample: true }),
    newTransaction({ type: 'listing_fee', description: 'Listing verification fee · Plot in Sector 150', amount: 499, status: 'failed', method: 'UPI · ananya@okhdfc', createdAt: daysAgo(12), sample: true }),
  ];
}

/** Applies only known settings keys with the right types; returns an error message or null. */
function mergeSettings(target, patch, defaults, cityIds, path = '') {
  for (const [key, value] of Object.entries(patch || {})) {
    if (!(key in defaults)) return `Unknown setting: ${path}${key}`;
    const def = defaults[key];
    if (key === 'upiIds') {
      if (!Array.isArray(value) || value.length > 5 || !value.every((v) => typeof v === 'string' && UPI_RE.test(v))) {
        return 'UPI IDs must look like name@bank (max 5).';
      }
      target[key] = [...new Set(value)];
    } else if (key === 'defaultCity') {
      if (value !== '' && !cityIds.includes(value)) return 'Unknown city.';
      target[key] = value;
    } else if (typeof def === 'boolean') {
      if (typeof value !== 'boolean') return `${path}${key} must be on or off.`;
      target[key] = value;
    } else if (typeof def === 'string') {
      if (!ENUMS[key]?.includes(value)) return `Invalid value for ${path}${key}.`;
      target[key] = value;
    } else if (def && typeof def === 'object') {
      if (typeof value !== 'object' || value === null) return `${path}${key} must be an object.`;
      target[key] = target[key] || structuredClone(def);
      const err = mergeSettings(target[key], value, def, cityIds, `${path}${key}.`);
      if (err) return err;
    }
  }
  return null;
}

function registerAccount(app, { db, persist, cityIds, removeApplication, publicApplication }) {
  if (!db.user) db.user = defaultUser();
  if (!db.applications) db.applications = [];
  if (!db.transactions) db.transactions = sampleTransactions();
  // Pick up settings added in newer versions.
  db.user.settings = { ...structuredClone(DEFAULT_SETTINGS), ...db.user.settings };

  const me = () => ({
    ...db.user,
    stats: {
      listings: db.applications.length,
      live: db.applications.filter((a) => a.status === 'live').length,
      transactions: db.transactions.length,
      enquiries: db.enquiries.length,
    },
  });

  app.get('/api/me', (req, res) => res.json(me()));

  app.patch('/api/me', (req, res) => {
    const b = req.body || {};
    const errors = {};
    const next = structuredClone(db.user);
    if ('name' in b) {
      const name = String(b.name).trim();
      if (name.length < 2 || name.length > 60) errors.name = 'Name should be 2-60 characters.';
      else next.name = name;
    }
    if ('email' in b) {
      const email = String(b.email).trim();
      if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
      else next.email = email;
    }
    if ('phone' in b) {
      const phone = String(b.phone).replace(/[\s-]/g, '').replace(/^\+91/, '');
      if (phone && !PHONE_RE.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number.';
      else {
        if (phone !== next.phone) next.verification.phone = false;
        next.phone = phone;
      }
    }
    if ('city' in b) {
      if (b.city !== '' && !cityIds.includes(b.city)) errors.city = 'Unknown city.';
      else next.city = b.city;
    }
    if ('role' in b) {
      if (!ROLES.includes(b.role)) errors.role = 'Pick one of the options.';
      else next.role = b.role;
    }
    if ('about' in b) {
      const about = String(b.about).trim();
      if (about.length > 280) errors.about = 'Keep it under 280 characters.';
      else next.about = about;
    }
    if ('settings' in b) {
      const err = mergeSettings(next.settings, b.settings, DEFAULT_SETTINGS, cityIds);
      if (err) errors.settings = err;
    }
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });
    db.user = next;
    persist();
    res.json(me());
  });

  app.get('/api/me/transactions', (req, res) => {
    const { type, status, q } = req.query;
    let items = [...db.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (type === 'payments') items = items.filter((t) => t.direction === 'debit');
    if (type === 'refunds') items = items.filter((t) => t.direction === 'credit');
    if (status) items = items.filter((t) => t.status === status);
    if (q) {
      const term = String(q).toLowerCase();
      items = items.filter((t) => [t.description, t.ref, t.method].some((f) => f.toLowerCase().includes(term)));
    }
    const ok = db.transactions.filter((t) => t.status === 'success');
    res.json({
      items,
      summary: {
        paid: ok.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0),
        refunded: ok.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0),
        pending: db.transactions.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0),
        count: db.transactions.length,
      },
    });
  });

  app.get('/api/me/transactions/:id', (req, res) => {
    const t = db.transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction not found' });
    res.json(t);
  });

  app.get('/api/me/export', (req, res) => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: db.user,
      listings: db.applications.map(publicApplication),
      transactions: db.transactions,
      enquiries: db.enquiries,
    };
    res.setHeader('Content-Disposition', 'attachment; filename="eleve-my-data.json"');
    res.json(data);
  });

  app.post('/api/me/delete', (req, res) => {
    if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.' });
    for (const a of [...db.applications]) removeApplication(a);
    db.applications = [];
    db.transactions = [];
    db.enquiries = [];
    db.user = defaultUser();
    persist();
    res.json(me());
  });
}

module.exports = { registerAccount, newTransaction, defaultUser, sampleTransactions, DEFAULT_SETTINGS };
