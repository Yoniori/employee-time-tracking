require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  const email = 'admin@company.com';
  const password = 'Admin123456';

  // Create or update Firebase Auth user
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password, displayName: 'מנהל' });
    console.log('Updated existing auth user:', userRecord.uid);
  } catch {
    userRecord = await auth.createUser({ email, password, displayName: 'מנהל' });
    console.log('Created auth user:', userRecord.uid);
  }

  // Set manager custom claim
  await auth.setCustomUserClaims(userRecord.uid, { role: 'manager' });
  console.log('Set role: manager');

  // Upsert managers collection doc
  await db.collection('managers').doc(userRecord.uid).set({
    email,
    name: 'מנהל',
    role: 'manager',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('Upserted managers collection doc');

  // Seed test employee if not exists
  const empSnap = await db.collection('employees')
    .where('idNumber', '==', '123456789').limit(1).get();
  if (empSnap.empty) {
    await db.collection('employees').add({
      name: 'ישראל ישראלי',
      idNumber: '123456789',
      phone: '+972501234567',
      workSite: 'אתר ראשי',
      location: { lat: 32.0853, lng: 34.7818 },
      allowedRadius: 200,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Created test employee: ישראל ישראלי');
  } else {
    console.log('Test employee already exists, skipping');
  }

  console.log('\n✓ Seed complete');
  console.log('  Manager: admin@company.com / Admin123456');
  console.log('  Employee ID: 123456789 | Phone: +972501234567');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
