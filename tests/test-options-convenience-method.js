'use strict'
const helpers = require('./helpers')

const server = helpers.server
const request = helpers.request
const tape = helpers.tape
const destroyable = require('./helpers/destroyable')

const s = server.createServer()

destroyable(s)

tape('setup', function (t) {
  s.listen(0, function () {
    s.on('/options', function (req, res) {
      res.writeHead(200, {
        'x-original-method': req.method,
        allow: 'OPTIONS, GET, HEAD'
      })

      res.end()
    })

    t.end()
  })
})

tape('options(string, function)', function (t) {
  request.options(s.url + '/options', function (err, res) {
    t.equal(err, null)
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-original-method'], 'OPTIONS')
    t.end()
  })
})

tape('options(object, function)', function (t) {
  request.options({
    url: s.url + '/options',
    headers: { foo: 'bar' }
  }, function (err, res) {
    t.equal(err, null)
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-original-method'], 'OPTIONS')
    t.end()
  })
})

tape('cleanup', function (t) {
  s.destroy(function () {
    t.end()
  })
})
