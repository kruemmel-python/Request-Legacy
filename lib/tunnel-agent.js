'use strict'

const assert = require('node:assert')
const { Buffer } = require('node:buffer')
const EventEmitter = require('node:events')
const http = require('node:http')
const https = require('node:https')
const tls = require('node:tls')

function mergeDefined (target) {
  for (let index = 1; index < arguments.length; index += 1) {
    const source = arguments[index]
    if (!source || typeof source !== 'object') continue
    Object.keys(source).forEach(function (key) {
      if (source[key] !== undefined) target[key] = source[key]
    })
  }
  return target
}

class TunnelingAgent extends EventEmitter {
  constructor (options, proxyRequest, secureEndpoint) {
    super()
    this.options = options || {}
    this.proxyOptions = this.options.proxy || {}
    this.maxSockets = this.options.maxSockets || http.Agent.defaultMaxSockets
    this.requests = []
    this.sockets = []
    this.proxyRequest = proxyRequest
    this.secureEndpoint = secureEndpoint
    this.defaultPort = secureEndpoint ? 443 : 80

    this.on('free', (socket, host, port) => {
      const pendingIndex = this.requests.findIndex(function (pending) {
        return pending.host === host && pending.port === port
      })
      if (pendingIndex !== -1) {
        const pending = this.requests.splice(pendingIndex, 1)[0]
        pending.request.onSocket(socket)
        return
      }
      socket.destroy()
      this.removeSocket(socket)
    })
  }

  addRequest (request, options) {
    if (typeof options === 'string') {
      options = { host: options, port: arguments[2], path: arguments[3] }
    }
    const pending = {
      host: options.hostname || options.host,
      port: Number(options.port || this.defaultPort),
      request
    }
    if (this.sockets.length >= this.maxSockets) {
      this.requests.push(pending)
      return
    }
    this.createConnection(pending)
  }

  createConnection (pending) {
    this.createSocket(pending, (socket) => {
      const release = () => this.emit('free', socket, pending.host, pending.port)
      const remove = () => {
        this.removeSocket(socket)
        socket.removeListener('free', release)
        socket.removeListener('close', remove)
        socket.removeListener('agentRemove', remove)
      }
      socket.on('free', release)
      socket.on('close', remove)
      socket.on('agentRemove', remove)
      pending.request.onSocket(socket)
    })
  }

  createSocket (pending, callback) {
    const placeholder = {}
    this.sockets.push(placeholder)

    const proxyTlsOptions = this.proxyRequest === https.request
      ? {
          ca: this.options.ca,
          cert: this.options.cert,
          key: this.options.key,
          passphrase: this.options.passphrase,
          pfx: this.options.pfx,
          ciphers: this.options.ciphers,
          rejectUnauthorized: this.options.rejectUnauthorized,
          secureOptions: this.options.secureOptions,
          secureProtocol: this.options.secureProtocol
        }
      : {}
    const connectOptions = mergeDefined({}, proxyTlsOptions, this.proxyOptions, {
      method: 'CONNECT',
      path: pending.host + ':' + pending.port,
      agent: false
    })
    connectOptions.headers = mergeDefined({}, connectOptions.headers)
    if (connectOptions.proxyAuth) {
      connectOptions.headers['Proxy-Authorization'] = 'Basic ' +
        Buffer.from(connectOptions.proxyAuth).toString('base64')
    }

    const connectRequest = this.proxyRequest(connectOptions)
    let completed = false
    const fail = (cause, statusCode) => {
      if (completed) return
      completed = true
      connectRequest.removeAllListeners()
      const detail = statusCode
        ? 'statusCode=' + statusCode
        : 'cause=' + (cause && cause.message ? cause.message : String(cause))
      const error = new Error('tunneling socket could not be established, ' + detail)
      error.code = 'ECONNRESET'
      pending.request.emit('error', error)
      this.removeSocket(placeholder)
    }
    const connected = (response, socket, head) => {
      if (completed) {
        socket.destroy()
        return
      }
      if (response.statusCode !== 200) {
        socket.destroy()
        fail(null, response.statusCode)
        return
      }
      if (head && head.length !== 0) {
        socket.destroy()
        fail(new Error('proxy sent unexpected data after CONNECT response'))
        return
      }

      completed = true
      connectRequest.removeAllListeners()
      const index = this.sockets.indexOf(placeholder)
      assert.notStrictEqual(index, -1)
      this.sockets[index] = socket

      if (!this.secureEndpoint) {
        callback(socket)
        return
      }
      const tlsOptions = mergeDefined({}, this.options, {
        socket,
        servername: pending.host
      })
      delete tlsOptions.proxy
      const secureSocket = tls.connect(tlsOptions)
      this.sockets[index] = secureSocket
      callback(secureSocket)
    }

    connectRequest.once('connect', connected)
    connectRequest.once('upgrade', function (response, socket, head) {
      process.nextTick(function () { connected(response, socket, head) })
    })
    connectRequest.once('response', function (response) {
      response.resume()
      fail(null, response.statusCode)
    })
    connectRequest.once('error', fail)
    connectRequest.end()
  }

  removeSocket (socket) {
    const index = this.sockets.indexOf(socket)
    if (index === -1) return
    this.sockets.splice(index, 1)
    const pending = this.requests.shift()
    if (pending) this.createConnection(pending)
  }

  destroy () {
    this.requests.splice(0).forEach(function (pending) {
      const error = new Error('tunneling agent destroyed')
      error.code = 'ECONNRESET'
      pending.request.emit('error', error)
    })
    this.sockets.splice(0).forEach(function (socket) {
      if (socket && typeof socket.destroy === 'function') socket.destroy()
    })
  }
}

function createAgent (options, proxyRequest, secureEndpoint) {
  return new TunnelingAgent(options, proxyRequest, secureEndpoint)
}

exports.httpOverHttp = function (options) { return createAgent(options, http.request, false) }
exports.httpsOverHttp = function (options) { return createAgent(options, http.request, true) }
exports.httpOverHttps = function (options) { return createAgent(options, https.request, false) }
exports.httpsOverHttps = function (options) { return createAgent(options, https.request, true) }
