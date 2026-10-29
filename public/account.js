'use strict';
// Account area: menu drawer, "Sell your property" wizard, My listings, Transactions and Settings.
// Loaded after app.js and uses its helpers (api, icon, esc, sheet, views, ...).

Object.assign(ICONS, {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 003.4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  out: '<path d="M7 17L17 7M9 7h8v8"/>',
  in: '<path d="M17 7L7 17M15 17H7V9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
});

const STATUS_TAG = {
  draft: ['tag', 'Draft'],
  in_review: ['tag tag-high', 'Under review'],
  live: ['tag tag-verified', 'Live'],
};
const TXN_STATUS = { success: ['tag-verified', 'Successful'], pending: ['tag-high', 'Pending'], failed: ['tag-overpriced', 'Failed'] };
const formatDateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const rupees = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function updateMenuButton() {
  const el = document.getElementById('menu-avatar');
  const tmp = document.createElement('div');
  tmp.innerHTML = avatar(ME.name || 'Guest', 'xs');
  el.replaceWith(Object.assign(tmp.firstElementChild, { id: 'menu-avatar' }));
}

async function saveMe(patch, { quiet = false } = {}) {
  ME = await api('/me', { method: 'PATCH', body: patch });
  applyPrefs();
  updateMenuButton();
  if (!quiet) toast('Saved');
  return ME;
}

const switchRow = (name, checked, label, desc = '') => `
  <label class="switch-row">
    <span><b>${label}</b>${desc ? `<span class="muted small">${desc}</span>` : ''}</span>
    <input type="checkbox" role="switch" class="switch" name="${name}" ${checked ? 'checked' : ''} />
  </label>`;

// ---------- menu drawer (☰) ----------

const SETTINGS_TABS = [
  ['profile', 'user', 'Profile'],
  ['security', 'shield', 'Account & verification'],
  ['notifications', 'bell', 'Notifications'],
  ['preferences', 'sun', 'Preferences'],
  ['privacy', 'lock', 'Privacy & data'],
  ['payments', 'card', 'Payment methods'],
  ['help', 'help', 'Help & support'],
  ['about', 'info', 'About'],
];

