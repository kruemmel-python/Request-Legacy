import cors from 'cors'
import express from 'express'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import request from 'request-legacy'
import { createRequire } from 'module'
import archiver from 'archiver'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const PDFDocument = require('pdfkit')

const app = express()
const port = process.env.PORT || 3001
const distPath = path.join(__dirname, 'dist')
const reportsDir = path.join(__dirname, 'reports')

const requestPkgPath = path.dirname(
  require.resolve('request-legacy/package.json')
)
let requestPkg = { name: 'request-legacy', version: 'unknown' }
try {
  requestPkg = require('request-legacy/package.json')
} catch {}

const MAX_REPORTS = Number(process.env.REPORT_MAX || 50)
const MAX_REPORT_DAYS = Number(process.env.REPORT_MAX_DAYS || 30)
const DEFAULT_INTERVAL_MINUTES = Number(process.env.SCHEDULE_INTERVAL_MINUTES || 60)

let lastReport = null
let isRunning = false
let schedule = {
  enabled: false,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  tests: []
}
let scheduleTimer = null
let nextRunAt = null

function ensureReportsDir () {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }
}

function pad (value) {
  return String(value).padStart(2, '0')
}

function timestamp (date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

function escapeHtml (input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function unescapeHtml (input) {
  return String(input)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseTestsInput (input) {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(input)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildCommand (tests) {
  if (!tests || tests.length === 0) return 'npm run test-ci'
  return `npm run test-ci -- ${tests.join(' ')}`
}

function buildNpmArgs (tests) {
  if (!tests || tests.length === 0) return ['run', 'test-ci']
  return ['run', 'test-ci', '--', ...tests]
}

function buildReportHtml (report) {
  const durationMs = report.finishedAt ? (report.finishedAt - report.startedAt) : null
  const duration = durationMs === null ? '--' : `${Math.round(durationMs / 1000)}s`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Request-Legacy Test-CI Report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; padding: 32px; background: #0c1018; color: #e9eef8; }
    .card { background: #141a26; border: 1px solid #263044; border-radius: 18px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
    h1 { margin-top: 0; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 20px 0; }
    .label { color: #8d98ad; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em; }
    .value { font-size: 0.95rem; word-break: break-all; }
    pre { background: #0a0e17; color: #9ef7c4; padding: 20px; border-radius: 12px; overflow: auto; max-height: 70vh; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Request-Legacy Test-CI Report</h1>
    <div class="meta">
      <div><div class="label">Command</div><div class="value">${escapeHtml(report.command)}</div></div>
      <div><div class="label">Target</div><div class="value">${escapeHtml(report.cwd)}</div></div>
      <div><div class="label">Started</div><div class="value">${escapeHtml(report.startedAt.toISOString())}</div></div>
      <div><div class="label">Finished</div><div class="value">${report.finishedAt ? escapeHtml(report.finishedAt.toISOString()) : '--'}</div></div>
      <div><div class="label">Exit Code</div><div class="value">${report.exitCode === null ? '--' : report.exitCode}</div></div>
      <div><div class="label">Duration</div><div class="value">${duration}</div></div>
    </div>
    <pre>${escapeHtml(report.output)}</pre>
  </div>
</body>
</html>`
}

function listReportFiles () {
  ensureReportsDir()
  return fs.readdirSync(reportsDir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => {
      const fullPath = path.join(reportsDir, name)
      const stat = fs.statSync(fullPath)
      return {
        filename: name,
        fullPath,
        createdAt: stat.mtimeMs
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

function listReports (limit = 20) {
  const entries = listReportFiles()
  return entries.slice(0, limit).map((entry) => ({
    filename: entry.filename,
    url: `/reports/${entry.filename}`,
    downloadUrl: `/api/report/download/${entry.filename}`,
    zipUrl: `/api/report/zip/${entry.filename}`,
    pdfUrl: `/api/report/pdf/${entry.filename}`,
    csvUrl: `/api/report/csv/${entry.filename}`,
    createdAt: entry.createdAt
  }))
}

function removeReportFiles (entry) {
  try {
    fs.unlinkSync(entry.fullPath)
  } catch {}

  const jsonPath = entry.fullPath.replace(/\.html$/, '.json')
  if (fs.existsSync(jsonPath)) {
    try {
      fs.unlinkSync(jsonPath)
    } catch {}
  }
}

function cleanupReports (maxReports, maxDays) {
  const entries = listReportFiles()
  if (entries.length === 0) return

  const now = Date.now()
  const maxAgeMs = maxDays && maxDays > 0 ? maxDays * 24 * 60 * 60 * 1000 : null
  const remaining = []

  entries.forEach((entry) => {
    const isExpired = maxAgeMs && (now - entry.createdAt > maxAgeMs)
    if (isExpired) {
      removeReportFiles(entry)
    } else {
      remaining.push(entry)
    }
  })

  if (maxReports && remaining.length > maxReports) {
    remaining.slice(maxReports).forEach((entry) => removeReportFiles(entry))
  }
}

function getLatestReportFromDisk () {
  const list = listReports(1)
  if (list.length === 0) return null
  const latest = list[0]
  return {
    filename: latest.filename,
    path: path.join(reportsDir, latest.filename),
    jsonPath: path.join(reportsDir, latest.filename.replace(/\.html$/, '.json')),
    url: latest.url,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    output: '',
    command: 'npm run test-ci',
    cwd: requestPkgPath,
    tests: []
  }
}

function resolveReportPath (filename) {
  if (!filename || filename !== path.basename(filename) || !filename.endsWith('.html')) {
    return null
  }
  const fullPath = path.join(reportsDir, filename)
  if (!fs.existsSync(fullPath)) {
    return null
  }
  return fullPath
}

function extractOutputFromHtml (html) {
  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
  if (!match) return ''
  return unescapeHtml(match[1])
}

function loadReportData (filename) {
  const htmlPath = resolveReportPath(filename)
  if (!htmlPath) return null
  const jsonPath = htmlPath.replace(/\.html$/, '.json')

  if (fs.existsSync(jsonPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      return {
        ...json,
        output: json.output || '',
        startedAt: json.startedAt ? new Date(json.startedAt) : null,
        finishedAt: json.finishedAt ? new Date(json.finishedAt) : null
      }
    } catch {
      // fall through to html parsing
    }
  }

  const html = fs.readFileSync(htmlPath, 'utf8')
  return {
    filename,
    command: 'npm run test-ci',
    cwd: requestPkgPath,
    output: extractOutputFromHtml(html),
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    tests: []
  }
}

function streamZip (res, filename, fullPath) {
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.html$/, '')}.zip"`)

  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.on('error', (err) => {
    console.error('Archive error', err)
    if (!res.headersSent) {
      res.status(500)
    }
    res.end()
  })

  archive.pipe(res)
  archive.file(fullPath, { name: filename })
  archive.finalize()
}

function csvEscape (value) {
  const text = value === null || typeof value === 'undefined' ? '' : String(value)
  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return text
}

function buildCsvContent (data, filename) {
  const durationMs = data.startedAt && data.finishedAt
    ? (data.finishedAt - data.startedAt)
    : null
  const durationSeconds = durationMs === null ? '' : Math.round(durationMs / 1000)
  const tests = Array.isArray(data.tests) && data.tests.length ? data.tests.join(' ') : ''

  const headers = [
    'filename',
    'command',
    'cwd',
    'tests',
    'startedAt',
    'finishedAt',
    'durationSeconds',
    'exitCode'
  ]

  const row = [
    filename || data.filename || '',
    data.command || 'npm run test-ci',
    data.cwd || '',
    tests,
    data.startedAt ? data.startedAt.toISOString() : '',
    data.finishedAt ? data.finishedAt.toISOString() : '',
    durationSeconds,
    data.exitCode ?? ''
  ]

  return headers.join(',') + '\n' + row.map(csvEscape).join(',') + '\n'
}

function streamCsv (res, data, filename) {
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.html$/, '')}.csv"`)
  res.send(buildCsvContent(data, filename))
}

function streamPdf (res, reportData, filename) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.html$/, '')}.pdf"`)

  const doc = new PDFDocument({ margin: 48 })
  doc.pipe(res)

  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0c1018')
  doc.fillColor('#e9eef8')
  doc.fontSize(20).text('Request-Legacy Test-CI Report', {
    align: 'left'
  })
  doc.moveDown(1.2)

  doc.fontSize(9).fillColor('#8d98ad')
  doc.text('Command')
  doc.fontSize(10).fillColor('#e9eef8')
  doc.text(reportData.command || 'npm run test-ci')

  doc.moveDown(0.6)
  doc.fontSize(9).fillColor('#8d98ad')
  doc.text('Target')
  doc.fontSize(10).fillColor('#e9eef8')
  doc.text(reportData.cwd || '')

  doc.moveDown(0.6)
  doc.fontSize(9).fillColor('#8d98ad')
  doc.text('Started')
  doc.fontSize(10).fillColor('#e9eef8')
  doc.text(reportData.startedAt ? reportData.startedAt.toISOString() : '--')

  doc.moveDown(0.6)
  doc.fontSize(9).fillColor('#8d98ad')
  doc.text('Finished')
  doc.fontSize(10).fillColor('#e9eef8')
  doc.text(reportData.finishedAt ? reportData.finishedAt.toISOString() : '--')

  doc.moveDown(0.6)
  doc.fontSize(9).fillColor('#8d98ad')
  doc.text('Exit Code')
  doc.fontSize(10).fillColor('#e9eef8')
  doc.text(reportData.exitCode ?? '--')

  doc.moveDown(1)
  doc.fontSize(11).fillColor('#8d98ad').text('Output')
  doc.moveDown(0.5)

  doc.font('Courier').fontSize(8).fillColor('#9ef7c4')
  doc.text(reportData.output || '', {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    lineGap: 2
  })

  doc.end()
}

function sendEvent (res, type, text) {
  res.write(`event: ${type}\n`)
  String(text).split(/\r?\n/).forEach((line) => {
    res.write(`data: ${line}\n`)
  })
  res.write('\n')
}

function finalizeReport (report) {
  if (!report || !report.path) return
  report.finishedAt = report.finishedAt || new Date()
  const html = buildReportHtml(report)
  fs.writeFileSync(report.path, html, 'utf8')

  const jsonPayload = {
    filename: report.filename,
    command: report.command,
    cwd: report.cwd,
    tests: report.tests,
    source: report.source,
    startedAt: report.startedAt ? report.startedAt.toISOString() : null,
    finishedAt: report.finishedAt ? report.finishedAt.toISOString() : null,
    exitCode: report.exitCode,
    output: report.output
  }
  fs.writeFileSync(report.jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8')
  cleanupReports(MAX_REPORTS, MAX_REPORT_DAYS)
}

function createReport (tests, source) {
  const now = new Date()
  const filename = `test-ci-${timestamp(now)}.html`
  const reportPath = path.join(reportsDir, filename)

  return {
    filename,
    path: reportPath,
    jsonPath: reportPath.replace(/\.html$/, '.json'),
    url: `/reports/${filename}`,
    cwd: requestPkgPath,
    command: buildCommand(tests),
    tests,
    source,
    startedAt: now,
    finishedAt: null,
    exitCode: null,
    output: ''
  }
}

function startTestRun ({ tests, onOutput, onExit, source }) {
  if (isRunning) {
    return { ok: false, reason: 'running' }
  }

  const parsedTests = parseTestsInput(tests)
  const report = createReport(parsedTests, source)
  lastReport = report
  isRunning = true

  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawn(cmd, buildNpmArgs(parsedTests), {
    cwd: requestPkgPath,
    shell: true,
    env: process.env
  })

  const FINISH_GRACE_MS = Number(process.env.TEST_FINISH_GRACE_MS || 1500)
  const IDLE_AFTER_SUMMARY_MS = Number(process.env.TEST_IDLE_AFTER_SUMMARY_MS || 3000)
  const MAX_RUNTIME_MS = Number(process.env.TEST_MAX_RUNTIME_MS || 20 * 60 * 1000)

  let sawFailure = false
  let sawSummary = false
  let forcedExitCode = null
  let finishTimer = null
  let idleTimer = null
  let maxTimer = null
  let finalized = false

  const clearTimers = () => {
    if (finishTimer) clearTimeout(finishTimer)
    if (idleTimer) clearTimeout(idleTimer)
    if (maxTimer) clearTimeout(maxTimer)
  }

  const scheduleFinish = () => {
    if (finishTimer) return
    finishTimer = setTimeout(() => {
      if (!child.killed) {
        forcedExitCode = sawFailure ? 1 : 0
        child.kill()
      }
    }, FINISH_GRACE_MS)
  }

  const scheduleIdleKill = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (!child.killed) {
        report.output += `\n[runner idle timeout] No output after summary. Forcing exit.\n`
        forcedExitCode = sawFailure ? 1 : 0
        child.kill()
      }
    }, IDLE_AFTER_SUMMARY_MS)
  }

  maxTimer = setTimeout(() => {
    if (!child.killed) {
      report.output += `\n[runner max timeout] Exceeded ${Math.round(MAX_RUNTIME_MS / 1000)}s. Forcing exit.\n`
      forcedExitCode = 1
      child.kill()
    }
  }, MAX_RUNTIME_MS)

  const handleOutput = (type, data) => {
    const text = String(data)
    report.output += text
    if (onOutput) onOutput(type, text)

    const lines = text.split(/\r?\n/)
    for (const line of lines) {
      if (!line) continue
      if (/^not ok\b/i.test(line)) {
        sawFailure = true
      }
      if (/^#\s*(ok|pass|fail|tests)\b/i.test(line)) {
        sawSummary = true
      }
    }

    if (sawSummary) {
      scheduleFinish()
      scheduleIdleKill()
    }
  }

  child.stdout.on('data', d => handleOutput('log', d))
  child.stderr.on('data', d => handleOutput('err', d))

  const finalize = (exitCode) => {
    if (finalized) return
    finalized = true
    clearTimers()

    const finalCode = (exitCode === null || typeof exitCode === 'undefined')
      ? (forcedExitCode ?? 1)
      : exitCode

    report.exitCode = finalCode
    report.finishedAt = new Date()
    finalizeReport(report)
    isRunning = false
    if (onExit) onExit(finalCode, report)
  }

  child.on('error', (err) => {
    report.exitCode = report.exitCode ?? 1
    report.output += `\n[runner error] ${err.message}\n`
    finalize(report.exitCode)
  })

  child.on('close', (code) => {
    finalize(code)
  })

  return { ok: true, report, child }
}

