/**
 * jest.config.js — Jest configuration for test pyramid.
 *
 * Run all unit tests:    npm run test:unit
 * Run e2e tests:         npm run test:e2e
 * Run everything:        npm test
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 60000,
  testPathIgnorePatterns: [],
};
