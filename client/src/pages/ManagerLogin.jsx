import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function ManagerLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (user) navigate('/manager', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/manager', { replace: true });
    } catch {
      setError('דואר אלקטרוני או סיסמה שגויים');
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await api.seedData();
      alert('נתוני בדיקה נוצרו בהצלחה!\nמנהל: admin@company.com / Admin123456');
    } catch (err) {
      alert('שגיאה: ' + err.message);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-700 to-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏢</div>
          <h1 className="text-3xl font-bold text-white">מנהל מערכת</h1>
          <p className="text-gray-400 mt-1">כניסה לדשבורד ניהול</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                דואר אלקטרוני
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-500"
                autoFocus
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                סיסמה
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-red-600 text-sm text-center">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 text-white rounded-xl py-3 font-semibold text-lg disabled:opacity-50 hover:bg-gray-900 transition-colors"
            >
              {loading ? 'מתחבר...' : 'כניסה'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              {seeding ? 'יוצר נתוני בדיקה...' : '⚙️ צור נתוני בדיקה (הגדרה ראשונית)'}
            </button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-300">
            ← כניסת עובד
          </a>
        </div>
      </div>
    </div>
  );
}
