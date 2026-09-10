// Google Apps Script bound to:
// https://docs.google.com/spreadsheets/d/1WEhedr0Z5aojUGwAehwF3MCyEUbBfLgsPnDnnfHghxc
//
// Deploy once (sheet owner Google account):
// 1. Spreadsheet → Extensions → Apps Script
// 2. Paste this file, Save
// 3. Deploy → New deployment → Type: Web app
//    Execute as: Me
//    Who has access: Anyone
// Deployed Web app URL (Anyone):
// https://script.google.com/macros/s/AKfycbx62XSiKseDBKlevj8QZTSobPEtezm6Kf1l4qkqMNp5EdRFNGAPQj0xlxOBCTFDM7hO9Q/exec

const SHEET_ID = '1WEhedr0Z5aojUGwAehwF3MCyEUbBfLgsPnDnnfHghxc';
const HEADERS = [
  'Horodatage',
  'Prénom & Nom',
  'Email',
  'WhatsApp',
  'Où tu en es actuellement',
  'Objectifs',
  'Expérience vente / relation client / administratif',
  "Ce qu'il te manque",
  'Tu veux démarrer',
  'Depuis quand tu me connais',
  'Présence confirmée',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'page_url'
];

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  } else {
    const existing = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    const mismatch = HEADERS.some(function(h, i) { return String(existing[i] || '') !== h; });
    if (mismatch) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    ensureHeaders(sheet);
    sheet.appendRow([
      new Date(),
      data.prenom_nom || data.prenom || '',
      data.email || '',
      data.whatsapp || '',
      data.situation || data.q1 || '',
      data.objectifs || data.q2 || '',
      data.experience || data.q3 || '',
      data.manque || data.q4 || '',
      data.demarrage || data.q5 || '',
      data.connaissance || data.q6 || '',
      data.presence || data.q7 || '',
      data.utm_source || '',
      data.utm_medium || '',
      data.utm_campaign || '',
      data.page_url || ''
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('AMB quiz endpoint OK');
}
