'use strict'

const deps = require('./deps')
const url = deps.url
const isUrl = /^https?:/

function effectivePort (uri) {
  if (!uri) return ''
  if (uri.port) return String(uri.port)
  if (uri.protocol === 'https:') return '443'
  if (uri.protocol === 'http:') return '80'
  return ''
}

function sameOrigin (left, right) {
  return Boolean(
    left && right &&
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    effectivePort(left) === effectivePort(right)
  )
}

function stripSensitiveHeaders (request, previousUri, nextUri) {
  if (sameOrigin(previousUri, nextUri) || !request.headers) {
    return
  }

  const stripped = []
  if (request.hasHeader('authorization')) {
    request.removeHeader('authorization')
    stripped.push('authorization')
  }
  if (request.hasHeader('proxy-authorization')) {
    request.removeHeader('proxy-authorization')
    stripped.push('proxy-authorization')
  }
  if (request.hasHeader('cookie')) {
    request.removeHeader('cookie')
    stripped.push('cookie')
  }
  request.originalCookieHeader = undefined

  request.debug(
    'redirect origin change %s -> %s, stripped headers: %s',
    previousUri && previousUri.href,
    nextUri && nextUri.href,
    stripped.length ? stripped.join(', ') : 'none'
  )
}

function sanitizedReferer (uri) {
  if (!uri) return null
  const copy = Object.assign({}, uri)
  copy.auth = null
  copy.hash = null
  return url.format(copy)
}

function Redirect (request) {
  this.request = request
  this.followRedirect = true
  this.followRedirects = true
  this.followAllRedirects = false
  this.followOriginalHttpMethod = false
  this.allowRedirect = function () { return true }
  this.maxRedirects = 10
  this.redirects = []
  this.redirectsFollowed = 0
  this.removeRefererHeader = false
}

Redirect.prototype.onRequest = function (options) {
  const self = this

  if (options.maxRedirects !== undefined) {
    if (!Number.isSafeInteger(options.maxRedirects) || options.maxRedirects < 0 || options.maxRedirects > 100) {
      throw new TypeError('options.maxRedirects must be an integer between 0 and 100')
    }
    self.maxRedirects = options.maxRedirects
  }
  if (typeof options.followRedirect === 'function') {
    self.allowRedirect = options.followRedirect
  }
  if (options.followRedirect !== undefined) {
    self.followRedirects = !!options.followRedirect
  }
  if (options.followAllRedirects !== undefined) {
    self.followAllRedirects = options.followAllRedirects
  }
  if (self.followRedirects || self.followAllRedirects) {
    self.redirects = self.redirects || []
  }
  if (options.removeRefererHeader !== undefined) {
    self.removeRefererHeader = options.removeRefererHeader
  }
  if (options.followOriginalHttpMethod !== undefined) {
    self.followOriginalHttpMethod = options.followOriginalHttpMethod
  }
}

Redirect.prototype.redirectTo = function (response) {
  const self = this
  const request = self.request

  let redirectTo = null
  if (response.statusCode >= 300 && response.statusCode < 400 && response.caseless.has('location')) {
    const location = response.caseless.get('location')
    request.debug('redirect', location)

    if (self.followAllRedirects) {
      redirectTo = location
    } else if (self.followRedirects) {
      switch (request.method) {
        case 'PATCH':
        case 'PUT':
        case 'POST':
        case 'DELETE':
          // Do not follow redirects
          break
        default:
          redirectTo = location
          break
      }
    }
  } else if (response.statusCode === 401) {
    const authHeader = request._auth.onResponse(response)
    if (authHeader) {
      request.setHeader('authorization', authHeader)
      redirectTo = request.uri
    }
  }
  return redirectTo
}

Redirect.prototype.onResponse = function (response) {
  const self = this
  const request = self.request

  let redirectTo = self.redirectTo(response)
  if (!redirectTo || !self.allowRedirect.call(request, response)) {
    return false
  }

  request.debug('redirect to', redirectTo)

  // ignore any potential response body.  it cannot possibly be useful
  // to us at this point.
  // response.resume should be defined, but check anyway before calling. Workaround for browserify.
  if (response.resume) {
    response.resume()
  }

  if (self.redirectsFollowed >= self.maxRedirects) {
    const err = new Error('E_TOO_MANY_REDIRECTS')
    err.name = 'E_TOO_MANY_REDIRECTS'
    err.code = 'E_TOO_MANY_REDIRECTS'
    err.maxRedirects = self.maxRedirects
    err.redirectsFollowed = self.redirectsFollowed
    err.termination = 'LIMIT_REACHED'
    err.details = 'Exceeded maxRedirects. Probably stuck in a redirect loop ' + request.uri.href
    request.debug('redirect loop abort: maxRedirects=%s, redirectsFollowed=%s', self.maxRedirects, self.redirectsFollowed)
    request.emit('error', err)
    return false
  }
  self.redirectsFollowed += 1

  if (!isUrl.test(redirectTo)) {
    redirectTo = url.resolve(request.uri.href, redirectTo)
  }

  const uriPrev = request.uri
  request.uri = url.parse(redirectTo)

  // handle the case where we change protocol from https to http or vice versa
  if (request.uri.protocol !== uriPrev.protocol) {
    delete request.agent
  }

  self.redirects.push({ statusCode: response.statusCode, redirectUri: redirectTo })

  const preserveMethod = (response.statusCode === 307 || response.statusCode === 308)
  if (self.followAllRedirects && request.method !== 'HEAD' &&
    response.statusCode !== 401 && !preserveMethod) {
    request.method = self.followOriginalHttpMethod ? request.method : 'GET'
  }
  // request.method = 'GET' // Force all redirects to use GET || commented out fixes #215
  delete request.src
  delete request.req
  delete request._started
  stripSensitiveHeaders(request, uriPrev, request.uri)
  if (response.statusCode !== 401 && !preserveMethod) {
    // Remove parameters from the previous response, unless this is the second request
    // for a server that requires digest authentication.
    delete request.body
    delete request._form
    if (request.headers) {
      request.removeHeader('host')
      request.removeHeader('content-type')
      request.removeHeader('content-length')
    }
  }

  if (!self.removeRefererHeader && !(uriPrev.protocol === 'https:' && request.uri.protocol === 'http:')) {
    const referer = sanitizedReferer(uriPrev)
    if (referer) request.setHeader('referer', referer)
  } else if (request.hasHeader('referer')) {
    request.removeHeader('referer')
  }

  request.emit('redirect')

  const timingPhases = request.timingPhases
  request.init()
  if (timingPhases) {
    request.timingPhases = timingPhases
  }

  return true
}

exports.Redirect = Redirect
