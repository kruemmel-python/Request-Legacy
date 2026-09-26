'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = require(path.join(root, 'package.json'))

const failures = []

function parseVersion (version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    return null
  }
  return match.slice(1).map(Number)
}

function gte (actual, minimum) {
  const a = parseVersion(actual)
  const b = parseVersion(minimum)
  if (!a || !b) {
    return false
  }

  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return true
}

function installedVersion (name) {
  try {
    return require(path.join(root, 'node_modules', name, 'package.json')).version
  } catch (error) {
    failures.push(`${name}: not installed (${error.code || error.message})`)
    return null
  }
}

function requireMinimum (name, minimum) {
  const actual = installedVersion(name)
  if (actual && !gte(actual, minimum)) {
    failures.push(`${name}: ${actual} is below required ${minimum}`)
  }
}

if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, 'har-validator')) {
  failures.push('har-validator must not be a production dependency')
}

requireMinimum('form-data', '4.0.6')
requireMinimum('qs', '6.16.0')
requireMinimum('tough-cookie', '6.0.2')
requireMinimum('mime-types', '3.0.2')
requireMinimum('http-signature', '1.4.0')
requireMinimum('aws4', '1.13.2')

;['har-validator', 'forever-agent', 'isstream', 'json-stringify-safe', 'performance-now', 'safe-buffer', 'extend', 'tunnel-agent'].forEach(function (name) {
  if (pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, name)) {
    failures.push(`${name}: obsolete production dependency must be removed`)
  }
})

const depsSource = fs.readFileSync(path.join(root, 'lib', 'deps.js'), 'utf8')
if (/require\(['"]har-validator['"]\)/.test(depsSource)) {
  failures.push('lib/deps.js still imports deprecated har-validator')
}
if (/require\(['"]tunnel-agent['"]\)/.test(depsSource)) {
  failures.push('lib/deps.js still imports unmaintained tunnel-agent')
}


const runtimeFiles = [
  'index.js',
  'request.js',
  ...fs.readdirSync(path.join(root, 'lib')).filter(function (name) { return name.endsWith('.js') }).map(function (name) { return path.join('lib', name) })
]
const forbiddenPatterns = [
  { re: /process\.env\.NODE_NO_WARNINGS\s*=/, name: 'warning suppression' },
  { re: /\beval\s*\(/, name: 'eval()' },
  { re: /\bnew\s+Function\s*\(/, name: 'new Function()' }
]
runtimeFiles.forEach(function (relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  forbiddenPatterns.forEach(function (item) {
    if (item.re.test(source)) failures.push(`${relative}: forbidden ${item.name}`)
  })
})

if (pkg.scripts && /--no-deprecation|NODE_NO_WARNINGS/.test(JSON.stringify(pkg.scripts))) {
  failures.push('package scripts must not suppress runtime/deprecation warnings')
}

const testServerPath = path.join(root, 'request_testserver', 'server.js')
if (fs.existsSync(testServerPath)) {
  const testServerSource = fs.readFileSync(testServerPath, 'utf8')
  if (/shell\s*:\s*true/.test(testServerSource)) {
    failures.push('request_testserver: shell process execution is forbidden')
  }
  if (/\bfrom\s+['"]cors['"]|app\.use\(\s*cors\s*\(/.test(testServerSource)) {
    failures.push('request_testserver: unrestricted CORS middleware is forbidden')
  }
  if (!/spawn\(process\.execPath,\s*buildRunnerArgs/.test(testServerSource)) {
    failures.push('request_testserver: tests must run directly through process.execPath')
  }
  if (!/app\.listen\(port, host,/.test(testServerSource)) {
    failures.push('request_testserver: listen host must be explicit')
  }
  if (!/loopbackHosts\.has\(req\.hostname\)/.test(testServerSource) || !/sec-fetch-site/.test(testServerSource)) {
    failures.push('request_testserver: reject non-loopback Host headers and cross-site browser requests')
  }
  if (!/TESTSERVER_API_TOKEN is required/.test(testServerSource)) {
    failures.push('request_testserver: non-loopback binding must require an API token')
  }
}

const testResolverSource = fs.readFileSync(path.join(root, 'scripts', 'resolve-test-files.js'), 'utf8')
if (!/fs\.realpathSync/.test(testResolverSource) || !/TEST_FILE_PATTERN/.test(testResolverSource)) {
  failures.push('test runner: canonical tests/test-*.js boundary is missing')
}

if (failures.length) {
  console.error('Security check FAILED')
  failures.forEach(function (failure) {
    console.error(`- ${failure}`)
  })
  process.exitCode = 1
} else {
  console.log('Security check PASSED')
  console.log('- har-validator: removed')
  console.log('- form-data: >= 4.0.6')
  console.log('- qs: >= 6.16.0')
  console.log('- tough-cookie: >= 6.0.2')
  console.log('- mime-types: >= 3.0.2')
  console.log('- http-signature: >= 1.4.0')
  console.log('- obsolete compatibility-only runtime dependencies: removed where Node 18+ makes them unnecessary')
  console.log('- HTTP CONNECT tunneling: internal implementation, no tunnel-agent/safe-buffer dependency')
  console.log('- test runner: canonical tests/test-*.js boundary enforced')
  console.log('- test server: shell-free process launch, loopback default and guarded LAN binding')
  console.log('- warning suppression: forbidden')
}
