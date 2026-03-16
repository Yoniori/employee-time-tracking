'use strict';

/**
 * Shared Israeli phone-number utilities.
 *
 * These are pure functions with NO external dependencies so they can be
 * imported by both server routes and automated tests without side effects.
 *
 * NOTE: The route files (employees.js, shifts.js, etc.) each carry a local
 * copy of these functions for historical reasons. This shared module is the
 * single-source-of-truth going forward and is used by the test suite.
 */

/**
 * Normalises any Israeli phone number to E.164 (+972XXXXXXXXX).
 *
 * Handles:
 *   0XXXXXXXXX    → +972XXXXXXXXX
 *   972XXXXXXXXX  → +972XXXXXXXXX
 *   +972XXXXXXXXX → unchanged
 *   bare digits   → +972 prefix added
 *   null/undefined/'' → ''  (empty string — never throws)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  return '+972' + digits;
}

/**
 * Validates that a phone number is a real Israeli mobile number.
 * Israeli mobiles are +9725XXXXXXXX (9 digits after the country code, starting with 5).
 *
 * @returns {string|null} Error message string, or null if valid.
 */
function validateIsraeliPhone(phone) {
  if (!phone) return 'מספר טלפון הוא שדה חובה';
  const e164 = normalizePhone(phone);
  if (!/^\+9725\d{8}$/.test(e164)) {
    return 'מספר טלפון לא תקין — יש להזין מספר נייד ישראלי (לדוגמה: 0501234567)';
  }
  return null;
}

/**
 * Returns both the E.164 and local "0..." variants of a phone number.
 * Used for Firestore `in` queries that need to match regardless of stored format.
 *
 * Example: phoneVariants('0501234567') → ['+972501234567', '0501234567']
 */
function phoneVariants(rawPhone) {
  const e164 = normalizePhone(rawPhone);
  const local = '0' + e164.replace(/^\+972/, '');
  return e164 === local ? [e164] : [e164, local];
}

module.exports = { normalizePhone, validateIsraeliPhone, phoneVariants };
