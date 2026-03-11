import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyARGrugIP7XNeSxLgdesLo8s62Dj91SxhI',
  authDomain: 'employee-time-tracking-bfd30.firebaseapp.com',
  projectId: 'employee-time-tracking-bfd30',
  storageBucket: 'employee-time-tracking-bfd30.firebasestorage.app',
  messagingSenderId: '848631646761',
  appId: '1:848631646761:web:c791afc8d03ee5ef38ea38',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
