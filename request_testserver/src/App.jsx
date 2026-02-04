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

export default function App () {
  const [status, setStatus] = useState('idle')
  const [log, setLog] = useState('')
  const [exitCode, setExitCode] = useState(null)
  const [duration, setDuration] = useState(null)
  const [meta, setMeta] = useState({ cwd: 'loading...', command: '', name: 'request-legacy', version: '--' })
  const [report, setReport] = useState({ available: false })
  const [reports, setReports] = useState([])
  const [testsInput, setTestsInput] = useState('')
  const [schedule, setSchedule] = useState({ enabled: false, intervalMinutes: 60, nextRunAt: null, tests: [] })
  const [intervalInput, setIntervalInput] = useState('60')

  const outRef = useRef(null)
  const esRef = useRef(null)

  const refreshReport = () => {
    fetch('/api/report/latest')
      .then((res) => res.json())
      .then((data) => setReport(data))
      .catch(() => setReport({ available: false }))
  }

  const refreshReports = () => {
    fetch('/api/report/list?limit=15')
      .then((res) => res.json())
      .then((data) => setReports(data.reports || []))
      .catch(() => setReports([]))
  }

  const refreshSchedule = () => {
    fetch('/api/schedule')
      .then((res) => res.json())
      .then((data) => {
        setSchedule(data)
        if (data?.intervalMinutes) {
          setIntervalInput(String(data.intervalMinutes))
        }
      })
      .catch(() => setSchedule({ enabled: false, intervalMinutes: 60, nextRunAt: null, tests: [] }))
  }

  useEffect(() => {
    fetch('/api/meta')
      .then((res) => res.json())
      .then((data) => setMeta(data))
      .catch(() => setMeta({ cwd: 'unknown', command: 'npm run test-ci', name: 'request-legacy', version: '--' }))

    refreshReport()
    refreshReports()
    refreshSchedule()

    const interval = setInterval(() => {
      refreshReport()
      refreshReports()
      refreshSchedule()
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!outRef.current) return
    outRef.current.scrollTop = outRef.current.scrollHeight
  }, [log])

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close()
    }
  }, [])

  const append = (chunk) => {
    setLog((prev) => prev + String(chunk))
  }

  const startRun = () => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const startedAt = Date.now()
    setLog('')
    setExitCode(null)
    setDuration(null)
    setStatus('running')

    const params = new URLSearchParams()
    if (testsInput.trim()) {
      params.set('tests', testsInput.trim())
    }

    const url = params.toString() ? `/api/test-ci?${params.toString()}` : '/api/test-ci'
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('log', (e) => append(e.data))
    es.addEventListener('err', (e) => append(e.data))
    es.addEventListener('exit', (e) => {
      const code = Number(e.data)
      setExitCode(Number.isNaN(code) ? null : code)
      setStatus('done')
      setDuration(Date.now() - startedAt)
      es.close()
      esRef.current = null
      refreshReport()
      refreshReports()
    })

    es.onerror = () => {
      setStatus('error')
      es.close()
      esRef.current = null
    }
  }

  const stopRun = () => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setStatus('idle')
  }

  const clearLog = () => {
    setLog('')
    setExitCode(null)
    setDuration(null)
  }

  const openUrl = (url) => {
    if (url) {
      window.open(url, '_blank', 'noopener')
    }
  }

  const openReport = () => {
    if (report && report.available && report.url) {
      openUrl(report.url)
    }
  }

  const downloadReport = () => {
    if (report && report.available && report.downloadUrl) {
      openUrl(report.downloadUrl)
    }
  }

  const downloadZip = () => {
    if (report && report.available && report.zipUrl) {
      openUrl(report.zipUrl)
    }
  }

  const downloadPdf = () => {
    if (report && report.available && report.pdfUrl) {
      openUrl(report.pdfUrl)
    }
  }

  const downloadCsv = () => {
    if (report && report.available && report.csvUrl) {
      openUrl(report.csvUrl)
    }
  }

  const startSchedule = () => {
    const interval = Math.max(1, Number(intervalInput) || 60)
    fetch('/api/schedule/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intervalMinutes: interval,
        tests: testsInput.trim()
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setSchedule(data)
        setIntervalInput(String(data.intervalMinutes || interval))
      })
      .catch(() => {})
  }

  const stopSchedule = () => {
    fetch('/api/schedule/stop', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setSchedule(data))
      .catch(() => {})
  }

  const metaInfo = statusMeta[status]

  const reportLabel = useMemo(() => {
    if (!report || !report.available) return '--'
    return report.filename
  }, [report])

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
            Run <span className="mono">{meta.command || 'npm run test-ci'}</span> from a clean UI, stream logs live, and keep focus on
            regressions.
          </p>
          <div className="meta-row">
            <div className={`status-pill ${metaInfo.tone}`}>{metaInfo.label}</div>
            <div className="meta">
              <span className="label">Target</span>
              <span className="value mono">{meta.cwd}</span>
            </div>
            <div className="meta">
              <span className="label">Command</span>
              <span className="value mono">{meta.command || 'npm run test-ci'}</span>
            </div>
            <div className="meta">
              <span className="label">Tests</span>
              <span className="value mono">{selectedTests}</span>
            </div>
            <div className="meta">
              <span className="label">Version</span>
              <span className="value mono">{meta.name}@{meta.version}</span>
            </div>
            <div className="meta">
              <span className="label">Exit</span>
              <span className="value mono">{exitCode === null ? '--' : exitCode}</span>
            </div>
            <div className="meta">
              <span className="label">Duration</span>
              <span className="value mono">{duration === null ? '--' : `${Math.round(duration / 1000)}s`}</span>
            </div>
            <div className="meta">
              <span className="label">Report</span>
              <span className="value mono">{reportLabel}</span>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <span className="label">Test Filter</span>
              <input
                value={testsInput}
                onChange={(e) => setTestsInput(e.target.value)}
                placeholder="tests/test-foo.js, tests/test-bar.js"
              />
              <span className="hint">Leave blank to run the full suite.</span>
            </div>
            <div className="field">
              <span className="label">Schedule (min)</span>
              <input
                type="number"
                min="1"
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
              />
              <span className="hint">Next run: {nextRunLabel}</span>
            </div>
            <div className="field">
              <span className="label">Schedule Status</span>
              <span className="value mono">{scheduleLabel}</span>
              <span className="hint">Scheduled tests: {schedule.tests && schedule.tests.length ? schedule.tests.join(', ') : 'All'}</span>
            </div>
          </div>

          <div className="actions">
            <button className="primary" onClick={startRun} disabled={status === 'running'}>
              Run test-ci
            </button>
            <button className="ghost" onClick={stopRun} disabled={status !== 'running'}>
              Stop
            </button>
            <button className="ghost" onClick={clearLog}>
              Clear
            </button>
            <button className="ghost" onClick={openReport} disabled={!report || !report.available}>
              Open report
            </button>
            <button className="ghost" onClick={downloadReport} disabled={!report || !report.available}>
              Download HTML
            </button>
            <button className="ghost" onClick={downloadZip} disabled={!report || !report.available}>
              Download ZIP
            </button>
            <button className="ghost" onClick={downloadPdf} disabled={!report || !report.available}>
              Download PDF
            </button>
            <button className="ghost" onClick={downloadCsv} disabled={!report || !report.available}>
              Download CSV
            </button>
            <button className="ghost" onClick={startSchedule} disabled={schedule.enabled}>
              Start schedule
            </button>
            <button className="ghost" onClick={stopSchedule} disabled={!schedule.enabled}>
              Stop schedule
            </button>
          </div>
        </div>
      </header>

      <section className="console">
        <div className="console-header">
          <span className="console-title">Live Output</span>
          <span className="console-sub">Streaming TAP output in real time</span>
        </div>
        <pre className="console-body" ref={outRef}>{log || 'Ready. Click "Run test-ci" to begin.'}</pre>
      </section>

      <section className="history">
        <div className="history-header">
          <span className="history-title">Report History</span>
          <span className="history-sub">Last 15 runs stored on disk</span>
        </div>
        <div className="history-list">
          {reports.length === 0 && (
            <div className="history-empty">No reports yet.</div>
          )}
          {reports.map((item) => (
            <div className="history-item" key={item.filename}>
              <div>
                <div className="history-name mono">{item.filename}</div>
                <div className="history-date">{formatDate(item.createdAt)}</div>
              </div>
              <div className="history-actions">
                <button className="ghost small" onClick={() => openUrl(item.url)}>Open</button>
                <button className="ghost small" onClick={() => openUrl(item.downloadUrl)}>HTML</button>
                <button className="ghost small" onClick={() => openUrl(item.zipUrl)}>ZIP</button>
                <button className="ghost small" onClick={() => openUrl(item.pdfUrl)}>PDF</button>
                <button className="ghost small" onClick={() => openUrl(item.csvUrl)}>CSV</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span className="mono">{meta.name}@{meta.version}</span> UI • Vite + React
      </footer>
    </div>
  )
}
