/**
 * InactivityWarning — two layers:
 *
 * 1. Toast (bottom of screen) when `showWarning` is true:
 *    "המערכת תנתק אותך בעוד דקה עקב חוסר פעילות"
 *    + "המשך" button that resets the timer.
 *
 * 2. Full-screen overlay when `sessionExpired` is true:
 *    "נותקת אוטומטית עקב חוסר פעילות"
 *    + "להתחברות מחדש" button that closes the overlay.
 *    (The route guard will have already redirected to the login page underneath.)
 *
 * Attendance records are NOT touched anywhere here.
 */
export default function InactivityWarning({
  showWarning,
  sessionExpired,
  onDismissWarning,
  onDismissExpired,
}) {
  // Full-screen "session expired" overlay — rendered on top of the login page
  // that the route guard already navigated to.
  if (sessionExpired) {
    return (
      <div
        className="fixed inset-0 z-50 bg-gray-900/80 flex items-center justify-center p-6"
        dir="rtl"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">הפגישה פגה</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            נותקת אוטומטית עקב חוסר פעילות.
            <br />
            ניתן להתחבר מחדש.
          </p>
          <button
            onClick={onDismissExpired}
            className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-indigo-700 transition-colors"
          >
            להתחברות מחדש
          </button>
        </div>
      </div>
    );
  }

  // 1-minute warning toast — anchored to the bottom of the screen
  if (!showWarning) return null;

  return (
    <div
      className="fixed bottom-6 inset-x-0 flex justify-center z-50 px-4"
      dir="rtl"
    >
      <div className="bg-amber-50 border border-amber-300 rounded-2xl shadow-lg p-5 max-w-sm w-full flex items-start gap-4">
        <span className="text-2xl flex-shrink-0" aria-hidden="true">⏱️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 mb-0.5">התראת ניתוק</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            המערכת תנתק אותך בעוד דקה עקב חוסר פעילות
          </p>
        </div>
        <button
          onClick={onDismissWarning}
          className="flex-shrink-0 bg-amber-600 text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-amber-700 transition-colors"
        >
          המשך
        </button>
      </div>
    </div>
  );
}
