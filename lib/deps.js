'use strict'

const fs = require('fs')
const url = require('url')
const qs = require('qs')
const querystring = require('querystring')
const validate = require('har-validator')
const caseless = require('caseless')
const CombinedStream = require('combined-stream')
const isstream = require('isstream')
const tunnelAgent = require('tunnel-agent')
const oauthSign = require('oauth-sign')
const crypto = require('crypto')

function uuid () {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const rnds = crypto.randomBytes(16)
  rnds[6] = (rnds[6] & 0x0f) | 0x40
  rnds[8] = (rnds[8] & 0x3f) | 0x80
  const hex = rnds.toString('hex')
  return (
    hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20)
  )
}

module.exports = {
  fs,
  url,
  qs,
  querystring,
  validate,
  caseless,
  uuid,
  CombinedStream,
  isstream,
  tunnelAgent,
  oauthSign,
  crypto
}
