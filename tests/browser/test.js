'use strict'

if (!Function.prototype.bind) {
  // This is because of the fact that phantom.js does not have Function.bind.
  // This is a bug in phantom.js.
  // More info: https://github.com/ariya/phantomjs/issues/10522
  /* eslint no-extend-native:0 */
  Function.prototype.bind = function bind (context) {
    const fn = this
    const slice = Array.prototype.slice
    const args = slice.call(arguments, 1)
    return function () {
      return fn.apply(context, args.concat(slice.call(arguments)))
    }
  }
}

const tape = require('tape')
const request = require('../../index')

tape('returns on error', function (t) {
  t.plan(1)
  request({
    uri: 'https://stupid.nonexistent.path:port123/\\<-great-idea',
    withCredentials: false
  }, function (error, response) {
    t.equal(typeof error, 'object')
    t.end()
  })
})

tape('succeeds on valid URLs (with https and CORS)', function (t) {
  t.plan(1)
  request({
    uri: __karma__.config.requestTestUrl,
    withCredentials: false
  }, function (_, response) {
    t.equal(response.statusCode, 200)
    t.end()
  })
})
