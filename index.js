
const path = require("path")
const fs = require("fs")
const util = require("util")

const argv = require("minimist")(process.argv.slice(2))
const read = util.promisify(require("read"))
const { Session } = require("maimainet-tools")


const SESSION_STORAGE = path.join(process.env.HOME, ".maimainet-cli.json")
let session


// helper functions

function restoreSession(session) {
  try {
    const data = fs.readFileSync(SESSION_STORAGE, "utf8")
    session.restore(data)
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error(e)
    }
  }
}

function saveSession(session) {
  const data = session.save()
  fs.writeFileSync(SESSION_STORAGE, data, "utf8")
}

function log(...args) {
  if (argv.verbose) {
    console.error(...args)
  }
}

// command handlers

async function executeCommandLogin() {
  log("executeCommandLogin")

  let sid = ""
  let password = ""

  if (argv._.length >= 2) {
    sid = argv._[1]
    password = argv._[2]
  } else {
    sid = await read({ prompt: "segaid: " })
    password = await read({ prompt: "password: ", silent: true })
  }

  const result = await session.login({ sid, password })
  if (result) {
    console.error("OK")
  } else {
    console.error("Error: failed to login")
    process.exit(2)
  }
}

async function executeCommandLogout() {
  log("executeCommandLogout")
  session = new Session()
  console.error("OK")
}

async function executeCommandProfile() {
  log("executeCommandProfile")
  const data = await session.myProfile()
  console.log(JSON.stringify(data, null, 2))
}

async function executeCommandFriends() {
  log("executeCommandFriends")
  const data = await session.friends()
  console.log(JSON.stringify(data, null, 2))
}

async function executeCommandPlayData() {
  log("executeCommandPlayData")
  const friendCode = argv._[1]
  if (!friendCode) {
    console.error("Missing friend code parameter")
    process.exit(2)
  }

  const data = await session.friendPlayData(friendCode)
  console.log(JSON.stringify(data, null, 2))
}


async function main() {
  session = new Session({ logger: log })

  try {
    restoreSession(session)

    if (argv._[0] === "login") {
      await executeCommandLogin()
    } else if (argv._[0] === "logout") {
      await executeCommandLogout()
    } else if (argv._[0] === "profile") {
      await executeCommandProfile()
    } else if (argv._[0] === "friends") {
      await executeCommandFriends()
    } else if (argv._[0] === "playData") {
      await executeCommandPlayData()
    } else {
      console.error("Usage: maimainet-cli <...>")
      console.error("  maimainet-cli login")
      console.error("  maimainet-cli logout")
      console.error("  maimainet-cli profile")
      console.error("  maimainet-cli friends")
      console.error("  maimainet-cli playData <friendCode>")
      process.exit(2)
    }
  } finally {
    saveSession(session)
  }
}

async function start() {
  try {
    await main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

start()
