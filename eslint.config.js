'use strict';

// ESLint 9 flat config — replaces the legacy .eslintrc.json.
// Mirrors the old config: eslint:recommended + a few project rules, Node/Jest
// globals, ES2022 CommonJS.
const globals = require('globals');
const js = require('@eslint/js');

module.exports = [
  {
    files: ['**/*.js'],
    ignores: [
      'node_modules/**',
      'logs/**',
      'coverage/**',
      'db/**',
      'scratch/**',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // The codebase deliberately wraps every query/IO call in try/catch and
      // rethrows (`catch (e) { throw e; }`) — 470+ occurrences. Treating that
      // as an error drowns out real issues, so it's disabled. Re-enable after
      // a dedicated cleanup pass if desired.
      'no-useless-catch': 'off',
      'no-console': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
