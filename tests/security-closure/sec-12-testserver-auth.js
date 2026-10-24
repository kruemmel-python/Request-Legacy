'use strict'
const path = require('path'); const root = path.resolve(__dirname, '../..')
const { check, equal, done, tempServerCopy, startServer, waitFor, stop, fs } = require('./helpers')
;(async () => {
  const cwd = tempServerCopy(root); const token = `synthetic-${process.pid}`; const port = 41000 + process.pid % 1000; const base = `http://127.0.0.1:${port}`
  const proc = startServer(cwd, { HOST:'127.0.0.1', PORT:String(port), TESTSERVER_API_TOKEN:token })
  try {
    await waitFor(`${base}/api/meta`, { 'x-api-token':token })
    const attempts = [
      {}, { headers:{ Origin:'https://attacker.invalid' } }, { headers:{ 'x-api-token':'wrong' } },
      { headers:{ 'x-requested-with':'XMLHttpRequest' } }, { method:'OPTIONS', headers:{ Origin:'https://attacker.invalid','access-control-request-method':'POST' } }
    ]
    for (const init of attempts) { const r = await fetch(`${base}/api/test-ci`, { method:init.method || 'POST', headers:{ 'content-type':'application/json', ...(init.headers||{}) }, body:(init.method==='OPTIONS'?undefined:'{}') }); check(r.status === 401 || r.status === 403 || r.status === 404, `unauthorized request denied: ${r.status}`) }
    equal(fs.existsSync(path.join(cwd,'reports')) ? fs.readdirSync(path.join(cwd,'reports')).length : 0, 0, 'unauthorized attempts created no report')
    const valid = await fetch(`${base}/api/meta`, { headers:{ Authorization:`Bearer ${token}` } }); equal(valid.status, 200, 'valid bearer token accepted')
    done('SEC-12')
  } finally { await stop(proc.child); fs.rmSync(cwd,{recursive:true,force:true,maxRetries:5,retryDelay:100}) }
})().catch(e => { console.error(e.stack); process.exitCode=1 })