function scheduleNextRun () {
  if (!schedule.enabled) {
    nextRunAt = null
    if (scheduleTimer) {
      clearTimeout(scheduleTimer)
      scheduleTimer = null
    }
    return
  }

  const intervalMs = Math.max(1, schedule.intervalMinutes) * 60 * 1000
  nextRunAt = new Date(Date.now() + intervalMs)

  if (scheduleTimer) {
    clearTimeout(scheduleTimer)
  }

  scheduleTimer = setTimeout(() => {
    if (!schedule.enabled) return
    if (isRunning) {
      scheduleNextRun()
      return
    }
    const result = startTestRun({
      tests: schedule.tests,
      source: 'schedule',
      onExit: () => scheduleNextRun()
    })
    if (!result.ok) {
      scheduleNextRun()
    }
  }, intervalMs)
}

function startSchedule (intervalMinutes, testsInput) {
  const interval = Number(intervalMinutes)
  schedule.intervalMinutes = Number.isNaN(interval) ? DEFAULT_INTERVAL_MINUTES : Math.max(1, interval)
  schedule.tests = parseTestsInput(testsInput)
  schedule.enabled = true
  scheduleNextRun()
}

function stopSchedule () {
  schedule.enabled = false
  scheduleNextRun()
}

app.use(cors())
app.use(express.json())

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
}

