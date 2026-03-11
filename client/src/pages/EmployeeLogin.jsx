import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function EmployeeLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('id'); // 'id' | 'otp'
  const [idNumber, setIdNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmResult, setConfirmResult] = useState(null);
  const recaptchaRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  function setupRecaptcha() {
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
      });
    }
    return recaptchaVerifierRef.current;
  }

  async function handleIdSubmit(e) {
    e.preventDefault();
    if (!/^\d{9}$/.test(idNumber)) {
      setError('נא להזין תעודת זהות בת 9 ספרות');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const emp = await api.lookupEmployee(idNumber);
      setEmployeeInfo(emp);
      const verifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, emp.phone, verifier);
      setConfirmResult(result);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'שגיאה בהתחברות');
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    if (otp.length < 6) {
      setError('נא להזין קוד בן 6 ספרות');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await confirmResult.confirm(otp);
      // Store employee data in sessionStorage for use in dashboard
      sessionStorage.setItem('employeeData', JSON.stringify(employeeInfo));
      navigate('/dashboard', { replace: true });
    } catch {
      setError('קוד שגוי, נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 flex flex-col items-center justify-center p-4">
      <div id="recaptcha-container" ref={recaptchaRef}></div>

      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">⏱️</div>
          <h1 className="text-3xl font-bold text-white">מעקב שעות</h1>
          <p className="text-blue-200 mt-1">מערכת נוכחות עובדים</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {step === 'id' && (
            <>
              <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
                כניסה לעובד
              </h2>
              <form onSubmit={handleIdSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    תעודת זהות
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="\d{9}"
                    maxLength={9}
                    value={idNumber}
                    onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456789"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">9 ספרות</p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                    <p className="text-red-600 text-sm text-center">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || idNumber.length !== 9}
                  className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                >
                  {loading ? 'מאמת...' : 'המשך'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <a
                  href="/manager/login"
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  כניסת מנהל →
                </a>
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <button
                onClick={() => { setStep('id'); setError(''); setOtp(''); }}
                className="text-blue-500 text-sm mb-4 flex items-center gap-1"
              >
                ← חזור
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">
                אימות מספר טלפון
              </h2>
              {employeeInfo && (
                <p className="text-gray-500 text-sm text-center mb-6">
                  שלום <strong>{employeeInfo.name}</strong>!<br />
                  נשלח קוד אימות לטלפון
                  <br />
                  <span dir="ltr">{employeeInfo.phone}</span>
                </p>
              )}
              <form onSubmit={handleOtpSubmit}>
                <div className="mb-4">
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="------"
                    className="otp-input w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                    <p className="text-red-600 text-sm text-center">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
                >
                  {loading ? 'מאמת...' : 'כניסה'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
