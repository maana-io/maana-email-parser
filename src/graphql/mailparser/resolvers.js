import { simpleParser } from 'mailparser'
const lodash = require('lodash')
require('node-json-color-stringify')
require('dotenv').config()

const regex = /(?:"?([^"]*)"?\s)?(?:<.+>?)/
const parseXAddress = (input) => {
  let m

  // console.log('input', input)
  const unparsed = input.split(':')[1].trim()
  if (!unparsed.length) return
  const multiples = unparsed.split(',').map((x) => x.trim())
  // console.log('multiples', multiples)

  const results = multiples.map((x) => {
    if ((m = regex.exec(x)) !== null) return m[1]
    return x
  })
  return results
}

const parseAddresses = (input) =>
  input.value.map((x) => ({ id: x.address, name: x.name }))

export const resolver = {
  Query: {
    parse: async (_, { id, rawEmail }) => {
      const parsedEmail = await simpleParser(rawEmail)
      // console.log(JSON.stringify(parsedEmail, null, 2))

      let xFrom, xTo, xCC, xBCC
      const headerLines = parsedEmail.headerLines.map((h) => {
        switch (h.key.toLowerCase()) {
          case 'x-from':
            xFrom = parseXAddress(h.line)
            break
          case 'x-to':
            xTo = parseXAddress(h.line)
            break
          case 'x-cc':
            xCC = parseXAddress(h.line)
            break
          case 'x-bcc':
            xBCC = parseXAddress(h.line)
            break
          default:
            break
        }
        return {
          id: h.key,
          line: h.line,
        }
      })

      const notSame = (x, i, y) =>
        x ? (x[i] !== y ? x[i] : undefined) : undefined

      const extractEmailAndName = (field, xCollection) => {
        const res = parsedEmail[field]
          ? parseAddresses(parsedEmail[field]).map((a, i) => ({
              id: a.id,
              name: !lodash.isEmpty(a.name)
                ? a.name
                : notSame(xCollection, i, a.id),
            }))
          : []
        // if (res && res.length) console.log(`${field}:`, res)
        return res
      }

      const from = extractEmailAndName('from', xFrom)
      const to = extractEmailAndName('to', xTo)
      const cc = extractEmailAndName('cc', xCC)
      const bcc = extractEmailAndName('bcc', xBCC)

      const email = {
        ...parsedEmail,
        id: id || parsedEmail.messageId,
        from,
        to,
        cc,
        bcc,
        attachments: parsedEmail.attachments
          ? parsedEmail.attachments.map((a) => ({
              id: a.cid,
              ...a,
            }))
          : undefined,
        headerLines,
      }

      return email
    },
  },
}