ensureReportsDir()
app.use('/reports', express.static(reportsDir))

app.get('/api/meta', (req, res) => {
  res.json({
    name: requestPkg.name || 'request-legacy',
    version: requestPkg.version || 'unknown',
    cwd: requestPkgPath,
    command: 'npm run test-ci',
    reportMax: MAX_REPORTS,
    reportMaxDays: MAX_REPORT_DAYS
  })
})

app.get('/api/schedule', (req, res) => {
  res.json({
    enabled: schedule.enabled,
    intervalMinutes: schedule.intervalMinutes,
    nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
    tests: schedule.tests
  })
})

app.post('/api/schedule/start', (req, res) => {
  startSchedule(req.body.intervalMinutes, req.body.tests)
  res.json({
    enabled: schedule.enabled,
    intervalMinutes: schedule.intervalMinutes,
    nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
    tests: schedule.tests
  })
})

app.post('/api/schedule/stop', (req, res) => {
  stopSchedule()
  res.json({
    enabled: schedule.enabled,
    intervalMinutes: schedule.intervalMinutes,
    nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
    tests: schedule.tests
  })
})

app.get('/api/report/latest', (req, res) => {
  if (!lastReport || !fs.existsSync(lastReport.path)) {
    lastReport = getLatestReportFromDisk()
  }

  if (!lastReport) {
    return res.json({ available: false })
  }

  res.json({
    available: true,
    filename: lastReport.filename,
    url: lastReport.url,
    downloadUrl: `/api/report/latest/download`,
    zipUrl: `/api/report/latest/zip`,
    pdfUrl: `/api/report/latest/pdf`,
    csvUrl: `/api/report/latest/csv`,
    startedAt: lastReport.startedAt,
    finishedAt: lastReport.finishedAt,
    exitCode: lastReport.exitCode
  })
})

