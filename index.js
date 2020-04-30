var { SMTPServer } = require('smtp-server')
var Emitter = require('events')
var assert = require('assert')
var maybe = require('call-me-maybe')
var promise = require('callbox')

var DONE = Symbol('done')
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
    var context, error, handler
    context = new UsemailContext(stream)
    error = null

    for await (handler of this[HANDLERS]) {
      try {
        await handler.call(this, session, context)
        if (context.done) break
      } catch (e) {
        error = new Error('Failed to process mail')
        e.session = session
        this.emit('error', e)
        break
      }
    }

    // Stream must be completed to end request
    for await (var chunk of stream) {} // eslint-disable-line
    done(error)
  }
}

function factory (opts) {
  return new Usemail(opts)
}

module.exports = factory
module.exports.Usemail = Usemail
