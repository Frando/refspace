module.exports = { queue }

function queue () {
  let q = []
  let handler = q.push.bind(q)
  let push = msg => handler(msg)
  let length = () => q.length
  let take = fn => {
    q.forEach(msg => fn(msg))
    handler = msg => setImmediate(() => fn(msg))
  }
  return { push, take, length }
}