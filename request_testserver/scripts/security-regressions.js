import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8')
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')

function assert (condition, message) {
  if (!condition) throw new Error(message)
}

function staticChecks () {
  assert(!serverSource.includes('req.query.token'), 'Server must not accept API tokens from query parameters')
  assert(!appSource.includes('EventSource('), 'UI must not use native EventSource for authenticated streams')
  assert(!appSource.includes("searchParams.set('token'"), 'UI must not place API tokens in URLs')
  assert(!appSource.includes('localStorage'), 'UI must not persist API tokens in localStorage')
  assert(!appSource.includes('sessionStorage'), 'UI must not persist API tokens in sessionStorage')
  assert(serverSource.includes("req.get('x-api-token')"), 'X-API-Token header support is required')
  assert(serverSource.includes('Bearer\\s+'), 'Authorization Bearer support is required')
}

async function waitForServer (url, token, child) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Testserver exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(url, { headers: { 'x-api-token': token } })
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Timed out waiting for testserver')
}

async function dynamicChecks () {
  const token = `regression-${process.pid}-${Date.now()}`
  const port = 39123 + (process.pid % 1000)
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      TESTSERVER_API_TOKEN: token
    }
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })

  try {
    await waitForServer(`${base}/api/meta`, token, child)

    const queryOnly = await fetch(`${base}/api/meta?token=${encodeURIComponent(token)}`)
    assert(queryOnly.status === 401, `Query token must be rejected with 401, got ${queryOnly.status}`)

    const header = await fetch(`${base}/api/meta`, {
      headers: { 'x-api-token': token }
    })
    assert(header.status === 200, `X-API-Token must be accepted, got ${header.status}`)

    const bearer = await fetch(`${base}/api/meta`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    assert(bearer.status === 200, `Bearer token must be accepted, got ${bearer.status}`)
  } finally {
    child.kill()
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ])
  }

  if (stderr.trim()) process.stderr.write(stderr)
}

try {
  staticChecks()
  await dynamicChecks()
  console.log('Testserver security regressions PASSED')
  console.log('- query-string API tokens: rejected')
  console.log('- X-API-Token: accepted')
  console.log('- Authorization Bearer: accepted')
  console.log('- native EventSource token workaround: absent')
  console.log('- browser token persistence: absent')
} catch (error) {
  console.error(`Testserver security regressions FAILED: ${error.message}`)
  process.exitCode = 1
}
