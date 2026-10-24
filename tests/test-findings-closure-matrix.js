'use strict'
const fs = require('fs')
const path = require('path')
const tape = require('./helpers').tape

tape('security: closure matrix has exactly fourteen complete unique findings', function (t) {
  const matrix = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'SECURITY_FINDINGS_CLOSURE_MATRIX.json'), 'utf8'))
  t.equal(matrix.findings.length, 14, 'exactly fourteen findings')
  const ids = matrix.findings.map(function (finding) { return finding.finding_id })
  t.equal(new Set(ids).size, 14, 'finding IDs are unique')
  matrix.findings.forEach(function (finding) {
    ;['finding_id', 'original_finding_id', 'cwe', 'affected_files', 'fix_files', 'fix_commit', 'regression_test', 'platform', 'test_status', 'log', 'evidence', 'residual_risk', 'closure_status'].forEach(function (key) {
      t.ok(finding[key], finding.finding_id + ' has ' + key)
    })
    t.ok(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'NOT_TESTED'].indexOf(finding.test_status) !== -1, finding.finding_id + ' has valid test status')
    t.ok(['VERIFIED_FIXED', 'PARTIALLY_VERIFIED', 'OPEN', 'INCONCLUSIVE'].indexOf(finding.closure_status) !== -1, finding.finding_id + ' has valid closure status')
    if (finding.closure_status === 'VERIFIED_FIXED') {
      t.equal(finding.test_status, 'PASS', finding.finding_id + ' verified closure requires PASS')
      t.equal(finding.exit_code, 0, finding.finding_id + ' verified closure requires exit code 0')
      t.equal(finding.assertions_verified, true, finding.finding_id + ' verified closure requires assertions')
    }
    if (['BLOCKED', 'SKIPPED', 'NOT_TESTED'].indexOf(finding.test_status) !== -1) {
      t.notEqual(finding.closure_status, 'VERIFIED_FIXED', finding.finding_id + ' incomplete execution cannot be verified')
    }
  })
  t.end()
})
