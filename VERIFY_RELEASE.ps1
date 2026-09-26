$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host '============================================================'
Write-Host ' Request-Legacy 3.0.5 - Clean Security Verification'
Write-Host '============================================================'

$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "[INFO] Node: $nodeVersion"
Write-Host "[INFO] npm : $npmVersion"

if (Test-Path node_modules) {
    Write-Host '[INFO] Removing node_modules ...'
    Remove-Item -Recurse -Force node_modules
}
if (Test-Path package-lock.json) {
    Write-Host '[INFO] Removing old package-lock.json ...'
    Remove-Item -Force package-lock.json
}

Write-Host '[1/7] Clean dependency install ...'
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

Write-Host '[2/7] Dependency tree check ...'
npm ls request-legacy form-data qs tough-cookie mime-types http-signature aws4 har-validator forever-agent safe-buffer performance-now json-stringify-safe isstream extend
if ($LASTEXITCODE -gt 1) { throw 'npm ls failed' }

Write-Host '[3/7] Lint ...'
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'lint failed' }

Write-Host '[4/7] Full test suite ...'
npm run test-ci
if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

Write-Host '[5/7] Internal security checks ...'
npm run security-check
if ($LASTEXITCODE -ne 0) { throw 'security-check failed' }

Write-Host '[6/7] npm production audit ...'
npm run audit:prod
if ($LASTEXITCODE -ne 0) { throw 'production audit failed' }

Write-Host '[7/7] Pack dry-run ...'
npm pack --dry-run
if ($LASTEXITCODE -ne 0) { throw 'npm pack --dry-run failed' }

Write-Host '============================================================'
Write-Host ' VERIFIED: lint/tests/security-check/audit/pack all passed'
Write-Host '============================================================'
