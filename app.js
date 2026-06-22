/* DIR UVP Sprint — UVP Clarity Check (two-stage) frontend.
   Stage 1: evidence submission -> diagnostic report (shown before any email).
   Stage 2: three-question Sprint fit -> routed recommendation.
   The report is strictly diagnostic; it never prescribes content. */

(() => {
  'use strict';

  const CONFIG = window.DIR_UVP_CONFIG || {};
  const ANALYZE_URL = CONFIG.analyzeUrl || '/api/uvp-clarity-check';
  const CONFIG_URL = CONFIG.configUrl || '/api/clarity-config';
  const CAPTURE_URL = CONFIG.captureUrl || '/api/fit-check';
  const BOOKING_URL = CONFIG.bookingUrl || 'https://calendar.app.google/36NF25hvaFQM2hpv9';
  const CONTACT_EMAIL = CONFIG.contactEmail || 'tom@mediathink.com';
  const PRICE = '$35,000';
  const MAX_PDF_BYTES = 10 * 1024 * 1024;

  const dl = (event, props) => { try { (window.dataLayer = window.dataLayer || []).push({ event, ...(props || {}) }); } catch (_) {} };
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const esc = (s) => String(s == null ? '' : s);
  // UI-1: the model sometimes returns excerpts already wrapped in quotes; we add our own
  // curly pair, which read as doubled (""…""). Strip a single wrapping quote pair first —
  // only when both ends are quote glyphs, so trailing possessives etc. are untouched.
  const unquote = (s) => {
    s = String(s == null ? '' : s).trim();
    if (s.length >= 2 && /^["“”'‘’«»]/.test(s[0]) && /["“”'‘’«»]$/.test(s[s.length - 1])) s = s.slice(1, -1).trim();
    return s;
  };
  const uuid = () => { try { return crypto.randomUUID(); } catch (_) { return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2); } };

  // ---- Economic + fit logic (mirrors functions/_shared/domain.js; Stage 2 is computed in the browser) ----
  const ECONOMIC_FLOORS = { 'B2B SaaS': 10, 'Consultancy / advisory': 14, 'Professional services': 16, 'Agency / services firm': 17, 'Other B2B': 18 };
  const REVENUE_BANDS = { 'Under $10M': [0, 10], '$10M–$15M': [10, 15], '$15M–$20M': [15, 20], '$20M–$35M': [20, 35], '$35M–$75M': [35, 75], 'Over $75M': [75, Infinity] };
  const ADEQUATE_SPEND = new Set(['$750K–$2M', '$2M–$5M', 'Over $5M']);

  function economicScreen(companyType, revenueBand, spendBand) {
    const floor = ECONOMIC_FLOORS[companyType] ?? 18;
    const band = REVENUE_BANDS[revenueBand];
    if (!band) return 'insufficient';
    const [low, high] = band;
    if (low >= floor) return 'clears';
    if (high <= floor) return 'below';
    return ADEQUATE_SPEND.has(spendBand) ? 'clears' : 'below';
  }

  function deriveSprintFit({ clarityBand, preliminaryCase, readiness, companyType, revenueBand, spendBand }) {
    if (clarityBand === 'not_enough_evidence') return 'insufficient_evidence';
    if (clarityBand === 'clear' || preliminaryCase === 'limited_case') return 'probably_unnecessary';
    if (readiness === 'No') return 'wrong_timing';
    const economics = economicScreen(companyType, revenueBand, spendBand);
    if (economics === 'below') return 'not_proportionate';
    if (economics === 'insufficient') return 'insufficient_evidence';
    if (readiness === 'Probably' || preliminaryCase === 'possible_case') return 'potential_fit';
    return 'strong_fit';
  }

  // ---- Display labels ----
  const BAND_LABEL = { clear: 'Clear', emerging: 'Emerging', fragmented: 'Fragmented', not_enough_evidence: 'Not enough evidence' };
  const LEVEL_LABEL = { clear: 'Clear', partial: 'Partial', weak: 'Weak', absent: 'Absent' };
  const DIM_LABEL = { audience_boundary: 'Audience boundary', problem_trigger: 'Problem or trigger', outcome_value: 'Outcome / value', difference: 'Difference vs alternatives', proof_boundaries: 'Proof & claim boundaries', consistency: 'Cross-material consistency' };
  const ELEMENT_LABEL = { audience: 'Audience', problem: 'Buyer problem / trigger', outcome: 'Promised outcome', difference: 'Meaningful difference', proof: 'Proof offered' };
  const STATUS_LABEL = { clearly_present: 'Clearly present', present_generic: 'Present but generic', conflicting: 'Conflicting across materials', not_found: 'Not found' };
  const CASE_LABEL = { strong_case: 'Strong case', possible_case: 'Possible case', limited_case: 'Limited case', cannot_determine: 'Cannot determine yet' };
  const GAP_LABEL = { unproven: 'Unproven', generic: 'Generic', over_broad: 'Over-broad' };

  const FIT = {
    strong_fit: { title: 'Strong Sprint fit', body: `A material clarity problem is present, your room can do the work, and the economics clear. A UVP Sprint is the method built for this. It is a single fixed price: ${PRICE}.`, booking: true, email: true },
    potential_fit: { title: 'Potential fit — one issue to resolve', body: `The clarity problem is real and a UVP Sprint is the method built to resolve it (${PRICE}). One thing — participation or proportionality — is worth confirming first.`, booking: true, email: true },
    wrong_timing: { title: 'Useful problem, wrong timing', body: 'There is a real clarity problem, but the people who would need to make the decisions cannot currently be in the room. The Sprint depends on that, so the timing is not right yet.', booking: false, email: true },
    not_proportionate: { title: 'Not proportionate yet', body: `A clarity problem is present, but at your current scale a ${PRICE} engagement is unlikely to return enough to justify it. The published methodology documents are yours to use in the meantime.`, booking: false, email: true },
    probably_unnecessary: { title: 'Sprint probably unnecessary', body: 'Your materials are already unusually clear and consistent. A Sprint is unlikely to be worth it right now.', booking: false, email: false },
    insufficient_evidence: { title: 'Insufficient evidence', body: 'There is not enough usable evidence to responsibly decide. Re-run the check with accessible pages or a readable PDF.', booking: false, email: false }
  };

  // ---- State ----
  let TURNSTILE_SITE_KEY = '';
  let turnstileWidgetId = null;
  let turnstileRequested = false;
  let lastReport = null;
  let stage1 = null;
  let stage2 = null;

  // ===================== rendering =====================
  function render(root) {
    root.innerHTML = '';
    root.appendChild(buildForm());
    root.appendChild(buildAnalyzing());
    root.appendChild(buildErrorPanel());
    const report = el('div', 'clarity-report'); report.id = 'clarityReport'; report.hidden = true;
    root.appendChild(report);
    armTurnstileLazyLoad();
    dl('clarity_check_viewed');
  }

  function buildForm() {
    const f = document.createElement('form');
    f.id = 'clarityForm'; f.className = 'clarity-form'; f.noValidate = true;
    f.innerHTML = `
      <div class="cc-grid">
        <div class="input-wrap">
          <label for="companyType">What kind of company are you?</label>
          <select class="field" id="companyType" name="companyType" required>
            <option value="">Choose one…</option>
            ${Object.keys(ECONOMIC_FLOORS).map((t) => `<option>${t}</option>`).join('')}
          </select>
        </div>
        <div class="input-wrap">
          <label for="primaryUrl">Your website (homepage)</label>
          <input class="field" id="primaryUrl" name="primaryUrl" type="url" inputmode="url" placeholder="https://yourcompany.com" autocomplete="url" required />
        </div>
        <div class="input-wrap">
          <label for="addl1">Another page (optional)</label>
          <input class="field" id="addl1" name="additionalUrls" type="url" inputmode="url" placeholder="Product or service page — same domain" />
        </div>
        <div class="input-wrap">
          <label for="addl2">Another page (optional)</label>
          <input class="field" id="addl2" name="additionalUrls" type="url" inputmode="url" placeholder="About or customer page — same domain" />
        </div>
        <div class="input-wrap cc-span">
          <label for="pdfs">Marketing or sales collateral (optional, PDF only)</label>
          <input class="field" id="pdfs" name="pdfs" type="file" accept="application/pdf" multiple />
          <p class="cc-hint">Up to two PDFs, 10 MB total. Choose the documents a prospect or salesperson would actually use — not your whole archive.</p>
        </div>
        <div class="input-wrap">
          <label for="whatYouSell">What do you sell?</label>
          <input class="field" id="whatYouSell" name="whatYouSell" type="text" maxlength="200" required />
        </div>
        <div class="input-wrap">
          <label for="buyer">Which buyer most needs to understand it?</label>
          <input class="field" id="buyer" name="buyer" type="text" maxlength="200" required />
        </div>
      </div>

      <label class="cc-check"><input type="checkbox" id="authorize" required /> <span>I have the authority to submit these materials, and they contain no regulated, personal, financial, medical, or highly confidential information. Files are processed transiently by UVP Sprint and OpenAI and are not stored. See our <a href="/privacy">Privacy Policy</a>.</span></label>

      <div id="turnstileHolder" class="cc-turnstile"></div>
      <p class="field-error" id="ccFormError" hidden aria-live="polite"></p>

      <div class="cc-submit-row">
        <button class="btn btn-primary" id="ccSubmit" type="submit">Check Your UVP Clarity</button>
        <span class="tiny">Roughly 5–8 minutes plus analysis time. You see the full report before any email is requested. No sales call required.</span>
      </div>
    `;
    f.addEventListener('submit', onSubmit);
    return f;
  }

  function buildAnalyzing() {
    const d = el('div', 'cc-analyzing'); d.id = 'clarityAnalyzing'; d.hidden = true; d.setAttribute('aria-live', 'polite');
    d.innerHTML = `<div class="cc-spinner" aria-hidden="true"></div><p class="cc-analyzing-msg" id="ccAnalyzingMsg">Reading selected pages…</p><p class="tiny">This runs once. Please keep this tab open.</p>`;
    return d;
  }

  function buildErrorPanel() {
    const d = el('div', 'cc-error'); d.id = 'clarityError'; d.hidden = true; d.setAttribute('aria-live', 'polite');
    d.innerHTML = `<h3>The analysis didn’t complete</h3><p class="cc-error-msg" id="ccErrorMsg"></p><button class="btn btn-primary" id="ccRetry" type="button">Try again</button>`;
    d.querySelector('#ccRetry').addEventListener('click', resetToForm);
    return d;
  }

  // ===================== config / turnstile =====================
  // Load Turnstile only when the visitor shows intent to use the form (it scrolls into
  // view, or they focus/tap it). Most visitors never submit, so this avoids fetching and
  // running the Cloudflare challenge script for everyone. Idempotent — first signal wins.
  function armTurnstileLazyLoad() {
    const form = $('clarityForm');
    if (!form) return;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); loadTurnstile(); }
      }, { rootMargin: '200px' });
      io.observe(form);
    } else {
      loadTurnstile();
    }
    form.addEventListener('focusin', loadTurnstile, { once: true });
    form.addEventListener('pointerdown', loadTurnstile, { once: true });
  }

  async function loadTurnstile() {
    if (turnstileRequested) return;
    turnstileRequested = true;
    // Prefer the inlined public site key (no network); fall back to the config endpoint.
    if (CONFIG.turnstileSiteKey) {
      TURNSTILE_SITE_KEY = CONFIG.turnstileSiteKey;
    } else {
      try {
        const res = await fetch(CONFIG_URL, { headers: { Accept: 'application/json' } });
        const cfg = await res.json();
        TURNSTILE_SITE_KEY = cfg.turnstileSiteKey || '';
      } catch (_) { TURNSTILE_SITE_KEY = ''; }
    }
    if (!TURNSTILE_SITE_KEY) return;
    if (window.turnstile) return renderTurnstile();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true; s.onload = renderTurnstile;
    document.head.appendChild(s);
  }

  function renderTurnstile() {
    const holder = $('turnstileHolder');
    if (!holder || !window.turnstile || !TURNSTILE_SITE_KEY) return;
    try {
      turnstileWidgetId = window.turnstile.render(holder, {
        sitekey: TURNSTILE_SITE_KEY,
        'response-field-name': 'turnstileToken',
        theme: 'light',
        // This form can sit open for several minutes — longer than a Turnstile
        // token's ~5 min life. Auto-refresh keeps the token fresh so a slow user
        // doesn't submit a stale token and get a "security check expired" error.
        'refresh-expired': 'auto',
        'error-callback': () => true,        // let Turnstile silently retry transient challenge errors
        'timeout-callback': resetTurnstile   // interactive challenge timed out — start it over
      });
    } catch (_) {}
  }

  // ===================== submit =====================
  function clientValidate(form) {
    if (!form.companyType.value) return 'Choose your company type.';
    if (!form.primaryUrl.value.trim()) return 'Enter your website URL.';
    try { const u = new URL(form.primaryUrl.value.trim()); if (u.protocol !== 'https:') return 'The website URL must start with https://.'; } catch (_) { return 'Enter a valid website URL, including https://.'; }
    if (!form.whatYouSell.value.trim()) return 'Tell us briefly what you sell.';
    if (!form.buyer.value.trim()) return 'Tell us which buyer most needs to understand it.';
    if (!$('authorize').checked) return 'Please confirm you’re authorized to submit these materials.';
    const files = ($('pdfs').files ? Array.from($('pdfs').files) : []);
    if (files.length > 2) return 'Upload no more than two PDFs.';
    if (files.some((f) => f.type !== 'application/pdf')) return 'Uploaded files must be PDFs.';
    if (files.reduce((s, f) => s + f.size, 0) > MAX_PDF_BYTES) return 'PDFs must be 10 MB or less combined.';
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const errBox = $('ccFormError');
    errBox.hidden = true; errBox.textContent = '';

    const problem = clientValidate(form);
    if (problem) { errBox.textContent = problem; errBox.hidden = false; return; }

    const fd = new FormData(form);
    const token = fd.get('turnstileToken');
    if (TURNSTILE_SITE_KEY && !token) { errBox.textContent = 'Please complete the security check, then submit again.'; errBox.hidden = false; return; }
    // Stable per-submission key so the single-use token survives silent retries:
    // Cloudflare returns the cached siteverify result instead of rejecting a reused token.
    if (TURNSTILE_SITE_KEY) fd.set('turnstileIdempotencyKey', uuid());

    stage1 = {
      companyType: form.companyType.value,
      primaryUrl: form.primaryUrl.value.trim(),
      whatYouSell: form.whatYouSell.value.trim(),
      buyer: form.buyer.value.trim()
    };
    showOnly('clarityAnalyzing');
    startAnalyzingMessages();
    const filledPages = 1 + Array.from(form.querySelectorAll('input[name="additionalUrls"]')).filter((i) => i.value.trim()).length;
    dl('clarity_analysis_started', { pages: filledPages, pdfs: ($('pdfs').files || []).length });

    // The API always answers in JSON. A non-JSON body (e.g. a Cloudflare 502/504
    // gateway page), a network error, or a client-side timeout is a transient platform
    // hiccup, not a real result, so those are retried silently. A legitimate JSON error
    // (missing fields, capacity, rate limit, expired challenge) is returned and shown to
    // the user, never retried.
    // Re-POSTing a multi-megabyte PDF payload repeatedly is wasteful on the flaky mobile
    // connections that trigger retries — allow one safety retry with files, two without.
    const hasPdfs = ($('pdfs').files || []).length > 0;
    const MAX_ATTEMPTS = hasPdfs ? 2 : 3;
    const RETRY_DELAY_MS = 1200;
    const ATTEMPT_TIMEOUT_MS = 90_000;  // above the function's own ~60s ceiling — only aborts true hangs
    let data = null;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let res = null, body = null, gotJson = false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
        try {
          res = await fetch(ANALYZE_URL, { method: 'POST', body: fd, signal: controller.signal });
          const raw = await res.text();
          try { body = JSON.parse(raw); gotJson = true; } catch (_) { gotJson = false; }
        } catch (_) {
          gotJson = false; // network error, abort, or timeout: treat as transient
        } finally {
          clearTimeout(timer);
        }

        if (gotJson && body && (body.ok || body.error)) {
          // A real answer from our own function: a success, or a legitimate error to show.
          if (!res.ok || !body.ok) {
            const msg = (body.error && body.error.message) || 'The analysis didn’t complete. No diagnosis was generated — please try again.';
            return failAnalysis(msg);
          }
          data = body;
          break;
        }

        // Non-JSON or unreachable: a platform hiccup. Retry unless attempts are spent.
        if (attempt < MAX_ATTEMPTS) {
          dl('clarity_analysis_retry', { attempt });
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } finally {
      stopAnalyzingMessages();
    }

    if (!data) {
      return failAnalysis('The analysis service is briefly unavailable. Please try again in a moment.');
    }

    lastReport = data.report;
    dl('clarity_analysis_completed');
    dl('clarity_result_band', { result_band: lastReport.overall_band });
    renderReport(lastReport);
    showOnly('clarityReport');
    resetTurnstile();
    $('clarityReport').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function failAnalysis(message) {
    dl('clarity_analysis_failed');
    $('ccErrorMsg').textContent = message;
    showOnly('clarityError');
    resetTurnstile();
  }

  let msgTimer = null;
  function startAnalyzingMessages() {
    const msgs = ['Reading selected pages…', 'Reviewing supplied collateral…', 'Comparing the company story…', 'Testing claims and proof…', 'Preparing the assessment…'];
    let i = 0; const node = $('ccAnalyzingMsg'); if (node) node.textContent = msgs[0];
    msgTimer = setInterval(() => {
      i += 1;
      if (node) node.textContent = msgs[Math.min(i, msgs.length - 1)];
      if (i >= msgs.length - 1) stopAnalyzingMessages(); // last message shown — stop waking the timer
    }, 2600);
  }
  function stopAnalyzingMessages() { if (msgTimer) { clearInterval(msgTimer); msgTimer = null; } }

  function resetTurnstile() { if (window.turnstile && turnstileWidgetId != null) { try { window.turnstile.reset(turnstileWidgetId); } catch (_) {} } }
  function resetToForm() { showOnly('clarityForm'); }

  function showOnly(id) {
    ['clarityForm', 'clarityAnalyzing', 'clarityError', 'clarityReport'].forEach((x) => { const n = $(x); if (n) n.hidden = (x !== id); });
  }

  // ===================== report rendering =====================
  function evidenceList(items) {
    const ul = el('ul', 'cc-evidence');
    const list = Array.isArray(items) ? items : (items ? [items] : []);
    list.forEach((ev) => {
      const li = el('li');
      const q = el('span', 'cc-quote', '“' + unquote(esc(ev.excerpt)) + '”');
      const src = el('span', 'cc-src', ' — ' + esc(ev.source_label || ev.source_id) + (ev.page_number != null ? `, p.${ev.page_number}` : ''));
      li.appendChild(q); li.appendChild(src); ul.appendChild(li);
    });
    return ul;
  }

  function section(title) { const s = el('section', 'cc-block'); s.appendChild(el('h4', null, title)); return s; }

  function renderReport(r) {
    const root = $('clarityReport'); root.innerHTML = '';

    // Overall band
    const head = el('div', 'cc-band cc-band-' + (r.overall_band || 'fragmented'));
    head.appendChild(el('div', 'cc-band-eyebrow', 'Overall clarity'));
    head.appendChild(el('div', 'cc-band-value', BAND_LABEL[r.overall_band] || '—'));
    head.appendChild(el('p', 'cc-band-note', 'This report names what is unclear, conflicting, generic, or unproven in your own materials, with quotes. It does not tell you what your message should be — that is the work of the room.'));
    root.appendChild(head);

    if (r.confidence) root.appendChild(el('p', 'cc-confidence', 'Assessment confidence: ' + r.confidence + (r.status === 'insufficient_evidence' ? ' — limited evidence was available.' : '')));

    // Clarity state (flag-only)
    const cs = section('Where your materials are clear — and where they aren’t');
    (r.clarity_state || []).forEach((item) => {
      const row = el('div', 'cc-state');
      const top = el('div', 'cc-state-top');
      top.appendChild(el('span', 'cc-state-label', ELEMENT_LABEL[item.element] || item.element));
      top.appendChild(el('span', 'cc-pill cc-pill-' + item.status, STATUS_LABEL[item.status] || item.status));
      row.appendChild(top);
      if (item.note) row.appendChild(el('p', 'cc-state-note', item.note));
      row.appendChild(evidenceList(item.evidence));
      cs.appendChild(row);
    });
    root.appendChild(cs);

    // Six-dimension scorecard
    const sc = section('Six-dimension scorecard');
    (r.dimensions || []).forEach((d) => {
      const row = el('div', 'cc-dim');
      const top = el('div', 'cc-state-top');
      top.appendChild(el('span', 'cc-state-label', DIM_LABEL[d.name] || d.name));
      top.appendChild(el('span', 'cc-pill cc-level-' + d.level, LEVEL_LABEL[d.level] || d.level));
      row.appendChild(top);
      if (d.explanation) row.appendChild(el('p', 'cc-state-note', d.explanation));
      row.appendChild(evidenceList(d.evidence));
      sc.appendChild(row);
    });
    root.appendChild(sc);

    // Contradictions
    if ((r.contradictions || []).length) {
      const c = section('Contradictions and drift');
      r.contradictions.forEach((item) => {
        const row = el('div', 'cc-item');
        row.appendChild(el('p', 'cc-state-note', (item.material ? '⚑ ' : '') + esc(item.why_it_matters)));
        row.appendChild(evidenceList(item.evidence));
        c.appendChild(row);
      });
      root.appendChild(c);
    }

    // Claim gaps
    if ((r.claim_gaps || []).length) {
      const g = section('Unsupported or weak claims');
      r.claim_gaps.forEach((item) => {
        const row = el('div', 'cc-item');
        const top = el('div', 'cc-state-top');
        top.appendChild(el('span', 'cc-state-label', esc(item.claim)));
        top.appendChild(el('span', 'cc-pill cc-pill-' + item.kind, GAP_LABEL[item.kind] || item.kind));
        row.appendChild(top);
        if (item.why_it_matters) row.appendChild(el('p', 'cc-state-note', item.why_it_matters));
        row.appendChild(evidenceList(item.evidence));
        g.appendChild(row);
      });
      root.appendChild(g);
    }

    // Clarity strength (observation, not endorsement)
    if ((r.clarity_strength || []).length) {
      const s = section('Where clarity is currently strongest');
      r.clarity_strength.forEach((item) => {
        const row = el('div', 'cc-item');
        row.appendChild(el('p', 'cc-state-note', esc(item.observation)));
        row.appendChild(evidenceList(item.evidence));
        s.appendChild(row);
      });
      root.appendChild(s);
    }

    // Operational consequence
    if ((r.operational_consequences || []).length) {
      const o = section('Likely operational consequence');
      const ul = el('ul', 'cc-bullets');
      r.operational_consequences.forEach((t) => ul.appendChild(el('li', null, t)));
      o.appendChild(ul); root.appendChild(o);
    }

    // Source warnings
    if ((r.source_warnings || []).length) {
      const w = section('Notes on the evidence');
      const ul = el('ul', 'cc-bullets');
      r.source_warnings.forEach((t) => ul.appendChild(el('li', null, t)));
      w.appendChild(ul); root.appendChild(w);
    }

    // Preliminary Sprint case (engagement-level, permitted)
    if (r.preliminary_sprint_case) {
      const p = section('Would a UVP Sprint help?');
      p.appendChild(el('div', 'cc-pill cc-case', CASE_LABEL[r.preliminary_sprint_case.level] || r.preliminary_sprint_case.level));
      p.appendChild(el('p', 'cc-state-note', esc(r.preliminary_sprint_case.explanation)));
      p.appendChild(el('p', 'tiny', 'This is a preliminary read based only on the evidence problem. The next step weighs whether a Sprint is operationally and economically proportionate.'));
      root.appendChild(p);
    }

    // Next action + Stage 2
    root.appendChild(buildStage2(r));

    // Utilities
    const util = el('div', 'cc-utils');
    const printBtn = el('button', 'btn btn-secondary', 'Print or save this report'); printBtn.type = 'button';
    printBtn.addEventListener('click', () => { dl('report_printed'); window.print(); });
    const again = el('button', 'btn btn-ghost', 'Run another check'); again.type = 'button';
    again.addEventListener('click', resetToForm);
    util.appendChild(printBtn); util.appendChild(again);
    root.appendChild(util);
  }

  // ===================== Stage 2 =====================
  function buildStage2(report) {
    const wrap = el('div', 'cc-stage2'); wrap.id = 'ccStage2';
    wrap.appendChild(el('h4', null, 'Is a Sprint the right next step? Three questions.'));
    wrap.appendChild(el('p', 'tiny', 'These decide whether the engagement is useful, possible, and proportionate. Nothing here is shared until you choose to share it.'));

    const form = document.createElement('form'); form.className = 'cc-stage2-form'; form.id = 'ccStage2Form'; form.noValidate = true;
    form.innerHTML = `
      <div class="input-wrap">
        <label for="readiness">Can your CEO/decider and senior sales, marketing, and delivery people stay for a full working session and make real decisions?</label>
        <select class="field" id="readiness" name="readiness" required>
          <option value="">Choose one…</option><option>Yes</option><option>Probably</option><option>No</option>
        </select>
      </div>
      <div class="input-wrap">
        <label for="revenueBand">Annual revenue</label>
        <select class="field" id="revenueBand" name="revenueBand" required>
          <option value="">Choose one…</option>${Object.keys(REVENUE_BANDS).map((b) => `<option>${b}</option>`).join('')}
        </select>
      </div>
      <div class="input-wrap">
        <label for="spendBand">Combined annual marketing &amp; sales spend</label>
        <select class="field" id="spendBand" name="spendBand" required>
          <option value="">Choose one…</option><option>Under $250K</option><option>$250K–$750K</option><option>$750K–$2M</option><option>$2M–$5M</option><option>Over $5M</option>
        </select>
      </div>
      <p class="field-error" id="ccStage2Error" hidden aria-live="polite"></p>
      <button class="btn btn-primary" id="ccStage2Submit" type="submit">See your recommendation</button>
    `;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('ccStage2Error'); err.hidden = true;
      if (!form.readiness.value || !form.revenueBand.value || !form.spendBand.value) { err.textContent = 'Please answer all three.'; err.hidden = false; return; }
      stage2 = { readiness: form.readiness.value, revenueBand: form.revenueBand.value, spendBand: form.spendBand.value };
      dl('sprint_fit_started');
      const fit = deriveSprintFit({
        clarityBand: report.overall_band,
        preliminaryCase: report.preliminary_sprint_case && report.preliminary_sprint_case.level,
        readiness: form.readiness.value,
        companyType: stage1.companyType,
        revenueBand: form.revenueBand.value,
        spendBand: form.spendBand.value
      });
      dl('sprint_fit_completed', { sprint_fit_band: fit });
      renderRecommendation(fit);
    });
    wrap.appendChild(form);
    wrap.appendChild(el('div', 'cc-reco', '')).id = 'ccReco';
    return wrap;
  }

  function renderRecommendation(fit) {
    const info = FIT[fit] || FIT.insufficient_evidence;
    const box = $('ccReco'); box.innerHTML = '';
    box.appendChild(el('div', 'cc-reco-title', info.title));
    box.appendChild(el('p', 'cc-state-note', info.body));

    const choices = el('div', 'cc-reco-actions');
    if (info.booking) {
      const b = el('button', 'btn btn-primary', 'Book a call'); b.type = 'button';
      b.addEventListener('click', () => { dl('booking_selected', { sprint_fit_band: fit }); showCapture(box, fit, 'call'); });
      choices.appendChild(b);
    }
    if (info.email) {
      const b = el('button', info.booking ? 'btn btn-secondary' : 'btn btn-primary', 'Get this recommendation by email'); b.type = 'button';
      b.addEventListener('click', () => { dl('recommendation_email_selected', { sprint_fit_band: fit }); showCapture(box, fit, 'email'); });
      choices.appendChild(b);
    }
    if (!info.booking && !info.email) {
      const a = el('a', 'btn btn-secondary', 'Review the methodology documents'); a.href = '/#evidence';
      choices.appendChild(a);
    }
    box.appendChild(choices);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // LEAD-2: the qualifying context the prospect typed + the derived bands, so the lead is
  // actionable. Privacy boundary: NO report text, evidence excerpts, or files. fit_score is
  // intentionally omitted — it's a numeric column for the website form; the clarity band
  // lives in result_band, so sending it here only produced a "non-numeric" audit note.
  function capturePayload(fit, email, intent) {
    return {
      email,
      source: 'clarity-check',
      next_step_choice: intent, // 'email' | 'call'
      company_website: (stage1 && stage1.primaryUrl) || '',
      company_type: (stage1 && stage1.companyType) || '',
      what_you_sell: (stage1 && stage1.whatYouSell) || '',
      intended_buyer: (stage1 && stage1.buyer) || '',
      fit_tier: fit,
      readiness: (stage2 && stage2.readiness) || '',
      revenue_band: (stage2 && stage2.revenueBand) || '',
      spend_band: (stage2 && stage2.spendBand) || '',
      result_band: (lastReport && lastReport.overall_band) || '',
      sprint_fit_band: fit
    };
  }

  // LEAD-1: resolve true ONLY on a confirmed-good response (2xx + ok !== false). Any
  // failure (non-2xx, ok:false, parse error, network/timeout) resolves false.
  async function postCapture(payload) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(CAPTURE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(payload) });
      clearTimeout(t);
      let body = null; try { body = await res.json(); } catch (_) {}
      return !!(res.ok && body && body.ok !== false);
    } catch (_) { return false; }
  }

  // Unified capture panel. intent 'email' = send the recommendation. intent 'call' = record
  // the qualified lead, then open the Google scheduler — so booking-path prospects (our
  // best-fit ones) land in the sheet instead of vanishing into the calendar.
  function showCapture(box, fit, intent) {
    const existing = box.querySelector('.cc-email');
    if (existing) existing.remove(); // allow switching between the two actions
    const isCall = intent === 'call';
    const panel = el('div', 'cc-email');
    panel.innerHTML = `
      <div class="input-wrap">
        <label for="ccEmail">Work email</label>
        <input class="field" id="ccEmail" type="email" placeholder="name@company.com" autocomplete="email" />
        <p class="field-error" id="ccEmailErr" hidden aria-live="polite"></p>
      </div>
      ${isCall
        ? `<a class="btn btn-primary" id="ccBookGo" href="${BOOKING_URL}" target="_blank" rel="noopener noreferrer">Continue to booking →</a>`
        : `<button class="btn btn-primary" id="ccEmailSend" type="button">Send it</button>`}
      <div class="success-note" id="ccEmailOk" hidden aria-live="polite">${isCall ? 'Saved — your booking page is open in a new tab. See you there.' : 'Thanks — we’ll review and reply within one business day.'}</div>
      <p class="trust-note">We use this only to ${isCall ? 'prepare for your call' : 'send your recommendation'}. If anything fails, email <a href="mailto:${CONTACT_EMAIL}?subject=UVP%20Clarity%20Check">${CONTACT_EMAIL}</a>.</p>
    `;
    box.appendChild(panel);
    const input = panel.querySelector('#ccEmail');
    const err = panel.querySelector('#ccEmailErr');
    const okNote = panel.querySelector('#ccEmailOk');

    if (isCall) {
      // The anchor's native click is a user gesture, so the new tab isn't popup-blocked.
      // We capture in parallel (no await before navigation) and confirm/flag on this page.
      panel.querySelector('#ccBookGo').addEventListener('click', (e) => {
        const email = input.value.trim();
        if (!EMAIL_RE.test(email)) { e.preventDefault(); err.textContent = 'Enter a valid work email to continue.'; err.hidden = false; return; }
        err.hidden = true;
        postCapture(capturePayload(fit, email, 'call')).then((ok) => {
          if (ok) { okNote.hidden = false; dl('recommendation_call_captured', { sprint_fit_band: fit }); }
          else {
            err.textContent = `Your booking page opened, but we couldn’t log your details. Please email ${CONTACT_EMAIL} so we can prepare.`;
            err.hidden = false;
            dl('recommendation_call_failed', { sprint_fit_band: fit });
          }
        });
        // do NOT preventDefault — let the anchor open the scheduler in a new tab
      });
      return;
    }

    const btn = panel.querySelector('#ccEmailSend');
    btn.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!EMAIL_RE.test(email)) { err.textContent = 'Enter a valid work email.'; err.hidden = false; return; }
      err.hidden = true;
      btn.disabled = true;
      const ok = await postCapture(capturePayload(fit, email, 'email'));
      if (ok) {
        okNote.hidden = false;
        dl('recommendation_email_captured', { sprint_fit_band: fit });
      } else {
        err.textContent = `That didn’t go through. Please email ${CONTACT_EMAIL} and we’ll send it.`;
        err.hidden = false;
        dl('recommendation_email_failed', { sprint_fit_band: fit });
      }
      btn.disabled = false;
    });
  }

  // ===================== boot =====================
  const mount = document.getElementById('clarityApp');
  if (mount) render(mount);
})();
