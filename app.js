/* =========================================================
   TrioMech Integrated Systems — Invoicing Console
   All data is stored locally in this browser (localStorage).
   ========================================================= */

/* ---------- CONFIG ---------- */
const COMPANY = {
  name: "TrioMech Integrated Systems",
  slogan: "Unified Engineering. Limitless Potential.",
  address: "Hansan Road, Timber Market, Accra, Ghana",
  paymentNumber: "0598832854",
  whatsapp: "0270757772",
  currency: "GHS"
};

// Two staff accounts. Change these passcodes before you deploy this
// publicly — they live in this JS file, so anyone who views the page
// source can read them. This is basic staff-only gating, not real
// account security (there's no server here to keep secrets on).
const ACCOUNTS = {
  niko:   { name: "Niko",   pass: "TrioNiko25" },
  ginger: { name: "Ginger", pass: "TrioGinger25" }
};

// Google Sheets backend (Apps Script Web App). See README.md for setup.
// Paste the /exec URL you get after deploying, and the same TOKEN you
// set in Code.gs. This token also lives in plain sight in this file —
// same tradeoff as the account passcodes above.
const API_URL = "https://script.google.com/macros/s/AKfycbyQFU8u3NHsosUmNj4edbJM-5B4mDsAdp_GGafnD8_C-_nslNvXAx6W1orIZzUUsXGC/exec";
const API_TOKEN = "Trio2026Xk978";

const LS_SESSION = "tm_session"; // only the login session stays local

/* ---------- STATE ---------- */
let currentItems = [];   // rows for the invoice currently being built
let editingId = null;    // set when re-saving an existing invoice
let historyFilter = "all";
let historySearch = "";
let activeDetailId = null;
let invoicesCache = [];  // last list fetched from the Sheet

/* ---------- API HELPERS ---------- */
async function apiGet(params){
  const url = new URL(API_URL);
  Object.entries(Object.assign({ token: API_TOKEN }, params)).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(payload){
  // text/plain avoids a CORS preflight, which Apps Script web apps don't
  // handle — this is the standard trick for calling Apps Script from
  // a different origin like GitHub Pages.
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ token: API_TOKEN }, payload))
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function fetchInvoices(){
  invoicesCache = await apiGet({ action: "list" });
  return invoicesCache;
}

