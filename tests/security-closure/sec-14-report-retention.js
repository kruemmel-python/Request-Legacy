'use strict'
const path = require('path'); const root = path.resolve(__dirname, '../..')
const { check, equal, done, tempServerCopy, startServer, waitFor, stop, fs } = require('./helpers')
;(async () => {
  const cwd=tempServerCopy(root); const reports=path.join(cwd,'reports'); fs.mkdirSync(reports); const token=`synthetic-${process.pid}`; const port=42000+process.pid%1000; const base=`http://127.0.0.1:${port}`
  const old='expired.html', fresh='fresh.html'; fs.writeFileSync(path.join(reports,old),'<pre>old</pre>'); fs.writeFileSync(path.join(reports,fresh),'<pre>fresh</pre>'); const past=new Date(Date.now()-3*86400000); fs.utimesSync(path.join(reports,old),past,past)
  let proc=startServer(cwd,{HOST:'127.0.0.1',PORT:String(port),TESTSERVER_API_TOKEN:token,REPORT_MAX_DAYS:'1'})
  try {
    await waitFor(`${base}/api/meta`,{'x-api-token':token}); check(!fs.existsSync(path.join(reports,old)),'expired report removed at startup'); check(fs.existsSync(path.join(reports,fresh)),'fresh report retained')
    const expiredFetch=await fetch(`${base}/api/report/download/${old}`,{headers:{'x-api-token':token}}); equal(expiredFetch.status,404,'expired report cannot be downloaded')
    fs.utimesSync(path.join(reports,fresh),past,past); const concurrent=await Promise.all([fetch(`${base}/api/report/download/${fresh}`,{headers:{'x-api-token':token}}),fetch(`${base}/api/report/list`,{headers:{'x-api-token':token}})]); equal(concurrent[0].status,404,'report expiring during runtime denied under concurrent read'); check(!fs.existsSync(path.join(reports,fresh)),'runtime expiry cleanup completed')
    await stop(proc.child); proc=startServer(cwd,{HOST:'127.0.0.1',PORT:String(port),TESTSERVER_API_TOKEN:token,REPORT_MAX_DAYS:'1'}); await waitFor(`${base}/api/meta`,{'x-api-token':token}); const list=await fetch(`${base}/api/report/list`,{headers:{'x-api-token':token}}).then(r=>r.json()); equal(list.reports.length,0,'restart exposes no expired reports'); done('SEC-14')
  } finally { await stop(proc.child); fs.rmSync(cwd,{recursive:true,force:true,maxRetries:5,retryDelay:100}) }
})().catch(e=>{console.error(e.stack);process.exitCode=1})
