'use strict'

var fs = require('fs')
var url = require('url')
var qs = require('qs')
var querystring = require('querystring')
var validate = require('har-validator')
var caseless = require('caseless')
var uuid = require('uuid/v4')
var CombinedStream = require('combined-stream')
var isstream = require('isstream')
var tunnelAgent = require('tunnel-agent')
var oauthSign = require('oauth-sign')
var crypto = require('crypto')

module.exports = {
  fs: fs,
  url: url,
  qs: qs,
  querystring: querystring,
  validate: validate,
  caseless: caseless,
  uuid: uuid,
  CombinedStream: CombinedStream,
  isstream: isstream,
  tunnelAgent: tunnelAgent,
  oauthSign: oauthSign,
  crypto: crypto
}
