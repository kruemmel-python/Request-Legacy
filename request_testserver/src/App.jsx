import { useEffect, useMemo, useRef, useState } from 'react'

const statusMeta = {
  idle: { label: 'Idle', tone: 'idle' },
  running: { label: 'Running', tone: 'running' },
  done: { label: 'Done', tone: 'done' },
  error: { label: 'Error', tone: 'error' }
}

function formatDate (value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString()
}

function filenameFromResponse (response, fallback) {
  const disposition = response.headers.get('content-disposition') || ''
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {}
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1] : fallback
}

async function consumeSse (response, onEvent) {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `HTTP ${response.status}`)
  }
  if (!response.body) throw new Error('Streaming response body is unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatchFrame = (frame) => {
    if (!frame.trim()) return
    let event = 'message'
    const data = []
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    onEvent(event, data.join('\n'))
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      dispatchFrame(frame)
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, '\n')
  if (buffer.trim()) dispatchFrame(buffer)
}

export default function App () {
  const [apiToken, setApiToken] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [status, setStatus] = useState('idle')
  const [log, setLog] = useState('')
  const [exitCode, setExitCode] = useState(null)
  const [duration, setDuration] = useState(null)
  const [meta, setMeta] = useState({ target: 'loading...', command: '', name: 'request-legacy', version: '--' })
  const [report, setReport] = useState({ available: false })
  const [reports, setReports] = useState([])
  const [testsInput, setTestsInput] = useState('')
  const [schedule, setSchedule] = useState({ enabled: false, intervalMinutes: 60, nextRunAt: null, tests: [] })
  const [intervalInput, setIntervalInput] = useState('60')

  const outRef = useRef(null)
  const runAbortRef = useRef(null)

  const apiFetch = (url, options = {}) => {
    const headers = new Headers(options.headers || {})
    if (apiToken) headers.set('x-api-token', apiToken)
    return fetch(url, { ...options, headers })
  }

  const refreshReport = () => {
    apiFetch('/api/report/latest')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setReport(data))
      .catch(() => setReport({ available: false }))
  }

  const refreshReports = () => {
    apiFetch('/api/report/list?limit=15')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setReports(data.reports || []))
      .catch(() => setReports([]))
  }

  const refreshSchedule = () => {
    apiFetch('/api/schedule')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setSchedule(data)
        if (data?.intervalMinutes) setIntervalInput(String(data.intervalMinutes))
      })
      .catch(() => setSchedule({ enabled: false, intervalMinutes: 60, nextRunAt: null, tests: [] }))
  }

  const refreshAll = () => {
    apiFetch('/api/meta')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setMeta(data))
      .catch(() => setMeta({ target: 'unauthorized or unavailable', command: 'node scripts/run-tests.js', name: 'request-legacy', version: '--' }))
    refreshReport()
    refreshReports()
    refreshSchedule()
  }

  useEffect(() => {
    refreshAll()
    const interval = setInterval(refreshAll, 15000)
    return () => clearInterval(interval)
  }, [apiToken])

  useEffect(() => {
    if (!outRef.current) return
    outRef.current.scrollTop = outRef.current.scrollHeight
  }, [log])

  useEffect(() => () => {
    runAbortRef.current?.abort()
  }, [])

  const append = (chunk) => setLog((prev) => prev + String(chunk))

  const applyToken = () => {
    setApiToken(tokenInput)
  }

  const clearToken = () => {
    setTokenInput('')
    setApiToken('')
  }

  const startRun = async () => {
    runAbortRef.current?.abort()
    const controller = new AbortController()
    runAbortRef.current = controller

    const startedAt = Date.now()
    setLog('')
    setExitCode(null)
    setDuration(null)
    setStatus('running')

    const params = new URLSearchParams()
    if (testsInput.trim()) params.set('tests', testsInput.trim())
    const url = params.toString() ? `/api/test-ci?${params}` : '/api/test-ci'

    try {
      const response = await apiFetch(url, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' }
      })
      await consumeSse(response, (event, data) => {
        if (event === 'log' || event === 'err') append(data)
        if (event === 'exit') {
          const code = Number(data)
          setExitCode(Number.isNaN(code) ? null : code)
          setStatus(code === 0 ? 'done' : 'error')
          setDuration(Date.now() - startedAt)
          refreshReport()
          refreshReports()
        }
      })
    } catch (error) {
      if (error.name !== 'AbortError') {
        append(`\n[stream error] ${error.message}\n`)
        setStatus('error')
      }
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null
    }
  }

  const stopRun = () => {
    runAbortRef.current?.abort()
    runAbortRef.current = null
    setStatus('idle')
  }

  const clearLog = () => {
    setLog('')
    setExitCode(null)
    setDuration(null)
  }

  const fetchBlob = async (url, fallbackName) => {
    const response = await apiFetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return {
      blob: await response.blob(),
      filename: filenameFromResponse(response, fallbackName)
    }
  }

  const openReportUrl = async (url) => {
    if (!url) return
    const popup = window.open('', '_blank', 'noopener')
    try {
      const { blob } = await fetchBlob(url, 'report.html')
      const objectUrl = URL.createObjectURL(blob)
      if (popup) popup.location.href = objectUrl
      else window.open(objectUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (error) {
      if (popup) popup.close()
      append(`\n[report error] ${error.message}\n`)
    }
  }

  const downloadReportUrl = async (url, fallbackName) => {
    if (!url) return
    try {
      const { blob, filename } = await fetchBlob(url, fallbackName)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (error) {
      append(`\n[download error] ${error.message}\n`)
    }
  }

  const openReport = () => report?.available && openReportUrl(report.url)
  const downloadReport = () => report?.available && downloadReportUrl(report.downloadUrl, report.filename || 'report.html')
  const downloadZip = () => report?.available && downloadReportUrl(report.zipUrl, 'report.zip')
  const downloadPdf = () => report?.available && downloadReportUrl(report.pdfUrl, 'report.pdf')
  const downloadCsv = () => report?.available && downloadReportUrl(report.csvUrl, 'report.csv')

  const startSchedule = () => {
    const interval = Math.max(1, Number(intervalInput) || 60)
    apiFetch('/api/schedule/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalMinutes: interval, tests: testsInput.trim() })
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setSchedule(data)
        setIntervalInput(String(data.intervalMinutes || interval))
      })
      .catch((error) => append(`\n[schedule error] ${error.message}\n`))
  }

  const stopSchedule = () => {
    apiFetch('/api/schedule/stop', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setSchedule(data))
      .catch((error) => append(`\n[schedule error] ${error.message}\n`))
  }

  const metaInfo = statusMeta[status]
  const reportLabel = useMemo(() => (!report?.available ? '--' : report.filename), [report])
  const scheduleLabel = schedule.enabled ? 'Enabled' : 'Disabled'
  const nextRunLabel = schedule.enabled && schedule.nextRunAt ? formatDate(schedule.nextRunAt) : '--'
  const selectedTests = testsInput.trim() || 'All'

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-card">
          <p className="eyebrow">Request-Legacy</p>
          <h1>Test-CI Control Room</h1>
          <p className="lead">
            Run <span className="mono">{meta.command || 'node scripts/run-tests.js'}</span> from a clean UI, stream logs live, and keep focus on regressions.
          </p>

          <div className="field-row auth-row">
            <div className="field">
              <span className="label">LAN API Token</span>
              <input
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyToken() }}
                placeholder="Only required when TESTSERVER_API_TOKEN is configured"
              />
              <span className="hint">Kept only in this page's memory. Never placed in the URL, history or storage.</span>
            </div>
            <div className="auth-actions">
              <button className="ghost" onClick={applyToken}>Use token</button>
              <button className="ghost" onClick={clearToken} disabled={!apiToken && !tokenInput}>Clear token</button>
              <span className="hint mono">{apiToken ? 'Token active' : 'No token active'}</span>
            </div>
          </div>

          <div className="meta-row">
            <div className={`status-pill ${metaInfo.tone}`}>{metaInfo.label}</div>
            <div className="meta"><span className="label">Target</span><span className="value mono">{meta.target}</span></div>
            <div className="meta"><span className="label">Command</span><span className="value mono">{meta.command || 'node scripts/run-tests.js'}</span></div>
            <div className="meta"><span className="label">Tests</span><span className="value mono">{selectedTests}</span></div>
            <div className="meta"><span className="label">Version</span><span className="value mono">{meta.name}@{meta.version}</span></div>
            <div className="meta"><span className="label">Exit</span><span className="value mono">{exitCode === null ? '--' : exitCode}</span></div>
            <div className="meta"><span className="label">Duration</span><span className="value mono">{duration === null ? '--' : `${Math.round(duration / 1000)}s`}</span></div>
            <div className="meta"><span className="label">Report</span><span className="value mono">{reportLabel}</span></div>
          </div>

          <div className="field-row">
            <div className="field">
              <span className="label">Test Filter</span>
              <input value={testsInput} onChange={(e) => setTestsInput(e.target.value)} placeholder="tests/test-foo.js, tests/test-bar.js" />
              <span className="hint">Leave blank to run the full suite.</span>
            </div>
            <div className="field">
              <span className="label">Schedule (min)</span>
              <input type="number" min="1" value={intervalInput} onChange={(e) => setIntervalInput(e.target.value)} />
              <span className="hint">Next run: {nextRunLabel}</span>
            </div>
            <div className="field">
              <span className="label">Schedule Status</span>
              <span className="value mono">{scheduleLabel}</span>
              <span className="hint">Scheduled tests: {schedule.tests?.length ? schedule.tests.join(', ') : 'All'}</span>
            </div>
          </div>

          <div className="actions">
            <button className="primary" onClick={startRun} disabled={status === 'running'}>Run test-ci</button>
            <button className="ghost" onClick={stopRun} disabled={status !== 'running'}>Stop</button>
            <button className="ghost" onClick={clearLog}>Clear</button>
            <button className="ghost" onClick={openReport} disabled={!report?.available}>Open report</button>
            <button className="ghost" onClick={downloadReport} disabled={!report?.available}>Download HTML</button>
            <button className="ghost" onClick={downloadZip} disabled={!report?.available}>Download ZIP</button>
            <button className="ghost" onClick={downloadPdf} disabled={!report?.available}>Download PDF</button>
            <button className="ghost" onClick={downloadCsv} disabled={!report?.available}>Download CSV</button>
            <button className="ghost" onClick={startSchedule} disabled={schedule.enabled}>Start schedule</button>
            <button className="ghost" onClick={stopSchedule} disabled={!schedule.enabled}>Stop schedule</button>
          </div>
        </div>
      </header>

      <section className="console">
        <div className="console-header"><span className="console-title">Live Output</span><span className="console-sub">Streaming TAP output in real time</span></div>
        <pre className="console-body" ref={outRef}>{log || 'Ready. Click "Run test-ci" to begin.'}</pre>
      </section>

      <section className="history">
        <div className="history-header"><span className="history-title">Report History</span><span className="history-sub">Last 15 runs stored on disk</span></div>
        <div className="history-list">
          {reports.length === 0 && <div className="history-empty">No reports yet.</div>}
          {reports.map((item) => (
            <div className="history-item" key={item.filename}>
              <div><div className="history-name mono">{item.filename}</div><div className="history-date">{formatDate(item.createdAt)}</div></div>
              <div className="history-actions">
                <button className="ghost small" onClick={() => openReportUrl(item.url)}>Open</button>
                <button className="ghost small" onClick={() => downloadReportUrl(item.downloadUrl, item.filename)}>HTML</button>
                <button className="ghost small" onClick={() => downloadReportUrl(item.zipUrl, 'report.zip')}>ZIP</button>
                <button className="ghost small" onClick={() => downloadReportUrl(item.pdfUrl, 'report.pdf')}>PDF</button>
                <button className="ghost small" onClick={() => downloadReportUrl(item.csvUrl, 'report.csv')}>CSV</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer"><span className="mono">{meta.name}@{meta.version}</span> UI • Vite + React</footer>
    </div>
  )
}
