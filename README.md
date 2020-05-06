# Usemail

Extendable framework for SMTP servers.

## Motivation

I was looking at ways to build a custom mail server in Node. The obvious first candidate was [Haraka](https://haraka.github.io/). Being mature and stable, as well as extendable, it looked like a perfect fit. Haraka relies heavily on all kinds of configuration files though, whereas I prefer the "code over configuration" approach that is more prevalent in the Node community.

Next I looked into Nodemailer's [`smtp-server`](http://nodemailer.com/extras/smtp-server/). This module meets all the low-level requirements for building mail servers in Node. What it doesn't do though, is define a standardized way to break things up in smaller, reusable functionalities. I wanted an extendable higher-level API on top of it, similar to web frameworks like [Express](https://expressjs.com) and [Fastify](https://www.fastify.io), but I couldn't find any. So I decided to build one myself.

## Installation

```sh
npm install usemail
```

## Usage

```js
var usemail = require('usemail')
var filter = require('usemail-address-filter')
var spf = require('usemail-spf')

var mail = usemail()
var storage = new Map()

mail.from(spf())
mail.to(filter.allow({ addresses: ['some@example.com'] })
mail.use(usemail.parse())
mail.use(function (session) {
  storage.set(session.get('id'), session.get('text'))
})

mail.listen(25)
```

This example creates a basic mail server that stores the text of incoming messages in memory. First, before accepting the message, it validates the [SPF](https://en.wikipedia.org/wiki/Sender_Policy_Framework) records using [`usemail-spf`](https://github.com/brechtcs/usemail-spf). Then [`usemail-address-filter`](https://github.com/brechtcs/usemail-address-filter) filters out all mails, except those sent to explicitly allowed recipients. Only when both those checks have passed, the incoming mail data is parsed and stored.

## Plugins

So far, the following Usemail plugins are available on `npm`:

- [usemail-address-filter](https://npmjs.com/package/usemail-address-filter)
- [usemail-spf](https://npmjs.com/package/usemail-spf)

If you want to add your own to the list, feel free to open a PR!

## License

Apache-2.0

