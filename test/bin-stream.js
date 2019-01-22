const tape = require('tape')
const refspace = require('..')
const streambus = require('../bus/stream')
const localbus = require('../bus/local')
const pump = require('pump')
const stream = require('stream')

function make2 () {
  const p1 = refspace()
  const p2 = refspace()
  
  const s1 = streambus()
  const s2 = streambus()

  pump(s1.stream, s2.stream)
  pump(s2.stream, s1.stream)

  p1.addPeer(p2.id, s2)
  p2.addPeer(p1.id, s1)

  return [p1, p2]
}

tape('streaming', async t => {
  const [p1, p2] = make2()

  let val = {
    id: 'foo',
    hi: async m => 'hi, ' + m.toUpperCase()
  }

  let ref = p1.ref(val)
  let proxy = p2.proxy(val)
  
  let res = await proxy.hi('alice')
  t.equal(res, 'hi, ALICE', 'matches')

  let buf = Buffer.from('buh!')
  let bufval = {
    foo: () => Buffer.from(buf)
  }
  ref = p2.ref(bufval)
  proxy = p1.proxy(ref)
  res = await proxy.foo()
  t.equal(Buffer.isBuffer(res), true, 'buffer is returned as buffer')
  t.deepEqual(res, buf, 'buffers match')
  t.end()
})

tape('read stream', async t => {
  function reader (str) {
    var i = 0
    return function () {
      if (i < 3) this.push(str + i)
      else this.push(null)
      i++
    }
  }

  var api = {
    rs: async (str, cb) => {
      var rs = new stream.Readable({
        objectMode: true,
        read: reader(str)
      })
      // return rs
      cb(null, rs)
    }
  }

  const [a, b] = make2()
  let ref = a.add(api)
  let remote = b.add(ref)
  // let rs = await remote.rs('foo')

  remote.rs('foo', (err, rs) => {
    t.equal(err, null)
    var i = 0
    rs.on('data', (data) => {
      t.equal(data, 'foo' + i)
      i++
    })
    rs.on('end', () => {
      t.equal(i, 3)
      t.end()
    })
  })

})
