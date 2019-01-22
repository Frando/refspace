# refspace

A ref is a reference to a value. A value is either a primitive, a function or an object. An object has values and methods. A *refspace* holds values with attached ref objects. A *refspace* can be connected to another refspace, which allows the other to call all methods on object refs. The transport bus is pluggable.

```javascript
const value = {
  id: 'db-1',
  query: (question) => 'Dont know about ' + question.toUpperString()
}

const worker = refspace()
const ui = refspace()

const workerT = streambus()
const uiT = streambus()

// these are all binary streams.
pump(workerT.stream, uiT.stream)
pump(uiT.stream, workerT.stream)

const workerRef = worker.ref(value)
const screenRef = screen.proxy(workerRef)

worker.addPeer(screen.id, workerT)
screen.addPeer(worker.id, screenT)

const res = await screenRef.query('gossip')
console.log(res)
```


