const express = require('express');
const router = express.Router();
const { db, auth } = require('../firebase');

// Lookup employee by ID number, return phone for OTP
router.post('/lookup-employee', async (req, res) => {
  const { idNumber } = req.body;
  if (!idNumber || !/^\d{9}$/.test(idNumber)) {
    return res.status(400).json({ error: 'מספר תעודת זהות לא תקין' });
  }
  try {
    const snap = await db.collection('employees')
      .where('idNumber', '==', idNumber)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (snap.empty) {
      return res.status(404).json({ error: 'עובד לא נמצא במערכת' });
    }
    const employee = { id: snap.docs[0].id, ...snap.docs[0].data() };
    res.json({ phone: employee.phone, name: employee.name, employeeId: employee.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Seed manager account (one-time setup)
router.post('/seed-manager', async (req, res) => {
  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail('admin@company.com');
    } catch {
      userRecord = await auth.createUser({
        email: 'admin@company.com',
        password: 'Admin123456',
        displayName: 'מנהל',
      });
    }
    await auth.setCustomUserClaims(userRecord.uid, { role: 'manager' });

    // Seed employee
    const empSnap = await db.collection('employees')
      .where('idNumber', '==', '123456789')
      .limit(1).get();
    if (empSnap.empty) {
      await db.collection('employees').add({
        name: 'ישראל ישראלי',
        idNumber: '123456789',
        phone: '+972501234567',
        workSite: 'אתר ראשי',
        location: { lat: 32.0853, lng: 34.7818 },
        allowedRadius: 200,
        active: true,
        createdAt: new Date(),
      });
    }
    res.json({ message: 'Seed completed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
