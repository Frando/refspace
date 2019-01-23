const tape = require('tape')
const { prom } = require('../util/async')

const refspace = require('..')
const localBus = require('../bus/local')

const { REF } = refspace

function make2 () {
  const p1 = refspace()
  const p2 = refspace()

  localBus(p1, p2)

  const [promise, done] = prom()
  let i = 0

  p1.on('peer', finish)
  p2.on('peer', finish)

  return promise
  
  function finish (p) {
    if (++i === 2) done(null, [p1, p2])
  }
}

tape('refspace basics', async t => {
  const [server, client] = await make2()

  const value = {
    id: 'db',
    query: async question => {
      console.log('hi!')
      return 'I dunno ' + question.toUpperCase()
    }
  }

  let ref = server.ref(value)
  server.log(value)
  // t.equal(await ref.query('foo'), 'I dunno FOO', 'local call works')

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

  // crazy function object back and forth
  client.ref({
    log: async obj => {
      let id
      if (typeof obj.id === 'function') id = await obj.id()
      else id = obj.id
      return 'log: ' + id
    }
  }, { space: 'api', id: 'log' })
  const log = client.get('api', 'log').log
  let wantLog = server.ref({
    wantLog: (log, value) => log(value)
  }, { space: 'api', id: 'wantLog' })

  ref = client.proxy(wantLog)

  let wantLogProxy = client.get('api', 'wantLog').wantLog
  res = await wantLogProxy(log, { id: 'foo' })
  t.equal(res, 'log: foo')
  let val = server.ref({ id: async () => 'baz' })
  let valp = client.proxy(val)
  res = await wantLogProxy(log, valp)
  t.equal(res, 'log: baz')



  t.end()
})
