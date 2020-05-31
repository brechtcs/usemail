var Opt = require('stdopt')
var prop = require('stdprop')

var DATA = Symbol('data')
var ERR_CLIENT = Symbol('clientError')
var ERR_SERVER = Symbol('serverError')
var PHASE = Symbol('phase')
var TOKENS = Symbol('tokens')

var store = new WeakMap()

class UsemailSession {
  constructor (raw) {
    this[PHASE] = 'connect'
    this[DATA] = new Map()
    this[TOKENS] = new Map()
    this[ERR_CLIENT] = null
    this[ERR_SERVER] = null

    prop(this, 'id', raw.id, 'e')
    prop(this, 'envelope', raw.envelope, 'e')
    prop(this, 'remoteAddress', raw.remoteAddress, 'e')
    prop(this, 'remoteHost', raw.hostNameAppearsAs, 'e')
    prop(this, 'transmissionType', raw.transmissionType, 'e')
    prop(this, 'user', raw.user, 'e')
    prop(this, 'raw', raw)
  }

  static for (raw) {
    if (store.has(raw)) {
      return store.get(raw)
    }
    var session = new UsemailSession(raw)
    store.set(raw, session)
    return session
  }

  end (err, clientErr) {
    if (err) this.fail(err, clientErr)
    this.phase = 'done'
  }

  fail (err, clientErr) {
    clientErr = clientErr || new Error('Something went wrong')
    this[ERR_SERVER] = err
    this[ERR_CLIENT] = clientErr === true ? err : clientErr
  }

  get (key) {
    return this[DATA].get(key)
  }

  has (key) {
    return this[DATA].has(key)
  }

  set (key, value, token) {
    if (token === true) this[TOKENS].set(key, Math.random())
    if (token) this[TOKENS].set(key, token)
    if (this[TOKENS].get(key) !== token) return
    this[DATA].set(key, value)
  }

  get from () {
    return this.envelope.mailFrom.address
  }

  get to () {
    return this.envelope.rcptTo.map(to => to.address)
  }

  get phase () {
    return this[PHASE]
  }

  set phase (phase) {
    this[PHASE] = new Phase(phase).catch('Invalid phase for UsemailSession').value()
  }

  get clientError () {
    return this[ERR_CLIENT]
  }

  get serverError () {
    return this[ERR_SERVER]
  }
}

class Phase extends Opt {
  static parse (phase) {
    if (phase === 'data') return 'use'
    if (this.phases.includes(phase)) {
      return phase
    }
  }

  static get phases () {
    return ['connect', 'from', 'to', 'use', 'done']
  }
}

module.exports = UsemailSession
