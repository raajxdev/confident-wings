# Confident Wings — Backend Architecture (Firebase / Firestore)

Static site hosted on GitHub Pages: **no server is possible**. This document
describes the serverless lead-capture backend: a dependency-free client library
(`cw-backend.js`) that writes leads straight into Cloud Firestore via its REST
API, with WhatsApp kept as the always-on confirmation/fallback channel.

## Overview diagram

```
 ┌──────────────────────────────────────────────────────────┐
 │  GitHub Pages (static, no server)                        │
 │  index.html  +  cw-backend.js  +  window.CW_CONFIG        │
 └───────────────────────────────┬──────────────────────────┘
                                 │ 1. client-side validate
                                 ▼
 ┌──────────────────────────────────────────────────────────┐
 │  window.CWBackend.saveLead(lead)                         │
 │  sanitize → validate → POST (8s timeout, never throws)   │
 └───────────────┬──────────────────────────────┬───────────┘
                 │ 2a. success                  │ 2b. fail / offline / timeout
                 ▼                              ▼
 ┌──────────────────────────────┐   ┌──────────────────────────────┐
 │ Firestore REST               │   │ resolve { ok:false, error }  │
 │ POST …/documents/leads       │   └──────────────┬───────────────┘
 │ (security rules validate     │                  │
 │  every field server-side)    │                  ▼
 └──────────────────────────────┘   ┌──────────────────────────────┐
                                    │ 3. ALWAYS: open WhatsApp     │
                                    │    deep link (prefilled msg) │
                                    └──────────────────────────────┘
```

The golden rule: **the WhatsApp deep link opens no matter what**.
`saveLead()` never rejects and never blocks the WhatsApp flow.

## Why Firestore

- **No server needed.** GitHub Pages can only serve static files; Firestore is
  reached directly from the browser via HTTPS.
- **Free tier is generous.** Spark plan: 50,000 reads/day, 20,000 writes/day,
  1 GiB stored — all free. At ~50 leads/day the project stays at $0 forever.
- **No SDK required.** The Firestore REST API + `fetch` is enough for
  create-only writes, so the site keeps its "vanilla JS, zero dependencies"
  property (no npm, no bundler, no 100 KB SDK).
- **Grows into an admin dashboard later.** When the institute wants a lead
  list/search UI, add Firebase Auth + read rules — same database, no migration.
  (See "Future" below.)
- **Console included.** Leads are viewable/searchable in the Firebase console
  from day one, with zero extra code.

Alternatives considered: Formspree (simpler, but per-form pricing and no
queryable database), Google Sheets (free but fragile auth, no validation),
Supabase (excellent, but heavier than needed for create-only leads).

## Data flows per form type

All three flows share the same shape: validate → `saveLead()` →
**always** open WhatsApp. Only the payload differs.

### 1. Demo booking (`type: 'demo'`)
- Fields: `name`, `phone`, `course` (from the course `<select>`),
  `message` (preferred time slot, optional), `page`.
- Rules require `course` when `type` is `'demo'`.
- WhatsApp message: `Hi Confident Wings! I'd like to book a free demo for
  {course}. Name: {name}.`

### 2. Contact (`type: 'contact'`)
- Fields: `name`, `phone`, `message`, `page`.
- General enquiry; no course/resource required.
- WhatsApp message: `Hi Confident Wings! {message} — {name}.`

### 3. Free-resource request (`type: 'resource'`)
- Fields: `name`, `phone`, `resource` (one of the three PDF titles), `page`.
- Rules require `resource` when `type` is `'resource'`.
- WhatsApp message: `Hi! Please send me the {resource} PDF. — {name}.`
- The institute replies on WhatsApp with the PDF (unchanged from today).

### Lead document schema (`leads/{autoId}`)

| Field      | Type      | Required | Constraints |
|------------|-----------|----------|-------------|
| `type`     | string    | yes      | `demo` \| `contact` \| `resource` |
| `name`     | string    | yes      | 2–60 chars, trimmed |
| `phone`    | string    | yes      | Indian mobile `^[6-9]\d{9}$` (10 digits, normalized) |
| `course`   | string    | demo-only| one of the 8 course values (see rules) |
| `resource` | string    | resource-only | one of the 3 PDF titles (see rules) |
| `message`  | string    | no       | ≤ 500 chars |
| `page`     | string    | yes      | ≤ 200 chars (URL path the form was submitted from) |
| `createdAt`| timestamp | yes      | client time; rules reject >5 min future / >7 days old |

**No other fields are permitted** — the rules reject any document with extra
keys. This is deliberate: it keeps junk/spam writes structurally useless.

## Failure / fallback behavior

| Situation | Library behavior | User-visible result |
|-----------|------------------|---------------------|
| Backend not configured (`CW_CONFIG` absent) | `isConfigured()` → false; `saveLead` resolves `{ok:false}` immediately | WhatsApp opens (unchanged from today) |
| Offline / DNS fail / CORS / timeout (>8s) | catch → resolve `{ok:false, error}` | WhatsApp opens; lead still captured |
| Firestore rejects (rules validation, 4xx/5xx) | resolve `{ok:false, error:'server …'}` | WhatsApp opens; lead still captured |
| Success | resolve `{ok:true}` | WhatsApp opens; lead saved in Firestore |

`saveLead()` **never throws and never rejects**. The frontend wraps it in its
own 8 s timeout as a second safety net and opens WhatsApp in a `finally`-style
path. A Firestore outage is therefore invisible to the visitor.

Spam note: rules cap field lengths and enforce enums, but an attacker can still
write valid-shaped junk. Mitigations: keep the API key's HTTP referrer
restriction off (it would break some browsers) and instead monitor the
`leads` collection; if spam appears, enable App Check or add a CAPTCHA later.
For an institute site this is an acceptable starting posture.

## Security model

- **The Firebase web config (`apiKey` etc.) is public by design.** It ships in
  the page source; anyone can read it. This is how Firebase web apps work.
- **The real boundary is `firestore.rules`** (server-side, cannot be bypassed
  from the browser):
  - Clients can only **create** documents in `leads/{id}`.
  - Every field is type-, length- and enum-validated; unknown fields rejected.
  - `read`, `update`, `delete` are **denied** for all clients.
  - All other collections/paths are denied by the catch-all rule.
- Leads are readable only inside the Firebase console by project members
  (owner adds staff as Viewers — never Editors — via IAM).
- No secrets live in the repo. The API key is not a secret; there is nothing
  else to leak because there is no server and no service account in the client.

## Cost estimate (Firebase Spark — free tier)

| Quota (per day, free) | Expected usage | Cost |
|-----------------------|---------------|------|
| 20,000 writes | ~10–100 leads/day | $0 |
| 50,000 reads | console views only | $0 |
| 1 GiB storage | ~0.5 KB/lead → ~2M leads per GB | $0 |

Realistic monthly bill: **$0 / ₹0**. The Blaze pay-as-you-go plan is not
needed unless the site exceeds 20k writes/day (it won't).

## Future: admin dashboard

When the institute outgrows the Firebase console:
1. Enable **Firebase Authentication** (email/password) for staff.
2. Extend `firestore.rules`: `allow read: if request.auth.token.admin == true`
   (via custom claims) or check membership in an `admins/{uid}` doc.
3. Build a tiny `/admin.html` page (or separate private repo) listing leads,
   with filters by type/course/date and CSV export.
4. No data migration needed — the same `leads` collection is reused.

Optional later hardening: App Check, rate limiting via Cloud Functions,
auto-reply WhatsApp via the WhatsApp Business API.
