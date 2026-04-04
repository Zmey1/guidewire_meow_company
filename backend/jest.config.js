/**
 * jest.config.js — Jest multi-project config for test pyramid.
 *
 * Projects: unit → integration → flow
 * Run all:         npm test
 * Run by layer:    npm run test:unit
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
  testTimeout: 30000,
};
