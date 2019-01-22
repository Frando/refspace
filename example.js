const RefStore = require('./RefStore')
const EventEmitter = require('events').EventEmitter

const { REF } = RefStore

const server = new RefStore()
const client = new RefStore()

const [a, b] = localRemotes()

server.addPeer(client.id, a)
client.addPeer(server.id, b)

// client.on('call', (msg) => console.log('CLIENT pushCall', msg))
// server.on('call', (msg) => console.log('SERVER pushCall', msg.args))

client.on('add', (ref) => console.log('client add', ref, client.resolve(ref)))
server.on('add', (ref) => console.log('server add', ref, server.resolve(ref)))

const serverArchive = {
  id: 'a-first-archive',
  title: 'First archive!',
  async print (msg) {
    console.log('The server prints it: "' + msg + '" , says [' + this.title + ']')
    return (foo) => console.log(foo.toUpperCase())
    return server.ref({ foo: 'bar', boom: (archive) => console.log('BOOM!', archive.title)}, {
      space: 'boom',
      id: 9,
    })
  }
}

let root = server.ref(serverArchive, {
  space: 'api',
  id: 'root'
})

async function start () {
  client.proxy(root[REF])
  let api = client.get('api', 'root')
  let boomer = await api.print('im outta here!')
  console.log(boomer)
  boomer('hi')
  // boomer.boom(api)
}

start()


function localRemotes () {
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
  return [a, b]
}