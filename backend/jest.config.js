/**
 * jest.config.js — default suite: hermetic unit tests (no network, no live Firebase).
 * The live E2E suite runs only on demand: npm run test:e2e (see jest.e2e.config.js).
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testTimeout: 30000,
};