app.get('/api/report/list', (req, res) => {
  const limit = Number(req.query.limit || 20)
  const reports = listReports(Number.isNaN(limit) ? 20 : limit)
  res.json({ reports })
})

app.get('/api/report/latest/download', (req, res) => {
  if (!lastReport || !fs.existsSync(lastReport.path)) {
    lastReport = getLatestReportFromDisk()
  }
  if (!lastReport) {
    return res.status(404).end()
  }
  res.download(lastReport.path, lastReport.filename)
})

app.get('/api/report/latest/zip', (req, res) => {
  if (!lastReport || !fs.existsSync(lastReport.path)) {
    lastReport = getLatestReportFromDisk()
  }
  if (!lastReport) {
    return res.status(404).end()
  }
  streamZip(res, lastReport.filename, lastReport.path)
})

app.get('/api/report/latest/pdf', (req, res) => {
  if (!lastReport || !fs.existsSync(lastReport.path)) {
    lastReport = getLatestReportFromDisk()
  }
  if (!lastReport) {
    return res.status(404).end()
  }
  const data = loadReportData(lastReport.filename)
  if (!data) {
    return res.status(404).end()
  }
  streamPdf(res, data, lastReport.filename)
})

app.get('/api/report/latest/csv', (req, res) => {
  if (!lastReport || !fs.existsSync(lastReport.path)) {
    lastReport = getLatestReportFromDisk()
  }
  if (!lastReport) {
    return res.status(404).end()
  }
  const data = loadReportData(lastReport.filename)
  if (!data) {
    return res.status(404).end()
  }
  streamCsv(res, data, lastReport.filename)
})

