const tape = require('tape')
const { prom } = require('../util/async')

const refstore = require('..')
const localBus = require('../bus/local')

const { REF, RefStore, logRef } = refstore

function make2 () {
  const p1 = new RefStore()
  const p2 = new RefStore()
  const [a, b] = localBus()
  p1.addPeer(p2.id, a)
  p2.addPeer(p1.id, b)
  return [p1, p2]
}

tape('refstore basics', async t => {
  const [server, client] = make2()

  const value = {
    id: 'db',
    query: async question => {
      console.log(question)
      return 'I dunno ' + question.toUpperCase()
    }
  }

  let ref = server.ref(value)
  server.log(value)
  t.equal(await ref.query('foo'), 'I dunno FOO', 'local call works')

  client.proxy(ref)
  let db = client.resolve(ref)
  let res = await db.query('power')
  t.equal(res, 'I dunno POWER', 'remote call works')

  const valueSync = {
    query: q => q.toUpperCase()
  }
  ref = server.ref(valueSync)
  let p = client.proxy(ref)
  res = await p.query('foo')
  t.equal(res, 'FOO', 'yep')

  t.end()
})
