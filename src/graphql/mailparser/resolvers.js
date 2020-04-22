import { simpleParser } from 'mailparser'

require('dotenv').config()

export const resolver = {
  Query: {
    parse: async (_, { rawEmail }) => {
      const email = await simpleParser(rawEmail)
      console.log(email)
      return {
        ...email,
        id: email.messageId,
        from: email.from.value.map((addressValue) => ({
          id: uuid(),
          ...addressValue,
        })),
        to: email.to.value.map((addressValue) => ({
          id: uuid(),
          ...addressValue,
        })),
        cc: email.cc?.value?.map((addressValue) => ({
          id: uuid(),
          ...addressValue,
        })),
        attachments: email.attachments
          ? email.attachments.map((attachement) => ({
              id: uuid(),
              ...attachement,
            }))
          : null,
        headerLines: email.headerLines.map((h) => ({ id: uuid(), ...h })),
      }
    },
  },
}
