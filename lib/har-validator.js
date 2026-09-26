'use strict'

function isObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber (value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringPairArray (value, extraValidator) {
  if (!Array.isArray(value)) {
    return false
  }

  return value.every(function (entry) {
    if (!isObject(entry) || typeof entry.name !== 'string') {
      return false
    }

    if (entry.value !== undefined && typeof entry.value !== 'string') {
      return false
    }

    return !extraValidator || extraValidator(entry)
  })
}

function isValidPostDataParam (param) {
  if (param.fileName !== undefined && typeof param.fileName !== 'string') {
    return false
  }

  if (param.contentType !== undefined && typeof param.contentType !== 'string') {
    return false
  }

  return true
}

function request (har) {
  if (!isObject(har)) {
    return false
  }

  if (typeof har.method !== 'string' || har.method.length === 0) {
    return false
  }

  if (typeof har.url !== 'string' || har.url.length === 0) {
    return false
  }

  if (typeof har.httpVersion !== 'string' || har.httpVersion.length === 0) {
    return false
  }

  if (!isStringPairArray(har.cookies)) {
    return false
  }

  if (!isStringPairArray(har.headers)) {
    return false
  }

  if (!isStringPairArray(har.queryString)) {
    return false
  }

  if (!isFiniteNumber(har.headersSize) || !isFiniteNumber(har.bodySize)) {
    return false
  }

  if (!isObject(har.postData) || typeof har.postData.mimeType !== 'string') {
    return false
  }

  if (har.postData.text !== undefined && typeof har.postData.text !== 'string') {
    return false
  }

  if (har.postData.params !== undefined &&
      !isStringPairArray(har.postData.params, isValidPostDataParam)) {
    return false
  }

  if (har.postData.size !== undefined && !isFiniteNumber(har.postData.size)) {
    return false
  }

  return true
}

module.exports = {
  request
}
