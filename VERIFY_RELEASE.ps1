$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host '============================================================'
Write-Host ' Request-Legacy 3.0.5 - Clean Security Verification'
Write-Host '============================================================'

$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "[INFO] Node: $nodeVersion"
Write-Host "[INFO] npm : $npmVersion"

Write-Host '[1/8] Clean dependency install ...'
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

Write-Host '[2/8] Dependency tree check ...'
npm ls request-legacy form-data qs tough-cookie mime-types http-signature aws4 har-validator forever-agent safe-buffer performance-now json-stringify-safe isstream extend
if ($LASTEXITCODE -gt 1) { throw 'npm ls failed' }

Write-Host '[3/8] Lint ...'
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'lint failed' }

Write-Host '[4/8] Full test suite ...'
npm run test-ci
if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

Write-Host '[5/8] Internal security checks ...'
npm run security-check
if ($LASTEXITCODE -ne 0) { throw 'security-check failed' }

Write-Host '[6/8] npm production audit ...'
npm run audit:prod
if ($LASTEXITCODE -ne 0) { throw 'production audit failed' }

Write-Host '[7/8] Optional test server: clean install, build, security tests and audit ...'
npm --prefix request_testserver ci
if ($LASTEXITCODE -ne 0) { throw 'test server npm ci failed' }
npm --prefix request_testserver run build
if ($LASTEXITCODE -ne 0) { throw 'test server build failed' }
npm --prefix request_testserver run test:security
if ($LASTEXITCODE -ne 0) { throw 'test server security tests failed' }
npm --prefix request_testserver audit --audit-level=moderate
if ($LASTEXITCODE -ne 0) { throw 'test server audit failed' }

Write-Host '[8/8] Pack dry-run ...'
npm pack --dry-run
if ($LASTEXITCODE -ne 0) { throw 'npm pack --dry-run failed' }

Write-Host '============================================================'
Write-Host ' VERIFIED: lint/tests/security-check/audit/pack all passed'
Write-Host '============================================================'
