# TrioMech Integrated Systems — Invoicing Console

A single-page invoicing tool: login, create invoices, save them, browse
history, print, and export to PDF. Pure HTML/CSS/JS, no build step —
deploy straight to GitHub Pages.

## Files
- `index.html` — login screen + app shell (all views live in one page)
- `style.css` — all styling
- `app.js` — all logic (auth, invoice form, storage, PDF/print)
- `assets/logo.png` — your logo

## Accounts
Two hardcoded staff accounts, set at the top of `app.js`:

```js
const ACCOUNTS = {
  niko:   { name: "Niko",   pass: "TrioNiko25" },
  ginger: { name: "Ginger", pass: "TrioGinger25" }
};
```

**Change these passcodes before sharing the link with anyone.** Because
this is a static site with no server, the passcodes live in plain text
in `app.js` — anyone who views the page source can read them. This is
enough to keep casual visitors out, but it is not real account security.
If you ever need that (e.g. this becomes a public-facing tool with real
secrets to protect), it would need a proper backend login, similar to
how Register uses Supabase.

## Data storage
- Invoices are saved in the browser's `localStorage`, under the key
  `tm_invoices` — this means invoices are **per device/browser**, not
  shared between Niko's and Ginger's computers. If you outgrow that
  (e.g. you want both of you to see the same invoice list from any
  device), the next step is a small Supabase table, the same pattern
  used in Register.
- The login session itself is `sessionStorage`, so it clears when the
  browser tab is closed (each person logs in again next time).
- Invoice numbers auto-increment as `TM-{year}-{seq}` and are tracked
  in `localStorage` under `tm_seq`.

## PDF export
Uses `html2pdf.js` (loaded from cdnjs) to turn the invoice sheet into a
downloadable PDF — no server needed.

## Deploying
1. Push this folder to a GitHub repo.
2. Enable GitHub Pages (Settings → Pages → deploy from `main` branch).
3. Share the resulting URL with Niko and Ginger.

## Customizing
- Company details (name, address, payment number, WhatsApp) are set
  once at the top of `app.js` in the `COMPANY` object — edit there if
  anything changes.
- Colors and fonts are all defined as CSS variables at the top of
  `style.css` under `:root`.
