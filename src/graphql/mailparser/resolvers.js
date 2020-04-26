import { simpleParser } from 'mailparser'
const lodash = require('lodash')
require('node-json-color-stringify')
require('dotenv').config()

function compareInsensitive(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

// strip the X-*: line header
const XHeaderRE = /^(?:x-\w*):\s*/i
const stripXHeader = (input) => input.replace(XHeaderRE, '')

// replace "" -> "
const DoubleDoubleQuotesRE = /""/g
const replaceDoubleDoubleQuotes = (input) =>
  input.replace(DoubleDoubleQuotesRE, `"`)

// replace "' and '" -> "
const SingleDoubleQuotePairsRE = /"'|'"/g
const replaceSingleDoubleQuotes = (input) =>
  input.replace(SingleDoubleQuotePairsRE, `"`)

// extract unquoted CSV with *bonus* commas
const AltSplitRE = /([^<]*<[^>]*>),?\s?/g
const altSplit = (input) => {
  let m

  const out = []
  while ((m = AltSplitRE.exec(input)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === AltSplitRE.lastIndex) {
      regex.lastIndex++
    }
    out.push(m[1])
  }
  return out
}

// split quoted CSV
const UnquotedCommaRE = /(?:,\s*)(?=(?:[^"]|"[^"]*")*$)/g
const splitOnUnquotedCommas = (input) => input.split(UnquotedCommaRE)

// extract names from an email address x-* header line
const ExtractName1RE = /(?:'([^']*)')/
const ExtractName2RE = /(?:"?([^"<>]*)"?)?(?:<[^>]*>)?/
const ExtractName3RE = /(?:<([^>]*)>)/
const extractName = (input) => {
  let m = ExtractName1RE.exec(input)
  if (!m || !m[1]) {
    m = ExtractName2RE.exec(input)
    if (!m || !m[1]) {
      m = ExtractName3RE.exec(input)
      if (!m || !m[1]) {
        // console.log('Failed to extract name:', input)
        return
      }
    }
  }
  return m[1].trim()
}
// const input = `'psorrells@periwinklefoundation.org'`
// console.log(extractName(input))

const parseXAddresses = (headerLine, addresses) => {
  // pre-process
  let cleanInput = stripXHeader(headerLine)
  cleanInput = replaceDoubleDoubleQuotes(cleanInput)
  cleanInput = replaceSingleDoubleQuotes(cleanInput)
  if (!cleanInput) return addresses

  // split comma-separated values (except inside quotes)
  let useEntries = splitOnUnquotedCommas(cleanInput)
  let isAlt = false
  if (useEntries.length !== addresses.length) {
    // alternative split stratey
    useEntries = altSplit(cleanInput)
    if (useEntries.length !== addresses.length) {
      // console.group('neither x-* header parse matches target list')
      // console.log('addresses', addresses)
      // console.log('headerLine', headerLine)
      // console.groupEnd()
      return addresses
    }
    isAlt = true
  }

  // extract just the names
  const names = useEntries.map((e) => (e ? extractName(e) : undefined))

  addresses.forEach((x, i) => {
    const name = names[i]
    if (
      !x.name &&
      name &&
      name.length &&
      !name.toLowerCase().includes(x.id.toLowerCase())
    ) {
      x.name = name
    }
  })
  // if (isAlt) console.log('using alt split', headerLine, addresses)
  return addresses
}

const parseAddresses = (input) =>
  input.value.map((x) => ({ id: x.address, name: x.name }))

export const resolver = {
  Query: {
    parse: async (_, { id, rawEmail }) => {
      const parsedEmail = await simpleParser(rawEmail)
      // console.log(JSON.stringify(parsedEmail, null, 2))

      const headerLines = parsedEmail.headerLines.map((h) => {
        return {
          id: h.key,
          line: h.line,
        }
      })

      const getXHeader = (key) => headerLines.filter((x) => x.id === key)[0]

      const extractEmailAndName = (field) => {
        const source = parsedEmail[field]
        if (!source) return

        const parsedAddresses = parseAddresses(source)
        if (!parsedAddresses) return

        const header = getXHeader(`x-${field}`)
        if (!header) return

        const res = parseXAddresses(header.line, parsedAddresses)
        // if (res && res.length) console.log(`${field}:`, res)
        return res
      }

      // Parse the
      const from = extractEmailAndName('from') || []
      const to = extractEmailAndName('to') || []
      const cc = extractEmailAndName('cc')
      const bcc = extractEmailAndName('bcc')

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
