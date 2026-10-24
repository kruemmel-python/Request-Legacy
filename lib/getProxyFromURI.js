'use strict'

function formatHostname (hostname) {
  // canonicalize the hostname, so that 'oogle.com' won't match 'google.com'
  return hostname.replace(/^\.*/, '.').toLowerCase()
}

function parseNoProxyZone (zone) {
  zone = zone.trim().toLowerCase()

  let zoneHost = zone
  let zonePort
  let hasPort = false
  const bracketed = zone.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (bracketed) {
    zoneHost = bracketed[1]
    zonePort = bracketed[2]
    hasPort = Boolean(zonePort)
  } else if (zone.indexOf(':') === zone.lastIndexOf(':')) {
    const zoneParts = zone.split(':', 2)
    zoneHost = zoneParts[0]
    zonePort = zoneParts[1]
    hasPort = zonePort !== undefined
  }
  zoneHost = formatHostname(zoneHost.replace(/^\[|\]$/g, ''))

  return { hostname: zoneHost, port: zonePort, hasPort }
}

function uriInNoProxy (uri, noProxy) {
  const port = uri.port || (uri.protocol === 'https:' ? '443' : '80')
  const hostname = formatHostname(uri.hostname.replace(/^\[|\]$/g, ''))
  const noProxyList = noProxy.split(',')

  // iterate through the noProxyList until it finds a match.
  return noProxyList.map(parseNoProxyZone).some(function (noProxyZone) {
    const isMatchedAt = hostname.indexOf(noProxyZone.hostname)
    const hostnameMatched = (
      isMatchedAt > -1 &&
        (isMatchedAt === hostname.length - noProxyZone.hostname.length)
    )

    if (noProxyZone.hasPort) {
      return (port === noProxyZone.port) && hostnameMatched
    }

    return hostnameMatched
  })
}

function getProxyFromURI (uri) {
  // Decide the proper request proxy to use based on the request URI object and the
  // environmental variables (NO_PROXY, HTTP_PROXY, etc.)
  // respect NO_PROXY environment variables (see: https://lynx.invisible-island.net/lynx2.8.7/breakout/lynx_help/keystrokes/environments.html)

  const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''

  // if the noProxy is a wildcard then return null

  if (noProxy === '*') {
    return null
  }

  // if the noProxy is not empty and the uri is found return null

  if (noProxy !== '' && uriInNoProxy(uri, noProxy)) {
    return null
  }

  // Check for HTTP or HTTPS Proxy in environment Else default to null

  if (uri.protocol === 'http:') {
    return process.env.http_proxy ||
      (!process.env.REQUEST_METHOD && process.env.HTTP_PROXY) || null
  }

  if (uri.protocol === 'https:') {
    return process.env.https_proxy || process.env.HTTPS_PROXY ||
      process.env.http_proxy || (!process.env.REQUEST_METHOD && process.env.HTTP_PROXY) || null
  }

  // if none of that works, return null
  // (What uri protocol are you using then?)

  return null
}

module.exports = getProxyFromURI
