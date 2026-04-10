import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function OtpBoxes({ value, onChange }) {
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = value.split('');

  function handleKey(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) {
        next[i] = '';
      } else if (i > 0) {
        next[i - 1] = '';
        refs[i - 1].current?.focus();
      }
      onChange(next.join(''));
    }
  }

  function handleChange(i, e) {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    const next = digits.slice();
    next[i] = char;
    onChange(next.join(''));
    if (char && i < 5) refs[i + 1].current?.focus();
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6).trimEnd());
    if (pasted.length > 0) refs[Math.min(pasted.length, 5)].current?.focus();
    e.preventDefault();
  }

  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <input
          key={i}
          ref={refs[i]}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          autoFocus={i === 0}
          className="w-11 h-14 text-center text-2xl font-bold border-2 rounded-xl
            border-gray-200 focus:border-indigo-500 focus:outline-none
            transition-colors bg-gray-50 focus:bg-white"
        />
      ))}
    </div>
  );
}

export default function EmployeeLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('id');
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
      sessionStorage.setItem('employeeData', JSON.stringify(employeeInfo));
      navigate('/dashboard', { replace: true });
    } catch {
      setError('קוד שגוי, נסה שוב');
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setStep('id');
    setError('');
    setOtp('');
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 50%, #6366f1 100%)' }}
    >
      <div id="recaptcha-container" ref={recaptchaRef} />

      <div className="w-full max-w-sm px-4 sm:px-0">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur mb-4 shadow-lg">
            <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">מעקב שעות</h1>
          <p className="text-indigo-200 mt-1 text-sm">מערכת נוכחות עובדים</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`h-2 rounded-full transition-all duration-300 ${step === 'id' ? 'w-8 bg-white' : 'w-2 bg-white/40'}`} />
          <div className={`h-2 rounded-full transition-all duration-300 ${step === 'otp' ? 'w-8 bg-white' : 'w-2 bg-white/40'}`} />
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-4 sm:p-7">

          {step === 'id' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">כניסה לעובד</h2>
              <p className="text-gray-400 text-sm mb-6">הזן את תעודת הזהות שלך</p>

              <form onSubmit={handleIdSubmit}>
                <div className="mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    תעודת זהות
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="\d{9}"
                    maxLength={9}
                    value={idNumber}
                    onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000000"
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-center
                      text-2xl tracking-[0.4em] font-bold text-gray-800
                      focus:outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white"
                    autoFocus
                    dir="ltr"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                    <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || idNumber.length !== 9}
                  title={idNumber.length !== 9 ? 'יש להזין 9 ספרות של תעודת זהות' : undefined}
                  className="w-full rounded-2xl py-3.5 font-bold text-base text-white transition-all
                    disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                    active:scale-[0.98] flex items-center justify-center gap-2"
                  style={!(loading || idNumber.length !== 9) ? { background: 'linear-gradient(135deg, #4f46e5, #6366f1)' } : undefined}
                >
                  {loading ? <><Spinner /> מאמת...</> : 'המשך'}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-gray-100 text-center space-y-2">
                <Link to="/signup" className="block text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                  עובד חדש? להרשמה לחץ כאן
                </Link>
                <Link to="/manager/login" className="block text-sm text-gray-400 hover:text-indigo-600 transition-colors">
                  כניסת מנהל
                </Link>
              </div>
            </>
          )}

          {step === 'otp' && (
            <>
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-indigo-500 text-sm mb-5 hover:text-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4 rotate-180" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                חזור
              </button>

              <h2 className="text-xl font-bold text-gray-900 mb-1">קוד אימות</h2>
              {employeeInfo && (
                <p className="text-gray-400 text-sm mb-6">
                  שלום <span className="font-semibold text-gray-700">{employeeInfo.name}</span>!
                  נשלח קוד SMS לטלפון שלך
                </p>
              )}

              <form onSubmit={handleOtpSubmit}>
                <div className="mb-5">
                  <OtpBoxes value={otp} onChange={setOtp} />
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                    <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full rounded-2xl py-3.5 font-bold text-base text-white transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]
                    flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
                >
                  {loading ? <><Spinner /> מאמת...</> : 'כניסה'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
