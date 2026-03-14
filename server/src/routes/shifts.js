const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');

// Returns today's date as "YYYY-MM-DD" in Israel time
function todayInIsrael() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// POST /api/shifts — manager creates a shift for an employee
router.post('/', verifyToken, requireManager, async (req, res) => {
  const { employeeId, date, startTime, endTime, workSite } = req.body;
  if (!employeeId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'חסרים שדות חובה: עובד, תאריך, שעת התחלה, שעת סיום' });
  }
  // Basic date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'תאריך לא תקין — נדרש פורמט YYYY-MM-DD' });
  }
  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) return res.status(404).json({ error: 'עובד לא נמצא' });
    const emp = empDoc.data();

    // Duplicate guard: one shift per employee per day
    // Uses two equality filters — no composite index required
    const existing = await db.collection('shifts')
      .where('employeeId', '==', employeeId)
      .where('date', '==', date)
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({
        error: 'כבר קיימת משמרת לעובד זה בתאריך זה',
        existingShiftId: existing.docs[0].id,
      });
    }

    const ref = db.collection('shifts').doc();
    await ref.set({
      employeeId,
      employeeName: emp.name,
      date,
      startTime,
      endTime,
      workSite: workSite || emp.workSite || '',
      createdAt: new Date(),
    });
    res.json({ shiftId: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts — manager lists shifts; optional ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Uses single-field date index (auto-created by Firestore) — no composite index needed
router.get('/', verifyToken, requireManager, async (req, res) => {
  try {
    const { from, to } = req.query;
    // Default: show shifts from today onwards (7-day window)
    const rangeFrom = from || todayInIsrael();
    const rangeTo = to || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 6);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    })();

    let query = db.collection('shifts')
      .where('date', '>=', rangeFrom)
      .where('date', '<=', rangeTo)
      .orderBy('date', 'asc');

    const snap = await query.limit(500).get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shifts/:id — manager deletes a shift
router.delete('/:id', verifyToken, requireManager, async (req, res) => {
  try {
    await db.collection('shifts').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/import — bulk import from a pre-validated, pre-parsed array
// Body: { shifts: [{ employeeId, employeeName, date, startTime, endTime, workSite }] }
// - max 200 rows per request
// - duplicate check runs in parallel before the batch write
// - sets importedAt to distinguish bulk imports from manual entries
router.post('/import', verifyToken, requireManager, async (req, res) => {
  const { shifts } = req.body;
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: 'אין משמרות לייבוא' });
  }
  if (shifts.length > 200) {
    return res.status(400).json({ error: 'ניתן לייבא עד 200 משמרות בפעם אחת' });
  }

  try {
    // Run all duplicate checks in parallel for speed
    const checks = await Promise.all(
      shifts.map(sh =>
        db.collection('shifts')
          .where('employeeId', '==', sh.employeeId)
          .where('date', '==', sh.date)
          .limit(1)
          .get()
          .then(snap => ({ sh, isDup: !snap.empty }))
      )
    );

    const batch = db.batch();
    const now = new Date();
    const imported = [];
    const skipped = [];

    for (const { sh, isDup } of checks) {
      const { employeeId, employeeName, date, startTime, endTime, workSite } = sh;
      if (!employeeId || !date || !startTime || !endTime) {
        skipped.push({ ...sh, reason: 'חסרים שדות חובה' });
        continue;
      }
      if (isDup) {
        skipped.push({ ...sh, reason: 'משמרת כבר קיימת' });
        continue;
      }
      const ref = db.collection('shifts').doc();
      batch.set(ref, {
        employeeId,
        employeeName,
        date,
        startTime,
        endTime,
        workSite: workSite || '',
        createdAt: now,
        importedAt: now,
      });
      imported.push(sh);
    }

    if (imported.length > 0) await batch.commit();
    res.json({ imported: imported.length, skipped: skipped.length, skippedDetails: skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts/my — authenticated employee sees their own upcoming shifts (next 7 days)
// Queries by employeeId only (equality) — no composite index required.
// Date filtering and sorting happen in JS to stay within single-field index limits.
router.get('/my', verifyToken, async (req, res) => {
  try {
    const phone = req.user.phone_number;
    if (!phone) return res.status(400).json({ error: 'מספר טלפון לא זמין' });

    const empSnap = await db.collection('employees')
      .where('phone', '==', phone)
      .limit(1)
      .get();
    if (empSnap.empty) return res.status(404).json({ error: 'עובד לא נמצא' });
    const employeeId = empSnap.docs[0].id;

    const today = todayInIsrael();
    const future = new Date();
    future.setDate(future.getDate() + 6);
    const futureStr = future.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

    // Single equality filter — uses auto-index on employeeId, no composite index needed.
    // limit(100) gives ~20 weeks of daily shifts before JS filtering could miss results.
    const snap = await db.collection('shifts')
      .where('employeeId', '==', employeeId)
      .limit(100)
      .get();

    // Filter this week in JS and sort by date
    const shifts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.date >= today && s.date <= futureStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json(shifts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
