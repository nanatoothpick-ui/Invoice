/* =========================================================
   TrioMech Integrated Systems — Invoicing Console
   All data is stored locally in this browser (localStorage).
   ========================================================= */

/* ---------- CONFIG ---------- */
const COMPANY = {
  name: "TrioMech Integrated Systems",
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

const LS_SESSION  = "tm_session";
const LS_INVOICES = "tm_invoices";
const LS_SEQ      = "tm_seq";

/* ---------- STATE ---------- */
let currentItems = [];   // rows for the invoice currently being built
let editingId = null;    // set when re-saving an existing invoice
let historyFilter = "all";
let historySearch = "";
let activeDetailId = null;

/* ---------- STORAGE HELPERS ---------- */
function getInvoices(){
  try { return JSON.parse(localStorage.getItem(LS_INVOICES)) || []; }
  catch(e){ return []; }
}
function saveInvoices(list){
  localStorage.setItem(LS_INVOICES, JSON.stringify(list));
}
function nextInvoiceNumber(){
  let seq = parseInt(localStorage.getItem(LS_SEQ) || "0", 10) + 1;
  localStorage.setItem(LS_SEQ, String(seq));
  const year = new Date().getFullYear();
  return `TM-${year}-${String(seq).padStart(3,"0")}`;
}
function peekInvoiceNumber(){
  const seq = parseInt(localStorage.getItem(LS_SEQ) || "0", 10) + 1;
  const year = new Date().getFullYear();
  return `TM-${year}-${String(seq).padStart(3,"0")}`;
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
  if (where === "history") renderHistory();
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
  $("#invoice-number-tag").textContent = peekInvoiceNumber();
  addItemRow();
  renderItems();
  updateTotals();
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

$("#invoice-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = collectFormData();
  if (!validateForm(data)) return;

  const session = getSession();
  const invoices = getInvoices();

  let record;
  if (editingId){
    record = invoices.find(i => i.id === editingId);
    Object.assign(record, data, { updatedAt: Date.now() });
  } else {
    record = Object.assign({
      id: "inv_" + Date.now(),
      number: nextInvoiceNumber(),
      createdBy: session ? ACCOUNTS[session.user].name : "—",
      createdAt: Date.now()
    }, data);
    invoices.unshift(record);
  }
  saveInvoices(invoices);
  openDetail(record.id);
});

$("#preview-btn").addEventListener("click", () => {
  const data = collectFormData();
  if (!validateForm(data)) return;
  const draft = Object.assign({
    id: null,
    number: editingId ? (getInvoices().find(i=>i.id===editingId)||{}).number : peekInvoiceNumber(),
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

function renderHistory(){
  const list = $("#history-list");
  const empty = $("#history-empty");
  let invoices = getInvoices();

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
      <span></span>
    `;
    row.addEventListener("click", () => openDetail(inv.id));
    list.appendChild(row);
  });
}

/* =========================================================
   DETAIL / PRINT VIEW
   ========================================================= */
function openDetail(id){
  const inv = getInvoices().find(i => i.id === id);
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
      <td class="mono">${escapeHtml(it.category)}</td>
      <td class="mono">${escapeHtml(it.code)}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="num">${it.qty}</td>
      <td class="num mono">${money(it.price)}</td>
      <td class="num mono">${money((Number(it.qty)||0)*(Number(it.price)||0))}</td>
    </tr>
  `).join("");

  $("#invoice-print-area").innerHTML = `
    <div class="inv-header">
      <div class="inv-brand">
        <img src="assets/logo.png" alt="TrioMech logo">
        <div class="inv-brand-text">
          <strong>${COMPANY.name}</strong>
          <span>${COMPANY.address}</span>
        </div>
      </div>
      <div class="inv-meta">
        <div class="inv-num">${inv.number}</div>
        <div class="inv-date">${formatDate(inv.date)}</div>
        <span class="status-badge status-${inv.status}">${inv.status}</span>
      </div>
    </div>

    <div class="inv-bill-row">
      <div class="inv-bill-to">
        <h3>Bill to</h3>
        <p><strong>${escapeHtml(inv.clientName)}</strong></p>
        ${inv.clientAddress ? `<p>${escapeHtml(inv.clientAddress)}</p>` : ""}
        ${inv.clientContact ? `<p>${escapeHtml(inv.clientContact)}</p>` : ""}
      </div>
      <div class="inv-pay-info">
        <h3>Payment</h3>
        <p>Pay to: <strong>${COMPANY.paymentNumber}</strong></p>
        <p>Enquiries (WhatsApp only): ${COMPANY.whatsapp}</p>
        <p>Prepared by: ${escapeHtml(inv.createdBy || "—")}</p>
      </div>
    </div>

    <table class="inv-items">
      <thead>
        <tr>
          <th class="mono">Category</th>
          <th class="mono">Code</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num mono">Unit price</th>
          <th class="num mono">Line total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="inv-totals">
      <table>
        <tr class="grand"><td>Total due</td><td>${money(subtotal)}</td></tr>
      </table>
    </div>

    ${inv.notes ? `<div class="inv-notes"><h3>Notes</h3><p>${escapeHtml(inv.notes)}</p></div>` : ""}

    <div class="inv-footer">
      <span><strong>${COMPANY.name}</strong> — ${COMPANY.address}</span>
      <span>Payment only: ${COMPANY.paymentNumber} &nbsp;•&nbsp; WhatsApp enquiries only: ${COMPANY.whatsapp}</span>
    </div>
  `;
}

$("#detail-print-btn").addEventListener("click", () => window.print());

$("#detail-pdf-btn").addEventListener("click", () => {
  const inv = getInvoices().find(i => i.id === activeDetailId);
  const filename = (inv ? inv.number : "invoice") + ".pdf";
  const el = $("#invoice-print-area");
  html2pdf().set({
    margin: 10,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  }).from(el).save();
});

$("#detail-duplicate-btn").addEventListener("click", () => {
  const inv = getInvoices().find(i => i.id === activeDetailId);
  if (!inv) return;
  editingId = null;
  currentItems = (inv.items||[]).map(i => Object.assign({}, i));
  $("#f-client-name").value = inv.clientName || "";
  $("#f-client-contact").value = inv.clientContact || "";
  $("#f-client-address").value = inv.clientAddress || "";
  $("#f-date").value = new Date().toISOString().slice(0,10);
  $("#f-status").value = "pending";
  $("#f-notes").value = inv.notes || "";
  $("#invoice-number-tag").textContent = peekInvoiceNumber();
  renderItems();
  updateTotals();
  pageDetail.hidden = true; pageNew.hidden = false;
});

$("#detail-delete-btn").addEventListener("click", () => {
  if (!activeDetailId) return;
  if (!confirm("Delete this invoice? This can't be undone.")) return;
  const invoices = getInvoices().filter(i => i.id !== activeDetailId);
  saveInvoices(invoices);
  goTo("history");
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
