import { log, print } from 'io.maana.shared'

import { gql } from 'apollo-server-express'
import pubsub from '../../pubsub'
import uuid from 'uuid'
import { simpleParser } from 'mailparser'

require('dotenv').config()

const SERVICE_ID = process.env.SERVICE_ID
const SELF = SERVICE_ID || 'io.maana.template'

// dummy in-memory store

export const resolver = {
  Query: {
    info: async (_, args, { client }) => {
      let remoteId = SERVICE_ID

      try {
        if (client) {
          const query = gql`
            query info {
              info {
                id
              }
            }
          `
          const {
            data: {
              info: { id }
            }
          } = await client.query({ query })
          remoteId = id
        }
      } catch (e) {
        log(SELF).error(
          `Info Resolver failed with Exception: ${e.message}\n${print.external(
            e.stack
          )}`
        )
      }

      return {
        id: SERVICE_ID,
        name: 'io.maana.template',
        description: `Maana Q Knowledge Service template using ${remoteId}`
      }
    },

    parse: async (_, { rawEmail }, { client }) => {
      const email = await simpleParser(rawEmail)
      
      return {
        ...email,
        id: email.messageId,
        from: email.from.value.map(addressValue => ({
          id: uuid(),
          ...addressValue
        })),
        to: email.to.value.map(addressValue => ({
          id: uuid(),
          ...addressValue
        })),
        cc: email.cc?.value?.map(addressValue => ({
          id: uuid(),
          ...addressValue
        })),
        attachements: email.attachements
          ? email.attachements.map(attachement => ({
              id: uuid(),
              ...attachement
            }))
          : null,
        headerLines: email.headerLines.map(h => ({ id: uuid(), ...h}))  
          
      }
    }
  }
}
