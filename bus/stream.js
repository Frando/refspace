const multiplex = require('multiplex')
const duplexify = require('duplexify')
const through = require('through2')
const pump = require('pump')
const msgpack = require('msgpack-lite')
const nanoid = require('nanoid')

var READABLE = 1 // 10
var WRITABLE = 2 // 01
// var DUPLEX = 1 | 2 // 11

module.exports = function streamBus (opts) {
  opts = opts || {}
  opts.id = opts.id || nanoid()
  // const objectMode = opts.objectMode || false
  const stream = multiplex({ objectMode: false }, onstream)

  let transports = new Map()

  let queue = []
  let receiveMessage = queue.push.bind(queue)

  var rpc = stream.createSharedStream('rpc')

  var send = through.obj(function (chunk, enc, next) {
    chunk = encode(chunk)
    // chunk = JSON.stringify(chunk)
    chunk = msgpack.encode(chunk)
    this.push(chunk)
    next()
  })
  var recv = through.obj(function (chunk, enc, next) {
    // chunk = JSON.parse(chunk)
    chunk = msgpack.decode(chunk)
    chunk = decode(chunk)
    this.push(chunk)
    next()
  })

  pump(send, rpc)
  pump(rpc, recv)

  recv.on('data', data => receiveMessage(data))

  return {
    onmessage: fn => { 
      if (queue.length) queue.forEach(msg => fn(msg))
      receiveMessage = msg => fn(msg)
    },
    postMessage: msg => send.write(msg),
    stream
  }

  function onstream (stream, name) {
    transports.set(name, stream)
  }

  function getTransportStream (id, type) {
    var sid = `${id}-${type}`
    if (!transports[sid]) transports[sid] = stream.createSharedStream(sid)
    return transports[sid]
  }

  function encode (msg) {
    if (msg.args) msg.args = msg.args.map(arg => {
        // if (isBuffer(arg)) // handled by msgpack
        if (isStream(arg.value)) {
          const id = nanoid()
          // const id = msg.ref.space + '-' + msg.ref.id
          arg.value = prepareStream(arg.value, id)
          arg.valuetype = 'stream'
          arg.valueid = id
        }
        return arg
      })
    return msg
  }

  function decode (msg) {
    if (msg.args) msg.args = msg.args.map(arg => {
        if (arg.valuetype === 'stream') {
          // const id = msg.ref.space + '-' + msg.ref.id
          const stream = resolveStream(arg.value, arg.valueid)
          delete arg.valuetype
          delete arg.valueid
          arg.value = stream
        }
        return arg
      })
    
    return msg
  }

  function prepareStream (stream, id) {
    var streamType = getStreamType(stream)
    var objectMode = isObjectStream(stream)

    if (streamType & READABLE) {
      var rsT = getTransportStream(id, READABLE, stream)
      pump(stream, maybeConvert(objectMode, false), rsT)
    }
    if (streamType & WRITABLE) {
      var wsT = getTransportStream(id, WRITABLE, stream)
      pump(wsT, maybeConvert(false, objectMode), stream)
    }

    return { streamType, objectMode }
  }

  function resolveStream (arg, id) {
    var { streamType, objectMode } = arg
    var ds = objectMode ? duplexify.obj() : duplexify()

    if (streamType & READABLE) {
      var rs = through({ objectMode })
      var rsT = getTransportStream(id, READABLE, rs)
      pump(rsT, maybeConvert(false, objectMode), rs)
      ds.setReadable(rs)
    }
    if (streamType & WRITABLE) {
      var ws = through({ objectMode })
      var wsT = getTransportStream(id, WRITABLE, ws)
      pump(ws, maybeConvert(objectMode, false), wsT)
      ds.setWritable(ws)
    }

    return ds
  }
}

function isStream (obj) {
  return isObject(obj) && obj && (obj._readableState || obj._writableState)
}

function isReadable (obj) {
  return isStream(obj) && typeof obj._read === 'function' && typeof obj._readableState === 'object'
}

function isWritable (obj) {
  return isStream(obj) && typeof obj._write === 'function' && typeof obj._writableState === 'object'
}

function isTransform (obj) {
  return isStream(obj) && typeof obj._transform === 'function' && typeof obj._transformState === 'object'
}

function isObjectStream (stream) {
  if (isWritable(stream)) return stream._writableState.objectMode
  if (isReadable(stream)) return stream._readableState.objectMode
}

function isBuffer (buf) {
  return Buffer.isBuffer(buf)
}

function getStreamType (stream) {
  var type = 0

  // Special handling for transform streams. If it has no pipes attached,
  // assume its readable. Otherwise, assume its writable. If this leads
  // to unexpected behaviors, set up a duplex stream with duplexify and
  // use either setReadable() or setWritable() to only set up one end.
  if (isTransform(stream)) {
    if (typeof stream._readableState === 'object' && !stream._readableState.pipes) {
      return READABLE
    } else {
      return WRITABLE
    }
  }

  if (isReadable(stream)) type = type | READABLE
  if (isWritable(stream)) type = type | WRITABLE

  return type
}

function pass (objectMode) {
  return through({objectMode})
}

function toObj () {
  return through.obj(function (chunk, enc, next) {
    this.push(JSON.parse(chunk))
    next()
  })
}

function toBin () {
  return through.obj(function (chunk, enc, next) {
    this.push(JSON.stringify(chunk))
    next()
  })
}

function maybeConvert (oneInObjMode, twoInObjMode) {
  if (oneInObjMode && !twoInObjMode) return toBin()
  if (!oneInObjMode && twoInObjMode) return toObj()
  if (oneInObjMode && twoInObjMode) return pass(true)
  if (!oneInObjMode && !twoInObjMode) return pass(false)
}

function isObject (obj) {
  return (typeof obj === 'object')
}
