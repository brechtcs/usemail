var { SMTPServer } = require('smtp-server')
var { simpleParser } = require('mailparser')
var Emitter = require('events')
var UsemailSession = require('./lib/session')
var assert = require('assert')
var maybe = require('call-me-maybe')
var promise = require('await-callback')
var prop = require('stdprop')

var CLOSED = Symbol('Closed sessions')
var SERVER = Symbol('SMTP server')
var TCP = Symbol('TCP server')

class Usemail extends Emitter {
  constructor (opts) {
    super()

    this.opts = opts || {}
    this.handlers = {
      connect: [],
      from: [],
      to: [],
      use: []
    }

    prop(this, CLOSED, new WeakSet())
  }

  close () {
    if (this[SERVER]) {
      return promise(done => this[SERVER].close(done))
    }
  }

  connect (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this.handlers.connect.push(fn)
  }

  from (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this.handlers.from.push(fn)
  }

  to (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this.handlers.to.push(fn)
  }

  use (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this.handlers.use.push(fn)
  }

  listen (port, cb) {
    var settings = Object.assign({}, this.opts)
    settings.onConnect = this.onConnect.bind(this)
    settings.onMailFrom = this.onMailFrom.bind(this)
    settings.onRcptTo = this.onRcptTo.bind(this)
    settings.onData = this.onData.bind(this)
    settings.onClose = this.onClose.bind(this)

    var server = new SMTPServer(settings)
    var p = promise(done => {
      this[SERVER] = server
      this[TCP] = server.listen(port, done)
    })

    return maybe(cb, p)
  }

  get address () {
    var addr = this[TCP] && this[TCP].address()
    return addr && addr.address
  }

  get port () {
    var addr = this[TCP] && this[TCP].address()
    return addr && addr.port
  }

  get server () {
    return this[SERVER]
  }

  /**
   * SMTP handlers:
   */
  async onConnect (session, done) {
    var context, handler
    context = UsemailSession.for(session)
    context.phase = 'connect'
    this.emit('connect', context)

    for await (handler of this.handlers.connect) {
      try {
        if (context.phase !== 'connect') break
        await handler.call(this, context)
      } catch (err) {
        context.end(err)
        break
      }
    }

    done(context.clientError)
  }

  async onMailFrom (addr, session, done) {
    var context, handler
    context = UsemailSession.for(session)
    context.phase = 'from'
    this.emit('from', addr, context)

    for await (handler of this.handlers.from) {
      try {
        if (context.phase !== 'from') break
        await handler.call(this, context, addr)
      } catch (err) {
        context.end(err)
        break
      }
    }

    done(context.clientError)
  }

  async onRcptTo (addr, session, done) {
    var context, error, handler
    context = UsemailSession.for(session)
    context.phase = 'to'
    this.emit('to', addr, context)

    for await (handler of this.handlers.to) {
      try {
        if (context.phase !== 'to') break
        await handler.call(this, context, addr)
      } catch (err) {
        error = new Error('Something went wrong')
        break
      }

      if (context.serverError) {
        error = context.clientError
        context.fail(null, true)
        break
      }
    }

    done(error)
  }

  async onData (stream, session, done) {
    var context, handler
    context = UsemailSession.for(session)
    context.phase = 'use'

    for await (handler of this.handlers.use) {
      try {
        if (context.phase !== 'use') break
        await handler.call(this, context, stream)
      } catch (err) {
        context.end(err)
        break
      }
    }

    // Stream must be fully consumed to end request
    for await (var chunk of stream) {} // eslint-disable-line

    context.end()
    this.emit('bye', context)
    this[CLOSED].add(session)
    done(context.clientError)
  }

  onClose (session) {
    if (this[CLOSED].has(session)) return
    this.emit('bye', UsemailSession.for(session))
  }
}

function parse (opts) {
  return async function parser (session, stream) {
    var data = await simpleParser(stream, opts)
    var token = Math.random()
    Object.keys(data).forEach(prop => session.set(prop, data[prop], token))
  }
}

function factory (opts) {
  return new Usemail(opts)
}

module.exports = factory
module.exports.parse = parse
module.exports.Usemail = Usemail
