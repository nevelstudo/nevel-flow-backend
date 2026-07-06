const { google } = require('googleapis');

const spreadsheetId = process.env.GOOGLE_CENTER_SPREADSHEET_ID;
const sheetName = process.env.GOOGLE_CENTER_SHEET_NAME || 'Users';
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!spreadsheetId) {
  throw new Error('GOOGLE_CENTER_SPREADSHEET_ID belum diset');
}

if (!sheetName) {
  throw new Error('GOOGLE_CENTER_SHEET_NAME belum diset');
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

module.exports = {
  appendUserRow
};
