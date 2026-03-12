const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

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
  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) return res.status(404).json({ error: 'עובד לא נמצא' });
    const emp = empDoc.data();

    // Check if already clocked in
    const existing = await db.collection('timeRecords')
      .where('employeeId', '==', employeeId)
      .where('clockOut', '==', null)
      .limit(1).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'אתה כבר רשום כנוכח' });
    }

    // Location verification
    if (!emp.location?.lat || !emp.location?.lng) {
      return res.status(400).json({ error: 'לא הוגדר מיקום לאתר העבודה - פנה למנהל' });
    }
    const allowed = emp.allowedRadius || 200;
    const distance = haversineDistance(lat, lng, emp.location.lat, emp.location.lng);
    const locationVerified = distance <= allowed;
    if (!locationVerified) {
      return res.status(403).json({
        error: `אינך נמצא במיקום העבודה (${Math.round(distance)} מ' מהאתר, מותר עד ${allowed} מ')`,
        distance: Math.round(distance),
        allowed,
      });
    }

    const now = new Date();
    const ref = await db.collection('timeRecords').add({
      employeeId,
      employeeName: emp.name,
      idNumber: emp.idNumber,
      workSite: emp.workSite,
      clockIn: now,
      clockOut: null,
      clockInLocation: { lat, lng },
      clockOutLocation: null,
      locationVerified: true,
      totalHours: null,
      syncedToSheets: false,
    });

    res.json({ recordId: ref.id, clockIn: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST clock-out
router.post('/clock-out', verifyToken, async (req, res) => {
  const { employeeId, lat, lng } = req.body;
  try {
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
      clockOutLocation: { lat, lng },
      totalHours: Math.round(totalHours * 100) / 100,
    });

    res.json({ recordId: doc.id, clockOut: now, totalHours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET current status for employee
router.get('/status/:employeeId', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('timeRecords')
      .where('employeeId', '==', req.params.employeeId)
      .where('clockOut', '==', null)
      .limit(1).get();
    if (snap.empty) return res.json({ clockedIn: false });
    const doc = snap.docs[0];
    res.json({ clockedIn: true, recordId: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all records (manager) with filters
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = db.collection('timeRecords');
    const { employeeId, site, from, to } = req.query;

    if (employeeId) query = query.where('employeeId', '==', employeeId);
    if (site) query = query.where('workSite', '==', site);

    const snap = await query.orderBy('clockIn', 'desc').limit(500).get();
    let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Convert timestamps
    records = records.map(r => ({
      ...r,
      clockIn: r.clockIn?.toDate ? r.clockIn.toDate().toISOString() : r.clockIn,
      clockOut: r.clockOut?.toDate ? r.clockOut.toDate().toISOString() : r.clockOut,
    }));

    // Date filter client-side
    if (from) records = records.filter(r => r.clockIn >= from);
    if (to) records = records.filter(r => r.clockIn <= to + 'T23:59:59');

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET live - who is clocked in now
router.get('/live', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('timeRecords')
      .where('clockOut', '==', null)
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
