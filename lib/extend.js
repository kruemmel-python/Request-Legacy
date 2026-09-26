'use strict'

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function isPlainObject (value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function assignValue (target, key, value, deep) {
  if (BLOCKED_KEYS.has(key)) {
    return
  }

  if (!deep || (!Array.isArray(value) && !isPlainObject(value))) {
    target[key] = value
    return
  }

  if (Array.isArray(value)) {
    const base = Array.isArray(target[key]) ? target[key] : []
    target[key] = merge(true, base, value)
    return
  }

  const base = isPlainObject(target[key]) ? target[key] : Object.create(null)
  target[key] = merge(true, base, value)
}

function merge () {
  let deep = false
  let index = 0

  if (typeof arguments[0] === 'boolean') {
    deep = arguments[0]
    index = 1
  }

  let target = arguments[index]
  index += 1

  if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
    target = {}
  }

  for (; index < arguments.length; index += 1) {
    const source = arguments[index]
    if (source === null || typeof source === 'undefined') {
      continue
    }

    Object.keys(Object(source)).forEach(function (key) {
      assignValue(target, key, source[key], deep)
    })
  }

  return target
}

module.exports = merge
