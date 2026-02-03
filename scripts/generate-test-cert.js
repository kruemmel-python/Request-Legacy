'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function derLength (len) {
  if (len < 128) {
    return Buffer.from([len])
  }
  const octets = []
  while (len > 0) {
    octets.unshift(len & 0xff)
    len >>= 8
  }
  return Buffer.concat([Buffer.from([0x80 | octets.length]), Buffer.from(octets)])
}

function derSequence (parts) {
  const payload = Buffer.concat(parts)
  return Buffer.concat([Buffer.from([0x30]), derLength(payload.length), payload])
}

function derSet (buffer) {
  return Buffer.concat([Buffer.from([0x31]), derLength(buffer.length), buffer])
}

function derInteger (value) {
  let buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
  while (buf.length > 1 && buf[0] === 0 && !(buf[1] & 0x80)) {
    buf = buf.slice(1)
  }
  if (buf[0] & 0x80) {
    buf = Buffer.concat([Buffer.from([0x00]), buf])
  }
  return Buffer.concat([Buffer.from([0x02]), derLength(buf.length), buf])
}

function derIntegerFromNumber (num) {
  let hex = num.toString(16)
  if (hex.length % 2) {
    hex = '0' + hex
  }
  if (hex.length === 0) {
    hex = '00'
  }
  return derInteger(Buffer.from(hex, 'hex'))
}

function derOid (oid) {
  const sections = oid.split('.').map(Number)
  const first = 40 * sections[0] + sections[1]
  let body = []
  for (let i = 2; i < sections.length; i += 1) {
    let value = sections[i]
    const octets = []
    do {
      octets.unshift(value & 0x7f)
      value >>= 7
    } while (value > 0)
    for (let j = 0; j < octets.length - 1; j += 1) {
      octets[j] |= 0x80
    }
    body = body.concat(octets)
  }
  return Buffer.concat([Buffer.from([0x06]), derLength(body.length + 1), Buffer.from([first]), Buffer.from(body)])
}

function derUtf8String (str) {
  const buf = Buffer.from(str, 'utf8')
  return Buffer.concat([Buffer.from([0x0c]), derLength(buf.length), buf])
}

function derUtcTime (date) {
  function twoDigits (value) {
    return value < 10 ? '0' + value : '' + value
  }
  const year = date.getUTCFullYear() % 100
  const str =
    twoDigits(year) +
    twoDigits(date.getUTCMonth() + 1) +
    twoDigits(date.getUTCDate()) +
    twoDigits(date.getUTCHours()) +
    twoDigits(date.getUTCMinutes()) +
    twoDigits(date.getUTCSeconds()) +
    'Z'
  const buf = Buffer.from(str, 'ascii')
  return Buffer.concat([Buffer.from([0x17]), derLength(buf.length), buf])
}

function derNull () {
  return Buffer.from([0x05, 0x00])
}

function derContextSpecific (index, buffer) {
  const tag = 0xa0 + index
  return Buffer.concat([Buffer.from([tag]), derLength(buffer.length), buffer])
}

function derBitString (data) {
  const payload = Buffer.concat([Buffer.from([0x00]), data])
  return Buffer.concat([Buffer.from([0x03]), derLength(payload.length), payload])
}

function derName (commonName) {
  const attr = derSequence([derOid('2.5.4.3'), derUtf8String(commonName)])
  return derSequence([derSet(attr)])
}

function toPem (buffer, label) {
  const b64 = buffer.toString('base64')
  const chunks = b64.match(/.{1,64}/g) || []
  return (
    '-----BEGIN ' + label + '-----\n' +
    chunks.join('\n') +
    '\n-----END ' + label + '-----\n'
  )
}

const signatureAlgorithm = derSequence([derOid('1.2.840.113549.1.1.11'), derNull()])

