'use strict'

const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'fixit/**',
      'fixit_neu_analyse/**',
      'reports/**',
      'data/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.node
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn'
    },
    rules: Object.assign({}, js.configs.recommended.rules, {
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-var': 'off',
      'prefer-const': 'warn',
      'no-prototype-builtins': 'warn',
      'no-unused-expressions': 'warn',
      'no-empty': 'warn',
      'no-tabs': 'warn',
      'no-mixed-spaces-and-tabs': 'warn',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }]
    })
  },
  {
    files: ['tests/browser/**/*.js'],
    languageOptions: {
      globals: Object.assign({}, globals.browser, {
        __karma__: 'readonly'
      })
    }
  }
]
