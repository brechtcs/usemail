var { SMTPServer } = require('smtp-server')
var { simpleParser } = require('mailparser')
var Emitter = require('events')
var assert = require('assert')
var maybe = require('call-me-maybe')
var promise = require('await-callback')

var CONTEXTS = Symbol('Usemail context')
var DONE = Symbol('done')
var ERROR = Symbol('error')
var HANDLERS = Symbol('Usemail handlers')
var PHASE = Symbol('phase')
var SERVER = Symbol('SMTP server')
var STREAM = Symbol('SMTP stream')
var TCP = Symbol('TCP server')

class UsemailContext {
  constructor () {
    this[DONE] = false
    this[PHASE] = 'from'
  }

  end () {
    this[DONE] = true
  }

  get done () {
    return this[DONE]
  }

  get externalError () {
    return this[ERROR] ? new Error('Something went wrong') : null
  }

  get internalError () {
    return this[ERROR] || null
  }

  get phase () {
    return this[PHASE]
  }

  get stream () {
    return this[STREAM]
  }
}

class Usemail extends Emitter {
  constructor (opts) {
    super()
    this.opts = opts || {}

    this[CONTEXTS] = new WeakMap()
    this[HANDLERS] = {
      from: [],
      to: [],
      data: []
    }
  }

  close () {
    if (this[SERVER]) {
      return promise(done => this[SERVER].close(done))
    }
  }

  from (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this[HANDLERS].from.push(fn)
  }

  to (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this[HANDLERS].to.push(fn)
  }

  use (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this[HANDLERS].data.push(fn)
  }

  listen (port, cb) {
    var settings = Object.assign({}, this.opts)
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
  async onMailFrom (addr, session, done) {
    var context, handler
    context = new UsemailContext()
    this[CONTEXTS].set(session, context)
    this.emit('from', session, context)

    for await (handler of this[HANDLERS].from) {
      try {
        await handler.call(this, addr, session, context)
        if (context.done) break
      } catch (err) {
        context[ERROR] = err
        break
      }
    }

    done(context.externalError)
  }

  async onRcptTo (addr, session, done) {
    var context, handler
    context = this[CONTEXTS].get(session)
    context[PHASE] = 'to'
    this.emit('to', session, context)

    for await (handler of this[HANDLERS].to) {
      try {
        await handler.call(this, addr, session, context)
        if (context.done) break
      } catch (err) {
        context[ERROR] = err
        break
      }
    }

    done(context.externalError)
  }

  async onData (stream, session, done) {
    var context, handler
    context = this[CONTEXTS].get(session)
    context[PHASE] = 'data'
    context[STREAM] = stream

    for await (handler of this[HANDLERS].data) {
      try {
        await handler.call(this, session, context)
        if (context.done) break
      } catch (err) {
        context[ERROR] = err
        break
      }
    }

    // Stream must be fully consumed to end request
    for await (var chunk of stream) {} // eslint-disable-line

    context.end()
    this.emit('bye', session, context)
    done(context.externalError)
  }

  onClose (session) {
    var context = this[CONTEXTS].get(session)
    if (context.done) return
    context.end()
    this.emit('bye', session, context)
  }
}

function parse (opts) {
  return async function parser (session, ctx) {
    var data = await simpleParser(ctx.stream, opts)

    Object.defineProperty(ctx, 'data', {
      value: data,
      enumerable: true
    })
  }
}

function factory (opts) {
  return new Usemail(opts)
}

module.exports = factory
module.exports.parse = parse
module.exports.Usemail = Usemail
