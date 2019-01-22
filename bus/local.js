const EventEmitter = require('events').EventEmitter

module.exports = function localBus (peer1, peer2) {
  let _a = new EventEmitter()
  let _b = new EventEmitter()

  let a = {
    postMessage: msg => _b.emit('message', msg),
    onmessage: (fn) => _a.on('message', fn)
  }
  let b = {
    postMessage: msg => _a.emit('message', msg),
    onmessage: (fn) => _b.on('message', fn)
  }

  if (peer1 && peer2) {
    peer1.addPeer(peer2.id, a)
    peer2.addPeer(peer1.id, b)
  }

  return [a, b]
}