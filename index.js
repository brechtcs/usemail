var { SMTPServer } = require('smtp-server')
var { simpleParser } = require('mailparser')
var Emitter = require('events')
var assert = require('assert')
var maybe = require('call-me-maybe')
var promise = require('callbox')

var DONE = Symbol('done')
var ERROR = Symbol('error')
var HANDLERS = Symbol('Usemail handlers')
var SERVER = Symbol('SMTP server')
var STREAM = Symbol('SMTP stream')
var TCP = Symbol('TCP server')

class UsemailContext {
  constructor (stream) {
    this[DONE] = false
    this[STREAM] = stream
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

  get stream () {
    return this[STREAM]
  }
}

class Usemail extends Emitter {
  constructor (opts) {
    super()
    this.opts = opts || {}
    this[HANDLERS] = []
  }

  close () {
    if (this[SERVER]) this[SERVER].close()
  }

  use (fn) {
    assert(typeof fn === 'function', 'Usemail handler should be function')
    this[HANDLERS].push(fn)
  }

  listen (port, cb) {
    var settings = Object.assign({}, this.opts)
    settings.onData = this.onData.bind(this)

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
  async onData (stream, session, done) {
    var context, handler
    context = new UsemailContext(stream)

    for await (handler of this[HANDLERS]) {
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
