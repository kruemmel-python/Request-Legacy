'use strict'

const http = require('http')
const stream = require('stream')
const zlib = require('zlib')
const request = require('..')
const tape = require('./helpers/tape')

function listen (server, callback) { server.listen(0, '127.0.0.1', callback) }

tape('security: deferred credentials are not recreated after a cross-origin redirect', function (t) {
  let authorization
  const target = http.createServer(function (req, res) {
    authorization = req.headers.authorization
    res.writeHead(401, { 'www-authenticate': 'Basic realm="target"' })
    res.end()
  })
  const source = http.createServer(function (req, res) {
    res.writeHead(302, { location: 'http://127.0.0.1:' + target.address().port + '/' })
    res.end()
  })
  listen(target, function () {
    listen(source, function () {
      request({ url: 'http://127.0.0.1:' + source.address().port + '/', auth: { user: 'alice', pass: 'secret', sendImmediately: false } }, function (err, res) {
        t.equal(err, null, 'request completes')
        t.equal(res.statusCode, 401, 'challenge is not retried')
        t.equal(authorization, undefined, 'target received no deferred credential')
        source.close(function () { target.close(function () { t.end() }) })
      })
    })
  })
})

tape('security: AWS signing state is not reused after a cross-origin redirect', function (t) {
  let headers
  const target = http.createServer(function (req, res) { headers = req.headers; res.end('ok') })
  const source = http.createServer(function (req, res) {
    res.writeHead(302, { location: 'http://127.0.0.1:' + target.address().port + '/' })
    res.end()
  })
  listen(target, function () {
    listen(source, function () {
      request({ url: 'http://127.0.0.1:' + source.address().port + '/', aws: { key: 'AKIDEXAMPLE', secret: 'not-a-real-secret', sign_version: 4, service: 'execute-api' } }, function (err, res) {
        t.equal(err, null, 'request completes')
        t.equal(res.statusCode, 200, 'target responds')
        t.equal(headers.authorization, undefined, 'target received no AWS signature')
        t.equal(headers['x-amz-security-token'], undefined, 'target received no AWS session token')
        source.close(function () { target.close(function () { t.end() }) })
      })
    })
  })
})

tape('security: decoded pipes do not forward compressed Content-Length', function (t) {
  const payload = Buffer.from('decoded payload has a different length')
  const compressed = zlib.gzipSync(payload)
  const source = http.createServer(function (req, res) {
    res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': compressed.length, 'content-type': 'text/plain' })
    res.end(compressed)
  })
  listen(source, function () {
    const destination = new stream.PassThrough()
    const headers = {}
    destination.headers = headers
    destination.headersSent = false
    destination.setHeader = function (name, value) { headers[name.toLowerCase()] = value }
    const chunks = []
    destination.on('data', function (chunk) { chunks.push(chunk) })
    destination.on('end', function () {
      t.equal(Buffer.concat(chunks).toString(), payload.toString(), 'destination receives decoded bytes')
      t.equal(headers['content-length'], undefined, 'compressed framing is absent')
      t.equal(headers['content-encoding'], undefined, 'compressed representation header is absent')
      source.close(function () { t.end() })
    })
    request({ url: 'http://127.0.0.1:' + source.address().port + '/', gzip: true }).pipe(destination)
  })
})

tape('security: advanced agent policies are not globally pooled', function (t) {
  const source = http.createServer(function (req, res) { res.end('ok') })
  listen(source, function () {
    const uri = 'http://127.0.0.1:' + source.address().port + '/'
    const first = request({ uri, agentOptions: { lookup: function () {} } })
    const second = request({ uri, agentOptions: { lookup: function () {} } })
    t.notEqual(first.agent, second.agent, 'arbitrary agent policies receive isolated pools')
    first.abort(); second.abort(); first.agent.destroy(); second.agent.destroy()
    source.close(function () { t.end() })
  })
})
