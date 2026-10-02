# Confident Wings

Website for **Confident Wings** — Spoken English & Public Speaking Institute,
Basirhat, West Bengal. Coach: Susanta Mondal ("Sir").

Live: https://raajxdev.github.io/confident-wings/

## Structure

- `index.html` — the whole site. Single self-contained file, vanilla
  HTML/CSS/JS, no build step, no frameworks. Edit copy directly in here.
- `backend/` — Firebase lead-capture backend (optional):
  - `cw-backend.js` — dependency-free client library, loaded by `index.html`.
    Writes every form lead (demo / contact / free-resource) to Firestore.
  - `firestore.rules` — security rules: clients may only *create* leads,
    every field validated server-side.
  - `ARCHITECTURE.md` — design overview, data flows, costs.
  - `SETUP.md` — step-by-step setup (create Firebase project, paste config,
    publish rules).
  - `FORM_CONTRACT.md` — the frontend ↔ backend integration spec.

## Backend status

The site works fully **without** the backend: forms fall back to WhatsApp.
To enable lead capture, follow `backend/SETUP.md` (one-time, ~15 min, free)
and paste the Firebase web config into the `window.CW_CONFIG` block near the
bottom of `index.html`.

## Placeholders (need real data)

See the `TODO` comment at the top of `index.html`: batch timetable times,
YouTube video IDs, `hello@confidentwings.in`, coach photo, and unverified
prices/claims. Replace before treating any of those as final.