function openMenu() {
  const item = (href, ic, label, extra = '') => `<a class="menu-item" href="${href}">${icon(ic)}<span>${label}</span>${extra}${icon('chevron', 16)}</a>`;
  const count = (n) => (n ? `<span class="menu-count">${n}</span>` : '');
  const theme = prefs().theme;
  sheet.open(`${sheetHead('Menu')}
    <div class="sheet-body menu-body">
      <a class="menu-user" href="#/settings?tab=profile">
        ${avatar(ME.name || 'Guest')}
        <div><b>${esc(ME.name)}</b><div class="muted small">${ME.email ? esc(ME.email) : 'Complete your profile'}</div></div>
        ${icon('chevron', 16)}
      </a>
      <a class="btn btn-primary btn-lg btn-block" href="#/sell">${icon('home')} Sell your property</a>
      <div class="menu-group"><h4>Explore</h4>
        ${item('#/properties?listingType=sale', 'search', 'Buy a home')}
        ${item('#/properties?listingType=rent', 'pin', 'Rent a home')}
        ${item('#/agents', 'user', 'Find an agent')}
        ${item('#/shortlist', 'heart', 'Saved homes', count(shortlist.get().length))}
      </div>
      <div class="menu-group"><h4>Your activity</h4>
        ${item('#/my-listings', 'file', 'My listings', count(ME.stats.listings))}
        ${item('#/transactions', 'receipt', 'Transactions', count(ME.stats.transactions))}
      </div>
      <div class="menu-group"><h4>Settings</h4>
        ${SETTINGS_TABS.slice(0, 6).map(([t, ic, label]) => item(`#/settings?tab=${t}`, ic, label)).join('')}
      </div>
      <div class="menu-group"><h4>Support</h4>
        ${SETTINGS_TABS.slice(6).map(([t, ic, label]) => item(`#/settings?tab=${t}`, ic, label)).join('')}
      </div>
      <div class="menu-group"><h4>Appearance</h4>
        <div class="segmented segmented-block" id="menu-theme">
          ${[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([v, l]) => `<button data-v="${v}" class="${theme === v ? 'active' : ''}">${l}</button>`).join('')}
        </div>
      </div>
    </div>`);
  // Links to the current page don't trigger a route change, so close explicitly.
  sheet.el.querySelectorAll('.menu-body a').forEach((a) => a.addEventListener('click', () => sheet.close()));
  sheet.el.querySelector('#menu-theme').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    sheet.el.querySelectorAll('#menu-theme button').forEach((x) => x.classList.toggle('active', x === b));
    await saveMe({ settings: { theme: b.dataset.v } }, { quiet: true });
  });
}

// ---------- payment method picker (demo payments) ----------

const PAY_METHODS = [
  ['upi', 'UPI', 'Google Pay, PhonePe, Paytm or any UPI app'],
  ['netbanking', 'Net banking', 'All major Indian banks'],
  ['card', 'Debit / credit card', 'Visa, Mastercard, RuPay'],
];

const payMethods = (selected = prefs().payments?.defaultMethod || 'upi') => `
  <div class="pay-methods" role="radiogroup" aria-label="Payment method">
    ${PAY_METHODS.map(([v, l, d]) => `
      <label class="pay-method">
        <input type="radio" name="method" value="${v}" ${v === selected ? 'checked' : ''} />
        <span><b>${l}</b><span class="muted small">${d}</span></span>
      </label>`).join('')}
  </div>
  <p class="demo-note">${icon('info', 16)} Demo payment: no money is charged and no payment details are collected.</p>`;

// ---------- Sell your property ----------

const STEPS = [
  null,
  ['Verify your phone number', 'We\'ll send a one-time code so buyers know they\'re talking to a real owner.'],
  ['Confirm your identity', 'Only verified owners can list on Elevé. This keeps buyers safe.'],
  ['Tell us about your property', 'Accurate details help your listing reach the right buyers.'],
  ['Upload ownership documents', 'Our team checks these privately. They are never shown on your listing.'],
  ['Review and submit', 'Check your details and confirm to send your listing for verification.'],
];

views.sell = {
  destroy() {
    clearInterval(this.poll);
    clearInterval(this.countdown);
  },

  update(query) {
    this.destroy();
    return this.render(query);
  },

  async render(query) {
    document.title = 'Sell your property · Elevé';
    if (!query.app) return this.renderIntro();
    app.innerHTML = `<div class="container narrow section">${loading(1)}</div>`;
    try {
      this.app = await api(`/sell/${encodeURIComponent(query.app)}`);
    } catch {
      app.innerHTML = `<div class="container narrow section">${emptyState('search', 'Application not found', 'It may have been deleted.', '<a class="btn btn-primary" href="#/sell">Start a new listing</a>')}</div>`;
      return;
    }
    if (this.app.status !== 'draft') return this.renderStatus();
    // Earlier steps can be revisited; later ones are never reachable early.
    this.step = Math.min(Math.max(Number(query.step) || this.app.step, 1), this.app.step);
    this.renderStep();
  },

  go(step) {
    location.hash = `#/sell${qs({ app: this.app.id, step })}`;
  },

  async renderIntro() {
    const { items } = await api('/me/listings');
    const drafts = items.filter((a) => a.status === 'draft');
    app.innerHTML = `
      <div class="container narrow">
        <section class="sell-hero">
          <span class="eyebrow">${icon('shield', 16)} Verified sellers only</span>
          <h1>Sell your property, the safe way</h1>
          <p class="lead muted">List for free in about 5 minutes. Every seller is verified, so serious buyers trust your listing from day one.</p>
          <div class="sell-benefits">
            <div>${icon('eye', 22)}<b>Reach serious buyers</b><span class="muted small">Thousands of verified home-seekers browse every day.</span></div>
            <div>${icon('chart', 22)}<b>Price it right</b><span class="muted small">See a fair-price estimate from similar homes nearby.</span></div>
            <div>${icon('lock', 22)}<b>Stay private</b><span class="muted small">Your phone number is only shared with people who enquire.</span></div>
          </div>
          <button class="btn btn-primary btn-lg" id="start-sell">Start listing ${icon('arrow', 18)}</button>
          <p class="muted small" style="margin-top:12px">Keep your ownership papers handy. You can save and come back any time.</p>
        </section>
        ${drafts.length ? `<section class="section"><h2>Continue where you left off</h2>
          <div class="stack-list">${drafts.map((d) => `
            <a class="list-row" href="#/sell${qs({ app: d.id })}">
              <span class="row-icon">${icon('file')}</span>
              <span class="grow"><b>${esc(d.title || 'New listing')}</b><span class="muted small">Step ${d.step} of ${d.totalSteps} · updated ${timeAgo(d.updatedAt)}</span></span>
              <span class="mini-progress"><i style="width:${(d.step / d.totalSteps) * 100}%"></i></span>
              ${icon('chevron', 16)}
            </a>`).join('')}</div></section>` : ''}
      </div>`;
    document.getElementById('start-sell').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const a = await api('/sell', { method: 'POST' });
      location.hash = `#/sell${qs({ app: a.id })}`;
    });
  },

  renderStep() {
    const n = this.step;
    const [title, subtitle] = STEPS[n];
    app.innerHTML = `
      <div class="container narrow wizard">
        <div class="wizard-top">
          <a class="btn btn-ghost" href="#/my-listings">${icon('x', 16)} Save & exit</a>
          <span class="muted small">Step ${n} of ${this.app.totalSteps}</span>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${this.app.totalSteps}" aria-valuenow="${n}" aria-label="Step ${n} of ${this.app.totalSteps}"><i style="width:${(n / this.app.totalSteps) * 100}%"></i></div>
        <header class="wizard-head"><h1>${title}</h1><p class="muted">${subtitle}</p></header>
        <div class="step-card" id="step-body"></div>
        <div class="wizard-foot">
          ${n > 1 ? `<button class="btn btn-ghost" id="step-back">${icon('back', 16)} Back</button>` : '<span></span>'}
          <span class="muted small">${icon('lock', 14)} Your details are only used to verify this listing.</span>
        </div>
      </div>`;
    document.getElementById('step-back')?.addEventListener('click', () => this.go(n - 1));
    const body = document.getElementById('step-body');
    ({ 1: this.stepContact, 2: this.stepIdentity, 3: this.stepProperty, 4: this.stepDocuments, 5: this.stepReview })[n].call(this, body);
    window.scrollTo({ top: 0 });
  },

  /** Submits a step form; on validation errors shows them inline. */
  async submit(form, url, body, onSuccess) {
    const btn = form.querySelector('[type=submit]');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Checking…';
    form.querySelectorAll('.field-error').forEach((e) => e.remove());
    try {
      const res = await api(url, { method: 'POST', body });
      this.app = res;
      ME = await api('/me'); // verification status and counts may have changed
      updateMenuButton();
      await onSuccess(res);
    } catch (err) {
      showFieldErrors(form, Object.keys(err.errors || {}).length ? err.errors : { _: err.message });
      form.querySelector('.field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  },

  stepContact(body) {
    const c = this.app.contact || {};
    const val = (k) => esc(c[k] || ME[k] || '');
    body.innerHTML = `
      <form id="contact-form" novalidate>
        <div class="field"><label for="c-name">Full name</label><input id="c-name" name="name" autocomplete="name" value="${val('name') === 'Guest' ? '' : val('name')}" /></div>
        <div class="form-2">
          <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" autocomplete="email" value="${val('email')}" /></div>
          <div class="field"><label for="c-phone">Mobile number</label>
            <div class="prefix-input"><span>+91</span><input id="c-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="${val('phone')}" /></div>
            ${c.phoneVerified ? `<div class="ok-note">${icon('check', 14)} Verified</div>` : ''}
          </div>
        </div>
        <button class="btn btn-primary btn-lg" type="submit">${c.phoneVerified ? 'Continue' : 'Send verification code'}</button>
      </form>
      <form id="otp-form" class="otp-box hidden" novalidate></form>`;
    const form = body.querySelector('#contact-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      this.submit(form, `/sell/${this.app.id}/contact`, data, (res) => {
        if (!res.otpSent) return this.go(2);
        this.showOtp(body, res);
      });
    });
  },

  showOtp(body, res) {
    const box = body.querySelector('#otp-form');
    box.classList.remove('hidden');
    box.innerHTML = `
      <h3>Enter the 6-digit code</h3>
      <p class="muted small">Sent to +91 ${esc(res.sentTo)}. The code expires in 5 minutes.</p>
      <p class="demo-note">${icon('info', 16)} Demo mode: no SMS is sent. Your code is <b>${esc(res.demoOtp)}</b>.</p>
      <div class="field"><input name="code" class="otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="Verification code" /></div>
      <div class="row wrap between">
        <button class="btn btn-primary btn-lg" type="submit">Verify & continue</button>
        <button type="button" class="btn btn-ghost" id="resend" disabled>Resend code</button>
      </div>`;
    const input = box.querySelector('[name=code]');
    input.focus();
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      if (input.value.length === 6) box.requestSubmit();
    });
    box.onsubmit = (e) => {
      e.preventDefault();
      this.submit(box, `/sell/${this.app.id}/verify-otp`, { code: input.value }, () => {
        toast('Phone number verified');
        this.go(2);
      });
    };
    const resend = box.querySelector('#resend');
    let left = res.resendIn;
    clearInterval(this.countdown);
    const tick = () => {
      resend.textContent = left > 0 ? `Resend in ${left}s` : 'Resend code';
      resend.disabled = left > 0;
      if (left-- <= 0) clearInterval(this.countdown);
    };
    tick();
    this.countdown = setInterval(tick, 1000);
    resend.onclick = () => body.querySelector('#contact-form').requestSubmit();
  },

  stepIdentity(body) {
    const id = this.app.identity || {};
    body.innerHTML = `
      <form id="identity-form" novalidate>
        <div class="field"><label for="i-own">How is the property owned?</label>
          <select id="i-own" name="ownership">
            ${['Individual', 'Joint', 'Company', 'HUF'].map((o) => `<option ${o === (id.ownership || 'Individual') ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="form-2">
          <div class="field"><label for="i-pan">PAN</label><input id="i-pan" name="pan" maxlength="10" autocomplete="off" placeholder="${id.panMasked ? esc(id.panMasked) : 'ABCDE1234F'}" style="text-transform:uppercase;letter-spacing:.08em" /></div>
          <div class="field"><label for="i-name">Name as on PAN</label><input id="i-name" name="panName" value="${esc(id.panName || this.app.contact?.name || '')}" /></div>
        </div>
        <div class="field" id="dob-field"><label for="i-dob">Date of birth</label><input id="i-dob" name="dob" type="date" value="${esc(id.dob || '')}" max="${new Date().toISOString().slice(0, 10)}" /></div>
        <p class="info-note">${icon('lock', 16)} We only keep a masked copy of your PAN (like XXXXXX234F) for verification.</p>
        <button class="btn btn-primary btn-lg" type="submit">Verify & continue</button>
      </form>`;
    const form = body.querySelector('form');
    const sync = () => body.querySelector('#dob-field').classList.toggle('hidden', form.elements.ownership.value === 'Company');
    form.elements.ownership.addEventListener('change', sync);
    form.elements.pan.addEventListener('input', () => { form.elements.pan.value = form.elements.pan.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    sync();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(form, `/sell/${this.app.id}/identity`, Object.fromEntries(new FormData(form)), () => {
        toast('Identity verified');
        this.go(3);
      });
    });
  },

  stepProperty(body) {
    const p = this.app.property || {};
    const opt = (list, sel, ph = '') => `${ph ? `<option value="">${ph}</option>` : ''}${list.map((v) => `<option ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
    body.innerHTML = `
      <form id="property-form" novalidate>
        <h3 class="form-section">Basics</h3>
        <div class="form-2">
          <div class="field"><label>Property type</label><select name="propertyType">${opt(META.propertyTypes, p.propertyType || 'Apartment')}</select></div>
          <div class="field"><label>Building / project name <span class="muted">(optional)</span></label><input name="project" value="${esc(p.project || '')}" maxlength="80" /></div>
          <div class="field"><label>City</label><select name="city"><option value="">Choose city</option>${META.cities.map((c) => `<option value="${c.id}" ${c.id === (p.city || prefs().defaultCity || ME.city) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Locality</label><select name="locality"></select></div>
        </div>

        <h3 class="form-section">Size & layout</h3>
        <div class="form-3">
          <div class="field" data-for="residential"><label>Bedrooms</label><select name="bhk">${opt([1, 2, 3, 4, 5, 6], p.bhk, 'Choose')}</select></div>
          <div class="field" data-for="built"><label>Bathrooms</label><input name="bathrooms" type="number" min="0" max="10" value="${p.bathrooms ?? ''}" /></div>
          <div class="field"><label>Area (sq ft)</label><input name="areaSqft" type="number" min="100" step="10" value="${p.areaSqft || ''}" /></div>
          <div class="field" data-for="floors"><label>Floor <span class="muted">(0 = ground)</span></label><input name="floor" type="number" min="0" value="${p.floor ?? ''}" /></div>
          <div class="field" data-for="built"><label>Total floors</label><input name="totalFloors" type="number" min="1" value="${p.totalFloors ?? ''}" /></div>
          <div class="field"><label>Facing</label><select name="facing">${opt(['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'], p.facing || 'East')}</select></div>
          <div class="field" data-for="built"><label>Furnishing</label><select name="furnishing">${opt(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'], p.furnishing || 'Semi-Furnished')}</select></div>
          <div class="field"><label>Status</label><select name="status">${opt(['Ready to Move', 'Under Construction'], p.status || 'Ready to Move')}</select></div>
          <div class="field" data-for="ready"><label>Age (years)</label><input name="ageYears" type="number" min="0" value="${p.ageYears ?? ''}" /></div>
          <div class="field" data-for="uc"><label>Possession by</label><input name="possession" placeholder="e.g. Dec 2027" value="${esc(p.possession || '')}" /></div>
        </div>

        <h3 class="form-section">Price</h3>
        <div class="field"><label>Expected price (₹)</label><input name="price" type="number" min="100000" step="10000" value="${p.price || ''}" placeholder="e.g. 8500000" />
          <div class="muted small" id="price-words"></div></div>
        <div class="estimate-card" id="estimate">${icon('chart', 18)}<span class="muted small">Enter the type, location and area to see a suggested price.</span></div>

        <h3 class="form-section">Amenities</h3>
        <div class="chips" id="amenity-chips">${META.amenities.map((x) => `<button type="button" class="chip ${(p.amenities || []).includes(x) ? 'active' : ''}" data-amenity="${esc(x)}">${esc(x)}</button>`).join('')}</div>

        <h3 class="form-section">Description</h3>
        <div class="field"><textarea name="description" rows="4" maxlength="1500" placeholder="What makes your home special? Light, views, neighbourhood, recent renovations…">${esc(p.description || '')}</textarea>
          <div class="row between small muted"><button type="button" class="link-btn" id="suggest-desc">${icon('sparkle', 14)} Suggest a description</button><span id="desc-count"></span></div></div>
        <div class="field"><label>RERA ID <span class="muted">(optional, for new projects)</span></label><input name="reraId" value="${esc(p.reraId || '')}" /></div>

        <button class="btn btn-primary btn-lg" type="submit">Save & continue</button>
      </form>`;

    const form = body.querySelector('form');
    const f = form.elements;
    const fillLocalities = () => {
      const city = META.cities.find((c) => c.id === f.city.value);
      f.locality.innerHTML = city ? `<option value="">Choose locality</option>${city.localities.map((l) => `<option ${l === p.locality ? 'selected' : ''}>${esc(l)}</option>`).join('')}` : '<option value="">Choose a city first</option>';
      f.locality.disabled = !city;
    };
    const sync = () => {
      const t = f.propertyType.value;
      const show = {
        residential: ['Apartment', 'Independent House', 'Villa', 'Builder Floor'].includes(t),
        built: t !== 'Plot',
        floors: !['Plot', 'Villa', 'Independent House'].includes(t),
        ready: f.status.value === 'Ready to Move' && t !== 'Plot',
        uc: f.status.value === 'Under Construction',
      };
      form.querySelectorAll('[data-for]').forEach((el) => el.classList.toggle('hidden', !show[el.dataset.for]));
    };
    let estTimer;
    const estimate = () => {
      clearTimeout(estTimer);
      f.price.value && (body.querySelector('#price-words').textContent = Number(f.price.value) >= 100000 ? `= ${formatINR(Number(f.price.value))}` : '');
      estTimer = setTimeout(async () => {
        const box = body.querySelector('#estimate');
        const q = { city: f.city.value, locality: f.locality.value, propertyType: f.propertyType.value, areaSqft: f.areaSqft.value, price: f.price.value };
        if (!q.city || !q.areaSqft) return;
        const e = await api(`/sell-estimate${qs(q)}`);
        if (!e.estimate) {
          box.innerHTML = `${icon('chart', 18)}<span class="muted small">Not enough similar homes nearby to suggest a price yet.</span>`;
          return;
        }
        const verdict = e.diffPct === undefined ? '' : e.diffPct > 15 ? ['tag-overpriced', 'Above market. Buyers may negotiate hard'] : e.diffPct > 5 ? ['tag-high', 'Slightly above market'] : e.diffPct < -10 ? ['tag-great', 'Below market. You may be leaving money on the table'] : ['tag-verified', 'In line with the market'];
        box.innerHTML = `${icon('chart', 18)}<div>
          <div class="small muted">Suggested price for similar homes in ${esc(q.locality || cityName(q.city))}</div>
          <b>${formatINR(e.low)} – ${formatINR(e.high)}</b> <span class="muted small">(~₹${e.marketPsf.toLocaleString('en-IN')}/sq ft · ${e.confidence} confidence)</span>
          ${verdict ? `<div style="margin-top:6px"><span class="tag ${verdict[0]}">${verdict[1]}${e.diffPct ? ` (${e.diffPct > 0 ? '+' : ''}${e.diffPct}%)` : ''}</span></div>` : ''}
        </div>`;
      }, 350);
    };
    const count = () => { body.querySelector('#desc-count').textContent = `${f.description.value.length} / 1500`; };

    fillLocalities();
    sync();
    estimate();
    count();
    f.city.addEventListener('change', () => { p.locality = ''; fillLocalities(); estimate(); });
    f.propertyType.addEventListener('change', () => { sync(); estimate(); });
    f.status.addEventListener('change', sync);
    ['locality', 'areaSqft', 'price'].forEach((n) => f[n].addEventListener('input', estimate));
    f.locality.addEventListener('change', estimate);
    f.description.addEventListener('input', count);
    body.querySelectorAll('[data-amenity]').forEach((c) => c.addEventListener('click', () => c.classList.toggle('active')));
    body.querySelector('#suggest-desc').addEventListener('click', () => {
      const t = f.propertyType.value;
      const bhk = f.bhk.value && !['Plot', 'Office Space', 'Shop'].includes(t) ? `${f.bhk.value} BHK ` : '';
      const am = [...body.querySelectorAll('[data-amenity].active')].map((c) => c.dataset.amenity.toLowerCase());
      const where = f.locality.value ? ` in ${f.locality.value}` : '';
      f.description.value = `Well-maintained ${bhk}${t.toLowerCase()}${where} with ${f.areaSqft.value || 'generous'} sq ft of space${t !== 'Plot' ? `, ${f.facing.value.toLowerCase()}-facing and ${f.furnishing.value.toLowerCase()}` : ''}. `
        + `${f.status.value === 'Ready to Move' ? 'Ready to move in. ' : `Possession expected by ${f.possession.value || 'soon'}. `}`
        + `${am.length ? `Amenities include ${am.slice(0, 5).join(', ')}. ` : ''}Close to schools, hospitals, shopping and public transport.`;
      count();
      toast('Description added. Feel free to personalise it');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.amenities = [...body.querySelectorAll('[data-amenity].active')].map((c) => c.dataset.amenity);
      this.submit(form, `/sell/${this.app.id}/property`, data, () => this.go(4));
    });
  },

  stepDocuments(body) {
    const docs = META.sell.documents;
    const render = () => {
      body.innerHTML = `
        <div class="doc-list">
          ${Object.entries(docs).map(([kind, d]) => {
            const f = this.app.documents[kind];
            return `<div class="doc-tile ${f ? 'done' : ''}" data-kind="${kind}">
              <span class="row-icon">${icon(f ? 'check' : 'file')}</span>
              <span class="grow">
                <b>${esc(d.label)}</b> <span class="tag ${d.required ? 'tag-ai' : ''}">${d.required ? 'Required' : 'Optional'}</span>
                <span class="muted small">${f ? `${esc(f.name)} · ${formatBytes(f.size)}` : 'PDF, JPG or PNG · up to 5 MB'}</span>
              </span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" hidden />
              ${f ? `<button class="btn btn-ghost" data-act="replace">Replace</button><button class="icon-btn" data-act="remove" aria-label="Remove ${esc(d.label)}">${icon('trash', 16)}</button>`
                : `<button class="btn btn-secondary" data-act="upload">${icon('upload', 16)} Upload</button>`}
            </div>`;
          }).join('')}
        </div>
        <p class="info-note">${icon('lock', 16)} Documents are stored privately and only used to verify ownership.</p>
        <form id="docs-form" novalidate><button class="btn btn-primary btn-lg" type="submit">Continue</button></form>`;

      body.querySelectorAll('.doc-tile').forEach((tile) => {
        const kind = tile.dataset.kind;
        const input = tile.querySelector('input[type=file]');
        tile.querySelectorAll('[data-act=upload],[data-act=replace]').forEach((b) => b.addEventListener('click', () => input.click()));
        tile.querySelector('[data-act=remove]')?.addEventListener('click', async () => {
          this.app = await api(`/sell/${this.app.id}/documents/${kind}`, { method: 'DELETE' });
          render();
        });
        tile.addEventListener('dragover', (e) => { e.preventDefault(); tile.classList.add('drag'); });
        tile.addEventListener('dragleave', () => tile.classList.remove('drag'));
        tile.addEventListener('drop', (e) => { e.preventDefault(); tile.classList.remove('drag'); if (e.dataTransfer.files[0]) upload(kind, e.dataTransfer.files[0], tile); });
        input.addEventListener('change', () => input.files[0] && upload(kind, input.files[0], tile));
      });
      body.querySelector('#docs-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this.submit(e.currentTarget, `/sell/${this.app.id}/documents-complete`, {}, () => this.go(5));
      });
    };

    const upload = async (kind, file, tile) => {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return toast('Please choose a PDF, JPG or PNG file');
      if (file.size > 5 * 1024 * 1024) return toast('Files must be 5 MB or smaller');
      tile.querySelector('.muted.small').innerHTML = '<span class="spinner" style="display:inline-block;vertical-align:-3px"></span> Uploading…';
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      try {
        this.app = await api(`/sell/${this.app.id}/documents/${kind}`, { method: 'POST', body: { name: file.name, type: file.type, data } });
        toast('Document uploaded');
      } catch (err) {
        toast(err.message);
      }
      render();
    };
    render();
  },

  stepReview(body) {
    const a = this.app;
    const p = a.property;
    const fee = META.sell.fee;
    const base = Math.round(fee / 1.18);
    const edit = (step) => `<button type="button" class="link-btn" data-edit="${step}">Edit</button>`;
    body.innerHTML = `
      <div class="review-block"><div class="row between"><h3>Contact</h3>${edit(1)}</div>
        <dl class="kv"><dt>Name</dt><dd>${esc(a.contact.name)}</dd><dt>Email</dt><dd>${esc(a.contact.email)}</dd><dt>Mobile</dt><dd>+91 ${esc(a.contact.phone)} <span class="tag tag-verified">${icon('check', 12)} Verified</span></dd></dl></div>
      <div class="review-block"><div class="row between"><h3>Identity</h3>${edit(2)}</div>
        <dl class="kv"><dt>Ownership</dt><dd>${esc(a.identity.ownership)}</dd><dt>PAN</dt><dd>${esc(a.identity.panMasked)} <span class="tag tag-verified">${icon('check', 12)} Verified</span></dd><dt>Name on PAN</dt><dd>${esc(a.identity.panName)}</dd></dl></div>
      <div class="review-block"><div class="row between"><h3>Property</h3>${edit(3)}</div>
        <dl class="kv">
          <dt>Listing</dt><dd>${esc(p.bhk ? `${p.bhk} BHK ` : '')}${esc(p.propertyType)}${p.project ? `, ${esc(p.project)}` : ''}</dd>
          <dt>Location</dt><dd>${esc(p.locality)}, ${esc(cityName(p.city))}</dd>
          <dt>Area</dt><dd>${p.areaSqft.toLocaleString('en-IN')} sq ft</dd>
          <dt>Expected price</dt><dd><b>${formatINR(p.price)}</b></dd>
          <dt>Status</dt><dd>${esc(p.status)}${p.possession ? ` · possession ${esc(p.possession)}` : ''}</dd>
          <dt>Amenities</dt><dd>${p.amenities.length ? esc(p.amenities.join(', ')) : 'None listed'}</dd>
        </dl></div>
      <div class="review-block"><div class="row between"><h3>Documents</h3>${edit(4)}</div>
        <ul class="plain-list">${Object.entries(a.documents).map(([k, d]) => `<li>${icon('file', 16)} ${esc(META.sell.documents[k].label)} <span class="muted small">· ${esc(d.name)}</span></li>`).join('')}</ul></div>

      <form id="submit-form" novalidate>
        <div class="review-block">
          <h3>Declarations</h3>
          <label class="checkbox"><input type="checkbox" name="owner" /> I am the owner of this property, or authorised by the owner to sell it.</label>
          <label class="checkbox"><input type="checkbox" name="accurate" /> The details and documents I have provided are true and accurate.</label>
          <label class="checkbox"><input type="checkbox" name="terms" /> I agree to the listing terms and to Elevé verifying my documents.</label>
          <div class="field" style="margin:0"><input type="hidden" name="declarations" /></div>
        </div>
        <div class="review-block">
          <h3>Verification fee</h3>
          <div class="fee-table">
            <span>Listing verification</span><span>${rupees(base)}</span>
            <span>GST (18%)</span><span>${rupees(fee - base)}</span>
            <b>Total</b><b>${rupees(fee)}</b>
          </div>
          ${payMethods()}
          <div class="field" style="margin:0"><input type="hidden" name="method-error" /></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Pay ${rupees(fee)} & submit</button>
      </form>`;
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => this.go(Number(b.dataset.edit))));
    const form = body.querySelector('#submit-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = form.elements;
      const payload = { declarations: { owner: f.owner.checked, accurate: f.accurate.checked, terms: f.terms.checked }, method: form.querySelector('[name=method]:checked')?.value };
      this.submit(form, `/sell/${a.id}/submit`, payload, () => {
        toast('Payment successful. Your listing is under review');
        this.renderStatus();
      });
    });
  },

  renderStatus() {
    const a = this.app;
    const live = a.status === 'live';
    app.innerHTML = `
      <div class="container narrow section">
        <div class="status-card">
          <div class="status-icon ${live ? 'ok' : 'wait'}">${icon(live ? 'check' : 'clock', 34)}</div>
          <h1>${live ? 'Your listing is live!' : 'We\'re verifying your listing'}</h1>
          <p class="muted lead">${live ? 'Buyers can now find your property. You\'ll be notified when someone enquires.' : 'Our team is checking your documents. This usually takes a few moments in this demo. This page updates automatically.'}</p>
          ${a.payment ? `<p class="small">Payment reference <b>${esc(a.payment.ref)}</b> · ${rupees(a.payment.amount)}</p>` : ''}
          <div class="row wrap" style="justify-content:center;margin-top:20px">
            ${live ? `<a class="btn btn-primary" href="#/property/${a.propertyId}">View listing</a>` : ''}
            <a class="btn btn-secondary" href="#/my-listings">My listings</a>
            <a class="btn btn-secondary" href="#/transactions">${icon('receipt', 16)} Receipt</a>
          </div>
        </div>
        <section class="section"><h2>Progress</h2>${timeline(a.timeline, !live)}</section>
      </div>`;
    if (!live) {
      clearInterval(this.poll);
      this.poll = setInterval(async () => {
        const next = await api(`/sell/${a.id}`);
        if (next.status !== a.status) {
          this.app = next;
          clearInterval(this.poll);
          if (next.status === 'live') toast('Your listing is now live');
          this.renderStatus();
        }
      }, 3000);
    }
  },
};

