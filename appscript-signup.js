/**
 * DROP-IN REPLACEMENT FOR YOUR WAITLIST WEB APP
 *
 * What it does:
 * - Accepts POSTs from the Redline landing page (doPost)
 * - Appends a row to the "Waitlist" sheet
 * - Sends an autoresponder welcome email via Gmail "Send as" alias
 * - Emails you an alert for new submissions (rate-limited)
 * - Sends a SignUp conversion event to Reddit CAPI (if rdt_cid present)
 * - Returns plain-text "OK"
 *
 * Activation:
 * - Run authorizeAll() once in the Apps Script editor to grant
 *   all required permissions.
 * - Add admin@getredlineapp.com as a "Send as" alias in Gmail:
 *   Gmail Settings > Accounts > Send mail as > Add another address
 *   SMTP: mail.privateemail.com, port 465, SSL
 *   Username: maurice@getredlineapp.com
 * - Set REDDIT_PIXEL_ID and REDDIT_CAPI_TOKEN in Script Properties
 *   (Project Settings > Script Properties).
 */

/** CONFIG **/
const SHEET_NAME = 'Waitlist';

// Where alerts go (REQUIRED for alerts)
const NOTIFY_EMAIL = 'yell@mauricewingfield.com';

// Shared token guard
const REQUIRED_TOKEN = 'redline_safety_first_2026';
const REQUIRED_SOURCE = 'redline_signup_v1';

// Rate limit: notify at most once per email per window (ms)
const NOTIFY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

// Autoresponder from address (must be a configured "Send as" alias in Gmail)
const AUTORESPONDER_FROM = 'maurice@getredlineapp.com';
const AUTORESPONDER_REPLY_TO = 'maurice@getredlineapp.com';
/** END CONFIG **/

function doPost(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput('OK')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  var params = e.parameter;

  // Validate source
  if (!params.source || params.source !== REQUIRED_SOURCE) {
    return ContentService.createTextOutput('FORBIDDEN')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  // Validate token
  if (!params.token || params.token !== REQUIRED_TOKEN) {
    return ContentService.createTextOutput('FORBIDDEN')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(SHEET_NAME)
      || ss.insertSheet(SHEET_NAME);

    var submittedAt = new Date();
    var email      = (params.email      || '').trim();
    var name       = (params.name       || '').trim();
    var source     = (params.source     || '').trim();
    var page       = (params.page       || '').trim();
    var ua         = (params.ua         || '').trim();
    var origin     = (params.origin     || '').trim();
    var referrer   = (params.referrer   || '').trim();
    var sessionId  = (params.session_id || '').trim();
    var utmSource  = (params.utm_source   || '').trim();
    var utmMedium  = (params.utm_medium   || '').trim();
    var utmCampaign = (params.utm_campaign || '').trim();
    var utmTerm    = (params.utm_term     || '').trim();
    var utmContent = (params.utm_content  || '').trim();
    var rdtCid     = (params.rdt_cid      || '').trim();

    // Check for duplicate email
    if (email) {
      var data = sh.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][1] === email) {
          return ContentService.createTextOutput('OK')
            .setMimeType(ContentService.MimeType.TEXT);
        }
      }
    }

    // Append row
    sh.appendRow([
      submittedAt,
      email,
      name,
      source,
      page,
      ua,
      origin,
      referrer,
      sessionId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      rdtCid
    ]);

    // Autoresponder via Gmail (once per email address)
    if (email) {
      sendAutoresponder_(email, name);
    }

    // Reddit CAPI conversion event
    if (email) {
      sendRedditConversion_(email, submittedAt, ua);
    }

    // Email alert (rate-limited per email)
    if (NOTIFY_EMAIL) {
      var props = PropertiesService.getScriptProperties();
      var key = 'notified_'
        + (email ? email.toLowerCase() : 'no_email');
      var last = Number(props.getProperty(key) || 0);

      if (!last || (Date.now() - last) > NOTIFY_WINDOW_MS) {
        MailApp.sendEmail({
          to: NOTIFY_EMAIL,
          replyTo: email || undefined,
          subject: 'New Redline signup',
          body:
            'New signup\n\n' +
            'Time: ' + submittedAt + '\n' +
            'Email: ' + email + '\n' +
            'Name: ' + name + '\n' +
            'Source: ' + source + '\n' +
            'Page: ' + page + '\n' +
            'UA: ' + ua + '\n' +
            (utmSource ? 'UTM Source: ' + utmSource + '\n' : '') +
            (utmMedium ? 'UTM Medium: ' + utmMedium + '\n' : '') +
            (utmCampaign ? 'UTM Campaign: ' + utmCampaign + '\n' : '') +
            (rdtCid ? 'Reddit Click ID: ' + rdtCid + '\n' : '')
        });
        props.setProperty(key, String(Date.now()));
      }
    }

    return ContentService.createTextOutput('OK')
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    console.error('doPost error: ' + err.toString());
    return ContentService.createTextOutput('ERROR')
      .setMimeType(ContentService.MimeType.TEXT);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Sends a one-time welcome email via Gmail "Send as" alias.
 * Skips if already sent to this address.
 */
