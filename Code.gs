/**
 * TrioMech Invoicing — Google Sheets backend
 * -------------------------------------------
 * Paste this whole file into Extensions > Apps Script (replacing the
 * default Code.gs content), set TOKEN below to a secret of your own,
 * then deploy as a Web App. See the README for full steps.
 */

const SHEET_NAME = "Invoices";

// Stored in Project Settings → Script Properties (not hardcoded here),
// so the secret doesn't travel if you ever share or copy this file.
// Must match API_TOKEN in app.js exactly.
const TOKEN = PropertiesService.getScriptProperties().getProperty("MY_SECRET_TOKEN");

const COLUMNS = [
  "id", "number", "date", "clientName", "clientContact", "clientAddress",
  "status", "notes", "createdBy", "createdAt", "updatedAt", "itemsJson"
];

function doGet(e) {
  if (!TOKEN) return jsonOut({ error: "Server misconfigured: MY_SECRET_TOKEN script property not set" });
  if (e.parameter.token !== TOKEN) return jsonOut({ error: "Unauthorized" });
  const action = e.parameter.action || "list";
  if (action === "list") return jsonOut(listInvoices());
  return jsonOut({ error: "Unknown action" });
}

function doPost(e) {
  if (!TOKEN) return jsonOut({ error: "Server misconfigured: MY_SECRET_TOKEN script property not set" });
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: "Bad request body" });
  }
  if (body.token !== TOKEN) return jsonOut({ error: "Unauthorized" });

  if (body.action === "save") return jsonOut(saveInvoice(body.invoice));
  if (body.action === "delete") return jsonOut(deleteInvoice(body.id));
  return jsonOut({ error: "Unknown action" });
}

/* ---------- sheet helpers ---------- */

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
  }
  return sheet;
}

function listInvoices() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data
    .filter(row => row[0]) // skip blank rows
    .map(row => rowToInvoice(headers, row));
}

function rowToInvoice(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  try { obj.items = JSON.parse(obj.itemsJson || "[]"); }
  catch (e) { obj.items = []; }
  delete obj.itemsJson;
  return obj;
}

function saveInvoice(inv) {
  if (!inv || !inv.id) return { error: "Missing invoice id" };
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === inv.id) { rowIndex = i + 1; break; }
  }

  const row = headers.map(h =>
    h === "itemsJson" ? JSON.stringify(inv.items || []) : (inv[h] !== undefined ? inv[h] : "")
  );

  if (rowIndex === -1) {
    sheet.appendRow(row);
  } else {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  }
  return { ok: true };
}

function deleteInvoice(id) {
  if (!id) return { error: "Missing id" };
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { ok: true };
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
