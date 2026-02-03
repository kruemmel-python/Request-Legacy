'use strict'
var helpers = require('./helpers')

var http = helpers.http
var path = helpers.path
var mime = helpers.mime
var request = helpers.request
var fs = helpers.fs
var tape = helpers.tape

function destroyStreamOrRequest (value) {
  if (!value || typeof value !== 'object') {
    return
  }
  if (typeof value.abort === 'function') {
    value.abort()
  }
  if (typeof value.destroy === 'function') {
    try {
      value.destroy()
    } catch (err) {}
  }
}

function cleanupFormDataStreams (formData) {
  destroyStreamOrRequest(formData.my_file)
  destroyStreamOrRequest(formData.remote_file)
  if (formData.secret_file) {
    destroyStreamOrRequest(formData.secret_file.value)
  }
  if (Array.isArray(formData.batch)) {
    formData.batch.forEach(destroyStreamOrRequest)
  }
}

function drainRequestBody (req) {
  if (!req || typeof req.resume !== 'function') {
    return
  }
  req.on('data', function () {})
  req.resume()
}

function runTest (t, options) {
  var remoteFile = path.join(__dirname, 'googledoodle.jpg')
  var localFile = path.join(__dirname, 'unicycle.jpg')
  var multipartFormData = {}

  var server = http.createServer(function (req, res) {
    if (req.url === '/file') {
      res.writeHead(200, {'content-type': 'image/jpg', 'content-length': 7187})
      res.end(fs.readFileSync(remoteFile), 'binary')
      return
    }

    t.ok(/multipart\/form-data; boundary=--------------------------\d+/
      .test(req.headers['content-type']))

    // temp workaround
    var data = ''
    req.setEncoding('utf8')
    req.on('data', function (d) {
      data += d
    })

    req.on('end', function () {
      if (options.auth && !req.headers.authorization) {
        drainRequestBody(req)
        res.writeHead(401, {'www-authenticate': 'Basic realm="Private"'})
        res.end()
        return
      }
      if (options.auth) {
        var expectedAuth = 'Basic ' + Buffer.from(options.auth.user + ':' + options.auth.pass).toString('base64')
        t.ok(req.headers.authorization === expectedAuth)
      }

      // check for the fields' traces

      // 1st field : my_field
      t.ok(data.indexOf('form-data; name="my_field"') !== -1)
      t.ok(data.indexOf(multipartFormData.my_field) !== -1)

      // 2nd field : my_buffer
      t.ok(data.indexOf('form-data; name="my_buffer"') !== -1)
      t.ok(data.indexOf(multipartFormData.my_buffer) !== -1)

      // 3rd field : my_file
      t.ok(data.indexOf('form-data; name="my_file"') !== -1)
      t.ok(data.indexOf('; filename="' + path.basename(multipartFormData.my_file.path) + '"') !== -1)
      // check for unicycle.jpg traces
      t.ok(data.indexOf('2005:06:21 01:44:12') !== -1)
      t.ok(data.indexOf('Content-Type: ' + mime.lookup(multipartFormData.my_file.path)) !== -1)

      // 4th field : remote_file
      t.ok(data.indexOf('form-data; name="remote_file"') !== -1)
      t.ok(data.indexOf('; filename="' + path.basename(multipartFormData.remote_file.path) + '"') !== -1)

      // 5th field : file with metadata
      t.ok(data.indexOf('form-data; name="secret_file"') !== -1)
      t.ok(data.indexOf('Content-Disposition: form-data; name="secret_file"; filename="topsecret.jpg"') !== -1)
      t.ok(data.indexOf('Content-Type: image/custom') !== -1)

      // 6th field : batch of files
      t.ok(data.indexOf('form-data; name="batch"') !== -1)
      t.ok(data.match(/form-data; name="batch"/g).length === 2)

      // check for http://localhost:nnnn/file traces
      t.ok(data.indexOf('Photoshop ICC') !== -1)
      t.ok(data.indexOf('Content-Type: ' + mime.lookup(remoteFile)) !== -1)

      drainRequestBody(req)
      res.writeHead(200)
      res.end(options.json ? JSON.stringify({status: 'done'}) : 'done')
    })
  })

  server.listen(0, function () {
    var url = 'http://localhost:' + this.address().port
    // @NOTE: multipartFormData properties must be set here so that my_file read stream does not leak in node v0.8
    multipartFormData.my_field = 'my_value'
    multipartFormData.my_buffer = Buffer.from([1, 2, 3])
    multipartFormData.my_file = fs.createReadStream(localFile)
    var remoteFileOptions = { url: url + '/file' }
    if (options.auth && typeof options.auth === 'object') {
      remoteFileOptions.auth = options.auth
    }
    multipartFormData.remote_file = request(remoteFileOptions)
    multipartFormData.secret_file = {
      value: fs.createReadStream(localFile),
      options: {
        filename: 'topsecret.jpg',
        contentType: 'image/custom'
      }
    }
    multipartFormData.batch = [
      fs.createReadStream(localFile),
      fs.createReadStream(localFile)
    ]

    var reqOptions = {
      url: url + '/upload',
      formData: multipartFormData
    }
    if (options.json) {
      reqOptions.json = true
    }
    if (options.auth) {
      var authOptions = typeof options.auth === 'object'
        ? options.auth
        : {user: 'test', pass: 'test', sendImmediately: true}
      if (typeof authOptions.sendImmediately === 'undefined') {
        authOptions.sendImmediately = true
      }
      reqOptions.auth = authOptions
      options.auth = authOptions
    }
    request.post(reqOptions, function (err, res, body) {
      cleanupFormDataStreams(multipartFormData)
      if (err) {
        server.close(function () {
          t.fail(err)
          t.end()
        })
        return
      }
      t.equal(res.statusCode, 200)
      t.deepEqual(body, options.json ? {status: 'done'} : 'done')
      server.close(function () {
        t.end()
      })
    })
  })
}

tape('multipart formData', function (t) {
  runTest(t, {json: false})
})

tape('multipart formData + JSON', function (t) {
  runTest(t, {json: true})
})

tape('multipart formData + basic auth', function (t) {
  runTest(t, {json: false, auth: true})
})