function buildTbsCertificate (opts) {
  const version = derContextSpecific(0, derIntegerFromNumber(2))
  const validity = derSequence([
    derUtcTime(opts.notBefore),
    derUtcTime(opts.notAfter)
  ])
  return derSequence([
    version,
    derInteger(opts.serial),
    signatureAlgorithm,
    opts.issuer,
    validity,
    opts.subject,
    opts.subjectPublicKeyInfo
  ])
}

function createCertificate (opts) {
  const tbs = buildTbsCertificate(opts)
  const signer = crypto.createSign('sha256')
  signer.update(tbs)
  signer.end()
  const signature = signer.sign(opts.signingKey)
  const certDer = derSequence([tbs, signatureAlgorithm, derBitString(signature)])
  return { der: certDer, pem: toPem(certDer, 'CERTIFICATE') }
}

function writeKey (filePath, key) {
  fs.writeFileSync(filePath, key)
  console.log('Wrote key to', filePath)
}

function writeCert (filePath, cert) {
  fs.writeFileSync(filePath, cert)
  console.log('Wrote certificate to', filePath)
}

function generate () {
  const caKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 })
  const serverKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 })
  const clientKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 })
  const caSpki = caKeys.publicKey.export({ type: 'spki', format: 'der' })
  const serverSpki = serverKeys.publicKey.export({ type: 'spki', format: 'der' })
  const clientSpki = clientKeys.publicKey.export({ type: 'spki', format: 'der' })

  function serial () {
    const value = crypto.randomBytes(16)
    value[0] &= 0x7f
    return value
  }

  const now = new Date()
  const yearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  const issuerName = derName('Test CA')

  const caCert = createCertificate({
    serial: serial(),
    issuer: issuerName,
    subject: issuerName,
    subjectPublicKeyInfo: caSpki,
    signingKey: caKeys.privateKey,
    notBefore: new Date(now.getTime() - 60 * 1000),
    notAfter: yearLater
  })

  const serverCert = createCertificate({
    serial: serial(),
    issuer: issuerName,
    subject: derName('localhost'),
    subjectPublicKeyInfo: serverSpki,
    signingKey: caKeys.privateKey,
    notBefore: new Date(now.getTime() - 60 * 1000),
    notAfter: yearLater
  })

  const clientCert = createCertificate({
    serial: serial(),
    issuer: issuerName,
    subject: derName('client'),
    subjectPublicKeyInfo: clientSpki,
    signingKey: caKeys.privateKey,
    notBefore: new Date(now.getTime() - 60 * 1000),
    notAfter: yearLater
  })

  const sslDir = path.join(__dirname, '..', 'tests', 'ssl')
  const caDir = path.join(sslDir, 'ca')

  const caKeyPem = caKeys.privateKey.export({ type: 'pkcs1', format: 'pem' })
  writeKey(path.join(caDir, 'ca.key'), caKeyPem)
  writeCert(path.join(caDir, 'ca.crt'), caCert.pem)

  const serverKeyPem = serverKeys.privateKey.export({ type: 'pkcs1', format: 'pem' })
  writeKey(path.join(caDir, 'localhost.key'), serverKeyPem)
  writeCert(path.join(caDir, 'localhost.crt'), serverCert.pem)
  writeKey(path.join(caDir, 'server.key'), serverKeyPem)
  writeCert(path.join(caDir, 'server.crt'), serverCert.pem)

  const clientKeyPem = clientKeys.privateKey.export({ type: 'pkcs1', format: 'pem' })
  writeKey(path.join(caDir, 'client.key'), clientKeyPem)
  writeCert(path.join(caDir, 'client.crt'), clientCert.pem)
  const clientEncKeyPem = clientKeys.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: 'password'
  })
  writeKey(path.join(caDir, 'client-enc.key'), clientEncKeyPem)

  const generalDir = sslDir
  writeKey(path.join(generalDir, 'test.key'), serverKeyPem)
  writeCert(path.join(generalDir, 'test.crt'), serverCert.pem)
  writeCert(path.join(generalDir, 'npm-ca.crt'), caCert.pem)
}

generate()
