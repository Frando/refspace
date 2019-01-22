const generate = require('nanoid/generate')
const nolookalikes = require('nanoid-dictionary/nolookalikes');
const EventEmitter = require('events').EventEmitter
const { MapOfMaps } = require('./util/map')
const { prom, isPromise } = require('./util/async')

const nanoid = () => generate(nolookalikes, 8)

const REF = Symbol('ref')
const IS_REF = Symbol('is-ref')

class RefStore extends EventEmitter {
  constructor (id, opts) {
    super()
    this.store = new MapOfMaps() 
    this.peers = new Map()
    this.spaces = new Map()
    this.id = id || nanoid()
    this.cnt = 0
  }

  anonId () {
    return '' + this.id + ':' + ++this.cnt
  }

  add (value, opts) {
    let ref = getRef(value)
    if (ref && ref.peer && ref.peer !== this.id) return this.proxy(ref)
    return this.ref(value, opts)
  }

  ref (value, opts) {
    let ref = getRef(value)
    if (!ref) ref = makeRef(value)

    if (opts) ref = Object.assign({}, ref, opts)

    if (!ref.space) ref.space = '_'
    if (!ref.id) {
      if (ref.space.charAt(0) === '_') ref.id = this.anonId()
      else throw new Error('Id is required for non-local refs')
    }
    if (!ref.peer) ref.peer = this.id

    if (isObject(value)) value[REF] = ref

    // todo: this gives endless circles
    // value = this.makeProxy(ref)

    this._set(ref, value)
    return value
  }

  proxy (ref) {
    if (ref[REF]) ref = ref[REF]
    if (this.store.has(ref.space, ref.id)) return this.store.get(ref.space, ref.id)
    if (!this.peers.has(ref.peer)) throw new Error('Peer not found: ' + ref.peer)

    // if (ref.type === 'value') return ref.value
    if (ref.type === 'value') throw new Error('Cannot proxy value refs.')

    ref[IS_REF] = true

    let value
    if (ref.type === 'function') {
      value = (...args) => this.pushCall(ref, { args })
      value[REF] = ref
    } else if (ref.type === 'object') {
      value = this.makeProxy(ref)
    } else throw new Error('Unknown ref type: ' + ref.type)

    this._set(ref, value)
    return value
  }

  _set (ref, value) {
    this.store.set(ref.space, ref.id, value)
    this.emit('add', ref)
  }

  has (ref) {
    ref = getRef(ref)
    return this.store.has(ref.space, ref.id)
  }

  get (space, id) {
    return this.store.get(space, id)
  }

  resolve (ref) {
    ref = getRef(ref)
    if (!ref) throw new Error('No ref: ' + ref)
    if (!this.has(ref)) throw new Error('Cannot resolve ref: ' + ref)
    return this.get(ref.space, ref.id)
  }

  load (space, id) {
    if (this.store.has(space, id)) return this.store.get(space, id)
    if (!this.spaces.has(space)) throw new Error('No handler for space: ' + space)
    const handler = this.spaces.get(space)
    const object = handler.load(this, id)
    this.store.set(space, id, object)
    return object
  }

  addPeer (id, peer) {
    peer.onmessage(msg => {
      const { ref, method, args, from } = msg
      this.pushCall(ref, { method, args, from })
    })
    // peer.pushMessage({ ref: { peer: this.id }})
    this.peers.set(id, peer)
  }

  addSpace (name, handler) {
    this.spaces.set(name, handler)
  }

  shorten (ref) {
    ref = getRef(ref)
    return { space: ref.space, id: ref.id, peer: ref.peer }
  }

  localCall (ref, opts) {
    let obj = this.resolve(ref)
    ref = getRef(obj)

    let { method, args, from } = opts

    args = this.decodeArgs(args)

    let ret
    if (ref.type === 'function') ret = obj(...args)
    else if (ref.type === 'object') ret = obj[method](...args)
    else throw new Error('Cannot call ref: ' + ref)

    if (from) {
      Promise.resolve(ret).then(res => {
        this.pushCall(from, { args: [undefined, res], from: false })
      }).catch(err => {
        this.pushCall(from, { args: [err, undefined], from: false })
      })
    }
    return ret
  }

