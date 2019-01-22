module.exports = {
  asyncThunky,
  prom,
  isPromise
}

/**
 * An async wrapper for thunky
 *
 * Usage:
 * let ready = asyncThunky(_ready)
 *
 * Where _ready receives a callback as single argument
 * which has to be called after being done.
 *
 * Then, either call ready with a callback
 *    ready(cb)
 * or await it
 *    await ready()
 */
function asyncThunky (fn) {
  let thunk = thunky(fn)
  return function (cb) {
    if (cb) thunk(cb)
    else {
      return new Promise((resolve, reject) => {
        thunk(err => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }
}

function prom (cb) {
  let done
  const promise = new Promise((resolve, reject) => {
    done = (err, data) => {
      err ? reject(err) : resolve(data)
      if (cb) cb()
    }
  })
  return [promise, done]
}

function isPromise (obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function'
}