function nextNumberFromCache(){
  const year = new Date().getFullYear();
  const prefix = `TM-${year}-`;
  const nums = invoicesCache
    .map(i => i.number)
    .filter(n => n && String(n).startsWith(prefix))
    .map(n => parseInt(String(n).slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

/* ---------- TOAST (error feedback) ---------- */
function showError(msg){
  console.error(msg);
  let el = document.getElementById("toast");
  if (!el){
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showError._t);
  showError._t = setTimeout(() => el.classList.remove("show"), 6000);
}

/* ---------- MONEY FORMAT ---------- */
function money(n){
  const v = Number(n) || 0;
  return `${COMPANY.currency} ${v.toLocaleString("en-GH", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

/* ---------- DOM REFS ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const loginView = $("#login-view");
const appView = $("#app-view");
const loginForm = $("#login-form");
const loginError = $("#login-error");

const pageNew = $("#view-new");
const pageHistory = $("#view-history");
const pageDetail = $("#view-detail");

/* =========================================================
   AUTH
   ========================================================= */
function getSession(){
  try { return JSON.parse(sessionStorage.getItem(LS_SESSION)); }
  catch(e){ return null; }
}
function setSession(userKey){
  sessionStorage.setItem(LS_SESSION, JSON.stringify({ user: userKey, at: Date.now() }));
}
function clearSession(){
  sessionStorage.removeItem(LS_SESSION);
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const userKey = $("#login-user").value;
  const pass = $("#login-pass").value;
  const account = ACCOUNTS[userKey];
  if (account && account.pass === pass){
    loginError.hidden = true;
    setSession(userKey);
    enterApp();
  } else {
    loginError.hidden = false;
  }
});

$("#logout-btn").addEventListener("click", () => {
  clearSession();
  location.reload();
});

function enterApp(){
  const session = getSession();
  if (!session || !ACCOUNTS[session.user]){
    loginView.hidden = false;
    appView.hidden = true;
    return;
  }
  loginView.hidden = true;
  appView.hidden = false;
  $("#sidebar-username").textContent = ACCOUNTS[session.user].name;
  goTo("new");
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function goTo(where){
  pageNew.hidden = where !== "new";
  pageHistory.hidden = where !== "history";
  pageDetail.hidden = where !== "detail";

  $("#nav-new").classList.toggle("is-active", where === "new");
  $("#nav-history").classList.toggle("is-active", where === "history");

  if (where === "new") resetForm();
  if (where === "history") loadHistory();
}
$("#nav-new").addEventListener("click", () => goTo("new"));
$("#nav-history").addEventListener("click", () => goTo("history"));
$("#detail-back-btn").addEventListener("click", () => goTo("history"));

/* =========================================================
   NEW INVOICE FORM
   ========================================================= */
function resetForm(){
  editingId = null;
  currentItems = [];
  $("#invoice-form").reset();
  $("#f-date").value = new Date().toISOString().slice(0,10);
  $("#f-payref").value = COMPANY.paymentNumber;
  $("#invoice-number-tag").textContent = "Loading…";
  addItemRow();
  renderItems();
  updateTotals();
  fetchInvoices()
    .then(() => { $("#invoice-number-tag").textContent = nextNumberFromCache(); })
    .catch(err => {
      $("#invoice-number-tag").textContent = "TM-—";
      showError("Couldn't reach the Google Sheet: " + err.message);
    });
}

function addItemRow(data){
  currentItems.push(Object.assign({
    category: "Mechanical",
    code: "",
    description: "",
    qty: 1,
    price: 0
  }, data || {}));
}

function renderItems(){
  const tbody = $("#items-tbody");
  tbody.innerHTML = "";
  currentItems.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-cat">
        <select data-idx="${idx}" data-field="category">
          <option value="Mechanical" ${item.category==="Mechanical"?"selected":""}>Mechanical</option>
          <option value="Electrical" ${item.category==="Electrical"?"selected":""}>Electrical</option>
        </select>
      </td>
      <td class="col-code"><input type="text" data-idx="${idx}" data-field="code" value="${escapeAttr(item.code)}" placeholder="e.g. MEC-014"></td>
      <td class="col-desc"><input type="text" data-idx="${idx}" data-field="description" value="${escapeAttr(item.description)}" placeholder="Item description"></td>
      <td class="col-qty"><input type="number" min="0" step="1" data-idx="${idx}" data-field="qty" value="${item.qty}"></td>
      <td class="col-price"><input type="number" min="0" step="0.01" data-idx="${idx}" data-field="price" value="${item.price}"></td>
      <td class="col-total line-total-cell">${money(item.qty * item.price)}</td>
      <td class="col-del"><button type="button" class="row-del-btn" data-idx="${idx}" title="Remove item">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

$("#items-tbody").addEventListener("input", (e) => {
  const idx = e.target.getAttribute("data-idx");
  const field = e.target.getAttribute("data-field");
  if (idx === null || !field) return;
  let val = e.target.value;
  if (field === "qty" || field === "price") val = parseFloat(val) || 0;
  currentItems[idx][field] = val;
  if (field === "qty" || field === "price"){
    const row = e.target.closest("tr");
    row.querySelector(".line-total-cell").textContent = money(currentItems[idx].qty * currentItems[idx].price);
  }
  updateTotals();
});

$("#items-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest(".row-del-btn");
  if (!btn) return;
  const idx = parseInt(btn.getAttribute("data-idx"), 10);
  currentItems.splice(idx, 1);
  if (currentItems.length === 0) addItemRow();
  renderItems();
  updateTotals();
});

$("#add-item-btn").addEventListener("click", () => {
  addItemRow();
  renderItems();
  updateTotals();
});

function updateTotals(){
  const count = currentItems.reduce((a,i) => a + (Number(i.qty)||0), 0);
  const grand = currentItems.reduce((a,i) => a + (Number(i.qty)||0) * (Number(i.price)||0), 0);
  $("#totals-count").textContent = count;
  $("#totals-grand").textContent = money(grand);
}

$("#reset-form-btn").addEventListener("click", () => {
  if (confirm("Clear this form? Unsaved changes will be lost.")) resetForm();
});

function collectFormData(){
  return {
    clientName: $("#f-client-name").value.trim(),
    clientContact: $("#f-client-contact").value.trim(),
    clientAddress: $("#f-client-address").value.trim(),
    date: $("#f-date").value,
    status: $("#f-status").value,
    notes: $("#f-notes").value.trim(),
    items: currentItems.filter(i => i.description || i.code),
  };
}

function validateForm(data){
  if (!data.clientName) { alert("Please enter the client's name."); return false; }
  if (!data.items.length) { alert("Add at least one item to the invoice."); return false; }
  for (const it of data.items){
    if (!it.code) { alert("Every item needs a unique item code."); return false; }
  }
  return true;
}

$("#invoice-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = collectFormData();
  if (!validateForm(data)) return;

  const session = getSession();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    await fetchInvoices(); // refresh right before saving, to keep numbering in sync
    let record;
    if (editingId){
      const existing = invoicesCache.find(i => i.id === editingId);
      record = Object.assign({}, existing, data, { updatedAt: Date.now() });
    } else {
      record = Object.assign({
        id: "inv_" + Date.now(),
        number: nextNumberFromCache(),
        createdBy: session ? ACCOUNTS[session.user].name : "—",
        createdAt: Date.now()
      }, data);
    }
    await apiPost({ action: "save", invoice: record });
    await fetchInvoices();
    openDetail(record.id);
  } catch (err){
    showError("Couldn't save to Google Sheets: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

$("#preview-btn").addEventListener("click", () => {
  const data = collectFormData();
  if (!validateForm(data)) return;
  const draft = Object.assign({
    id: null,
    number: editingId ? ((invoicesCache.find(i=>i.id===editingId)||{}).number) : nextNumberFromCache(),
    createdBy: (getSession() && ACCOUNTS[getSession().user].name) || "—"
  }, data);
  renderInvoiceSheet(draft);
  pageNew.hidden = true; pageHistory.hidden = true; pageDetail.hidden = false;
  $("#detail-heading").textContent = draft.number + " (preview)";
  toggleDetailActionsForPreview(true);
});

/* =========================================================
   HISTORY
   ========================================================= */
$("#history-search").addEventListener("input", (e) => {
  historySearch = e.target.value.trim().toLowerCase();
  renderHistory();
});
$("#filter-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  historyFilter = chip.getAttribute("data-filter");
  $$(".chip").forEach(c => c.classList.toggle("is-active", c === chip));
  renderHistory();
});

async function loadHistory(){
  const list = $("#history-list");
  const empty = $("#history-empty");
  empty.hidden = true;
  list.innerHTML = '<p class="empty-state">Loading invoices from Google Sheets…</p>';
  try {
    await fetchInvoices();
    renderHistory();
  } catch (err){
    list.innerHTML = "";
    showError("Couldn't load invoices from Google Sheets: " + err.message);
    list.innerHTML = '<p class="empty-state">Couldn\'t load invoices. Check your connection and try again.</p>';
  }
}

function renderHistory(){
  const list = $("#history-list");
  const empty = $("#history-empty");
  let invoices = invoicesCache.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  if (historyFilter !== "all"){
    invoices = invoices.filter(i => i.status === historyFilter);
  }
  if (historySearch){
    invoices = invoices.filter(i => {
      const hay = [
        i.number, i.clientName,
        ...(i.items||[]).map(it => it.code + " " + it.description)
      ].join(" ").toLowerCase();
      return hay.includes(historySearch);
    });
  }

  list.innerHTML = "";
  empty.hidden = invoices.length !== 0;

  invoices.forEach(inv => {
    const total = (inv.items||[]).reduce((a,i)=>a+(Number(i.qty)||0)*(Number(i.price)||0),0);
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <span class="h-num">${inv.number}</span>
      <span class="h-client">${escapeHtml(inv.clientName)}</span>
      <span class="h-date">${formatDate(inv.date)}</span>
      <span class="status-badge status-${inv.status}">${inv.status}</span>
      <span class="h-total">${money(total)}</span>
      <span class="h-by" title="Prepared by (internal record — not shown on the invoice)">${escapeHtml(inv.createdBy || "")}</span>
    `;
    row.addEventListener("click", () => openDetail(inv.id));
    list.appendChild(row);
  });
}

/* =========================================================
   DETAIL / PRINT VIEW
   ========================================================= */
function openDetail(id){
  const inv = invoicesCache.find(i => i.id === id);
  if (!inv) return;
  activeDetailId = id;
  renderInvoiceSheet(inv);
  $("#detail-heading").textContent = inv.number;
  toggleDetailActionsForPreview(false);
  pageNew.hidden = true; pageHistory.hidden = true; pageDetail.hidden = false;
}

function toggleDetailActionsForPreview(isPreview){
  $("#detail-duplicate-btn").hidden = isPreview;
  $("#detail-delete-btn").hidden = isPreview;
  $("#detail-back-btn").textContent = isPreview ? "← Back to form" : "← Back";
  $("#detail-back-btn").onclick = () => {
    if (isPreview){ pageDetail.hidden = true; pageNew.hidden = false; }
    else { goTo("history"); }
  };
}

function renderInvoiceSheet(inv){
  const items = inv.items || [];
  const subtotal = items.reduce((a,i)=>a+(Number(i.qty)||0)*(Number(i.price)||0),0);
  const rows = items.map(it => `
    <tr>
      <td class="mono">${escapeHtml(it.code)}</td>
      <td class="mono">${escapeHtml(shortCat(it.category))}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="num">${it.qty}</td>
      <td class="num mono">${money(it.price)}</td>
      <td class="num mono">${money((Number(it.qty)||0)*(Number(it.price)||0))}</td>
    </tr>
  `).join("");

  $("#invoice-print-area").innerHTML = `
    <div class="inv-letterhead">
      <div class="inv-brand">
        <img src="assets/logo.png" alt="TrioMech logo">
        <div class="inv-brand-text">
          <strong>${COMPANY.name}</strong>
          <em>${COMPANY.slogan}</em>
        </div>
      </div>
      <div class="inv-contact">
        <p>${COMPANY.address}</p>
        <p>Payment only: ${COMPANY.paymentNumber} &nbsp;|&nbsp; WhatsApp enquiries only: ${COMPANY.whatsapp}</p>
      </div>
    </div>

    <div class="inv-title-row">
      <div class="inv-doc-title">INVOICE N° : <span>${inv.number}</span></div>
      <span class="status-badge status-${inv.status}">${inv.status}</span>
    </div>

    <div class="inv-bill-row">
      <div class="inv-box inv-bill-to">
        <strong>${escapeHtml(inv.clientName)}</strong>
        ${inv.clientAddress ? `<p>${escapeHtml(inv.clientAddress)}</p>` : ""}
        <p>TEL &nbsp; ${inv.clientContact ? escapeHtml(inv.clientContact) : "—"}</p>
      </div>
      <div class="inv-box inv-meta-box">
        <p>ACCRA DATE &nbsp; <strong>${formatDate(inv.date)}</strong></p>
        <p>ATT &nbsp; :</p>
        <p>D. // DDP N° &nbsp; :</p>
      </div>
    </div>

    <table class="inv-items">
      <thead>
        <tr>
          <th class="mono">Code</th>
          <th class="mono">Cat.</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num mono">Price</th>
          <th class="num mono">Total price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="inv-totals">
      <table>
        <tr class="grand"><td>Total value, GH Cedis</td><td>${money(subtotal)}</td></tr>
      </table>
    </div>

    ${inv.notes ? `<div class="inv-notes"><h3>Notes</h3><p>${escapeHtml(inv.notes)}</p></div>` : ""}

    <div class="inv-footer">
      <ul class="inv-footer-notes">
        <li>Goods are subject to prior sale</li>
        <li>Prices subject to change without prior notice</li>
        <li>No warranty on electrical parts</li>
      </ul>
      <p class="inv-footer-thanks">Hoping that our offer will be convenient for you, we remain at your disposal for any further questions. Yours truly.</p>
    </div>
  `;
}

// Convert measured pixels to millimetres (96 CSS px per inch).
const pxToMm = (px) => px * 25.4 / 96;
const PAGE_MARGIN_MM = 12;
const SHEET_WIDTH_MM = 210; // fixed A4 width, so the layout/branding stays consistent

// However long the invoice gets, it must land on ONE sheet: instead of a
// fixed page height, size the PDF page to exactly fit the rendered content.
function getFitPageSizeMM(el){
  const heightPx = el.scrollHeight;
  const heightMm = pxToMm(heightPx) + PAGE_MARGIN_MM * 2;
  return [SHEET_WIDTH_MM, Math.max(heightMm, 148)]; // never smaller than A5 height
}

$("#detail-print-btn").addEventListener("click", () => {
  const el = $("#invoice-print-area");
  const [, heightMm] = getFitPageSizeMM(el);
  // Best-effort: ask the browser to use a page exactly as tall as the
  // invoice, so a long item list still prints/saves as a single sheet
  // instead of spilling onto a second page. Physical printers with a
  // fixed paper size will fall back to their own page size.
  const styleTag = document.createElement("style");
  styleTag.id = "dynamic-print-size";
  styleTag.textContent = `@page { size: ${SHEET_WIDTH_MM}mm ${heightMm.toFixed(1)}mm; margin: ${PAGE_MARGIN_MM}mm; }`;
  document.head.appendChild(styleTag);
  window.print();
  setTimeout(() => styleTag.remove(), 500);
});

$("#detail-pdf-btn").addEventListener("click", () => {
  const inv = invoicesCache.find(i => i.id === activeDetailId);
  const filename = (inv ? inv.number : "invoice") + ".pdf";
  const el = $("#invoice-print-area");
  const format = getFitPageSizeMM(el);
  html2pdf().set({
    margin: PAGE_MARGIN_MM,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format, orientation: "portrait" },
    pagebreak: { mode: ["avoid-all"] }
  }).from(el).save();
});

