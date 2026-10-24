'use strict'
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

let assertions = 0
function check (value, message) { assert.ok(value, message); assertions++ }
function equal (actual, expected, message) { assert.strictEqual(actual, expected, message); assertions++ }
function done (id) { console.log(`CLOSURE ${id} PASS assertions=${assertions}`) }
function tempServerCopy (root) {
  const source = path.join(root, 'request_testserver')
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'request-legacy-closure-'))
  for (const name of ['server.js', 'package.json']) fs.copyFileSync(path.join(source, name), path.join(target, name))
  for (const name of ['dist', 'src']) if (fs.existsSync(path.join(source, name))) fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true })
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'junction')
  return target
}
function startServer (cwd, env) {
  const child = spawn(process.execPath, ['server.js'], { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  let stderr = ''; child.stderr.on('data', c => { stderr += c })
  return { child, stderr: () => stderr }
}
async function waitFor (url, headers) {
  const until = Date.now() + 15000
  while (Date.now() < until) { try { const r = await fetch(url, { headers }); if (r.status < 500) return } catch (error) { void error } await new Promise(r => setTimeout(r, 100)) }
  throw new Error('server readiness timeout')
}
async function stop (child) { child.kill(); await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 2000))]) }
module.exports = { check, equal, done, tempServerCopy, startServer, waitFor, stop, fs, path }
