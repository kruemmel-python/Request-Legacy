'use strict'
const Request = require('../../request')
const { check, done } = require('./helpers')
const secrets = ['BASIC_SYNTHETIC_SECRET','BEARER_SYNTHETIC_SECRET','COOKIE_SYNTHETIC_SECRET','AWS_SYNTHETIC_SECRET','URL_SYNTHETIC_SECRET','QUERY_SYNTHETIC_SECRET','NESTED_SYNTHETIC_SECRET']
const old = console.error; const output = []; console.error = (...args) => output.push(require('util').format(...args)); Request.debug = true
try {
  const circular = { password: secrets[6] }; circular.self = circular
  Request.prototype.debug('https://user:URL_SYNTHETIC_SECRET@example.test/path?token=QUERY_SYNTHETIC_SECRET', {
    authorization: `Basic ${secrets[0]}`, bearerToken: secrets[1], cookie: secrets[2], aws: { secretAccessKey: secrets[3] }, nested: circular
  })
} finally { Request.debug = false; console.error = old }
const text = output.join('\n'); for (const secret of secrets) check(!text.includes(secret), `secret redacted: ${secret}`)
check(text.includes('[REDACTED]'), 'redaction marker emitted'); check(text.includes('[Circular]'), 'circular object handled'); done('SEC-08')
