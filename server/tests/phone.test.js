'use strict';

/**
 * Unit tests for server/src/utils/phone.js
 * Run with:  npm test  (uses Node.js built-in test runner — no extra deps required)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, validateIsraeliPhone, phoneVariants } = require('../src/utils/phone');

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  it('converts local 0... format to E.164', () => {
    assert.equal(normalizePhone('0501234567'), '+972501234567');
    assert.equal(normalizePhone('0541112233'), '+972541112233');
  });

  it('keeps E.164 +972... unchanged', () => {
    assert.equal(normalizePhone('+972501234567'), '+972501234567');
  });

  it('converts 972... (no leading +) to E.164', () => {
    assert.equal(normalizePhone('972501234567'), '+972501234567');
  });

  it('strips spaces before normalizing', () => {
    assert.equal(normalizePhone('050 123 4567'), '+972501234567');
  });

  it('strips dashes before normalizing', () => {
    assert.equal(normalizePhone('050-123-4567'), '+972501234567');
  });

  it('strips parentheses and dots', () => {
    assert.equal(normalizePhone('(050)123.4567'), '+972501234567');
  });

  it('returns empty string for null', () => {
    assert.equal(normalizePhone(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(normalizePhone(undefined), '');
  });

  it('returns empty string for empty string', () => {
    assert.equal(normalizePhone(''), '');
  });

  it('handles numeric input (non-string)', () => {
    // phone stored as number in old records
    assert.equal(normalizePhone(502345678), '+972502345678');
  });
});

// ─── validateIsraeliPhone ─────────────────────────────────────────────────────

describe('validateIsraeliPhone', () => {
  it('accepts valid local 05X format', () => {
    assert.equal(validateIsraeliPhone('0501234567'), null);
    assert.equal(validateIsraeliPhone('0541234567'), null);
    assert.equal(validateIsraeliPhone('0521234567'), null);
  });

  it('accepts valid E.164 +9725X format', () => {
    assert.equal(validateIsraeliPhone('+972501234567'), null);
    assert.equal(validateIsraeliPhone('+972541234567'), null);
  });

  it('accepts number with spaces/dashes', () => {
    assert.equal(validateIsraeliPhone('050-123-4567'), null);
    assert.equal(validateIsraeliPhone('050 123 4567'), null);
  });

  it('rejects Israeli landline (02 area code)', () => {
    assert.notEqual(validateIsraeliPhone('0261234567'), null);
  });

  it('rejects Israeli landline (03 area code)', () => {
    assert.notEqual(validateIsraeliPhone('0361234567'), null);
  });

  it('rejects number that is too short', () => {
    assert.notEqual(validateIsraeliPhone('050123'), null);
  });

  it('rejects number that is too long', () => {
    assert.notEqual(validateIsraeliPhone('050123456789'), null);
  });

  it('rejects empty string', () => {
    assert.notEqual(validateIsraeliPhone(''), null);
  });

  it('rejects null', () => {
    assert.notEqual(validateIsraeliPhone(null), null);
  });

  it('returns a string error message (not boolean/undefined)', () => {
    const result = validateIsraeliPhone('bad');
    assert.equal(typeof result, 'string');
  });
});

// ─── phoneVariants ────────────────────────────────────────────────────────────

describe('phoneVariants', () => {
  it('returns both E.164 and local variants from local input', () => {
    const variants = phoneVariants('0501234567');
    assert.ok(variants.includes('+972501234567'), 'should include E.164');
    assert.ok(variants.includes('0501234567'),    'should include local');
    assert.equal(variants.length, 2);
  });

  it('returns both E.164 and local variants from E.164 input', () => {
    const variants = phoneVariants('+972501234567');
    assert.ok(variants.includes('+972501234567'), 'should include E.164');
    assert.ok(variants.includes('0501234567'),    'should include local');
    assert.equal(variants.length, 2);
  });

  it('returns array of exactly 2 elements for normal numbers', () => {
    assert.equal(phoneVariants('0501234567').length, 2);
  });

  it('E.164 variant is always first', () => {
    const variants = phoneVariants('0501234567');
    assert.ok(variants[0].startsWith('+'));
  });
});

// ─── Cross-function consistency ───────────────────────────────────────────────

describe('normalizePhone + validateIsraeliPhone consistency', () => {
  it('a number that passes validation normalizes to a valid E.164', () => {
    const phone = '0501234567';
    assert.equal(validateIsraeliPhone(phone), null); // valid
    const e164 = normalizePhone(phone);
    assert.ok(/^\+9725\d{8}$/.test(e164), `E.164 ${e164} should match mobile pattern`);
  });

  it('both local and E.164 variants of the same number normalize to same value', () => {
    assert.equal(normalizePhone('0501234567'), normalizePhone('+972501234567'));
  });
});
