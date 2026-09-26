'use strict'

const tape = require('./helpers/tape')
const FormData = require('form-data')
const qs = require('qs')
const harValidator = require('../lib/har-validator')

tape('security: form-data escapes CRLF in field names', function (t) {
  const form = new FormData()
  form.append('name"\r\nX-Injected: yes\r\nfoo="', 'value')
  const body = form.getBuffer().toString('utf8')

  t.notOk(body.includes('\r\nX-Injected: yes\r\n'), 'raw injected header is absent')
  t.ok(body.includes('%0D%0A'), 'CRLF is percent-escaped')
  t.end()
})

tape('security: qs enforces arrayLimit for bracket-key comma parsing', function (t) {
  t.throws(function () {
    qs.parse('a[]=1,2,3,4', {
      comma: true,
      arrayLimit: 3,
      throwOnLimitExceeded: true
    })
  }, 'array limit bypass is blocked')
  t.end()
})

tape('security: qs stringify resists attacker-controlled constructor.isBuffer', function (t) {
  const parsed = qs.parse('a[constructor][isBuffer]=not-a-function', {
    allowPrototypes: true
  })

  t.doesNotThrow(function () {
    qs.stringify(parsed)
  }, 'stringify does not call a non-function isBuffer property')
  t.end()
})

tape('security: internal HAR validator rejects malformed structures', function (t) {
  t.equal(harValidator.request(null), false, 'null is rejected')
  t.equal(harValidator.request({ method: 'GET' }), false, 'incomplete request is rejected')
  t.equal(harValidator.request({
    method: 'GET',
    url: 'https://example.invalid/',
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headers: [],
    queryString: [],
    headersSize: 0,
    bodySize: 0,
    postData: {
      mimeType: 'application/octet-stream',
      size: 0
    }
  }), true, 'minimal normalized request is accepted')
  t.end()
})

tape('security: direct qs objects do not import inherited properties', function (t) {
  const request = require('..')
  const inherited = { inherited: 'must-not-leak' }
  const input = Object.create(inherited)
  input.own = 'ok'

  const req = request({
    url: 'http://127.0.0.1/',
    qs: input
  })

  t.ok(req.uri.query.includes('own=ok'), 'own query property is serialized')
  t.notOk(req.uri.query.includes('inherited='), 'inherited query property is ignored')
  req.abort()
  t.end()
})


tape('security: maxRedirects rejects non-finite and excessive values', function (t) {
  const request = require('..')
  t.throws(function () { request({ url: 'http://127.0.0.1/', maxRedirects: NaN }) }, /maxRedirects/, 'NaN rejected')
  t.throws(function () { request({ url: 'http://127.0.0.1/', maxRedirects: 101 }) }, /maxRedirects/, 'excessive redirect limit rejected')
  t.end()
})

tape('security: maxResponseSize rejects invalid values', function (t) {
  const request = require('..')
  t.throws(function () {
    request({ url: 'http://127.0.0.1/', maxResponseSize: -1 })
  }, /maxResponseSize/, 'negative limit rejected')
  t.end()
})


tape('security: internal merge blocks prototype-pollution keys', function (t) {
  const extend = require('../lib/extend')
  const payload = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"safe":1}')
  const target = {}
  extend(true, target, payload)
  t.equal(target.safe, 1, 'safe properties are merged')
  t.equal({}.polluted, undefined, 'Object prototype is not polluted')
  t.equal(Object.prototype.hasOwnProperty.call(target, '__proto__'), false, '__proto__ is ignored')
  t.equal(Object.prototype.hasOwnProperty.call(target, 'constructor'), false, 'constructor is ignored')
  t.end()
})
