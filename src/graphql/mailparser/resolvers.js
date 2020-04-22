import { simpleParser } from 'mailparser'
require('node-json-color-stringify')

require('dotenv').config()

const parseAddresses = (input) =>
  input.value.map((x) => ({ id: x.address, name: x.name }))
export const resolver = {
  Query: {
    parse: async (_, { id, rawEmail }) => {
      const parsedEmail = await simpleParser(rawEmail)
      // console.log(JSON.stringify(parsedEmail, null, 2))

      const email = {
        ...parsedEmail,
        id: id || parsedEmail.messageId,
        from: parseAddresses(parsedEmail.from),
        to: parseAddresses(parsedEmail.to),
        cc: parsedEmail.cc ? parseAddresses(parsedEmail.cc) : undefined,
        bcc: parsedEmail.bcc ? parseAddresses(parsedEmail.bcc) : undefined,
        attachments: parsedEmail.attachments
          ? parsedEmail.attachments.map((a) => ({
              id: a.cid,
              ...a,
            }))
          : undefined,
        headerLines: parsedEmail.headerLines.map((h) => ({
          id: h.key,
          line: h.line,
        })),
      }
      return email
    },
  },
}
