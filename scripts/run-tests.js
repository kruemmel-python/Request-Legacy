'use strict'

const path = require('path')
const resolveTestFiles = require('./resolve-test-files')

const timeoutMs = 300 * 1000
const timeout = setTimeout(function () {
  console.error('Global timeout reached, exiting test runner.')
  process.exit(1)
}, timeoutMs)
timeout.unref()

const testsDir = path.join(__dirname, '..', 'tests')
const cliTests = process.argv.slice(2)
const testFiles = resolveTestFiles(path.join(__dirname, '..'), cliTests)

if (testFiles.length === 0) {
  throw new Error('No test files found in tests/')
}

testFiles.forEach(function (name) {
  require(path.join(testsDir, name))
})

const tape = require(path.join(testsDir, 'helpers', 'tape'))
tape.finished().then(function () {
  const helpers = require(path.join(testsDir, 'helpers'))
  helpers.cleanup(function () {
    setImmediate(function () {
      process.exit(process.exitCode || 0)
    })
  })
}, function (error) {
  console.error(error)
  process.exit(1)
})
