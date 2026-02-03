'use strict'

const http = require('http')
const https = require('https')
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const stream = require('stream')
const util = require('util')
const url = require('url')
const os = require('os')
const qs = require('qs')
const zlib = require('zlib')
const mimeTypes = require('mime-types')
const tape = require('tape')
const httpSignature = require('http-signature')
const crypto = require('crypto')

const serverModule = require('../server')
const request = require('../../index')
const hawk = require('../../lib/hawk')

const trackedServers = new Set()

function registerServer (serverInstance) {
  if (!serverInstance || typeof serverInstance.close !== 'function') {
    return serverInstance
  }
  if (trackedServers.has(serverInstance)) {
    return serverInstance
  }

  trackedServers.add(serverInstance)
  serverInstance.once('close', function () {
    trackedServers.delete(serverInstance)
  })

  return serverInstance
}

function wrapServerFactory (name) {
  if (typeof serverModule[name] !== 'function') {
    return
  }
  server[name] = function () {
    const created = serverModule[name].apply(serverModule, arguments)
    return registerServer(created)
  }
}

var server = Object.assign({}, serverModule)
wrapServerFactory('createServer')
wrapServerFactory('createEchoServer')
wrapServerFactory('createSSLServer')

function cleanupServers (callback) {
  const servers = Array.from(trackedServers)
  let remaining = servers.length

  if (remaining === 0) {
    if (callback) {
      callback()
    }
    return
  }

  const finished = function () {
    remaining -= 1
    if (remaining === 0 && callback) {
      callback()
    }
  }

  trackedServers.clear()
  servers.forEach(function (s) {
    if (s.listening) {
      s.once('close', finished)
      s.close()
    } else {
      finished()
    }
  })
}

function destroyAgent (agent) {
  if (!agent || typeof agent.destroy !== 'function') {
    return
  }
  try {
    agent.destroy()
  } catch {
    // best-effort, swallow any destroy errors
  }
}

function destroyAgentSockets (agent) {
  if (!agent || typeof agent === 'undefined') {
    return
  }

  const destroySocketList = function (list) {
    Object.keys(list).forEach(function (key) {
      const entries = list[key]
      if (!Array.isArray(entries)) {
        return
      }
      entries.forEach(function (entry) {
        if (entry && typeof entry.destroy === 'function') {
          try {
            entry.destroy()
          } catch {
            // ignore destroy errors
          }
        }
      })
    })
  }

  destroySocketList(agent.sockets || {})
  destroySocketList(agent.requests || {})
}

function cleanup () {
  cleanupServers(function () {
    destroyAgent(http.globalAgent)
    destroyAgent(https.globalAgent)
    destroyAgentSockets(http.globalAgent)
    destroyAgentSockets(https.globalAgent)
    if (typeof request.resetGlobalPool === 'function') {
      request.resetGlobalPool()
    }
  })
}

process.once('exit', cleanup)

module.exports = {
  http,
  https,
  assert,
  fs,
  path,
  stream,
  util,
  url,
  os,
  qs,
  zlib,
  mime: mimeTypes,
  mimeTypes,
  tape,
  httpSignature,
  server,
  request,
  crypto,
  hawk,
  cleanup,
  cleanupServers
}
