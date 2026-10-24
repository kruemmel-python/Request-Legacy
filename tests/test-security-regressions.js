'use strict'

const tape = require('./helpers/tape')
const FormData = require('form-data')
const qs = require('qs')
const path = require('path')
const harValidator = require('../lib/har-validator')
const resolveTestFiles = require('../scripts/resolve-test-files')
const getProxyFromURI = require('../lib/getProxyFromURI')
const Multipart = require('../lib/multipart').Multipart
const Har = require('../lib/har').Har
const http = require('http')

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

tape('security: test runner confines input to tests/test-*.js', function (t) {
  const projectRoot = path.resolve(__dirname, '..')

  t.deepEqual(
    resolveTestFiles(projectRoot, ['tests/test-security-regressions.js']),
    ['test-security-regressions.js'],
    'valid test file is accepted'
  )
  t.throws(function () {
    resolveTestFiles(projectRoot, ['request.js'])
  }, /outside tests\/test-\*\.js/, 'project file outside tests is rejected')
  t.throws(function () {
    resolveTestFiles(projectRoot, ['tests/helpers/tape.js'])
  }, /outside tests\/test-\*\.js/, 'nested helper file is rejected')
  t.throws(function () {
    resolveTestFiles(projectRoot, [path.resolve(projectRoot, 'request.js')])
  }, /outside tests\/test-\*\.js/, 'absolute path outside tests is rejected')
  t.end()
})

tape('security: multipart rejects injected raw part headers', function (t) {
  const multipart = new Multipart({ preambleCRLF: false, postambleCRLF: false })
  t.throws(function () {
    multipart.build([{ 'X-Name\r\nInjected': 'value', body: 'safe' }], false)
  }, /Invalid multipart part header/, 'header-name CRLF is rejected')
  t.throws(function () {
    multipart.build([{ 'X-Name': 'value\r\nInjected: yes', body: 'safe' }], false)
  }, /Invalid multipart part header/, 'header-value CRLF is rejected')
  t.end()
})

tape('security: HAR file names do not authorize local reads', function (t) {
  const har = new Har({ debug: function () {} })
  const options = {
    har: {
      method: 'POST', url: 'http://example.invalid/', httpVersion: 'HTTP/1.1',
      cookies: [], headers: [], queryString: [], headersSize: 0, bodySize: 0,
      postData: { mimeType: 'multipart/form-data', size: 0, params: [{ name: 'upload', fileName: 'C:/secret.txt' }] }
    }
  }
  t.throws(function () { har.options(options) }, /harFileResolver/, 'untrusted HAR filename is rejected by default')
  t.end()
})

tape('security: proxy configuration handles CGI and IPv6 NO_PROXY safely', function (t) {
  const old = { HTTP_PROXY: process.env.HTTP_PROXY, http_proxy: process.env.http_proxy, NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy, REQUEST_METHOD: process.env.REQUEST_METHOD }
  process.env.HTTP_PROXY = 'http://attacker.invalid:8080'
  delete process.env.http_proxy
  process.env.REQUEST_METHOD = 'GET'
  t.equal(getProxyFromURI({ protocol: 'http:', hostname: 'example.invalid', port: '' }), null, 'CGI ignores uppercase HTTP_PROXY')
  delete process.env.REQUEST_METHOD
  process.env.NO_PROXY = '[::1]:8443'
  t.equal(getProxyFromURI({ protocol: 'https:', hostname: '::1', port: '8443' }), null, 'bracketed IPv6 NO_PROXY entry matches')
  Object.keys(old).forEach(function (key) {
    if (old[key] === undefined) delete process.env[key]
    else process.env[key] = old[key]
  })
  t.end()
})

tape('security: redirects cannot enter Unix-socket transport by default', function (t) {
  const request = require('..')
  const server = http.createServer(function (req, res) {
    res.writeHead(302, { location: 'http://unix:/tmp/blocked.sock:/admin' })
    res.end()
  })
  server.listen(0, '127.0.0.1', function () {
    request('http://127.0.0.1:' + server.address().port + '/', function (err) {
      t.equal(err && err.code, 'E_REDIRECT_TO_UNIX_SOCKET', 'network redirect is rejected before local socket access')
      server.close(function () { t.end() })
    })
  })
})
