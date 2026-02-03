'use strict'

const fs = require('fs')
const url = require('url')
const qs = require('qs')
const querystring = require('querystring')
const validate = require('har-validator')
const caseless = require('caseless')
const uuid = require('uuid/v4')
const CombinedStream = require('combined-stream')
const isstream = require('isstream')
const tunnelAgent = require('tunnel-agent')
const oauthSign = require('oauth-sign')
const crypto = require('crypto')

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
