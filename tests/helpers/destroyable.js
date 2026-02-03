'use strict'

module.exports = function destroyable (server) {
  if (!server || server.__destroyable) {
    return server
  }

  server.__destroyable = true
  const connections = new Set()

  server.on('connection', function (conn) {
    connections.add(conn)
    conn.on('close', function () {
      connections.delete(conn)
    })
  })

  server.destroy = function (callback) {
    const done = typeof callback === 'function' ? callback : function () {}
    try {
      server.close(function (err) {
        done(err)
      })
    } catch (err) {
      done(err)
    }

    connections.forEach(function (conn) {
      try {
        conn.destroy()
      } catch {
        // ignore destroy errors
      }
    })
  }

  return server
}
