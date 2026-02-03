'use strict'

const fs = require('fs')
const path = require('path')

const opensslConfig = path.join(__dirname, 'openssl-legacy.conf')
process.env.OPENSSL_CONF = opensslConfig

const timeoutMs = 300 * 1000
setTimeout(function () {
  console.error('Global timeout reached, exiting test runner.')
  process.exit(1)
}, timeoutMs)

const testsDir = path.join(__dirname, '..', 'tests')
const cliTests = process.argv.slice(2)
let testFiles

if (cliTests.length === 0) {
  testFiles = fs.readdirSync(testsDir)
    .filter(function (name) {
      return /^test-.*\.js$/.test(name)
    })
    .sort()
} else {
  testFiles = cliTests.map(function (arg) {
    const target = path.isAbsolute(arg) ? arg : path.join(__dirname, '..', arg)
    if (!fs.existsSync(target)) {
      throw new Error('Test file not found: ' + arg)
    }
    return path.relative(testsDir, target)
  })
}

if (testFiles.length === 0) {
  throw new Error('No test files found in tests/')
}

testFiles.forEach(function (name) {
  require(path.join(testsDir, name))
})
