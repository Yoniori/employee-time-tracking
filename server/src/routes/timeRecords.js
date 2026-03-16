const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const requireManager = require('../middleware/requireManager');

// Normalise any Israeli phone number to E.164 (+972...).
// Used to compare stored phone numbers against the Firebase phone_number JWT claim,
// which Firebase ALWAYS returns in E.164 format regardless of how the OTP was requested.
// This makes all ownership checks and phone lookups format-agnostic.
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) return digits;          // already E.164
  if (digits.startsWith('972')) return '+' + digits;  // 972501234567
  if (digits.startsWith('0')) return '+972' + digits.slice(1); // 0501234567
  return '+972' + digits;                             // bare digits
}

// Returns today's date as "YYYY-MM-DD" in Israel time
function todayInIsrael() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST clock-in
router.post('/clock-in', verifyToken, async (req, res) => {
  const { employeeId, lat, lng } = req.body;

  // Validate lat/lng types
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'נתוני מיקום לא תקינים' });
  }

  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) return res.status(404).json({ error: 'עובד לא נמצא' });
    const emp = empDoc.data();

    // Ownership check: normalize both sides to E.164 so that a stored "0..." local
    // format and a Firebase-issued "+972..." claim compare correctly.
    if (normalizePhone(req.user.phone_number) !== normalizePhone(emp.phone)) {
      return res.status(403).json({ error: 'אין הרשאה לבצע פעולה זו' });
    }

    // Shift restriction: employee must have a scheduled shift today.
    // Uses equality filters on two fields — no composite Firestore index required.
    // Clock-OUT is intentionally NOT gated here so employees can always leave.
    const today = todayInIsrael();
    const shiftSnap = await db.collection('shifts')
      .where('employeeId', '==', employeeId)
      .where('date', '==', today)
      .limit(1)
      .get();
    if (shiftSnap.empty) {
      return res.status(403).json({
        error: 'לא קיימת משמרת מתוכננת להיום - פנה למנהל לתזמון משמרת',
        noShift: true,
      });
    }

    // Location verification
    // BYPASS_GEOFENCE=true skips the radius check in non-production environments only.
    // To re-enable: remove BYPASS_GEOFENCE from the environment (or set it to anything other than 'true').
    // In production this block always runs regardless of BYPASS_GEOFENCE.
    const bypassGeofence =
      process.env.NODE_ENV !== 'production' &&
      process.env.BYPASS_GEOFENCE === 'true';

    if (!bypassGeofence) {
      // Geofence is applied only when the employee has BOTH a defined location
      // AND locationRestricted is not explicitly false.
      // - locationRestricted === undefined (existing employees): treated as true → geofence on
      // - locationRestricted === false (new employees without location, or manager-disabled): skip
      // - No location coordinates set: skip regardless (employee can clock in from anywhere)
      const hasLocation = emp.location?.lat != null && emp.location?.lng != null;
      const isRestricted = emp.locationRestricted !== false;

      if (hasLocation && isRestricted) {
        const allowed = emp.allowedRadius || 200;
        const distance = haversineDistance(lat, lng, emp.location.lat, emp.location.lng);
        if (distance > allowed) {
          return res.status(403).json({
            error: `אינך נמצא במיקום העבודה (${Math.round(distance)} מ' מהאתר, מותר עד ${allowed} מ')`,
            distance: Math.round(distance),
            allowed,
          });
        }
      }
    }

    // Atomic duplicate-check + write via Firestore transaction
    const recordRef = db.collection('timeRecords').doc();
    let clockInTime;
    try {
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(
          db.collection('timeRecords')
            .where('employeeId', '==', employeeId)
            .where('clockOut', '==', null)
            .limit(1)
        );
        if (!existing.empty) {
          const err = new Error('אתה כבר רשום כנוכח');
          err.alreadyClockedIn = true;
          throw err;
        }
        clockInTime = new Date();
        tx.set(recordRef, {
          employeeId,
          employeeName: emp.name,
          idNumber: emp.idNumber,
          workSite: emp.workSite,
          clockIn: clockInTime,
          clockOut: null,
          clockInLocation: { lat, lng },
          clockOutLocation: null,
          locationVerified: true,
          totalHours: null,
          syncedToSheets: false,
        });
      });
    } catch (err) {
      if (err.alreadyClockedIn) return res.status(400).json({ error: err.message });
      throw err;
    }

    res.json({ recordId: recordRef.id, clockIn: clockInTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST clock-out
router.post('/clock-out', verifyToken, async (req, res) => {
  const { employeeId, lat, lng } = req.body;
  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) return res.status(404).json({ error: 'עובד לא נמצא' });
    const emp = empDoc.data();

    // Ownership check — same format-agnostic comparison as clock-in
    if (normalizePhone(req.user.phone_number) !== normalizePhone(emp.phone)) {
      return res.status(403).json({ error: 'אין הרשאה לבצע פעולה זו' });
    }

    const snap = await db.collection('timeRecords')
      .where('employeeId', '==', employeeId)
      .where('clockOut', '==', null)
      .limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'לא נמצאה כניסה פעילה' });

    const doc = snap.docs[0];
    const record = doc.data();
    const now = new Date();
    const clockIn = record.clockIn.toDate ? record.clockIn.toDate() : new Date(record.clockIn);
    const totalHours = (now - clockIn) / 3600000;

    await doc.ref.update({
      clockOut: now,
      clockOutLocation: (lat != null && lng != null) ? { lat, lng } : null,
      totalHours: Math.round(totalHours * 100) / 100,
    });

    res.json({ recordId: doc.id, clockOut: now, totalHours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET current status for employee (employee sees own status only)
router.get('/status/:employeeId', verifyToken, async (req, res) => {
  try {
    const empId = req.params.employeeId;

    // Managers can check any employee; employees can only check themselves
    if (req.user.role !== 'manager') {
      const empDoc = await db.collection('employees').doc(empId).get();
      if (!empDoc.exists ||
          normalizePhone(empDoc.data().phone) !== normalizePhone(req.user.phone_number)) {
        return res.status(403).json({ error: 'אין הרשאה לבצע פעולה זו' });
      }
    }

    const snap = await db.collection('timeRecords')
      .where('employeeId', '==', empId)
      .where('clockOut', '==', null)
      .limit(1).get();
    if (snap.empty) return res.json({ clockedIn: false });
    const doc = snap.docs[0];
    const data = doc.data();
    res.json({
      clockedIn: true,
      recordId: doc.id,
      ...data,
      clockIn: data.clockIn?.toDate ? data.clockIn.toDate().toISOString() : data.clockIn,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET last 10 records for the authenticated employee (self-service)
router.get('/my', verifyToken, async (req, res) => {
  try {
    const phone = req.user.phone_number;
    if (!phone) return res.status(400).json({ error: 'מספר טלפון לא זמין' });

    // Firebase always issues E.164 phone_number claims (+972...).
    // Older records (e.g. manually created) may be stored as local "0..." format.
    // Query both variants so lookup works regardless of storage format.
    const e164 = normalizePhone(phone);
    const local = '0' + e164.replace(/^\+972/, '');  // "+972XXXXXXXX" → "0XXXXXXXX"
    const phoneVariants = e164 === local ? [e164] : [e164, local];

    const empSnap = await db.collection('employees')
      .where('phone', 'in', phoneVariants)
      .limit(1).get();
    if (empSnap.empty) return res.status(404).json({ error: 'עובד לא נמצא' });
    const employeeId = empSnap.docs[0].id;

    const snap = await db.collection('timeRecords')
      .where('employeeId', '==', employeeId)
      .orderBy('clockIn', 'desc')
      .limit(10)
      .get();

    const records = snap.docs.map(d => {
      const r = d.data();
      return {
        id: d.id,
        clockIn: r.clockIn?.toDate ? r.clockIn.toDate().toISOString() : r.clockIn,
        clockOut: r.clockOut?.toDate ? r.clockOut.toDate().toISOString() : r.clockOut,
        totalHours: r.totalHours,
        workSite: r.workSite,
      };
    });

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET all records (manager only) with filters pushed into Firestore
router.get('/', verifyToken, requireManager, async (req, res) => {
  try {
    let query = db.collection('timeRecords');
    const { employeeId, site, from, to } = req.query;

    if (employeeId) query = query.where('employeeId', '==', employeeId);
    if (site) query = query.where('workSite', '==', site);
    if (from) query = query.where('clockIn', '>=', new Date(from));
    if (to) query = query.where('clockIn', '<=', new Date(to + 'T23:59:59'));

    const snap = await query.orderBy('clockIn', 'desc').limit(500).get();
    const records = snap.docs.map(d => {
      const r = d.data();
      return {
        id: d.id,
        ...r,
        clockIn: r.clockIn?.toDate ? r.clockIn.toDate().toISOString() : r.clockIn,
        clockOut: r.clockOut?.toDate ? r.clockOut.toDate().toISOString() : r.clockOut,
      };
    });

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET live — who is clocked in now (manager only)
router.get('/live', verifyToken, requireManager, async (req, res) => {
  try {
    const snap = await db.collection('timeRecords')
      .where('clockOut', '==', null)
      .limit(200)
      .get();
    const records = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        clockIn: data.clockIn?.toDate ? data.clockIn.toDate().toISOString() : data.clockIn,
      };
    });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