app.get('/api/report/download/:filename', (req, res) => {
  const fullPath = resolveReportPath(req.params.filename)
  if (!fullPath) {
    return res.status(404).end()
  }
  res.download(fullPath, req.params.filename)
})

app.get('/api/report/zip/:filename', (req, res) => {
  const fullPath = resolveReportPath(req.params.filename)
  if (!fullPath) {
    return res.status(404).end()
  }
  streamZip(res, req.params.filename, fullPath)
})

app.get('/api/report/pdf/:filename', (req, res) => {
  const data = loadReportData(req.params.filename)
  if (!data) {
    return res.status(404).end()
  }
  streamPdf(res, data, req.params.filename)
})

app.get('/api/report/csv/:filename', (req, res) => {
  const data = loadReportData(req.params.filename)
  if (!data) {
    return res.status(404).end()
  }
  streamCsv(res, data, req.params.filename)
})

app.get('/api/zen', (req, res) => {
  request('https://api.github.com/zen', {
    headers: { 'user-agent': 'Request-Legacy-Demo' }
  }, (error, response, body) => {
    if (error) return res.status(500).send(error)
    res.send({ message: body })
  })
})

app.get('/api/test-ci', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const testsParam = req.query.tests
  const result = startTestRun({
    tests: testsParam,
    source: 'manual',
    onOutput: (type, text) => sendEvent(res, type, text),
    onExit: (code) => {
      sendEvent(res, 'exit', code)
      res.end()
    }
  })

  if (!result.ok) {
    sendEvent(res, 'err', 'A test run is already in progress.')
    sendEvent(res, 'exit', 1)
    res.end()
    return
  }

  req.on('close', () => {
    if (result.child && !result.child.killed) {
      result.child.kill()
    }
  })
})

if (fs.existsSync(path.join(distPath, 'index.html'))) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).end()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server laeuft auf http://localhost:${port}`)
})
