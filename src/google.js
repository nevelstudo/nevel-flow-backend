const { google } = require('googleapis');

const spreadsheetId = process.env.GOOGLE_CENTER_SPREADSHEET_ID;
const sheetName = process.env.GOOGLE_CENTER_SHEET_NAME || 'Users';
const templateSpreadsheetId = process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID;
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!spreadsheetId) {
  throw new Error('GOOGLE_CENTER_SPREADSHEET_ID belum diset');
}

if (!clientEmail) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL belum diset');
}

if (!privateKey) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY belum diset');
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n')
  },
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ]
});

async function getSheetsClient() {
  const authClient = await auth.getClient();

  return google.sheets({
    version: 'v4',
    auth: authClient
  });
}

async function getDriveClient() {
  const authClient = await auth.getClient();

  return google.drive({
    version: 'v3',
    auth: authClient
  });
}

async function appendUserRow(values) {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values]
    }
  });
}

async function updateUserSheetIdByPhone(phone, sheetId) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:H`
  });

  const rows = response.data.values || [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const currentPhone = row[0];

    if (String(currentPhone) === String(phone)) {
      const rowNumber = i + 1;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!C${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[sheetId]]
        }
      });

      return true;
    }
  }

  return false;
}

function sanitizeName(name = 'User') {
  return String(name)
    .trim()
    .replace(/[\\/:*?"<>|#%&{}]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'User';
}

async function copyTemplateSpreadsheet(userName) {
  if (!templateSpreadsheetId) {
    throw new Error('GOOGLE_TEMPLATE_SPREADSHEET_ID belum diset');
  }

  const drive = await getDriveClient();
  const safeName = sanitizeName(userName);
  const fileName = `NFAI_${safeName}`;

  const copied = await drive.files.copy({
    fileId: templateSpreadsheetId,
    requestBody: {
      name: fileName,
      mimeType: 'application/vnd.google-apps.spreadsheet'
    }
  });

  return {
    spreadsheetId: copied.data.id,
    spreadsheetName: fileName
  };
}

module.exports = {
  appendUserRow,
  updateUserSheetIdByPhone,
  copyTemplateSpreadsheet
};
