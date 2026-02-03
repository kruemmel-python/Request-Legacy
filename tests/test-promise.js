'use strict'
const helpers = require('./helpers')

const http = helpers.http
const request = helpers.request
const tape = helpers.tape
const Promise = global.Promise

function promisify (fn, options) {
  return function () {
    const self = this
    const args = Array.prototype.slice.call(arguments)
    return new Promise(function (resolve, reject) {
      args.push(function (err) {
        if (err) {
          reject(err)
          return
        }
        const results = Array.prototype.slice.call(arguments, 1)
        if (options && options.multiArgs) {
          resolve(results)
        } else {
          resolve(results[0])
        }
      })
      fn.apply(self, args)
    })
  }
}

function promisifyAll (obj, options) {
  for (const key in obj) {
    if (typeof obj[key] === 'function' && !obj[key + 'Async']) {
      obj[key + 'Async'] = promisify(obj[key], options)
    }
  }
}

const s = http.createServer(function (req, res) {
  res.writeHead(200, {})
  res.end('ok')
})

tape('setup', function (t) {
  s.listen(0, function () {
    s.url = 'http://localhost:' + this.address().port
    t.end()
  })
})

tape('promisify convenience method', function (t) {
  const get = request.get
  const p = promisify(get, { multiArgs: true })
  p(s.url)
    .then(function (results) {
      const res = results[0]
      t.equal(res.statusCode, 200)
      t.end()
    })
})

tape('promisify request function', function (t) {
  const p = promisify(request, { multiArgs: true })
  p(s.url)
    .then(function (results) {
      const res = results[0]
      t.equal(res.statusCode, 200)
      t.end()
    })
})

tape('promisify all methods', function (t) {
  promisifyAll(request, { multiArgs: true })
  request.getAsync(s.url)
    .then(function (results) {
      const res = results[0]
      t.equal(res.statusCode, 200)
      t.end()
    })
})

tape('cleanup', function (t) {
  s.close(function () {
    t.end()
  })
})