function sendAutoresponder_(email, name) {
  var props = PropertiesService.getScriptProperties();
  var key = 'welcomed_' + email.toLowerCase();
  if (props.getProperty(key)) return;

  var greeting = name
    ? ('Hey ' + name + ',')
    : 'Hey there,';

  var htmlBody =
    '<p>' + greeting + '</p>' +
    '<p>You\'re on the early access list for Redline. ' +
    'Thanks for signing up.</p>' +
    '<p>Here\'s the short version: Redline lets you ' +
    'draw zones around areas you want to avoid. When ' +
    'a ride offer comes in, you get a clear go/no-go ' +
    'signal before you accept. No surprises, no ' +
    'ending up somewhere you shouldn\'t be.</p>' +
    '<p>I built this after I was assaulted by a ' +
    'passenger and Lyft immediately tried to send me ' +
    'right back to the same neighborhood. That ' +
    'shouldn\'t happen to anyone.</p>' +
    '<p>The app is free and built by a driver, for ' +
    'drivers. I\'ll email you as soon as it\'s ready ' +
    'to download.</p>' +
    '<p>In the meantime, I\'d love to hear from you: ' +
    'Have you ever accepted a ride and ended up ' +
    'somewhere that made you feel unsafe? Just hit ' +
    'reply. I read every response and it helps me ' +
    'build something that actually keeps us ' +
    'safer.</p>' +
    '<p>Drive safe,<br>Maurice</p>' +
    '<p style="color:#999;font-size:13px;">' +
    'Redline &mdash; Know Before You Go<br>' +
    'Built in Cleveland</p>';

  try {
    GmailApp.sendEmail(email, 'Welcome to Redline', '', {
      htmlBody: htmlBody,
      from: AUTORESPONDER_FROM,
      replyTo: AUTORESPONDER_REPLY_TO,
      name: 'Maurice @ Redline'
    });
    props.setProperty(key, String(Date.now()));
  } catch (err) {
    console.error('Autoresponder error: ' + err.toString());
  }
}

/**
 * Sends a SignUp conversion event to Reddit's Conversions API.
 * Requires REDDIT_PIXEL_ID and REDDIT_CAPI_TOKEN in Script Properties.
 */
function sendRedditConversion_(email, eventTime, ua) {
  var props = PropertiesService.getScriptProperties();
  var pixelId = props.getProperty('REDDIT_PIXEL_ID');
  var capiToken = props.getProperty('REDDIT_CAPI_TOKEN');

  if (!pixelId || !capiToken) {
    console.error(
      'REDDIT_PIXEL_ID or REDDIT_CAPI_TOKEN not set in Script Properties'
    );
    return;
  }

  // SHA-256 hash the email (Reddit requires hashed PII)
  var emailHash = Utilities
    .computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase().trim())
    .map(function(b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    })
    .join('');

  var payload = {
    events: [
      {
        event_at: eventTime.toISOString(),
        event_type: {
          tracking_type: 'SignUp'
        },
        user: {
          email: emailHash,
          user_agent: ua || undefined
        },
        event_metadata: {
          conversion_id: 'signup_' + Date.now()
        }
      }
    ]
  };

  try {
    var res = UrlFetchApp.fetch(
      'https://ads-api.reddit.com/api/v2.0/conversions/events/' + pixelId,
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'Authorization': 'Bearer ' + capiToken
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error(
        'Reddit CAPI error (' + code + '): ' + res.getContentText()
      );
    }
  } catch (err) {
    console.error('Reddit CAPI error: ' + err.toString());
  }
}

function doGet() {
  return ContentService.createTextOutput('OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * RUN THIS ONCE FROM THE EDITOR to grant all required
 * permissions (GmailApp, MailApp, UrlFetchApp, PropertiesService).
 * Select this function from the dropdown and click Run.
 */
function authorizeAll() {
  // Triggers GmailApp permission (for autoresponder)
  GmailApp.sendEmail(
    NOTIFY_EMAIL,
    'Redline Apps Script authorized',
    'GmailApp + MailApp + UrlFetchApp scopes granted.'
  );

  // Triggers UrlFetchApp permission (for Reddit CAPI)
  UrlFetchApp.fetch('https://ads-api.reddit.com/api/v2.0/conversions/events/test', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer test' },
    payload: '{}',
    muteHttpExceptions: true
  });
}
