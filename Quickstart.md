# Quickstart – Request-Legacy

## 1) Install
```powershell
npm install request
```

## 2) GET
```js
const request = require('request')

request('https://example.com', function (err, res, body) {
  if (err) throw err
  console.log(res.statusCode)
  console.log(body)
})
```

## 3) POST (JSON)
```js
const request = require('request')

request.post({
  url: 'https://httpbin.org/post',
  json: { hello: 'world' }
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## 4) POST (Form)
```js
const request = require('request')

request.post({
  url: 'https://httpbin.org/post',
  form: { a: 1, b: 2 }
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## 5) Basic Auth
```js
request.get({
  url: 'https://example.com/private',
  auth: { user: 'user', pass: 'pass', sendImmediately: true }
}, function (err, res, body) {
  if (err) throw err
  console.log(res.statusCode)
})
```

## Tests
```powershell
npm run test-ci
```

## Status
- Stabilisiert fuer Node.js v22.13.0
- Legacy-API: fuer neue Projekte Alternativen pruefen
