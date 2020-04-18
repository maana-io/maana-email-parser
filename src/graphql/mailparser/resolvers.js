import { log, print } from 'io.maana.shared'

import { gql } from 'apollo-server-express'
import pubsub from '../../pubsub'
import uuid from 'uuid'
import { simpleParser } from 'mailparser'

require('dotenv').config()

// dummy in-memory store

export const resolver = {
  Query: {
    parse: async (_, { rawEmail }, { client }) => {
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
