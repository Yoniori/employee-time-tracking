import { useState } from 'react';
import { api } from '../lib/api';

export default function EmployeeSignup() {
  const [form, setForm] = useState({ fullName: '', idNumber: '', phone: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Client-side pre-validation
    if (!form.fullName.trim()) { setError('נא להזין שם מלא'); return; }
    if (!/^\d{9}$/.test(form.idNumber)) { setError('תעודת זהות חייבת להיות בדיוק 9 ספרות'); return; }
    if (!form.phone.trim()) { setError('נא להזין מספר טלפון'); return; }

    setLoading(true);
    try {
      await api.submitSignupRequest({
        fullName: form.fullName.trim(),
        idNumber: form.idNumber,
        phone:    form.phone.trim(),
        note:     form.note.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'שגיאה בשליחת הבקשה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 50%, #6366f1 100%)' }}
      dir="rtl"
    >
      <div className="w-full max-w-sm px-4 sm:px-0">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur mb-4 shadow-lg">
            <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">הצטרפות למערכת</h1>
          <p className="text-indigo-200 mt-1 text-sm">בקשה תישלח לאישור מנהל</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-4 sm:p-7">
          {submitted ? (
            /* ── Success state ────────────────────────────────────────────── */
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">הבקשה נשלחה!</h2>
              <p className="text-gray-500 text-sm mb-6">
                בקשת ההצטרפות שלך נשלחה לאישור המנהל.
                לאחר האישור תוכל להתחבר עם תעודת הזהות שלך.
              </p>
              <a
                href="/"
                className="inline-block w-full text-center rounded-2xl py-3 font-bold text-white text-base"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
              >
                חזור לכניסה
              </a>
            </div>
          ) : (
            /* ── Registration form ────────────────────────────────────────── */
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">פרטי הצטרפות</h2>
              <p className="text-gray-400 text-sm mb-6">מלא את הפרטים ובקשתך תועבר לאישור מנהל</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    שם מלא <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={e => setField('fullName', e.target.value)}
                    placeholder="ישראל ישראלי"
                    autoFocus
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-800
                      focus:outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white text-sm"
                  />
                </div>

                {/* ID number */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    תעודת זהות <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={9}
                    value={form.idNumber}
                    onChange={e => setField('idNumber', e.target.value.replace(/\D/g, ''))}
                    placeholder="000000000"
                    dir="ltr"
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-center
                      text-xl tracking-[0.3em] font-bold text-gray-800
                      focus:outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    מספר טלפון נייד <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={e => setField('phone', e.target.value)}
                    placeholder="0501234567"
                    dir="ltr"
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3
                      text-lg font-semibold text-gray-800 text-center
                      focus:outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    הטלפון ישמש לכניסה למערכת (OTP)
                  </p>
                </div>

                {/* Optional note */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    הערה <span className="text-gray-400 font-normal">(אופציונלי)</span>
                  </label>
                  <textarea
                    value={form.note}
                    onChange={e => setField('note', e.target.value)}
                    placeholder="מחלקה, תפקיד, או כל מידע נוסף למנהל..."
                    rows={2}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800
                      focus:outline-none focus:border-indigo-500 transition-colors bg-gray-50 focus:bg-white resize-none"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl py-3.5 font-bold text-base text-white transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]
                    flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      שולח...
                    </>
                  ) : 'שלח בקשת הצטרפות'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100 text-center">
                <a href="/" className="text-sm text-gray-400 hover:text-indigo-600 transition-colors">
                  כבר רשום? כניסה לעובד
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
