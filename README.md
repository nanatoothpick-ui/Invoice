# TrioMech Integrated Systems — Invoicing Console

A single-page invoicing tool: login, create invoices, save them, browse
history, print, and export to PDF. Pure HTML/CSS/JS, no build step —
deploy straight to GitHub Pages. Invoice data is stored centrally in a
**Google Sheet**, so both staff accounts see the same invoices from any
device — nothing lives only in one browser.

## Files
- `index.html` — login screen + app shell (all views live in one page)
- `style.css` — all styling
- `app.js` — all logic (auth, invoice form, Google Sheets API calls, PDF/print)
- `assets/logo.png` — your logo
- `Code.gs` — the backend script that goes into your Google Sheet

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

---

## Setting up the Google Sheet backend

### 1. Create the Sheet
Create a new Google Sheet (any name, e.g. "TrioMech Invoices"). You
don't need to add any headers or columns yourself — the script creates
an "Invoices" tab with the right columns automatically the first time
it runs.

### 2. Add the script
1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete whatever is in the default `Code.gs` file.
3. Open `Code.gs` from this project, copy everything, and paste it in.
4. Click the save icon (or Ctrl/Cmd+S).
5. Set your secret token as a **Script Property** (this keeps it out of
   the code itself, so it doesn't travel if you ever share or copy this
   file):
   - Click the gear icon (**Project Settings**) in the left sidebar.
   - Scroll to **Script Properties → Add script property**.
   - Property: `MY_SECRET_TOKEN`
   - Value: any random string of your own (letters/numbers, no spaces)
   - Click **Save**.

### 3. Deploy it as a web app
1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Google will ask you to authorize the script — click **Authorize
   access**, choose your Google account, then click **Advanced → Go to
   [project name] (unsafe)**. This warning appears because it's your
   own unpublished script, not because anything is actually wrong —
   you're the one who wrote it.
6. Copy the **Web app URL** it gives you (ends in `/exec`).

### 4. Connect the app to it
In `app.js`, near the top, fill in the two lines:
```js
const API_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
const API_TOKEN = "PUT-YOUR-OWN-SECRET-HERE";
```
- `API_URL` — the `/exec` URL you just copied.
- `API_TOKEN` — must be **exactly the same string** you saved as
  `MY_SECRET_TOKEN` in the Sheet's Script Properties.

Save, re-deploy to GitHub Pages, and you're live. Try creating a test
invoice — a new "Invoices" tab should appear in your Sheet with the
row in it.

### Updating the script later
If you ever edit `Code.gs` again, saving alone isn't enough to update
the live URL — go to **Deploy → Manage deployments → edit (pencil
icon) → New version → Deploy** so your changes actually take effect.

---

## Data storage
- All invoices live in the **Invoices** tab of your Google Sheet —
  shared, cross-device, and visible/editable there directly if you
  ever need to fix something by hand.
- Line items for each invoice are stored as a small JSON blob in the
  `itemsJson` column (that's normal — it keeps the sheet simple even
  though an invoice can have many items).
- Invoice numbers auto-increment as `TM-{year}-{seq}`, calculated from
  the highest existing number for the current year each time.
- The login session itself is only kept in the browser tab
  (`sessionStorage`), so each person still logs in on their own device
  — only invoice data is centralized.

## PDF export
Uses `html2pdf.js` (loaded from cdnjs). The PDF page is sized to fit
the invoice's actual content, so it always prints as a single sheet no
matter how many items are on it.

## Deploying
1. Push this folder to a GitHub repo.
2. Enable GitHub Pages (Settings → Pages → deploy from `main` branch).
3. Share the resulting URL with Niko and Ginger.

## Customizing
- Company details (name, slogan, address, payment number, WhatsApp) are
  set once at the top of `app.js` in the `COMPANY` object.
- Colors and fonts are all defined as CSS variables at the top of
  `style.css` under `:root`.

## If something's not saving
Open the browser console (right-click → Inspect → Console). API errors
also show as a small dark banner at the bottom of the screen. The most
common causes are: `API_URL` or `API_TOKEN` not filled in yet, the
token not matching the `MY_SECRET_TOKEN` script property, the script
property not set at all, or the Apps Script deployment needing a new
version after an edit (see above).

