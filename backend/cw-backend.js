/* ==========================================================================
 * cw-backend.js — Confident Wings lead-capture client library
 *
 * Dependency-free. Writes leads to Cloud Firestore via its REST API
 * (no Firebase SDK needed — important for a static GitHub Pages site with
 * no build step).
 *
 * Contract (see FORM_CONTRACT.md):
 *   window.CW_CONFIG = { firebase: { apiKey, authDomain, projectId,
 *                                     storageBucket, messagingSenderId, appId } }
 *   window.CWBackend = { isConfigured(), saveLead(lead) -> Promise }
 *
 * Golden rule: saveLead() NEVER throws and NEVER rejects. Any failure
 * resolves { ok:false, error }. The frontend ALWAYS opens the WhatsApp
 * deep link afterwards, so a backend outage is invisible to visitors.
 * ========================================================================== */
(function () {
  'use strict';

  var TIMEOUT_MS = 8000; // must match the frontend's own timeout
  var COLLECTION = 'leads';

  var TYPES = ['demo', 'contact', 'resource'];

  // Grounded in the site's actual course <select> option VALUES (slugs).
  // These must match the frontend's option values exactly.
  var COURSES = [
    'spoken-english',
    'public-speaking',
    'interview-prep',
    'kids-teens',
    'corporate'
  ];

  // Grounded in the site's actual resource form data-resource slugs.
  var RESOURCES = [
    'sentences',
    'interview',
    'vocabulary'
  ];

  // Pricing-plan interest, set by the plan-choice buttons (data-plan).
  var PLANS = [
    'Foundation',
    'Confidence Pro',
    '1:1 Mentor'
  ];

  var REQUIRED_CONFIG_KEYS = [
    'apiKey', 'authDomain', 'projectId',
    'storageBucket', 'messagingSenderId', 'appId'
  ];

  /* -- config ----------------------------------------------------------- */

  function getConfig() {
    try {
      var c = window.CW_CONFIG && window.CW_CONFIG.firebase;
      if (!c || typeof c !== 'object') return null;
      for (var i = 0; i < REQUIRED_CONFIG_KEYS.length; i++) {
        var v = c[REQUIRED_CONFIG_KEYS[i]];
        if (typeof v !== 'string' || !v.trim()) return null;
      }
      return c;
    } catch (e) {
      return null;
    }
  }

  function isConfigured() {
    return !!getConfig();
  }

  /* -- sanitization ------------------------------------------------------ */

  function cleanStr(v, max) {
    if (v === null || v === undefined) return '';
    var s = String(v).trim().replace(/\s+/g, ' ');
    return s.length > max ? s.slice(0, max) : s;
  }

  // Accepts "98765 43210", "+91 9876543210", "919876543210", "09876543210"
  // and normalizes to the 10-digit form the rules validate.
  function normalizePhone(v) {
    var d = String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  function defaultPage() {
    try {
      return window.location ? window.location.pathname : '';
    } catch (e) {
      return '';
    }
  }

  function sanitize(lead) {
    lead = lead || {};
    var out = {
      type: cleanStr(lead.type, 20).toLowerCase(),
      name: cleanStr(lead.name, 60),
      phone: normalizePhone(lead.phone),
      page: cleanStr(lead.page || defaultPage(), 200)
    };
    if (lead.course !== null && lead.course !== undefined &&
        String(lead.course).trim() !== '') {
      out.course = cleanStr(lead.course, 60);
    }
    if (lead.resource !== null && lead.resource !== undefined &&
        String(lead.resource).trim() !== '') {
      out.resource = cleanStr(lead.resource, 80);
    }
    // The demo form sends its optional note as `note`; the contact form
    // sends `message`. Normalize both to `message`.
    var note = lead.message !== null && lead.message !== undefined &&
               String(lead.message).trim() !== ''
      ? lead.message : lead.note;
    if (note !== null && note !== undefined && String(note).trim() !== '') {
      out.message = cleanStr(note, 500);
    }
    // Optional pricing-plan interest from the plan-choice buttons.
    if (lead.plan !== null && lead.plan !== undefined &&
        String(lead.plan).trim() !== '') {
      out.plan = cleanStr(lead.plan, 40);
    }
    return out;
  }

  /* -- client-side validation (mirrors firestore.rules; server re-checks) - */

  function validate(s) {
    if (TYPES.indexOf(s.type) === -1) return 'invalid type';
    if (s.name.length < 2) return 'name too short';
    if (!/^[6-9]\d{9}$/.test(s.phone)) return 'invalid phone';
    if (s.course && COURSES.indexOf(s.course) === -1) return 'unknown course';
    if (s.resource && RESOURCES.indexOf(s.resource) === -1) return 'unknown resource';
    if (s.plan && PLANS.indexOf(s.plan) === -1) return 'unknown plan';
    if (s.type === 'demo' && !s.course) return 'course required for demo lead';
    if (s.type === 'resource' && !s.resource) return 'resource required for resource lead';
    return null;
  }

  /* -- Firestore REST encoding ------------------------------------------- */

  function toRestFields(s) {
    var f = {
      type:      { stringValue: s.type },
      name:      { stringValue: s.name },
      phone:     { stringValue: s.phone },
      page:      { stringValue: s.page },
      createdAt: { timestampValue: new Date().toISOString() }
    };
    if (s.course)   f.course   = { stringValue: s.course };
    if (s.resource) f.resource = { stringValue: s.resource };
    if (s.message)  f.message  = { stringValue: s.message };
    if (s.plan)     f.plan     = { stringValue: s.plan };
    return f;
  }

  /* -- public API ---------------------------------------------------------- */

  // saveLead(lead) -> Promise<{ok:boolean, error?:string}>
  // Never rejects. Resolves {ok:false} when the backend is not configured,
  // the payload is invalid, the network fails, or Firestore rejects the write.
  function saveLead(lead) {
    var cfg = getConfig();
    var s = sanitize(lead);
    var invalid = validate(s);

    if (!cfg) {
      return Promise.resolve({ ok: false, error: 'backend not configured' });
    }
    if (invalid) {
      return Promise.resolve({ ok: false, error: invalid });
    }

    var url = 'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(cfg.projectId) +
      '/databases/(default)/documents/' + COLLECTION +
      '?key=' + encodeURIComponent(cfg.apiKey);

    var body;
    try {
      body = JSON.stringify({ fields: toRestFields(s) });
    } catch (e) {
      return Promise.resolve({ ok: false, error: 'encoding failed' });
    }

    var controller = null;
    var timer = null;
    try {
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timer = setTimeout(function () {
          try { controller.abort(); } catch (e) { /* noop */ }
        }, TIMEOUT_MS);
      }
    } catch (e) { controller = null; }

    var request;
    try {
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      };
      if (controller) opts.signal = controller.signal;
      request = fetch(url, opts).then(
        function (resp) {
          if (timer) clearTimeout(timer);
          if (!resp || !resp.ok) {
            return { ok: false, error: 'server ' + (resp ? resp.status : 'error') };
          }
          return { ok: true };
        },
        function () {
          if (timer) clearTimeout(timer);
          return { ok: false, error: 'network error' };
        }
      );
    } catch (e) {
      // fetch itself threw synchronously (very old browser / blocked)
      return Promise.resolve({ ok: false, error: 'network unavailable' });
    }

    // Backstop: guarantee resolution even if fetch hangs without
    // AbortController support.
    var backstop = new Promise(function (resolve) {
      setTimeout(function () { resolve({ ok: false, error: 'timeout' }); },
        TIMEOUT_MS + 500);
    });

    return Promise.race([request, backstop]).then(function (r) {
      if (timer) clearTimeout(timer);
      return r;
    });
  }

  window.CWBackend = {
    isConfigured: isConfigured,
    saveLead: saveLead
  };
})();
