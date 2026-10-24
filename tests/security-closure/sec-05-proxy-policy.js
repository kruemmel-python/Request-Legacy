'use strict'
const http = require('http')
const request = require('../../index')
const { equal, done } = require('./helpers')
function listen (handler) { return new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)) }) }
function close (s) { return new Promise(r => s.close(r)) }
function get (opts) { return new Promise((resolve, reject) => request(opts, (e, res, body) => e ? reject(e) : resolve(body))) }
;(async () => {
  const names = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'REQUEST_METHOD']
  const saved = {}; for (const name of names) saved[name] = process.env[name]
  let proxyHits = 0; let directHits = 0
  const destination = await listen((req, res) => { directHits++; res.end('direct') })
  const redirect = await listen((req, res) => {
    res.writeHead(302, { location: `http://localhost:${destination.address().port}/final` })
    res.end()
  })
  const proxy = await listen((req, res) => {
    proxyHits++
    const target = new URL(req.url)
    if (target.pathname === '/proxy-start') {
      res.writeHead(302, { location: `http://127.0.0.1:${destination.address().port}/direct-final` })
      res.end()
      return
    }
    if (target.pathname === '/explicit-start') {
      res.writeHead(302, { location: `http://localhost:${destination.address().port}/explicit-final` })
      res.end()
      return
    }
    res.end('proxy')
  })
  try {
    for (const name of names) delete process.env[name]
    process.env.http_proxy = `http://127.0.0.1:${proxy.address().port}`
    process.env.NO_PROXY = '127.0.0.1'

    let body = await get({ uri: `http://127.0.0.1:${redirect.address().port}/start` })
    equal(body, 'proxy', 'redirect target policy switches from direct to proxy')
    equal(proxyHits, 1, 'proxy-eligible redirected request reached proxy')
    equal(directHits, 0, 'proxy-eligible target was not reached directly')

    proxyHits = 0; directHits = 0
    body = await get({ uri: `http://localhost:${destination.address().port}/proxy-start` })
    equal(body, 'direct', 'redirect target policy switches from proxy to direct')
    equal(proxyHits, 1, 'only the proxy-eligible first hop reached proxy')
    equal(directHits, 1, 'NO_PROXY redirected target was reached directly')

    proxyHits = 0; directHits = 0
    body = await get({ uri: `http://127.0.0.1:${redirect.address().port}/explicit-start`, proxy: `http://127.0.0.1:${proxy.address().port}` })
    equal(body, 'proxy', 'explicit proxy remains authoritative across redirect')
    equal(proxyHits, 2, 'explicit proxy handled both redirect hops')
    equal(directHits, 0, 'explicit proxy prevented direct destination access')
    done('SEC-05')
  } finally {
    for (const name of names) delete process.env[name]
    for (const name of names) if (saved[name] !== undefined) process.env[name] = saved[name]
    await close(redirect); await close(proxy); await close(destination)
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1 })
