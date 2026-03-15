const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');

// Normalise any Israeli phone number to E.164 (+972...).
// Firebase always issues phone_number JWT claims in E.164, but employee records
// may be stored as local "0..." format.  Build both variants and use Firestore
// 'in' so the lookup works regardless of which format is stored.
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  return '+972' + digits;
}

function phoneVariants(rawPhone) {
  const e164 = normalizePhone(rawPhone);
  const local = '0' + e164.replace(/^\+972/, '');
  return e164 === local ? [e164] : [e164, local];
}

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
// Uses a single-field equality-free scan limited to 500 docs, filtered in JS.
// This avoids composite-index requirements (range + orderBy) on the date field.
router.get('/', verifyToken, requireManager, async (req, res) => {
  try {
    const { from, to } = req.query;
    const rangeFrom = from || todayInIsrael();
    const rangeTo = to || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 6);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    })();

    // Single-field range filter (no composite index needed — no explicit orderBy).
    // Upper bound filtered in JS; Firestore auto-index on `date` handles the >= clause.
    const snap = await db.collection('shifts')
      .where('date', '>=', rangeFrom)
      .limit(500)
      .get();
    const shifts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.date <= rangeTo)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json(shifts);
  } catch (err) {
    console.error('[GET /shifts]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Shift Slots — open slots that employees can voluntarily request ───────────

// POST /api/shifts/slots — manager creates an open slot
router.post('/slots', verifyToken, requireManager, async (req, res) => {
  const { title, date, startTime, endTime, workSite, positions } = req.body;
  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'חסרים שדות חובה: כותרת, תאריך, שעת התחלה, שעת סיום' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'תאריך לא תקין — נדרש YYYY-MM-DD' });
  }
  try {
    const ref = db.collection('shiftSlots').doc();
    await ref.set({
      title,
      date,
      startTime,
      endTime,
      workSite: workSite || '',
      positions: Math.max(1, parseInt(positions) || 1),
      createdAt: new Date(),
    });
    res.json({ id: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts/slots — manager lists upcoming open slots
// Fetch + JS-filter to avoid composite index on (date range + orderBy)
router.get('/slots', verifyToken, requireManager, async (req, res) => {
  try {
    const today = todayInIsrael();
    // Single-field range filter — no composite index needed (no separate orderBy field)
    const snap = await db.collection('shiftSlots')
      .where('date', '>=', today)
      .limit(200)
      .get();
    const slots = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date.localeCompare(b.date));
    res.json(slots);
  } catch (err) {
    console.error('[GET /shifts/slots]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts/slots/:id/requests — manager sees ALL requests for one slot (all statuses)
// Single equality filter on slotId — uses Firestore auto-index, no composite index needed.
router.get('/slots/:id/requests', verifyToken, requireManager, async (req, res) => {
  try {
    const snap = await db.collection('shiftRequests')
      .where('slotId', '==', req.params.id)
      .limit(100)
      .get();
    const requests = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });
    res.json(requests);
  } catch (err) {
    console.error('[GET /shifts/slots/:id/requests]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shifts/slots/:id — manager deletes a slot
router.delete('/slots/:id', verifyToken, requireManager, async (req, res) => {
  try {
    await db.collection('shiftSlots').doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts/open-slots — employee sees all upcoming open slots,
// annotated with alreadyRequested flag for this employee
router.get('/open-slots', verifyToken, async (req, res) => {
  try {
    const phone = req.user.phone_number;
    if (!phone) return res.status(400).json({ error: 'מספר טלפון לא זמין' });

    const empSnap = await db.collection('employees').where('phone', 'in', phoneVariants(phone)).limit(1).get();
    if (empSnap.empty) return res.status(404).json({ error: 'עובד לא נמצא' });
    const employeeId = empSnap.docs[0].id;

    const today = todayInIsrael();
    const slotsSnap = await db.collection('shiftSlots')
      .where('date', '>=', today)
      .limit(50)
      .get();
    const slots = slotsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (slots.length === 0) return res.json([]);

    // Check which slots this employee already requested (single equality — auto-index)
    const requestsSnap = await db.collection('shiftRequests')
      .where('employeeId', '==', employeeId)
      .get();
    const requestedSlotIds = new Set(requestsSnap.docs.map(d => d.data().slotId));

    res.json(slots.map(s => ({ ...s, alreadyRequested: requestedSlotIds.has(s.id) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/open-slots/:slotId/request — employee submits a request for a slot
router.post('/open-slots/:slotId/request', verifyToken, async (req, res) => {
  try {
    const phone = req.user.phone_number;
    if (!phone) return res.status(400).json({ error: 'מספר טלפון לא זמין' });

    const empSnap = await db.collection('employees').where('phone', 'in', phoneVariants(phone)).limit(1).get();
    if (empSnap.empty) return res.status(404).json({ error: 'עובד לא נמצא' });
    const employeeId = empSnap.docs[0].id;
    const employeeName = empSnap.docs[0].data().name;

    const slotDoc = await db.collection('shiftSlots').doc(req.params.slotId).get();
    if (!slotDoc.exists) return res.status(404).json({ error: 'הסלוט לא נמצא' });
    const slot = slotDoc.data();

    // Duplicate guard: one request per employee per slot
    const dupSnap = await db.collection('shiftRequests')
      .where('employeeId', '==', employeeId)
      .where('slotId', '==', req.params.slotId)
      .limit(1)
      .get();
    if (!dupSnap.empty) return res.status(409).json({ error: 'כבר שלחת בקשה למשמרת זו' });

    const ref = db.collection('shiftRequests').doc();
    await ref.set({
      slotId:        req.params.slotId,
      slotTitle:     slot.title,
      slotDate:      slot.date,
      slotStartTime: slot.startTime,
      slotEndTime:   slot.endTime,
      slotWorkSite:  slot.workSite || '',
      employeeId,
      employeeName,
      status:        'pending',
      createdAt:     new Date(),
    });
    res.json({ requestId: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shifts/requests — manager sees all pending requests
// Single equality filter (status) — uses Firestore auto-index; sorted in JS
router.get('/requests', verifyToken, requireManager, async (req, res) => {
  try {
    const snap = await db.collection('shiftRequests')
      .where('status', '==', 'pending')
      .limit(200)
      .get();
    const requests = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });
    res.json(requests);
  } catch (err) {
    console.error('[GET /shifts/requests]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/requests/:id/approve
// Atomically: marks request approved + creates a real shift in the shifts collection
router.post('/requests/:id/approve', verifyToken, requireManager, async (req, res) => {
  try {
    const reqDoc = await db.collection('shiftRequests').doc(req.params.id).get();
    if (!reqDoc.exists) return res.status(404).json({ error: 'בקשה לא נמצאה' });
    const r = reqDoc.data();
    if (r.status !== 'pending') return res.status(409).json({ error: 'בקשה זו כבר טופלה' });

    const batch = db.batch();
    batch.update(reqDoc.ref, { status: 'approved', reviewedAt: new Date() });

    const shiftRef = db.collection('shifts').doc();
    batch.set(shiftRef, {
      employeeId:   r.employeeId,
      employeeName: r.employeeName,
      date:         r.slotDate,
      startTime:    r.slotStartTime,
      endTime:      r.slotEndTime,
      workSite:     r.slotWorkSite,
      createdAt:    new Date(),
      fromSlotId:   r.slotId,   // audit trail
    });

    await batch.commit();
    res.json({ shiftId: shiftRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shifts/requests/:id/reject
router.post('/requests/:id/reject', verifyToken, requireManager, async (req, res) => {
  try {
    const reqDoc = await db.collection('shiftRequests').doc(req.params.id).get();
    if (!reqDoc.exists) return res.status(404).json({ error: 'בקשה לא נמצאה' });
    if (reqDoc.data().status !== 'pending') return res.status(409).json({ error: 'בקשה זו כבר טופלה' });
    await reqDoc.ref.update({ status: 'rejected', reviewedAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /shifts/requests/:id/reject]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── End of Shift Slots section ───────────────────────────────────────────────

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
      .where('phone', 'in', phoneVariants(phone))
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
