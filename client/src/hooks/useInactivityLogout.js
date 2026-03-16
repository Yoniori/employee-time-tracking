import { useEffect, useRef, useState, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from './useAuth';

// Show a warning 1 minute before logout, sign out after 10 minutes of inactivity.
const WARN_MS   = 9  * 60 * 1000;  // 9 min  → show warning
const LOGOUT_MS = 10 * 60 * 1000;  // 10 min → sign out

// All event types that count as "activity"
const EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

export function useInactivityLogout() {
  const { user } = useAuth();
  const [showWarning,    setShowWarning]    = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const warnTimer   = useRef(null);
  const logoutTimer = useRef(null);
  // resetRef lets the activity handler always call the latest reset function
  // without requiring the event listener to be re-registered on every render.
  const resetRef = useRef(null);

  useEffect(() => {
    // No authenticated user — clear any stale timers and bail out.
    if (!user) {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
      return;
    }

    // Called when the 10-minute timeout fires.
    // IMPORTANT: only clears the session — never modifies attendance records.
    const doLogout = async () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
      setShowWarning(false);
      setSessionExpired(true);           // show "session expired" overlay
      sessionStorage.removeItem('employeeData');  // mirror what manual logout does
      try {
        await signOut(auth);
      } catch (err) {
        console.error('[inactivity] signOut failed:', err.message);
      }
    };

    // Resets both timers. Called on every activity event and on manual dismissal.
    const reset = () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
      setShowWarning(false);
      warnTimer.current   = setTimeout(() => setShowWarning(true), WARN_MS);
      logoutTimer.current = setTimeout(doLogout, LOGOUT_MS);
    };

    // Store reset in a ref so the stable `handler` below always calls the latest version.
    resetRef.current = reset;
    reset(); // start timers immediately when user logs in

    // Stable wrapper — never changes identity, so add/remove are paired correctly.
    const handler = () => resetRef.current?.();
    EVENTS.forEach(evt => document.addEventListener(evt, handler, { passive: true }));

    return () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
      EVENTS.forEach(evt => document.removeEventListener(evt, handler));
    };
  }, [user?.uid]); // re-run only when the logged-in user identity changes

  /** Call when user clicks "המשך" on the warning toast to cancel the pending logout. */
  const dismissWarning = useCallback(() => {
    resetRef.current?.();
  }, []);

  /** Call when user clicks "להתחברות מחדש" on the expired overlay to close it. */
  const dismissExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return { showWarning, sessionExpired, dismissWarning, dismissExpired };
}
