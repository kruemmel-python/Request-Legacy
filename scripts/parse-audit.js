'use strict'

const chunks = []

process.stdin.on('data', function (chunk) {
  chunks.push(chunk)
})

process.stdin.on('end', function () {
  let buffer = Buffer.concat(chunks)
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.slice(3)
  }

  const payload = JSON.parse(buffer.toString('utf8'))
  if (payload && payload.error) {
    const summary = {
      error: {
        code: payload.error.code || payload.code,
        summary: payload.error.summary || payload.error.message || payload.error
      }
    }
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  const summary = {
    meta: payload.metadata,
    vulns: payload.vulnerabilities || {}
  }
  console.log(JSON.stringify(summary, null, 2))
})

process.stdin.on('error', function (err) {
  console.error(err)
  process.exitCode = 1
})
