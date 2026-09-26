'use strict'

const assert = require('node:assert')

const queue = []
let running = false
let total = 0
let failed = 0

function formatError (error) {
  return error && error.stack ? error.stack : String(error)
}

function createAssertion (complete) {
  let assertionCount = 0
  let plannedCount = null
  let ended = false
  const errors = []

  function record (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)))
  }

  function maybeComplete () {
    if (plannedCount !== null && assertionCount >= plannedCount) {
      if (assertionCount > plannedCount) {
        record(new Error(`plan exceeded: expected ${plannedCount} assertions, got ${assertionCount}`))
      }
      complete(errors)
    }
  }

  function check (assertion) {
    if (ended) {
      record(new Error('assertion occurred after t.end()'))
      complete(errors)
      return
    }
    try {
      assertion()
    } catch (error) {
      record(error)
    }
    assertionCount += 1
    maybeComplete()
  }

  return {
    plan (count) {
      if (!Number.isSafeInteger(count) || count < 0) {
        record(new TypeError('plan must be a non-negative safe integer'))
        complete(errors)
        return
      }
      plannedCount = count
      maybeComplete()
    },
    end (error) {
      if (ended) {
        record(new Error('t.end() called more than once'))
        complete(errors)
        return
      }
      ended = true
      if (error) record(error)
      if (plannedCount !== null && assertionCount !== plannedCount) {
        record(new Error(`plan mismatch: expected ${plannedCount} assertions, got ${assertionCount}`))
      }
      complete(errors)
    },
    ok (value, message) { check(function () { assert.ok(value, message) }) },
    true (value, message) { check(function () { assert.strictEqual(value, true, message) }) },
    notOk (value, message) { check(function () { assert.ok(!value, message) }) },
    notok (value, message) { check(function () { assert.ok(!value, message) }) },
    equal (actual, expected, message) { check(function () { assert.strictEqual(actual, expected, message) }) },
    equals (actual, expected, message) { check(function () { assert.strictEqual(actual, expected, message) }) },
    notEqual (actual, expected, message) { check(function () { assert.notStrictEqual(actual, expected, message) }) },
    deepEqual (actual, expected, message) { check(function () { assert.deepEqual(actual, expected, message) }) },
    same (actual, expected, message) { check(function () { assert.deepEqual(actual, expected, message) }) },
    error (error, message) {
      check(function () {
        if (error) throw new assert.AssertionError({ message: message || error.message, actual: error, expected: null, operator: 'ifError' })
      })
    },
    ifError (error, message) {
      check(function () {
        if (error) throw new assert.AssertionError({ message: message || error.message, actual: error, expected: null, operator: 'ifError' })
      })
    },
    throws (fn, expected, message) {
      check(function () {
        if (typeof expected === 'string' && message === undefined) assert.throws(fn, undefined, expected)
        else assert.throws(fn, expected, message)
      })
    },
    doesNotThrow (fn, expected, message) {
      check(function () {
        if (typeof expected === 'string' && message === undefined) assert.doesNotThrow(fn, undefined, expected)
        else assert.doesNotThrow(fn, expected, message)
      })
    },
    pass () { check(function () {}) },
    fail (message) { check(function () { assert.fail(message) }) },
    skip () {
      assertionCount += 1
      maybeComplete()
    }
  }
}

function tape (name, callback) {
  queue.push({ name: name || '<anonymous>', callback })
}

function runOne (entry) {
  return new Promise(function (resolve) {
    const started = process.hrtime.bigint()
    let settled = false
    const timeout = setTimeout(function () {
      finish([new Error('test timed out after 30000ms')])
    }, 30000)

    function finish (errors) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      process.removeListener('uncaughtException', onUncaught)
      process.removeListener('unhandledRejection', onUnhandled)
      const duration = Number(process.hrtime.bigint() - started) / 1e6
      total += 1
      if (errors.length > 0) {
        failed += 1
        console.error(`not ok ${total} - ${entry.name} (${duration.toFixed(2)}ms)`)
        errors.forEach(function (error) { console.error(formatError(error)) })
      } else {
        console.log(`ok ${total} - ${entry.name} (${duration.toFixed(2)}ms)`)
      }
      resolve()
    }

    function onUncaught (error) { finish([error]) }
    function onUnhandled (reason) { finish([reason]) }
    process.once('uncaughtException', onUncaught)
    process.once('unhandledRejection', onUnhandled)

    try {
      const result = entry.callback(createAssertion(finish))
      if (result && typeof result.then === 'function') {
        result.catch(function (error) { finish([error]) })
      }
    } catch (error) {
      finish([error])
    }
  })
}

tape.finished = async function () {
  if (running) throw new Error('test runner is already active')
  running = true
  console.log('TAP version 13')
  while (queue.length > 0) {
    await runOne(queue.shift())
  }
  console.log(`1..${total}`)
  console.log(`# tests ${total}`)
  console.log(`# pass ${total - failed}`)
  console.log(`# fail ${failed}`)
  if (failed > 0) process.exitCode = 1
}

module.exports = tape
