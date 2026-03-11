const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// POST sync unsynced records to Google Sheets
router.post('/sync', verifyToken, async (req, res) => {
  const { spreadsheetId } = req.body;
  if (!spreadsheetId) return res.status(400).json({ error: 'spreadsheetId required' });

  try {
    const snap = await db.collection('timeRecords')
      .where('syncedToSheets', '==', false)
      .where('clockOut', '!=', null)
      .limit(100).get();

    if (snap.empty) return res.json({ synced: 0, message: 'אין רשומות לסנכרן' });

    const sheets = await getSheetsClient();
    const rows = snap.docs.map(d => {
      const r = d.data();
      const clockIn = r.clockIn?.toDate ? r.clockIn.toDate() : new Date(r.clockIn);
      const clockOut = r.clockOut?.toDate ? r.clockOut.toDate() : new Date(r.clockOut);
      return [
        r.employeeName,
        r.idNumber,
        r.workSite,
        clockIn.toLocaleDateString('he-IL'),
        clockIn.toLocaleTimeString('he-IL'),
        clockOut.toLocaleTimeString('he-IL'),
        r.totalHours?.toFixed(2) || '',
      ];
    });

    // Ensure header row exists
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['שם עובד', 'תעודת זהות', 'אתר עבודה', 'תאריך', 'כניסה', 'יציאה', 'שעות']],
      },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A2',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    // Mark as synced
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { syncedToSheets: true }));
    await batch.commit();

    res.json({ synced: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
