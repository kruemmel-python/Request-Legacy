'use strict'

const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'request_testserver/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-console': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-with': 'error'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none' }]
    }
  }
]