$("#detail-duplicate-btn").addEventListener("click", () => {
  const inv = invoicesCache.find(i => i.id === activeDetailId);
  if (!inv) return;
  editingId = null;
  currentItems = (inv.items||[]).map(i => Object.assign({}, i));
  $("#f-client-name").value = inv.clientName || "";
  $("#f-client-contact").value = inv.clientContact || "";
  $("#f-client-address").value = inv.clientAddress || "";
  $("#f-date").value = new Date().toISOString().slice(0,10);
  $("#f-status").value = "pending";
  $("#f-notes").value = inv.notes || "";
  $("#invoice-number-tag").textContent = nextNumberFromCache();
  renderItems();
  updateTotals();
  pageDetail.hidden = true; pageNew.hidden = false;
});

$("#detail-delete-btn").addEventListener("click", async () => {
  if (!activeDetailId) return;
  if (!confirm("Delete this invoice? This can't be undone.")) return;
  const btn = $("#detail-delete-btn");
  btn.disabled = true; btn.textContent = "Deleting…";
  try {
    await apiPost({ action: "delete", id: activeDetailId });
    await fetchInvoices();
    goTo("history");
  } catch (err){
    showError("Couldn't delete invoice: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Delete";
  }
});

/* =========================================================
   UTIL
   ========================================================= */
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(str){ return escapeHtml(str); }
function shortCat(cat){ return cat === "Electrical" ? "ELEC" : "MECH"; }
function formatDate(d){
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

/* =========================================================
   BOOT
   ========================================================= */
(function boot(){
  const session = getSession();
  if (session && ACCOUNTS[session.user]){
    enterApp();
  } else {
    loginView.hidden = false;
    appView.hidden = true;
  }
})();
