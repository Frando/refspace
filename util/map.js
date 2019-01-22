class MapOfSets {
  constructor () {
    this.map = new Map()
  }

  add (key, value) {
    this.map.set(key, this.get(key).add(value))
  }

  delete (key, value) {
    if (!this.map.has(key)) return
    this.map.set(key, this.map.get(key).delete(value))
  }

  deleteAll (key) {
    this.map.delete(key)
  }

  get (key) {
    return this.map.has(key) ? this.map.get(key) : new Set()
  }

  has (key, value) {
    return this.map.get(key).has(value)
  }

  hasKey (key) {
    return this.map.has(key)
  }
}

class MapOfMaps {
  constructor() {
    this.map = new Map()
  }

  has (key1, key2) {
    if (!this.map.has(key1)) return false
    return this.map.get(key1).has(key2)
  }

  get (key1, key2) {
    if (key2 === undefined) return this.map.get(key1)
    if (!this.map.has(key1)) return undefined
    return this.map.get(key1).get(key2)
  }

  set (key1, key2, value) {
    if (!this.map.has(key1)) this.map.set(key1, new Map())
    this.map.get(key1).set(key2, value)
  }

  delete (key1, key2) {
    if (!this.map.has(key1)) return
    this.map.get(key1).delete(key2)
  }

  deleteAll (key1) {
    this.map.delete(key1)
  }
}

module.exports = {
  MapOfSets,
  MapOfMaps
}
