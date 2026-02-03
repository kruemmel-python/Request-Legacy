const request = require('request')
const BASE_URL = 'https://httpbin.org'

const scenarios = [
  {
    id: '308-PERM',
    name: '308 Permanent Redirect (POST Integrity)',
    opts: {
      url: `${BASE_URL}/status/308`,
      method: 'POST',
      json: { data: 'permanent-vision-1.1' },
      followAllRedirects: true
    },
    check: (res) => `Status: ${res.statusCode} | POST erhalten: ${res.request.method === 'POST'}`
  },
  {
    id: 'SEC-AUDIT',
    name: 'Cross-Host Security (Header-Strip Audit)',
    opts: {
      url: `${BASE_URL}/redirect-to?url=https://www.google.com`,
      headers: {
        Authorization: 'Bearer secret-v1.1',
        Cookie: 'session=123',
        'Proxy-Authorization': 'Basic auth'
      },
      followRedirect: true
    },
    check: (res) => {
      const h = res.request.headers
      const authLeaked = h.authorization || h.Authorization
      const cookieLeaked = h.cookie || h.Cookie
      const proxyLeaked = h['proxy-authorization']
      return `Ziel: ${res.request.uri.host} | Stripped: Auth=${!authLeaked}, Cookie=${!cookieLeaked}, Proxy=${!proxyLeaked}`
    }
  },
  {
    id: 'LOOP-LIM',
    name: 'Redirect Loop Resilience',
    opts: {
      url: `${BASE_URL}/redirect/20`,
      maxRedirects: 7,
      followRedirect: true
    },
    check: (err, res) => {
      const hops = res ? res.request._redirect.redirectsFollowed : 'Error'
      const limit = 7
      const active = (hops === limit || (err && err.message.includes('redirects')))
      return `Limit: ${limit} | Tatsächliche Hops: ${hops} | Schutz: ${active ? 'REBEL-PROOFS' : 'FAIL'}`
    }
  }
]

async function runFinalAudit () {
  console.log('=== SUBQG MATRIX v1.1 ULTIMATE AUDIT LOG ===\n')
  for (const s of scenarios) {
    console.log(`[START] ${s.name}`)
    await new Promise(resolve => {
      request(s.opts, (err, res) => {
        const result = s.check(err, res)
        console.log(`[${s.id}] ${result}\n`)
        resolve()
      })
    })
  }
  console.log('=== FINAL AUDIT COMPLETE - ARCHITECTURE SEALED ===')
}

runFinalAudit()
