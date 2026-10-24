'use strict'
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const request = require('../../index')
const { check, equal, done } = require('./helpers')
function listen (handler) { return new Promise(r => { const s = http.createServer(handler); s.listen(0, () => r(s)) }) }
function listenTls (handler) { const opts={key:fs.readFileSync(path.join(__dirname,'..','ssl','server.key')),cert:fs.readFileSync(path.join(__dirname,'..','ssl','server.crt'))}; return new Promise(r=>{const s=https.createServer(opts,handler);s.listen(0,()=>r(s))}) }
function close (s) { return new Promise(r => s.close(r)) }
function get (uri) { return new Promise((resolve, reject) => request({ uri, strictSSL:false }, (e, res, body) => e ? reject(e) : resolve({ res, body }))) }
;(async () => {
  let seenSame; let seenCross; let seenCrossHost
  const target = await listen((req, res) => {
    if (req.url === '/host-target') seenCrossHost = req.headers.referer
    else seenCross = req.headers.referer
    res.end('cross')
  })
  const source = await listen((req, res) => {
    if (req.url.startsWith('/same-target')) { seenSame = req.headers.referer; res.end('same'); return }
    const location = req.url.startsWith('/same')
      ? `http://127.0.0.1:${source.address().port}/same-target`
      : req.url.startsWith('/host')
        ? `http://localhost:${target.address().port}/host-target`
        : `http://127.0.0.1:${target.address().port}/target`
    res.writeHead(302, { location }); res.end()
  })
  let seenHttpToHttps; let seenHttpsToHttp
  const tlsTarget=await listenTls((req,res)=>{seenHttpToHttps=req.headers.referer;res.end('tls')})
  const downgradeTarget=await listen((req,res)=>{seenHttpsToHttp=req.headers.referer;res.end('down')})
  const tlsSource=await listenTls((req,res)=>{res.writeHead(302,{location:`http://127.0.0.1:${downgradeTarget.address().port}/down`});res.end()})
  try {
    await get(`http://127.0.0.1:${source.address().port}/same?token=SYNTHETIC_QUERY_SECRET#SYNTHETIC_FRAGMENT`)
    check(seenSame.includes('token=SYNTHETIC_QUERY_SECRET'), 'same-origin query retained')
    check(!seenSame.includes('SYNTHETIC_FRAGMENT'), 'fragment never sent')
    await get(`http://127.0.0.1:${source.address().port}/cross?token=SYNTHETIC_QUERY_SECRET#SYNTHETIC_FRAGMENT`)
    equal(seenCross, `http://127.0.0.1:${source.address().port}/`, 'cross-port referer reduced to origin')
    check(!seenCross.includes('SYNTHETIC_QUERY_SECRET') && !seenCross.includes('SYNTHETIC_FRAGMENT'), 'cross-origin secrets absent')
    await get(`http://127.0.0.1:${source.address().port}/host?token=SYNTHETIC_QUERY_SECRET#SYNTHETIC_FRAGMENT`)
    equal(seenCrossHost, `http://127.0.0.1:${source.address().port}/`, 'different-host referer reduced to source origin')
    check(!seenCrossHost.includes('SYNTHETIC_QUERY_SECRET') && !seenCrossHost.includes('SYNTHETIC_FRAGMENT'), 'different-host secrets absent')
    await new Promise((resolve,reject)=>request({uri:`http://127.0.0.1:${source.address().port}/scheme?secret=SYNTHETIC_QUERY_SECRET`,followRedirect:false},(e)=>e?reject(e):resolve()))
    const schemeSource=await listen((req,res)=>{res.writeHead(302,{location:`https://127.0.0.1:${tlsTarget.address().port}/secure`});res.end()})
    await get(`http://127.0.0.1:${schemeSource.address().port}/up?token=SYNTHETIC_QUERY_SECRET#SYNTHETIC_FRAGMENT`)
    equal(seenHttpToHttps,`http://127.0.0.1:${schemeSource.address().port}/`,'HTTP to HTTPS sends origin-only referer')
    await get(`https://127.0.0.1:${tlsSource.address().port}/down?token=SYNTHETIC_QUERY_SECRET#SYNTHETIC_FRAGMENT`)
    equal(seenHttpsToHttp,undefined,'HTTPS to HTTP suppresses referer')
    await close(schemeSource)
    done('SEC-04')
  } finally { await close(source); await close(target); await close(tlsTarget); await close(tlsSource); await close(downgradeTarget) }
})().catch(e => { console.error(e.stack); process.exitCode = 1 })