  // make a call
  // if ref is of type function method should be null
  // if ref is of type option method is required
  // the call may either be local or remote
  // from is undefined by default and res
  // returns a promise
  pushCall (ref, opts) {
    ref = getRef(ref) 
    // if (opts.args) opts.args = this.encodeArgs(args)

    if (ref.peer === this.id) return this.localCall(ref, opts)

    if (!this.peers.has(ref.peer)) throw new Error('Unknown peer: ' + ref.peer)
    const peer = this.peers.get(ref.peer)

    let { method, args, from } = opts
    args = this.encodeArgs(args)

    let promise, done
    if (from === undefined) {
      [promise, done] = prom()
      let doneRef = this.ref(done)
      from = this.shorten(doneRef)
    }

    ref = this.shorten(ref)

    let msg = { ref, method, args, from }

    peer.postMessage(msg)
    this.emit('call', msg)
    if (promise) return promise
  }

  encodeArgs (args) {
    if (!args || !args.length) return []
    return args.map(arg => {
      if (arg instanceof Error) throw arg // todo: how to deal with errors?
      if (hasRef(arg)) return { type: 'ref', ref: getRef(arg) }
      if (typeof arg === 'function') return { type: 'ref', ref: this.ref(arg)[REF]}
      return { type: 'value', value: arg }
    })
  }

  decodeArgs (args) {
    if (!args || !args.length) return []
    return args.map(arg => {
      if (arg.type === 'ref') return this.proxy(arg.ref)
      if (arg.type === 'value') return arg.value
      else throw new Error('Unkown arg type: ' + arg.type)
    })
  }

  makeProxy (ref) {
    const self = this

    let keys = [ ...Object.keys(ref.values), ...Object.keys(ref.methods)]
    let target = keys.reduce((ret, key) => {
      ret[key] = true
      return ret
    }, {})

    const handler = {
      get (target, prop) {
        if (prop === REF) return ref
        if (ref.values[prop]) return ref.values[prop]
        if (ref.methods[prop]) return (...args) => self.pushCall(ref, { args, method: prop })
      },
      set () {},
      ownKeys (target) {
        return keys
      },
      getOwnPropertyDescriptor (target, prop) {
        let ret = { configurable: true, enumerable: true, writable: false }
        if (ref.values[prop]) ret.value = ref.values[prop]
        else ret.value = () => {}
        return ret
      },
      has (ref, key) {
        return key in target
      }
    }

    return new Proxy(target, handler)
  }

  log (value) {
    const logger = console.log
    const ref = getRef(value)
    if (!ref) logger('Not a ref: %s', value)
    const keys = val => isObject(val) ? Object.keys(val).join(', ') : val 
    const { space, id, peer, methods, values, type } = ref
    logger('Ref: %s %s (peer %s)', space, id, peer)
    logger('  TYPE %s VALUES %s METHODS %o', type, keys(values), keys(methods))
  }
}

function refstore (id) {
  return new RefStore(id)
}

refstore.REF = REF
refstore.RefStore = RefStore

module.exports = refstore

function isObject (value) {
  return value instanceof Object
}

function hasRef (value) {
  return isObject(value) && value[REF]
}

function getRef (value) {
  if (!isObject(value)) return undefined
  if (value[IS_REF]) return value
  if (value[REF]) return value[REF]
  if (value.space && value.id) return value
  return false
}

function makeRef (value, opts) {
  opts = opts || {}
  switch (typeof value) {
    case 'function': return functionRef(value, opts)
    case 'object': return objectRef(value, opts)
    default: return valueRef(value, opts)
  }
}

function emptyRef (type) { 
  return { [IS_REF]: true, type }
}
// todo: check for evil values?
function valueRef (value, opts) {
  let ref = opts.ref || emptyRef('value')
  return { ...ref, value }
}

function functionRef (fn, opts) {
  let ref = opts.ref || emptyRef('function')
  return { ...ref, type: 'function' }
}

function objectRef (value, opts) {
  const { methods = true, values = true } = opts

  let ref = opts.ref || emptyRef('object')
  ref.methods = {}
  ref.values = {}

  const includes = (obj, key) => (
    obj === true
    || (Array.isArray(obj) && obj.indexOf(key) > -1)
    || (isObject(obj) && obj[key])
  )

  Object.keys(value).forEach(key => {
    if (typeof value[key] === 'function' && includes(methods, key)) {
      ref.methods[key] = true
    } else if (includes(values, key)) {
      ref.values[key] = values[key]
    }
  })

  return ref
}