function timeline(items, pending = false) {
  return `<ol class="timeline">
    ${items.map((t) => `<li><span class="dot">${icon('check', 12)}</span><div><b>${esc(t.label)}</b><span class="muted small">${formatDateTime(t.at)}</span></div></li>`).join('')}
    ${pending ? `<li class="pending"><span class="dot"><span class="spinner" style="width:12px;height:12px"></span></span><div><b>Document verification in progress</b><span class="muted small">Usually a few moments</span></div></li>` : ''}
  </ol>`;
}

// ---------- My listings ----------

views['my-listings'] = {
  destroy() { clearInterval(this.poll); },

  async render() {
    document.title = 'My listings · Elevé';
    app.innerHTML = `<div class="container narrow section">${loading(2)}</div>`;
    const { items } = await api('/me/listings');
    app.innerHTML = `
      <div class="container narrow">
        <div class="page-title">
          <div><h1>My listings</h1><p class="muted">Track verification and performance of the properties you're selling.</p></div>
          <a class="btn btn-primary" href="#/sell">${icon('home', 16)} List a property</a>
        </div>
        ${items.length ? `<div class="stack-list">${items.map(listingCard).join('')}</div>`
          : emptyState('home', 'You haven\'t listed a property yet', 'List your property for free. Verified sellers get more serious enquiries.', '<a class="btn btn-primary" href="#/sell">Start listing</a>')}
      </div>`;

    app.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this draft? This can\'t be undone.')) return;
      await api(`/sell/${b.dataset.delete}`, { method: 'DELETE' });
      ME.stats.listings -= 1;
      toast('Draft deleted');
      this.render();
    }));
    app.querySelectorAll('[data-boost]').forEach((b) => b.addEventListener('click', () => this.openBoost(b.dataset.boost)));

    clearInterval(this.poll);
    if (items.some((a) => a.status === 'in_review')) {
      this.poll = setInterval(async () => {
        const fresh = await api('/me/listings');
        if (!fresh.items.some((a) => a.status === 'in_review')) { clearInterval(this.poll); toast('Your listing is now live'); this.render(); }
      }, 3000);
    }
  },

  openBoost(appId) {
    sheet.open(`${sheetHead('Feature your listing')}
      <form class="sheet-body" id="boost-form">
        <div class="boost-hero">${icon('star', 28)}<div><h3 style="margin:0">Get up to 3× more views</h3><p class="muted small" style="margin:0">Featured listings appear first in search and on the home page for 7 days.</p></div></div>
        <div class="fee-table"><b>7-day feature</b><b>${rupees(META.sell.boostFee)}</b></div>
        ${payMethods()}
        <button class="btn btn-primary btn-lg btn-block" type="submit">Pay ${rupees(META.sell.boostFee)}</button>
      </form>`);
    const form = document.getElementById('boost-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const res = await api(`/me/listings/${appId}/boost`, { method: 'POST', body: { method: form.querySelector('[name=method]:checked').value } });
        ME.stats.transactions += 1;
        sheet.close();
        toast(`Payment successful (${res.transaction.ref}). Your listing is featured`);
        this.render();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    });
  },
};

