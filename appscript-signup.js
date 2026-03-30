// Google Apps Script — paste into Extensions > Apps Script in your Google Sheet
// After pasting, click Deploy > New deployment > Web app
// Set "Execute as" to yourself, "Who has access" to "Anyone"
// Copy the deployment URL and paste it into SHEET_URL in index.html

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var params = e.parameter;

    // Validate required fields
    if (!params.email || !params.source || params.source !== 'redline_signup_v1') {
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'error', message: 'Invalid submission' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Validate token
    if (!params.token || params.token !== 'redline_safety_first_2026') {
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'error', message: 'Invalid token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Check for duplicate email
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === params.email) {
        return ContentService
          .createTextOutput(JSON.stringify({ result: 'duplicate', message: 'Already signed up' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Append row
    sheet.appendRow([
      params.email,
      params.name || '',
      params.source,
      new Date().toISOString(),
      params.page || '',
      params.ua || '',
      params.origin || '',
      params.referrer || '',
      params.session_id || '',
      params.utm_source || '',
      params.utm_medium || '',
      params.utm_campaign || '',
      params.utm_term || '',
      params.utm_content || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}
