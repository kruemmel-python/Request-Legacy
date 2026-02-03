'use strict'
const helpers = require('./helpers')

const request = helpers.request
const http = helpers.http
const fs = helpers.fs
const rmSync = function (target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true })
  }
}
const assert = helpers.assert
const tape = helpers.tape
const url = helpers.url

if (process.platform === 'win32') {
  tape('skip unix socket tests on windows', function (t) {
    t.skip('Unix sockets are not reliably supported in this Windows environment')
    t.end()
  })
} else {
  const rawPath = [null, 'raw', 'path'].join('/')
  const queryPath = [null, 'query', 'path'].join('/')
  const searchString = '?foo=bar'
  const socket = [__dirname, 'tmp-socket'].join('/')
  const expectedBody = 'connected'
  const statusCode = 200

  rmSync(socket)

  const s = http.createServer(function (req, res) {
    const incomingUrl = url.parse(req.url)
    switch (incomingUrl.pathname) {
      case rawPath:
        assert.equal(incomingUrl.pathname, rawPath, 'requested path is sent to server')
        break

      case queryPath:
        assert.equal(incomingUrl.pathname, queryPath, 'requested path is sent to server')
        assert.equal(incomingUrl.search, searchString, 'query string is sent to server')
        break

      default:
        assert(false, 'A valid path was requested')
    }
    res.statusCode = statusCode
    res.end(expectedBody)
  })

  tape('setup', function (t) {
    s.listen(socket, function () {
      t.end()
    })
  })

  tape('unix socket connection', function (t) {
    request('http://unix:' + socket + ':' + rawPath, function (err, res, body) {
      t.equal(err, null, 'no error in connection')
      t.equal(res.statusCode, statusCode, 'got HTTP 200 OK response')
      t.equal(body, expectedBody, 'expected response body is received')
      t.end()
    })
  })

  tape('unix socket connection with qs', function (t) {
    request({
      uri: 'http://unix:' + socket + ':' + queryPath,
      qs: {
        foo: 'bar'
      }
    }, function (err, res, body) {
      t.equal(err, null, 'no error in connection')
      t.equal(res.statusCode, statusCode, 'got HTTP 200 OK response')
      t.equal(body, expectedBody, 'expected response body is received')
      t.end()
    })
  })

  tape('cleanup', function (t) {
    s.close(function () {
      fs.unlink(socket, function () {
        t.end()
      })
    })
  })
}