function listingCard(a) {
  const [cls, label] = STATUS_TAG[a.status];
  const p = a.property || {};
  const featured = a.listing?.featured && new Date(a.listing.featuredUntil) > new Date();
  return `<article class="listing-card">
    <div class="row between wrap">
      <div class="row"><span class="${cls}">${label}</span>${featured ? `<span class="tag tag-ai">${icon('star', 12)} Featured</span>` : ''}</div>
      <span class="muted small">Updated ${timeAgo(a.updatedAt)}</span>
    </div>
    <h3>${esc(a.title || 'New listing')}</h3>
    <p class="muted small" style="margin:0">${p.city ? `${esc(p.locality)}, ${esc(cityName(p.city))}` : 'Details not added yet'}${p.price ? ` · ${formatINR(p.price)}` : ''}</p>
    ${a.status === 'draft' ? `<div class="mini-progress wide"><i style="width:${(a.step / a.totalSteps) * 100}%"></i></div><p class="small muted" style="margin:0">Step ${a.step} of ${a.totalSteps} completed${a.step > 1 ? '' : ' (just started)'}</p>` : ''}
    ${a.status === 'live' && a.listing ? `<div class="listing-stats">
      <span>${icon('eye', 16)} ${a.listing.views} views</span>
      ${a.listing.insight ? `<span>${priceTag(a.listing.insight)}</span>` : ''}
      <span>${icon('clock', 16)} Live ${timeAgo(a.liveAt)}</span></div>` : ''}
    ${a.status === 'in_review' ? `<p class="info-note" style="margin:0">${icon('clock', 16)} Verification in progress. This page updates automatically.</p>` : ''}
    <div class="row wrap">
      ${a.status === 'draft' ? `<a class="btn btn-primary" href="#/sell${qs({ app: a.id })}">Continue</a><button class="btn btn-ghost" data-delete="${a.id}">${icon('trash', 16)} Delete draft</button>` : ''}
      ${a.status === 'live' ? `<a class="btn btn-secondary" href="#/property/${a.listing.id}">View listing</a>${featured ? '' : `<button class="btn btn-primary" data-boost="${a.id}">${icon('star', 16)} Feature for ${rupees(META.sell.boostFee)}</button>`}` : ''}
      ${a.status !== 'draft' ? `<a class="btn btn-ghost" href="#/sell${qs({ app: a.id })}">Progress</a>` : ''}
    </div>
  </article>`;
}

