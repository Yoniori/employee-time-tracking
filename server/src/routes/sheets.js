const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');
async function getSheetsClient() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('[sheets:google-auth] FIREBASE_SERVICE_ACCOUNT env var is not set');
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('[sheets:google-auth] FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// POST sync unsynced records to Google Sheets
router.post('/sync', verifyToken, requireManager, async (req, res) => {
  const { spreadsheetId } = req.body;
  if (!spreadsheetId) return res.status(400).json({ error: 'spreadsheetId required' });

  // ── 1. Fetch unsynced records ─────────────────────────────────────────────
  let snap;
  try {
    snap = await db.collection('timeRecords')
      .where('syncedToSheets', '==', false)
      .where('clockOut', '!=', null)
      .limit(100).get();
  } catch (err) {
    console.error('[sheets:firestore-read]', err);
    return res.status(500).json({ error: '[sheets:firestore-read] ' + err.message });
  }

  if (snap.empty) return res.json({ synced: 0, message: 'אין רשומות לסנכרן' });

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

  // ── 2. Auth + write to Google Sheets ─────────────────────────────────────
  let sheets;
  try {
    sheets = await getSheetsClient();
  } catch (err) {
    console.error('[sheets:google-auth]', err);
    return res.status(500).json({ error: err.message });
  }

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['שם עובד', 'תעודת זהות', 'אתר עבודה', 'תאריך', 'כניסה', 'יציאה', 'שעות']],
      },
    });
  } catch (err) {
    console.error('[sheets:write-header]', err);
    return res.status(500).json({ error: '[sheets:write-header] ' + err.message });
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A2',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  } catch (err) {
    console.error('[sheets:append-rows]', err);
    return res.status(500).json({ error: '[sheets:append-rows] ' + err.message });
  }

  // ── 3. Mark as synced in Firestore ────────────────────────────────────────
  // Re-verify docs are still unsynced to prevent double-write on retry
  const docIds = snap.docs.map(d => d.id);
  try {
    const batch = db.batch();
    docIds.forEach(id => batch.update(db.collection('timeRecords').doc(id), { syncedToSheets: true }));
    await batch.commit();
  } catch (err) {
    console.error('[sheets:firestore-update]', err);
    // Sheets write already succeeded — return 207 so the client knows data was
    // written but the syncedToSheets flag was not updated.
    return res.status(207).json({
      synced: rows.length,
      warning: 'Rows written to Sheets but Firestore sync flag update failed. Re-running sync may produce duplicates.',
      error: '[sheets:firestore-update] ' + err.message,
    });
  }

  res.json({ synced: rows.length });
});

module.exports = router;
