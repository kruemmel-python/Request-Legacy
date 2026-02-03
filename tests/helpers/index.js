'use strict'

var http = require('http')
var https = require('https')
var assert = require('assert')
var fs = require('fs')
var path = require('path')
var stream = require('stream')
var util = require('util')
var url = require('url')
var os = require('os')
var qs = require('qs')
var zlib = require('zlib')
var mimeTypes = require('mime-types')
var tape = require('tape')
var httpSignature = require('http-signature')
var crypto = require('crypto')

var serverModule = require('../server')
var request = require('../../index')
var hawk = require('../../lib/hawk')

var trackedServers = new Set()

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
    var created = serverModule[name].apply(serverModule, arguments)
    return registerServer(created)
  }
}

var server = Object.assign({}, serverModule)
wrapServerFactory('createServer')
wrapServerFactory('createEchoServer')
wrapServerFactory('createSSLServer')

function cleanupServers (callback) {
  var servers = Array.from(trackedServers)
  var remaining = servers.length

  if (remaining === 0) {
    if (callback) {
      callback()
    }
    return
  }

  var finished = function () {
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
  } catch (err) {
    // best-effort, swallow any destroy errors
  }
}

function destroyAgentSockets (agent) {
  if (!agent || typeof agent === 'undefined') {
    return
  }

  var destroySocketList = function (list) {
    Object.keys(list).forEach(function (key) {
      var entries = list[key]
      if (!Array.isArray(entries)) {
        return
      }
      entries.forEach(function (entry) {
        if (entry && typeof entry.destroy === 'function') {
          try {
            entry.destroy()
          } catch (err) {}
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
  http: http,
  https: https,
  assert: assert,
  fs: fs,
  path: path,
  stream: stream,
  util: util,
  url: url,
  os: os,
  qs: qs,
  zlib: zlib,
  mime: mimeTypes,
  mimeTypes: mimeTypes,
  tape: tape,
  httpSignature: httpSignature,
  server: server,
  request: request,
  crypto: crypto,
  hawk: hawk,
  cleanup: cleanup,
  cleanupServers: cleanupServers
}
