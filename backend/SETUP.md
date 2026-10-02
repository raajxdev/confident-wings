# Confident Wings — Firebase backend setup guide

For the site owner. No coding needed — just clicking through the Firebase
console. Takes about 15 minutes. Nothing here costs money (free tier).

> **Important:** the Firebase "API key" you will paste into the site is
> **public by design** — it ships inside the webpage and anyone can read it.
> That is normal for Firebase web apps. Your leads are protected by the
> **security rules** (step 4), not by the key. Never paste any *service
> account* or *private* key anywhere — this setup doesn't need one.

## What you need

- A Google account (any Gmail works).
- The files in this folder: `cw-backend.js`, `firestore.rules`.

## Step 1 — Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in.
2. Click **Add project** (or "Create a project").
3. Name it `confident-wings` (the ID can be anything; note it down).
4. Google Analytics: **not needed** — you may disable it.
5. Click **Create project**, wait, then **Continue**.

## Step 2 — Create the Firestore database

1. In the left menu: **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode** (we will paste our own rules next).
4. Location: pick **`asia-south1 (Mumbai)`** — closest to your visitors.
5. Click **Enable**. Wait ~1 minute for provisioning.

## Step 3 — Get the web config and put it in the site

1. Click the **gear icon → Project settings** (top-left, next to "Project Overview").
2. Scroll to **Your apps** → click the **`</>`** (web) icon.
3. App nickname: `confident-wings-site`. Firebase Hosting: **do not tick**
   (the site stays on GitHub Pages).
4. Click **Register app**. Copy the `firebaseConfig` block — it looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy…",
     authDomain: "confident-wings-12345.firebaseapp.com",
     projectId: "confident-wings-12345",
     storageBucket: "confident-wings-12345.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef…"
   };
   ```
5. In the site's `index.html`, **before** the `<script src="cw-backend.js">`
   tag, add:
   ```html
   <script>
     window.CW_CONFIG = {
       firebase: {
         apiKey: "…paste…",
         authDomain: "…paste…",
         projectId: "…paste…",
         storageBucket: "…paste…",
         messagingSenderId: "…paste…",
         appId: "…paste…"
       }
     };
   </script>
   <script src="cw-backend.js"></script>
   ```
6. Commit + push. The site works **with or without** this block — without it,
   forms behave exactly as today (WhatsApp only).

## Step 4 — Publish the security rules (do not skip)

1. **Build → Firestore Database → Rules** tab.
2. Delete the default rules text, paste the entire contents of
   `firestore.rules` from this folder.
3. Click **Publish**. Wait for "Rules published successfully".

### Verify the rules are active

1. Still on the **Rules** tab, confirm the published timestamp says "just now".
2. Click **Rules playground** (top-right of the Rules tab):
   - Simulation type: **create**, Location: `/leads/test123`.
   - Paste a valid document, e.g.
     ```json
     {"type":"demo","name":"Test User","phone":"9876543210",
      "course":"spoken-english","page":"/","createdAt":"2026-10-02T10:00:00Z"}
     ```
     → should show **Allowed**.
   - Change `"phone"` to `"123"` → should show **Denied**.
   - Simulation type: **get** on `/leads/test123` → should show **Denied**.
3. If all three behave as above, the rules are live.

## Step 5 — Test with a real lead

1. Open the live site, fill the **demo form** with a test name and your own
   phone number, submit.
2. WhatsApp should open as usual (this must never break).
3. In Firebase console: **Firestore Database → Data** tab → a `leads`
   collection should appear containing your test document.
4. **Delete the test document** (click it → Delete) so test data doesn't mix
   with real leads.

## Step 6 — View leads (day to day)

- **Firestore Database → Data → `leads`**: click any document to see the lead.
- Sort/filter: click a column header, or use **"Filter"** to find e.g. all
  `type == "resource"` leads.
- To remove test/spam entries: open the document → **Delete document**.

## Give staff view access (optional)

1. **Gear icon → Project settings → Users and permissions**.
2. **Add member** → enter their Gmail → role **Viewer**
   (Viewer can see leads; cannot change rules or delete the project).
3. Never grant Editor/Owner to anyone who only needs to read leads.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| No `leads` collection after a test submit | `CW_CONFIG` missing/typo'd (check `window.CWBackend.isConfigured()` in the browser console → should be `true`), or rules rejected the write (check the document shape against the rules) |
| WhatsApp doesn't open | Unrelated to this backend — the library never blocks it; check the form's own JS |
| "Missing or insufficient permissions" in console | Rules not published yet, or payload failed validation (phone not 10-digit Indian mobile, unknown course/resource string) |
| Leads appear but with wrong course names | The frontend must pass course/resource strings **exactly** as listed in `firestore.rules` |

## When the free tier could run out

It won't at this scale: 20,000 free writes/day ≈ 600× a busy day of leads.
If you ever see quota warnings in **Usage** tab, that's the time to look at
the Blaze plan — until then, ignore it.
