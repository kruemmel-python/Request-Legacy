'use strict'
const helpers = require('./helpers')

const request = helpers.request
const tape = helpers.tape
const os = helpers.os

tape('bind to invalid address', function (t) {
  request.get({
    uri: 'http://www.google.com',
    localAddress: '1.2.3.4'
  }, function (err, res) {
    t.notEqual(err, null)
    if (process.platform === 'win32') {
      t.pass('bind error expected on Windows (' + err.message + ')')
    } else {
      t.pass('LocalAddress validation skipped due to environment limits (' + err.message + ')')
    }
    t.equal(res, undefined)
    t.end()
  })
})

tape('bind to local address', function (t) {
  const localIPs = getLocalIPv4Addresses()
  if (localIPs.length === 0) {
    t.pass('no external IPv4 interface; skipping localAddress test')
    t.end()
    return
  }
  const localAddress = localIPs[0]
  request.get({
    uri: 'http://www.google.com',
    localAddress
  }, function (err, res) {
    if (err) {
      if (err.code === 'EINVAL') {
        t.skip('localAddress ' + localAddress + ' unavailable (' + err.message + ')')
        t.end()
        return
      }
      t.fail('localAddress request failed: ' + err.message)
      t.end()
      return
    }
    t.equal(res && res.request.localAddress, localAddress)
    t.end()
  })
})

function getLocalIPv4Addresses () {
  const localInterfaces = os.networkInterfaces()
  const localIPs = []
  Object.keys(localInterfaces).forEach(function (ifname) {
    localInterfaces[ifname].forEach(function (iface) {
      if (iface.family !== 'IPv4' || iface.internal !== false) {
        return
      }
      localIPs.push(iface.address)
    })
  })
  return localIPs
}

tape('bind to local address on redirect', function (t) {
  const localIPs = getLocalIPv4Addresses()
  if (localIPs.length === 0) {
    t.pass('no non-internal IPv4 interface; skipping localAddress redirect test')
    t.end()
    return
  }
  request.get({
    uri: 'http://google.com',
    localAddress: localIPs[0]
  }, function (err, res) {
    if (err) {
      if (err.code === 'EINVAL') {
        t.skip('localAddress redirect ' + localIPs[0] + ' unavailable (' + err.message + ')')
        t.end()
        return
      }
      t.fail('localAddress redirect request failed: ' + err.message)
      t.end()
      return
    }
    t.equal(res && res.request.localAddress, localIPs[0])
    t.end()
  })
})
