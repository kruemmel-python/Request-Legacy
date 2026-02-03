# Anleitung: Request-Legacy

Diese Anleitung beschreibt die Nutzung der stabilisierten Legacy-Version von `request` im Projektstand v1.1.

## Voraussetzungen
- Node.js >= 18 (validiert mit Node.js v22.13.0)
- npm

## Installation

### Als lokales Paket (Repo)
```powershell
npm install
```

### Als Abhaengigkeit in einem Projekt
```powershell
npm install request
```

Wenn du die lokale Repo-Version nutzen willst:
```powershell
npm install <pfad-zum-repo>
```

## Schnellstart

### Einfacher GET
```js
const request = require('request')

request('https://example.com', function (err, res, body) {
  if (err) throw err
  console.log(res.statusCode)
  console.log(body)
})
```

### GET mit Querystring und JSON-Antwort
```js
const request = require('request')

request.get({
  url: 'https://httpbin.org/get',
  qs: { q: 'test' },
  json: true
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

### POST mit JSON
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

### POST mit Form-Daten
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

### Multipart Upload
```js
const fs = require('fs')
const request = require('request')

request.post({
  url: 'https://httpbin.org/post',
  formData: {
    file: fs.createReadStream('file.txt')
  }
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## Authentifizierung

### Basic Auth
```js
request.get({
  url: 'https://example.com/private',
  auth: { user: 'user', pass: 'pass', sendImmediately: true }
}, function (err, res, body) {
  if (err) throw err
  console.log(res.statusCode)
})
```

### Bearer Token
```js
request.get({
  url: 'https://example.com/api',
  headers: { Authorization: 'Bearer <token>' }
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## Cookies
```js
const request = require('request')

const jar = request.jar()
jar.setCookie(request.cookie('session=abc123'), 'https://example.com')

request.get({ url: 'https://example.com', jar: jar }, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## Streaming
```js
const fs = require('fs')
const request = require('request')

request.get('https://example.com/file.bin')
  .pipe(fs.createWriteStream('file.bin'))
```

## Redirects
```js
request.get({
  url: 'https://example.com/redirect',
  followRedirect: true,
  followAllRedirects: true
}, function (err, res, body) {
  if (err) throw err
  console.log(res.statusCode)
})
```

## Timeouts
```js
request.get({
  url: 'https://example.com',
  timeout: 5000
}, function (err, res, body) {
  if (err) {
    console.error(err.code)
    return
  }
  console.log(body)
})
```

## TLS / HTTPS

### Eigene Zertifikate
```js
const fs = require('fs')
const request = require('request')

request.get({
  url: 'https://example.com',
  ca: fs.readFileSync('ca.crt')
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

### Unsichere Tests (nur lokal)
```js
request.get({
  url: 'https://localhost:8443',
  rejectUnauthorized: false
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## Defaults und Pooling
```js
const request = require('request')

const client = request.defaults({
  timeout: 10000,
  pool: { maxSockets: 50 },
  forever: true
})

client.get('https://example.com', function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## Proxy
Request nutzt standardmaessig HTTP_PROXY/HTTPS_PROXY/NO_PROXY Umgebungsvariablen.

```js
request.get({
  url: 'https://example.com',
  proxy: 'http://proxy.local:3128'
}, function (err, res, body) {
  if (err) throw err
  console.log(body)
})
```

## Tests und QA
- CI-Tests:
  ```powershell
  npm run test-ci
  ```
- Letzter TAP-Log:
  `fixit_neu_analyse/tap-final.log`
- QA-Report:
  `fixit_neu_analyse/qa_report_v1.1.md`

## Hinweise zur Legacy-Nutzung
`request` ist ein Legacy-Client. Diese Variante wurde fuer Node.js >= 18 (validiert mit v22.13.0) stabilisiert, bleibt aber eine Legacy-API. Fuer neue Projekte sollten moderne Alternativen evaluiert werden.
