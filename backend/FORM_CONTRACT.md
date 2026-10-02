# Confident Wings — Frontend ↔ Backend form contract

Integration spec for the redesigned frontend. The backend library
(`cw-backend.js`) implements exactly this; the frontend must call it exactly
this way.

## 1. Configuration

Before loading `cw-backend.js`, the page **may** define:

```js
window.CW_CONFIG = {
  firebase: {
    apiKey:            "…",  // Firebase web API key (public by design)
    authDomain:        "…",
    projectId:         "…",
    storageBucket:     "…",
    messagingSenderId: "…",
    appId:             "…"
  }
};
```

- `CW_CONFIG` **absent, empty, or missing any field** ⇒ backend is
  *not configured*. This is a normal, supported state: the site must work
  exactly as it does today (WhatsApp-only forms).
- The Firebase web config is **public by design**; it is not a secret.

## 2. Library surface

After `cw-backend.js` loads, exactly one global exists:

```js
window.CWBackend = {
  isConfigured(),        // -> boolean. True only if CW_CONFIG.firebase
                         //    has all six fields non-empty.
  saveLead(lead)          // -> Promise<{ ok:boolean, error?:string }>
};
```

### `saveLead(lead)`

Input — the lead object (all values are sanitized: trimmed, length-capped,
phone normalized to 10 digits):

```js
{
  type:     'demo' | 'contact' | 'resource',  // required
  name:     string,                            // required, 2–60 chars
  phone:    string,                            // required; any common Indian
                                               // format ("98765 43210",
                                               // "+91…", "91…", "0…")
  course:   string,                            // required iff type==='demo';
                                               // one of COURSES below
  resource: string,                            // required iff type==='resource';
                                               // one of RESOURCES below (slug)
  message:  string,                            // optional, ≤500 chars
                                               // (demo form sends `note`,
                                               // normalized to `message`)
  plan:     string,                            // optional; one of PLANS below
                                               // (pricing-plan interest)
  page:     string                             // optional; defaults to
                                               // location.pathname, ≤200 chars
}
```

Allowed `course` values — the frontend `<select>` option **values** (slugs),
must match `firestore.rules` exactly:

```
spoken-english, public-speaking, interview-prep, kids-teens, corporate
```

Allowed `resource` values — the frontend `data-resource` **slugs**,
must match `firestore.rules` exactly:

```
sentences, interview, vocabulary
```

Allowed `plan` values — the plan-choice button `data-plan` values:

```
Foundation, Confidence Pro, 1:1 Mentor
```

Output — **the promise always resolves, never rejects**:

```js
{ ok: true }                  // lead written to Firestore
{ ok: false, error: "…" }     // not configured | invalid input |
                              // network error | timeout | server NNN
```

Guarantees:
- 8 s internal timeout (AbortController + backstop timer).
- Offline / DNS / CORS / HTTP-error / rules-rejection ⇒ `{ok:false}`.
- The library **never opens WhatsApp itself** and **never throws** —
  it only records the lead.

## 3. Frontend flow (normative)

Every form (demo, contact, resource) MUST follow this order:

```
1. validate()            // existing client-side validation; on failure,
                         // show error and STOP (do not call saveLead,
                         // do not open WhatsApp)
2. try {                 // with the frontend's OWN 8 s timeout as backstop
     await CWBackend.saveLead(lead)
   } catch { /* unreachable by contract, but keep the guard */ }
3. ALWAYS → open WhatsApp deep link with the prefilled message
```

Rules for the frontend:
- **Never** skip step 3 because step 2 failed or was slow. WhatsApp is the
  primary capture channel; Firestore is the backup/database.
- **Never** pass raw unvalidated input to `saveLead` — validate first
  (the library re-sanitizes, but UX errors belong to the form).
- Pass `course`/`resource` strings **exactly** as spelled above; anything
  else is rejected by the security rules and the lead is lost from Firestore
  (WhatsApp still captures it).
- `type` values are lowercase: `'demo'`, `'contact'`, `'resource'`.

## 4. Example

```js
async function onDemoSubmit(e) {
  e.preventDefault();
  const lead = {
    type: 'demo',
    name: nameInput.value,
    phone: phoneInput.value,
    course: courseSelect.value,   // e.g. "spoken-english" (slug)
    note: noteInput.value,        // optional → saved as `message`
    plan: chosenPlan,             // optional: "Foundation" | "Confidence Pro" | "1:1 Mentor"
    page: location.pathname
  };
  if (!valid(lead)) { showError(); return; }

  try {
    await withTimeout(window.CWBackend.saveLead(lead), 8000);
  } catch (_) { /* ignore — WhatsApp is the source of truth */ }
  finally {
    openWhatsApp(`Hi Confident Wings! I'd like to book a free demo for ${lead.course}. Name: ${lead.name}.`);
  }
}
```

## 5. Versioning

- Contract version: **1.0** (2026-10-02).
- Backward-compatible changes only (new optional fields, new enum values
  added to *both* `cw-backend.js` and `firestore.rules` together).
- Breaking changes require a contract version bump and a coordinated
  frontend + rules deploy.
