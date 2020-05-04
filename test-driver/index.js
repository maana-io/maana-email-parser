#!/usr/bin/env node

const fs = require('fs')
const fsPromises = fs.promises
const process = require('process')
const path = require('path')
const commandLineArgs = require('command-line-args')
const commandLineUsage = require('command-line-usage')
const lodash = require('lodash')
const papa = require('papaparse')
const ora = require('ora')
const { request } = require('graphql-request')

const query = `query parse($id: ID, $rawEmail: String!) {
  parse(id: $id, rawEmail: $rawEmail) {
    id
    subject
    from {
      ...addressFields
    }
    to {
      ...addressFields
    }
    cc {
      ...addressFields
    }
    bcc {
      ...addressFields
    }
    date
    messageId
    inReplyTo
    replyTo {
      ...addressFields
    }
    references
    html
    text
    textAsHtml
    attachments {
      id
      filename
      contentType
      contentDisposition
      checksum
      size
      content
      contentId
      related    
    }
    headerLines {
      id
      line
    }
  }
}

fragment addressFields on Address {
  id
  name
}
`

const optionDefinitions = [
  {
    name: 'input',
    alias: 'i',
    typeLabel: 'email csv',
    defaultValue: 'emails.csv',
  },
  {
    name: 'endpoint',
    alias: 'e',
    typeLabel: 'graphql endpoint',
    defaultValue: 'http://localhost:8050/graphql',
    // defaultValue: "http://23.99.130.37:8050/graphql",
  },
  {
    name: 'filter',
    alias: 'f',
    typeLabel: 'filter file to extract email from',
    defaultValue: 'filter.txt',
  },
  {
    name: 'output',
    alias: 'o',
    typeLabel: 'output email csv from filter',
    defaultValue: 'filtered_emails.csv',
  },
  {
    name: 'extract',
    alias: 'x',
    typeLabel: 'use filter file to extract emails',
    type: Boolean,
  },
  {
    name: 'stats',
    alias: 's',
    typeLabel: 'track email stats',
    type: Boolean,
    defaultValue: false,
  },
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'help', alias: 'h', type: Boolean },
]

const usageSections = [
  {
    header: 'email-driver',
    content:
      'Reads emails from a CSV (id, message) and sends them to a GraphQL endpoint for parsing.',
  },
  {
    header: 'Options',
    optionList: optionDefinitions,
  },
]

// parse command line
const options = commandLineArgs(optionDefinitions)

if (options.verbose) console.log(options)

let error
options.input = path.resolve(options.input)
if (!fs.existsSync(options.input)) {
  console.log('Missing input email CSV:', options.input)
  error = true
}

let outstream
let filterData
if (options.extract) {
  options.filter = path.resolve(options.filter)
  if (!fs.existsSync(options.filter)) {
    console.log('Missing email filter file:', options.filter)
    error = true
  }
  filterData = fs.readFileSync(options.filter, { encoding: 'utf8' }).split('\n')
  console.log('filterData', filterData)
  options.output = path.resolve(options.output)
  outstream = fs.createWriteStream(options.output)
}

if (error || options.help) {
  const usage = commandLineUsage(usageSections)
  console.log(usage)
  return -1
}

const sendEmail = async (id, rawEmail) => {
  // options.verbose ? console.log("email", id) : process.stdout.write(".");
  try {
    const result = await request(options.endpoint, query, { id, rawEmail })
    // console.log("Parse:", JSON.stringify(result));
    return result
  } catch (e) {
    console.log(JSON.stringify(e, null, 2))
    return e
  }
}

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const getXHeader = (headerLines, key) =>
  headerLines.filter((x) => x.id === key)[0]

const memo = {}
const storeEmail = (email) => {
  let entry = memo[email.id]
  if (!entry) {
    entry = new Set()
    memo[email.id] = entry
  }
  entry.add(email.name)
}

const storeEmails = (input, field, headerLines) => {
  const emails = input[field]
  if (!emails) return

  emails.forEach(storeEmail)
  // console.log(field, emails, getXHeader(headerLines, `x-${field}`));
}

let numFiltered = 0
const include = (email) => {
  const addresses = lodash
    .flatMap(['from', 'to', 'cc', 'bcc'], (x) => email[x])
    .filter((x) => !!x)
    .map((x) => x.id)
  for (let address of addresses) {
    if (filterData.includes(address)) {
      return true
    }
  }
  return false
}

const visitEmail = (file, message, parse) => {
  if (options.extract) {
    if (include(parse)) {
      outstream.write(`${file}\n`)
      numFiltered += 1
    }
  }
  if (options.stats) {
    const { headerLines } = parse
    ;['from', 'to', 'cc', 'bcc'].forEach((field) =>
      storeEmails(parse, field, headerLines)
    )
  }
}

const dumpStats = () => {
  console.log(memo)
  console.log('Unique emails: ', Object.keys(memo).length)
  let validNames = 0
  let max = 0
  let maxEmail
  Object.keys(memo).forEach((x) => {
    const names = memo[x]
    if (names.size > max) {
      max = names.size
      maxEmail = x
    }
  })
  console.log('Max names: ', max, maxEmail, memo[maxEmail])
}

const spinner = ora('Loading emails').start()

const skip = 0
const take = 0
let i = 0
const readable = fs.createReadStream(options.input)
papa.parse(readable, {
  header: true,
  // preview: 10,
  chunk: async (results, parser) => {
    parser.pause()
    for (let data of results.data) {
      if (!skip || (skip && skip > i)) {
        if (!take || (take && i - skip < take)) {
          const res = await sendEmail(data.file, data.message)
          // console.group(i);
          // outstream.write(`${data.file},${data.message}\r\n`)
          visitEmail(data.file, data.message, res.parse)
          // console.groupEnd();
          // console.log("res:", Object.keys(res.parse));
        }
      }
      i += 1
    }
    spinner.text = `Pausing at ${numFiltered}/${i}`
    await sleep(100)
    parser.resume()
  },
  complete: () => {
    spinner.succeed(`Processed ${numFiltered}/${i} emails`)

    if (options.extract) {
      outstream.end()
    }
    if (options.stats) {
      dumpStats()
    }
  },
  error: (error, file) => {
    console.log(error)
    if (options.extract) {
      outstream.end()
    }
  },
})

// readable
//   .pipe(csv())
//   .on("data", (data) => {
//     i++;
//     return sendEmail(data.file, data.message);
//   })
//   .on("end", () => {
//     console.log(`\nDone! Sent ${i} emails`);
//     // [
//     //   { NAME: 'Daffy Duck', AGE: '24' },
//     //   { NAME: 'Bugs Bunny', AGE: '22' }
//     // ]
//   });
