const nanoid = require('nanoid')
const EventEmitter = require('events').EventEmitter
const { MapOfMaps } = require('./util/map')
const { prom, isPromise } = require('./util/async')

const REF = Symbol('ref')
const IS_REF = Symbol('is-ref')

class RefStore extends EventEmitter {
  constructor (id) {
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

  ref (object, specs) {
    let ref
    if (object[REF]) ref = object[REF]
    else ref = defaultRef(object)

    if (specs) ref = Object.assign({}, ref, specs)

    if (!ref.space || !ref.id) {
      ref.space = '_anon'
      ref.id = this.anonId()
    }

    ref.peer = this.id

    object[REF] = ref

    this.store.set(ref.space, ref.id, object)
    this.emit('add', ref)
    return object
  }

  proxy (ref) {
    if (ref[REF]) ref = ref[REF]
    if (this.store.has(ref.space, ref.id)) return this.store.get(ref.space, ref.id)
    if (!this.peers.has(ref.peer)) throw new Error('Peer not found: ' + ref.peer)

    if (ref.type === 'value') return ref.value

    ref[IS_REF] = true
    let value
    if (ref.type === 'function') {
      value = (...args) => this.pushCall(ref, null, args)
      value[REF] = ref
    } else if (ref.type === 'object') {
      value = this.makeProxy(ref)
    } else throw new Error('Unknown ref type: ' + ref.type)

    this.store.set(ref.space, ref.id, value)
    this.emit('add', ref)
    return value
  }

  get (space, id) {
    if (this.store.has(space, id)) return this.store.get(space, id)
    return undefined
  }

  resolve (ref) {
    if (!this.store.has(ref.space, ref.id)) throw new Error('Cannot resolve ref: ' + JSON.stringify(ref))
    return this.store.get(ref.space, ref.id)
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
      this.pushCall(ref, method, args, from)
    })
    this.peers.set(id, peer)
  }

  addSpace (name, handler) {
    this.spaces.set(name, handler)
  }

  shorten (ref) {
    if (ref[REF]) ref = ref[REF]
    return { space: ref.space, id: ref.id, peer: ref.peer }
  }

  pushCall (ref, method, args, from) {
    if (ref.peer === this.id) {
      let obj = this.resolve(ref)
      args = this.decodeArgs(args)
      let type = obj[REF].type
      let ret
      if (type === 'function') {
        ret = obj(...args)
      } else if (type === 'object') {
        ret = obj[method](...args)
      }
      // let ret = type === 'function' ? obj(...args) : obj[method](...args)
      if (isPromise(ret) && from) {
        ret.then(res => {
          this.pushCall(from, null, [undefined, res], false)
        }).catch(err => {
          this.pushCall(from, null, [err, undefined], false)
        })
      }
      return ret
    }

    if (!this.peers.has(ref.peer)) throw new Error('Unknown peer: ' + ref.peer)
    const peer = this.peers.get(ref.peer)

    let promise, done
    if (from === undefined) {
      [promise, done] = prom()
      let doneRef = this.ref(done)
      from = this.shorten(doneRef)
    }

    ref = this.shorten(ref)
    args = this.encodeArgs(args)

    let msg = { ref, from, method, args }

    peer.postMessage(msg)

    this.emit('call', msg)
    if (promise) return promise
  }

  encodeArgs (args) {
    if (!args || !args.length) return []
    return args.map(arg => {
      if (arg instanceof Error) throw arg // todo: how to deal with errors?
      if (arg instanceof Object && arg[REF]) return { type: 'ref', ref: arg[REF] }
      else if (typeof arg === 'function') return { type: 'ref', ref: this.ref(arg)[REF]}
      else return { type: 'value', value: arg }
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
      apply (target, thisArg, args) {
        if (typeof ref !== 'function') return undefined
        return self.pushCall(ref, prop, args)
      },
      get (target, prop) {
        if (prop === REF) return ref
        if (ref.values[prop]) return ref.values[prop]
        if (ref.methods[prop]) return (...args) => self.pushCall(ref, prop, args)
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
}

RefStore.REF = REF
RefStore.logRef = logRef

module.exports = RefStore

function makeRef () { 
  return { [IS_REF]: true }
}

function defaultRef (value) {
  let ref = makeRef()
  if (typeof value === 'function') ref.type = 'function'
  else if (typeof value !== 'object') ref.type = 'value'
  else {
    ref = { type: 'object', values: {}, methods: {} }
    Object.keys(value).forEach(key => {
      if (typeof value[key] === 'function') ref.methods[key] = true
      else ref.values[key] = value[key]
    })
  }
  return ref
}

function logRef (object) {
  let ref
  if (object[IS_REF]) ref = object
  if (object[REF]) ref = object[REF]
  const { id, space, peer, methods, values, type } = ref
  console.log('Ref: %s %s (peer %s)', space, id, peer)
  console.log('  type %s values %o methods %o', type, values, methods ? Object.keys(methods) : null)
}
