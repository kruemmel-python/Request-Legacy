'use strict'

const fs = require('fs')
const path = require('path')

const TEST_FILE_PATTERN = /^test-[A-Za-z0-9._-]+\.js$/

module.exports = function resolveTestFiles (projectRoot, requestedFiles) {
  const testsDir = fs.realpathSync(path.resolve(projectRoot, 'tests'))

  function validate (requestedFile) {
    if (typeof requestedFile !== 'string' || requestedFile.length === 0) {
      throw new Error('Test path must be a non-empty string')
    }

    const target = path.isAbsolute(requestedFile)
      ? path.resolve(requestedFile)
      : path.resolve(projectRoot, requestedFile)

    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error('Test file not found: ' + requestedFile)
    }

    const realTarget = fs.realpathSync(target)
    const name = path.basename(realTarget)
    if (path.dirname(realTarget) !== testsDir || !TEST_FILE_PATTERN.test(name)) {
      throw new Error('Test path outside tests/test-*.js is not allowed: ' + requestedFile)
    }

    return name
  }

  if (!requestedFiles || requestedFiles.length === 0) {
    return fs.readdirSync(testsDir)
      .filter(function (name) {
        return TEST_FILE_PATTERN.test(name)
      })
      .map(function (name) {
        return validate(path.join('tests', name))
      })
      .sort()
  }

  return requestedFiles.map(validate)
}
