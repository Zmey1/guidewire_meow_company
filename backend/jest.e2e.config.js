/**
 * jest.e2e.config.js — LIVE end-to-end suite. Writes to real Firebase and calls
 * the deployed services. Never run against production without explicit approval.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
  testTimeout: 30000,
};
