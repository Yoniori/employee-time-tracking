'use strict';

module.exports = {
  testEnvironment: 'node',
  // Only pick up Jest test files; phone.test.js uses the native node:test runner
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/phone.test.js'],
  clearMocks: true,   // clears call history between tests (not implementations)
  verbose: true,
};
