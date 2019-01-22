const refspace = require('.')
const localBus = require('./bus/local')

const value = {
  id: 'db-1',
  query: async q => 'Dunno about ' + q.toUpperCase()
}

const worker = refspace()
const screen = refspace()

localBus(worker, screen)

const workerRef = worker.ref(value)
const screenRef = screen.proxy(workerRef)

screenRef.query('gossip')
  .then(res => console.log(res))
