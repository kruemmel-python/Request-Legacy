'use strict'

module.exports = function isStream (value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.on === 'function' &&
    typeof value.pipe === 'function'
  )
}