// ---------- Transactions ----------

views.transactions = {
  async render(query) {
    document.title = 'Transactions · Elevé';
    app.innerHTML = `
      <div class="container narrow">
        <div class="page-title">
          <div><h1>Transactions</h1><p class="muted">Payments, refunds and receipts for your Elevé account.</p></div>
          <button class="btn btn-secondary" id="export-csv">${icon('download', 16)} Export CSV</button>
        </div>
        <div class="summary-grid" id="txn-summary">${loading(1)}</div>
        <div class="txn-toolbar">
          <div class="segmented" id="txn-type">${[['', 'All'], ['payments', 'Payments'], ['refunds', 'Refunds']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
          <select class="pill-select" id="txn-status" aria-label="Status"><option value="">Any status</option><option value="success">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
          <div class="input-icon grow">${icon('search')}<input id="txn-q" placeholder="Search description or reference" aria-label="Search transactions" /></div>
        </div>
        <div id="txn-list"></div>
      </div>`;
    const push = (patch) => { location.hash = `#/transactions${qs({ ...this.query, ...patch })}`; };
    document.getElementById('txn-type').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) push({ type: b.dataset.v }); });
    document.getElementById('txn-status').addEventListener('change', (e) => push({ status: e.target.value }));
    let t;
    document.getElementById('txn-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => push({ q: e.target.value.trim() }), 300); });
    document.getElementById('export-csv').addEventListener('click', () => this.exportCsv());
    document.getElementById('txn-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-txn]');
      if (row) this.openReceipt(this.items.find((x) => x.id === row.dataset.txn));
    });
    await this.update(query);
  },

  async update(query) {
    this.query = query;
    document.querySelectorAll('#txn-type button').forEach((b) => b.classList.toggle('active', b.dataset.v === (query.type || '')));
    document.getElementById('txn-status').value = query.status || '';
    const q = document.getElementById('txn-q');
    if (document.activeElement !== q) q.value = query.q || '';

    const { items, summary } = await api(`/me/transactions${qs(query)}`);
    this.items = items;
    document.getElementById('txn-summary').innerHTML = `
      <div class="summary-card"><span class="muted small">Total paid</span><b>${rupees(summary.paid)}</b></div>
      <div class="summary-card"><span class="muted small">Refunds received</span><b class="pos">${rupees(summary.refunded)}</b></div>
      <div class="summary-card"><span class="muted small">Pending</span><b>${rupees(summary.pending)}</b></div>
      <div class="summary-card"><span class="muted small">Transactions</span><b>${summary.count}</b></div>`;

    const list = document.getElementById('txn-list');
    if (!items.length) {
      list.innerHTML = emptyState('receipt', 'No transactions found', query.q || query.status || query.type ? 'Try clearing the filters.' : 'Payments you make on Elevé will show up here.');
      return;
    }
    const groups = new Map();
    for (const t of items) {
      const key = new Date(t.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    list.innerHTML = [...groups].map(([month, txns]) => `
      <h3 class="month-head">${month}</h3>
      <div class="txn-group">${txns.map((t) => {
        const [cls, label] = TXN_STATUS[t.status];
        const credit = t.direction === 'credit';
        return `<button class="txn-row" data-txn="${t.id}">
          <span class="txn-icon ${credit ? 'credit' : ''} ${t.status === 'failed' ? 'failed' : ''}">${icon(credit ? 'in' : 'out', 18)}</span>
          <span class="grow txn-text"><b>${esc(t.description)}</b><span class="muted small">${formatDateTime(t.createdAt)} · ${esc(t.method)}${t.sample ? ' · <span class="tag">Sample</span>' : ''}</span></span>
          <span class="txn-amount"><b class="${credit ? 'pos' : ''} ${t.status === 'failed' ? 'strike' : ''}">${credit ? '+' : '−'}${rupees(t.amount)}</b><span class="tag ${cls}">${label}</span></span>
        </button>`;
      }).join('')}</div>`).join('');
  },

  receiptHtml(t) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${t.ref}</title>
      <style>body{font-family:Inter,Arial,sans-serif;color:#0f1f2e;max-width:560px;margin:40px auto;padding:0 20px}h1{font-size:22px}table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid #e5e9ee}td:last-child{text-align:right;font-weight:600}.muted{color:#64748b}</style></head>
      <body><h1>Elevé · Payment receipt</h1><p class="muted">This is a demo receipt. No money was charged.</p>
      <table>
        <tr><td>Reference</td><td>${esc(t.ref)}</td></tr>
        <tr><td>Date</td><td>${formatDateTime(t.createdAt)}</td></tr>
        <tr><td>Description</td><td>${esc(t.description)}</td></tr>
        <tr><td>Method</td><td>${esc(t.method)}</td></tr>
        <tr><td>Status</td><td>${TXN_STATUS[t.status][1]}</td></tr>
        <tr><td>Amount</td><td>${t.direction === 'credit' ? '+' : ''}${rupees(t.amount)}</td></tr>
      </table></body></html>`;
  },

  openReceipt(t) {
    const [cls, label] = TXN_STATUS[t.status];
    const credit = t.direction === 'credit';
    sheet.open(`${sheetHead('Transaction details')}
      <div class="sheet-body">
        <div class="receipt-top">
          <span class="txn-icon big ${credit ? 'credit' : ''} ${t.status === 'failed' ? 'failed' : ''}">${icon(credit ? 'in' : 'out', 26)}</span>
          <div class="receipt-amount ${credit ? 'pos' : ''}">${credit ? '+' : '−'}${rupees(t.amount)}</div>
          <span class="tag ${cls}">${label}</span>
          <p class="muted" style="margin:10px 0 0">${esc(t.description)}</p>
        </div>
        <dl class="kv">
          <dt>Reference</dt><dd>${esc(t.ref)}</dd>
          <dt>Date & time</dt><dd>${formatDateTime(t.createdAt)}</dd>
          <dt>Payment method</dt><dd>${esc(t.method)}</dd>
          <dt>Type</dt><dd>${credit ? 'Refund / credit' : 'Payment'}</dd>
          ${t.propertyId ? `<dt>Listing</dt><dd><a class="link" href="#/property/${t.propertyId}">View listing</a></dd>` : ''}
        </dl>
        ${t.sample ? `<p class="info-note">${icon('info', 16)} This is a sample transaction included with the demo.</p>` : ''}
        ${t.status === 'failed' ? `<p class="info-note">${icon('alert', 16)} This payment failed and no money was deducted.</p>` : ''}
        <div class="row">
          <button class="btn btn-primary" style="flex:1" id="dl-receipt">${icon('download', 16)} Download receipt</button>
          <button class="btn btn-secondary" id="copy-ref">Copy reference</button>
        </div>
      </div>`);
    document.getElementById('dl-receipt').addEventListener('click', () => download(`receipt-${t.ref}.html`, this.receiptHtml(t), 'text/html'));
    document.getElementById('copy-ref').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(t.ref); toast('Reference copied'); } catch { toast(t.ref); }
    });
  },

  exportCsv() {
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Date', 'Reference', 'Description', 'Method', 'Type', 'Status', 'Amount (INR)'],
      ...this.items.map((t) => [t.createdAt, t.ref, t.description, t.method, t.direction === 'credit' ? 'Credit' : 'Debit', t.status, (t.direction === 'credit' ? 1 : -1) * t.amount])];
    download('eleve-transactions.csv', rows.map((r) => r.map(cell).join(',')).join('\n'), 'text/csv');
  },
};

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Settings ----------

const FAQ = [
  ['How is my listing verified?', 'Every seller verifies their phone number and identity, then uploads ownership documents. Our team checks them before the listing goes live.'],
  ['Do you store my PAN?', 'No. We only keep a masked copy (for example XXXXXX234F) to show that verification was completed.'],
  ['How does Price Check work?', 'We compare the asking price with similar homes in the same city and locality, adjusting for property type, to estimate a fair market range.'],
  ['Who can see my phone number?', 'Your number is only shared with people who send an enquiry. You can also hide it from agents in Privacy & data.'],
  ['Can I get a refund of the listing fee?', 'If your listing can\'t be verified, the verification fee is refunded to your original payment method within 5–7 working days.'],
];

views.settings = {
  render(query) {
    document.title = 'Settings · Elevé';
    app.innerHTML = `
      <div class="container">
        <div class="page-title"><div><h1>Settings</h1><p class="muted">Manage your profile, preferences and privacy.</p></div></div>
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="Settings sections">
            ${SETTINGS_TABS.map(([t, ic, label]) => `<a href="#/settings?tab=${t}" data-tab="${t}">${icon(ic)}<span>${label}</span></a>`).join('')}
          </nav>
          <section class="settings-panel" id="settings-panel"></section>
        </div>
      </div>`;
    this.update(query);
  },

  update(query) {
    const tab = SETTINGS_TABS.some(([t]) => t === query.tab) ? query.tab : 'profile';
    document.querySelectorAll('.settings-nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    // Swap in a fresh panel element so listeners from the previous tab don't pile up.
    const old = document.getElementById('settings-panel');
    const panel = old.cloneNode(false);
    old.replaceWith(panel);
    panel.innerHTML = this[tab]();
    this[`bind_${tab}`]?.(panel);
  },

  /** Autosaves switches/selects whose name is a dotted settings path, e.g. "notifications.priceDrops". */
  bindAutosave(panel) {
    panel.addEventListener('change', async (e) => {
      const el = e.target;
      if (!el.name || !el.closest('[data-autosave]')) return;
      const value = el.type === 'checkbox' ? el.checked : el.value;
      const patch = {};
      el.name.split('.').reduce((obj, key, i, keys) => (obj[key] = i === keys.length - 1 ? value : {}), patch);
      try { await saveMe({ settings: patch }); } catch (err) { toast(err.message); }
    });
  },

  profile() {
    return `
      <div class="panel-head">${avatar(ME.name || 'Guest', 'lg')}<div><h2>${esc(ME.name)}</h2><p class="muted" style="margin:0">Member since ${new Date(ME.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p></div></div>
      <form id="profile-form" novalidate>
        <div class="form-2">
          <div class="field"><label>Full name</label><input name="name" value="${esc(ME.name === 'Guest' ? '' : ME.name)}" autocomplete="name" /></div>
          <div class="field"><label>I am a</label><select name="role">${['Buyer', 'Tenant', 'Owner', 'Investor', 'Agent'].map((r) => `<option ${r === ME.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div class="field"><label>Email</label><input name="email" type="email" value="${esc(ME.email)}" autocomplete="email" /></div>
          <div class="field"><label>Mobile number</label><div class="prefix-input"><span>+91</span><input name="phone" type="tel" maxlength="10" inputmode="numeric" value="${esc(ME.phone)}" /></div></div>
          <div class="field"><label>City</label><select name="city"><option value="">Not set</option>${META.cities.map((c) => `<option value="${c.id}" ${c.id === ME.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>About you <span class="muted">(optional)</span></label><textarea name="about" rows="3" maxlength="280" placeholder="e.g. Looking for a 3 BHK near good schools for my family.">${esc(ME.about)}</textarea></div>
        <button class="btn btn-primary" type="submit">Save changes</button>
      </form>`;
  },
  bind_profile(panel) {
    const form = panel.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await saveMe(Object.fromEntries(new FormData(form)));
        this.update({ tab: 'profile' });
      } catch (err) { showFieldErrors(form, err.errors || { name: err.message }); }
    });
  },

  security() {
    const v = ME.verification;
    const row = (ok, title, desc) => `<div class="verify-row"><span class="row-icon ${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'clock')}</span><span class="grow"><b>${title}</b><span class="muted small">${desc}</span></span><span class="tag ${ok ? 'tag-verified' : ''}">${ok ? 'Verified' : 'Not verified'}</span></div>`;
    return `
      <h2>Account & verification</h2>
      <p class="muted">Verification is completed when you list a property. Verified accounts get a badge on their listings.</p>
      <div class="settings-card">
        ${row(v.phone, 'Mobile number', ME.phone ? `+91 ${esc(ME.phone)}` : 'No number added')}
        ${row(v.identity, 'Identity (PAN)', v.identity ? 'Masked copy stored' : 'Not provided')}
        ${row(Boolean(ME.email), 'Email address', ME.email ? esc(ME.email) : 'No email added')}
      </div>
      ${!(v.phone && v.identity) ? `<a class="btn btn-primary" href="#/sell">${icon('shield', 16)} Get verified by listing a property</a>` : ''}
      <h3 class="form-section">Account activity</h3>
      <div class="settings-card">
        <div class="verify-row"><span class="row-icon">${icon('file')}</span><span class="grow"><b>Listings</b><span class="muted small">${ME.stats.listings} total · ${ME.stats.live} live</span></span><a class="link" href="#/my-listings">Manage</a></div>
        <div class="verify-row"><span class="row-icon">${icon('receipt')}</span><span class="grow"><b>Transactions</b><span class="muted small">${ME.stats.transactions} records</span></span><a class="link" href="#/transactions">View</a></div>
        <div class="verify-row"><span class="row-icon">${icon('mail')}</span><span class="grow"><b>Enquiries sent</b><span class="muted small">${ME.stats.enquiries} messages to agents and owners</span></span></div>
      </div>`;
  },

  notifications() {
    const n = prefs().notifications;
    const c = prefs().channels;
    return `
      <h2>Notifications</h2>
      <p class="muted">Choose what we tell you about and how. Changes save automatically.</p>
      <div class="settings-card" data-autosave>
        <h3>What to notify me about</h3>
        ${switchRow('notifications.newMatches', n.newMatches, 'New matching homes', 'When new listings match your recent searches')}
        ${switchRow('notifications.priceDrops', n.priceDrops, 'Price drops', 'When a saved home gets cheaper')}
        ${switchRow('notifications.agentReplies', n.agentReplies, 'Replies from agents and owners', 'Responses to your enquiries')}
        ${switchRow('notifications.listingUpdates', n.listingUpdates, 'My listing updates', 'Verification status, views and enquiries')}
        ${switchRow('notifications.receipts', n.receipts, 'Payment receipts')}
        ${switchRow('notifications.newsletter', n.newsletter, 'Market insights newsletter', 'A monthly roundup of prices in your city')}
      </div>
      <div class="settings-card" data-autosave>
        <h3>How to reach me</h3>
        ${switchRow('channels.email', c.email, 'Email', ME.email ? esc(ME.email) : 'Add an email in Profile')}
        ${switchRow('channels.sms', c.sms, 'SMS', ME.phone ? `+91 ${esc(ME.phone)}` : 'Add a phone number in Profile')}
        ${switchRow('channels.whatsapp', c.whatsapp, 'WhatsApp')}
        ${switchRow('channels.push', c.push, 'Browser notifications')}
      </div>`;
  },
  bind_notifications(panel) { this.bindAutosave(panel); },

  preferences() {
    const s = prefs();
    const seg = (name, value, opts) => `<div class="segmented segmented-block" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${value === v ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    return `
      <h2>Preferences</h2>
      <p class="muted">Personalise how Elevé looks and works for you.</p>
      <div class="settings-card" data-autosave>
        <div class="pref-row"><span><b>Theme</b><span class="muted small">Match your device or pick one</span></span>${seg('theme', s.theme, [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']])}</div>
        <div class="pref-row"><span><b>Text size</b><span class="muted small">Make text easier to read</span></span>${seg('textSize', s.textSize, [['small', 'A'], ['medium', 'A+'], ['large', 'A++']])}</div>
        <div class="pref-row"><span><b>Price format</b><span class="muted small">How prices are shown</span></span>${seg('priceFormat', s.priceFormat, [['short', '₹1.2 Cr'], ['full', '₹1,20,00,000']])}</div>
        <div class="pref-row"><span><b>Default city</b><span class="muted small">Pre-selected when you search</span></span>
          <select class="pill-select" name="defaultCity"><option value="">None</option>${META.cities.map((c) => `<option value="${c.id}" ${c.id === s.defaultCity ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="pref-row"><span><b>Home search starts with</b><span class="muted small">The tab shown first on the home page</span></span>
          <select class="pill-select" name="defaultMode">${[['ai', 'Describe it'], ['sale', 'Buy'], ['rent', 'Rent'], ['agents', 'Agents']].map(([v, l]) => `<option value="${v}" ${v === s.defaultMode ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${switchRow('reduceMotion', s.reduceMotion, 'Reduce motion', 'Turn off animations and transitions')}
      </div>`;
  },
  bind_preferences(panel) {
    this.bindAutosave(panel);
    panel.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      g.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      await saveMe({ settings: { [g.dataset.seg]: b.dataset.v } });
    }));
  },

  privacy() {
    const p = prefs().privacy;
    return `
      <h2>Privacy & data</h2>
      <p class="muted">Control who sees your details and manage the data we keep.</p>
      <div class="settings-card" data-autosave>
        ${switchRow('privacy.showPhoneToAgents', p.showPhoneToAgents, 'Share my phone number with agents', 'Agents can call you back about your enquiries')}
        ${switchRow('privacy.personalised', p.personalised, 'Personalised recommendations', 'Use my searches and saved homes to suggest listings')}
        ${switchRow('privacy.profileVisible', p.profileVisible, 'Show my name on my listings', 'Otherwise buyers see "Verified owner"')}
      </div>
      <div class="settings-card">
        <h3>Your data</h3>
        <div class="verify-row"><span class="row-icon">${icon('heart')}</span><span class="grow"><b>Saved homes</b><span class="muted small">${shortlist.get().length} homes saved on this device</span></span><button class="btn btn-secondary" id="clear-saved" ${shortlist.get().length ? '' : 'disabled'}>Clear</button></div>
        <div class="verify-row"><span class="row-icon">${icon('download')}</span><span class="grow"><b>Download my data</b><span class="muted small">Profile, listings, transactions and enquiries as JSON</span></span><a class="btn btn-secondary" href="${window.API_BASE}/api/me/export" download>Download</a></div>
      </div>
      <div class="settings-card danger">
        <h3>Delete account</h3>
        <p class="muted small">Permanently removes your profile, listings, uploaded documents, transactions and enquiries. This can't be undone.</p>
        <button class="btn btn-danger" id="delete-account">${icon('trash', 16)} Delete my account</button>
      </div>`;
  },
  bind_privacy(panel) {
    this.bindAutosave(panel);
    panel.querySelector('#clear-saved').addEventListener('click', () => {
      shortlist.set([]);
      toast('Saved homes cleared');
      this.update({ tab: 'privacy' });
    });
    panel.querySelector('#delete-account').addEventListener('click', () => {
      sheet.open(`${sheetHead('Delete account')}
        <form class="sheet-body" id="delete-form">
          <p>This will permanently delete your profile, listings, documents, transactions and enquiries.</p>
          <div class="field"><label>Type <b>DELETE</b> to confirm</label><input name="confirm" autocomplete="off" /></div>
          <button class="btn btn-danger btn-block" type="submit">Delete my account</button>
        </form>`);
      const form = document.getElementById('delete-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          ME = await api('/me/delete', { method: 'POST', body: { confirm: form.elements.confirm.value } });
          shortlist.set([]);
          applyPrefs();
          updateMenuButton();
          sheet.close();
          toast('Your account has been deleted');
          location.hash = '#/';
        } catch (err) { showFieldErrors(form, { confirm: err.message }); }
      });
    });
  },

  payments() {
    const pay = prefs().payments;
    return `
      <h2>Payment methods</h2>
      <p class="muted">Used for listing fees and featured listings. We never store card or bank details.</p>
      <div class="settings-card" data-autosave>
        <h3>Default payment method</h3>
        <div class="pay-methods">${PAY_METHODS.map(([v, l, d]) => `<label class="pay-method"><input type="radio" name="payments.defaultMethod" value="${v}" ${v === pay.defaultMethod ? 'checked' : ''} /><span><b>${l}</b><span class="muted small">${d}</span></span></label>`).join('')}</div>
      </div>
      <div class="settings-card">
        <h3>Saved UPI IDs</h3>
        ${pay.upiIds.length ? pay.upiIds.map((u) => `<div class="verify-row"><span class="row-icon">${icon('card')}</span><span class="grow"><b>${esc(u)}</b></span><button class="icon-btn" data-remove-upi="${esc(u)}" aria-label="Remove ${esc(u)}">${icon('trash', 16)}</button></div>`).join('') : '<p class="muted small">No UPI IDs saved yet.</p>'}
        <form id="upi-form" class="row" novalidate style="margin-top:12px;align-items:flex-start">
          <div class="field grow" style="margin:0"><input name="upi" placeholder="yourname@bank" aria-label="UPI ID" /></div>
          <button class="btn btn-secondary" type="submit">Add</button>
        </form>
      </div>
      <a class="btn btn-ghost" href="#/transactions">${icon('receipt', 16)} View transactions</a>`;
  },
  bind_payments(panel) {
    this.bindAutosave(panel);
    const ids = prefs().payments.upiIds;
    panel.querySelector('#upi-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const v = form.elements.upi.value.trim();
      if (!/^[\w.-]{2,64}@[a-zA-Z]{2,32}$/.test(v)) return showFieldErrors(form, { upi: 'Enter a valid UPI ID, like name@okhdfc.' });
      try {
        await saveMe({ settings: { payments: { upiIds: [...ids, v] } } });
        this.update({ tab: 'payments' });
      } catch (err) { showFieldErrors(form, { upi: err.message }); }
    });
    panel.querySelectorAll('[data-remove-upi]').forEach((b) => b.addEventListener('click', async () => {
      await saveMe({ settings: { payments: { upiIds: ids.filter((x) => x !== b.dataset.removeUpi) } } });
      this.update({ tab: 'payments' });
    }));
  },

  help() {
    return `
      <h2>Help & support</h2>
      <p class="muted">Answers to common questions. Can't find what you need? We're here to help.</p>
      <div class="settings-card faq">
        ${FAQ.map(([q, a]) => `<details><summary>${esc(q)}${icon('chevron', 16)}</summary><p class="muted">${esc(a)}</p></details>`).join('')}
      </div>
      <div class="settings-card">
        <h3>Contact us</h3>
        <div class="verify-row"><span class="row-icon">${icon('mail')}</span><span class="grow"><b>Email support</b><span class="muted small">We reply within one working day</span></span><a class="btn btn-secondary" href="mailto:support@eleve.example">Email</a></div>
        <div class="verify-row"><span class="row-icon">${icon('phone')}</span><span class="grow"><b>Call us</b><span class="muted small">Mon–Sat, 9 am – 7 pm IST</span></span><a class="btn btn-secondary" href="tel:+911800000000">Call</a></div>
      </div>`;
  },

  about() {
    return `
      <h2>About Elevé</h2>
      <div class="settings-card">
        <dl class="kv">
          <dt>Version</dt><dd>1.2.0</dd>
          <dt>AI features</dt><dd>${META.ai.claude ? `Powered by Claude (${esc(META.ai.model)})` : 'Built-in offline mode'}</dd>
          <dt>Listings</dt><dd>${META.totals.properties} homes · ${META.totals.cities} cities · ${META.totals.agents} agents</dd>
          <dt>Map data</dt><dd>© OpenStreetMap contributors, © CARTO</dd>
        </dl>
      </div>
      <p class="info-note">${icon('info', 16)} This is a demo. Listings, agents and sample transactions are generated for illustration, and no real payments are processed.</p>`;
  },
};
