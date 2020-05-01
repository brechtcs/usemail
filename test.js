var nodemailer = require('nodemailer')
var test = require('tape')
var usemail = require('./')

test('chain middleware', async function (t) {
  var server = usemail({ authOptional: true })
  var id = null

  server.use(function first (session, ctx) {
    t.ok(ctx.stream)
    t.ok(session)
    t.equal(session.envelope.mailFrom.address, 'some@example.com')
    t.equal(session.envelope.rcptTo[0].address, 'other@example.com')
    t.equal(typeof ctx.stream.pipe, 'function')
    ctx.promise = Promise.resolve(1)
    id = session.id
  })

  server.use(async function second (session, ctx) {
    ctx.resolved = await ctx.promise
    t.ok(ctx.promise)
    t.equal(typeof ctx.promise.then, 'function')
    t.equal(ctx.resolved, 1)
    t.equal(session.id, id)
  })

  server.use(function third (session, ctx) {
    t.ok(ctx.stream)
    t.ok(ctx.promise)
    t.equal(ctx.resolved, 1)
    t.equal(session.envelope.mailFrom.address, 'some@example.com')
    t.equal(session.envelope.rcptTo[0].address, 'other@example.com')
    t.equal(session.id, id)
  })

  await server.listen()
  await sendMail(server.port)

  server.close()
  t.end()
})

test('terminate handling', async function (t) {
  var server = usemail({ authOptional: true })

  server.use(function synchronous (session) {
    if (session.envelope.mailFrom.address === 'first@example.com') {
      throw new Error('synchronous error')
    }
  })

  server.use(function asynchronous (session) {
    if (session.envelope.mailFrom.address === 'second@example.com') {
      throw new Error('asynchronous error')
    }
  })

  server.use(function end (session, ctx) {
    if (session.envelope.mailFrom.address === 'third@example.com') {
      ctx.end()
    }
  })

  server.use(function nope (session) {
    t.fail()
  })

  server.on('bye', function (session, ctx) {
    t.ok(ctx.done)

    if (session.envelope.mailFrom.address === 'first@example.com') {
      t.ok(ctx.internalError)
      t.ok(ctx.externalError)
      t.equal(ctx.internalError.message, 'synchronous error')
      t.equal(ctx.externalError.message, 'Something went wrong')
    }
    if (session.envelope.mailFrom.address === 'second@example.com') {
      t.equal(ctx.internalError.message, 'asynchronous error')
    }
    if (session.envelope.mailFrom.address === 'third@example.com') {
      t.notOk(ctx.internalError)
      t.notOk(ctx.externalError)
    }
  })

  await server.listen()
  await sendMail(server.port, { from: 'first@example.com' }).catch(e => t.ok(e))
  await sendMail(server.port, { from: 'second@example.com' }).catch(e => t.ok(e))
  await sendMail(server.port, { from: 'third@example.com' })

  server.close()
  t.end()
})

function sendMail (port, data) {
  var mail = Object.assign({
    from: 'Someone <some@example.com>',
    to: 'Another <other@example.com>',
    subject: 'Literally anything',
    text: '...'
  }, data)

  return nodemailer.createTransport({
    host: '127.0.0.1',
    port: port,
    secure: false,
    ignoreTLS: true
  }).sendMail(mail)
}
