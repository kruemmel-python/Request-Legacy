'use strict'

const crypto = require('crypto')
const Buffer = require('node:buffer').Buffer

const defer = typeof setImmediate === 'undefined'
  ? process.nextTick
  : setImmediate

function paramsHaveRequestBody (params) {
  return (
    params.body ||
    params.requestBodyStream ||
    (params.json && typeof params.json !== 'boolean') ||
    params.multipart
  )
}

function safeStringify (obj, replacer) {
  const seen = new WeakSet()

  return JSON.stringify(obj, function (key, value) {
    let nextValue = value
    if (typeof replacer === 'function') {
      nextValue = replacer.call(this, key, value)
    }

    if (nextValue && typeof nextValue === 'object') {
      if (seen.has(nextValue)) {
        return '[Circular]'
      }
      seen.add(nextValue)
    }
    return nextValue
  })
}

function md5 (str) {
  return crypto.createHash('md5').update(str).digest('hex')
}

function isReadStream (rs) {
  return rs.readable && rs.path && rs.mode
}

function toBase64 (str) {
  return Buffer.from(str || '', 'utf8').toString('base64')
}

function copy (obj) {
  const o = {}
  Object.keys(obj).forEach(function (i) {
    o[i] = obj[i]
  })
  return o
}


exports.paramsHaveRequestBody = paramsHaveRequestBody
exports.safeStringify = safeStringify
exports.md5 = md5
exports.isReadStream = isReadStream
exports.toBase64 = toBase64
exports.copy = copy
exports.defer = defer
