var { sendMail } = require('usemail-test-utils')
var Session = require('./lib/session')
var promise = require('await-callback')
var test = require('tape')
var usemail = require('./')

test('chain middleware', async function (t) {
  var server = usemail({ authOptional: true })
  var id = null

  server.use(function first (session, stream) {
    t.ok(stream)
    t.ok(session instanceof Session)
    t.equal(session.from, 'some@example.com')
    t.equal(session.to[0], 'other@example.com')
    t.equal(typeof stream.pipe, 'function')
    session.set('promise', Promise.resolve(1))
    id = session.id
  })

  server.use(async function second (session) {
    session.set('resolved', await session.get('promise'))
    t.ok(session.get('promise'))
    t.equal(typeof session.get('promise').then, 'function')
    t.equal(session.get('resolved'), 1)
    t.equal(session.id, id)
  })

  server.use(function third (session, stream) {
    t.ok(stream)
    t.ok(session.get('promise'))
    t.equal(session.get('resolved'), 1)
    t.equal(session.from, 'some@example.com')
    t.equal(session.to[0], 'other@example.com')
    t.equal(session.id, id)
  })

  await server.listen()
  await sendMail(server.port)
  await server.close()
  t.end()
})

test('terminate handling', async function (t) {
  var server = usemail({ authOptional: true })

  server.use(function synchronous (session) {
    if (session.from === 'first@example.com') {
      throw new Error('synchronous error')
    }
  })

  server.use(function asynchronous (session) {
    if (session.from === 'second@example.com') {
      throw new Error('asynchronous error')
    }
  })

  server.use(function end (session) {
    if (session.from === 'third@example.com') {
      session.end()
    }
  })

  server.use(function nope (session) {
    t.fail()
  })

  server.on('bye', function (session) {
    t.equal(session.phase, 'done')

    if (session.from === 'first@example.com') {
      t.ok(session.serverError)
      t.ok(session.clientError)
      t.equal(session.serverError.message, 'synchronous error')
      t.equal(session.clientError.message, 'Something went wrong')
    }
    if (session.from === 'second@example.com') {
      t.equal(session.serverError.message, 'asynchronous error')
    }
    if (session.from === 'third@example.com') {
      t.notOk(session.serverError)
      t.notOk(session.clientError)
    }
  })

  await server.listen()
  await sendMail(server.port, { from: 'first@example.com' }).catch(e => t.ok(e))
  await sendMail(server.port, { from: 'second@example.com' }).catch(e => t.ok(e))
  await sendMail(server.port, { from: 'third@example.com' }).catch(() => t.fail())
  await server.close()
  t.end()
})

test('handle from/to phases', async function (t) {
  var data = false
  var server = usemail({ authOptional: true })

  server.use(function (session) {
    t.equal(session.phase, 'use')
    t.equal(session.get('some'), 'stuff')
    t.equal(session.get('more'), 'things')
    data = true
  })

  server.to(function (session, rcpt) {
    if (!rcpt.address.endsWith('@localhost')) {
      throw new Error('Unknown recipient')
    }
    t.equal(session.from, 'me@localhost')
    t.equal(session.phase, 'to')
    t.equal(session.get('some'), 'stuff')
    session.set('some', 'other stuff')
    session.set('more', 'things')
  })

  server.from(function (session, sender) {
    t.ok(sender.address)
    t.equal(session.phase, 'from')
    session.set('some', 'stuff', true)
  })

  server.on('bye', function (session) {
    t.equal(session.to.length, 1)
    t.equal(session.to[0], 'you@localhost')
  })

  await server.listen()
  await sendMail(server.port, {
    from: 'me@localhost',
    to: ['they@otherhost', 'you@localhost']
  })

  await server.close()
  t.ok(data)
  t.end()
})

test('always emit bye', async function (t) {
  var bye = false

  await promise(async function (done) {
    var server = usemail({ authOptional: true })

    server.from(function () {
      throw new Error('None shall pass')
    })

    server.on('bye', function (session) {
      bye = true
      t.equal(session.phase, 'done')
      done()
    })

    await server.listen()
    await sendMail(server.port).catch(err => t.ok(err))
    await server.close()
  })

  t.ok(bye)
  t.end()
})
