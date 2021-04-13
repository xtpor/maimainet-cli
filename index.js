
const { URL, URLSearchParams } = require("url")
const path = require("path")
const fs = require("fs")
const util = require("util")

const argv = require("minimist")(process.argv.slice(2))
const fetch = require("cross-fetch")
const { parse } = require("node-html-parser")
const read = util.promisify(require("read"))


const SESSION_STORAGE = path.join(process.env.HOME, ".maimainet-cli.json")

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:87.0) Gecko/20100101 Firefox/87.0"

const FORM_LOGIN = "https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid/"
const PAGE_LOGIN  = "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/"
const PAGE_ROOT = "https://maimaidx-eng.com/maimai-mobile/"
const PAGE_HOME  = "https://maimaidx-eng.com/maimai-mobile/home/"
const PAGE_FRIEND_CODE = "https://maimaidx-eng.com/maimai-mobile/friend/userFriendCode/"
const PAGE_FRIENDS_PAGE = "https://maimaidx-eng.com/maimai-mobile/friend/"

function D_PAGE_FRIEND_VERSUS(id, diff) {
  return `https://maimaidx-eng.com/maimai-mobile/friend/friendGenreVs/battleStart/?scoreType=2&genre=99&diff=${diff}&idx=${id}`
}

function log(...args) {
  if (argv.verbose) {
    console.error(...args)
  }
}

async function get(ctx, url) {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, ...formatCookie(ctx, url) },
    redirect: "manual",
  })

  log(`GET ${url} ${response.status}`)
  if (300 <= response.status && response.status <= 399) {
    return get(updateContext(ctx, response), response.headers.get("location"))
  } else {
    return [updateContext(ctx, response), response]
  }
}

async function post(ctx, url, data = {}) {
  const body = String(new URLSearchParams(data))

  const response = await fetch(url, {
    method: "POST",
    body: body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": userAgent, ...formatCookie(ctx, url)
    },
    redirect: "manual",
  })

  log(`POST ${url} ${response.status}`)
  if (300 <= response.status && response.status <= 399) {
    return get(updateContext(ctx, response), response.headers.get("location"))
  } else {
    return [updateContext(ctx, response), response]
  }
}

function formatCookie(ctx, url) {
  const now = Date.now()
  const { origin } = new URL(url)
  const entry = ctx.cookies[origin]
  if (entry) {
    return {
      cookie: Object.values(entry)
      .filter(cookie => {
        if (cookie.attributes.expires) {
          return Number(new Date(cookie.attributes.expires)) >= now
        } else {
          return true
        }
      })
      .map(cookie => `${cookie.key}=${cookie.value}`).join("; ")
    }
  } else {
    return {}
  }
}

function updateContext(ctx, response) {
  return { ...ctx, cookies: mergeCookies(ctx.cookies, parseSetCookie(response)) }
}

function parseSetCookie(response) {
  let result = {}
  const { origin } = new URL(response.url)

  const headerValues = response.headers.raw()['set-cookie']
  if (Array.isArray(headerValues)) {
    for (const hv of headerValues ) {
      const cookie = parseCookieHeaderValue(hv)

      result[origin] = result[origin] || {}
      result[origin][cookie.key] = cookie
    }
  }

  return result
}

function parseCookieHeaderValue(headerValue) {
  const parts = headerValue.split(";").map(t => t.trim())
  const payload = parts[0]
  const [key, value] = payload.split("=")
  const attributes = Object.fromEntries(parts.slice(1).map(p => {
    const kv = p.split("=")
    if (kv.length > 1) {
      return [kv[0].toLowerCase(), kv[1]]
    } else {
      return [kv[0].toLowerCase(), true]
    }
  }))

  return { key, value, attributes }
}

function mergeCookies(ca, cb) {
  let result = {}

  for (const [origin, entries] of Object.entries(ca)) {
    for (const [key, value] of Object.entries(entries)) {
      result[origin] = result[origin] || {}
      result[origin][key] = value
    }
  }

  for (const [origin, entries] of Object.entries(cb)) {
    for (const [key, value] of Object.entries(entries)) {
      result[origin] = result[origin] || {}
      result[origin][key] = value
    }
  }

  return result
}

function loadContext() {
  try {
    const text = fs.readFileSync(SESSION_STORAGE, "utf8")
    const obj = JSON.parse(text)
    return obj
  } catch (e) {
    if (e.code === "ENOENT") {
      return { cookies: {} }
    } else {
      console.error(e)
    }
  }
}

function storeContext(ctx) {
  const text = JSON.stringify(ctx, null, 2)
  fs.writeFileSync(SESSION_STORAGE, text, "utf8")
}

function parseHomePage(html) {
  const dom = parse(html)
  const nameBlock = dom.querySelector(".name_block")
  const img = dom.querySelector(".basic_block img")
  const ratingBlock = dom.querySelector(".basic_block .rating_block")

  return {
    playerName: nameBlock.text,
    avatar: img.getAttribute("src"),
    rating: Number(ratingBlock.text),
  }
}

function parseFriendPage(html) {
  const dom = parse(html)

  const entries = []
  const friendBlocks = dom.querySelectorAll(".see_through_block")
  for (const elem of friendBlocks) {
    const idBlock = elem.querySelector("form input")
    const nameBlock = elem.querySelector(".name_block")
    const ratingBlock = elem.querySelector(".basic_block .rating_block")

    entries.push({
      friendCode: idBlock.getAttribute("value"),
      name: nameBlock.text,
      rating: Number(ratingBlock.text),
    })
  }

  return entries
}

function parseAchievement(text) {
  if (text.endsWith("%")) {
    text = text.slice(0, -1)
  }
  text = text.replace("%", "")
  text = text.replace(".", "")
  return Number(text)
}

function parseVersusPage(html, difficulty) {
  const dom = parse(html)
  const entries = []

  for (const elem of dom.querySelectorAll(".w_450.m_15")) {
    const name = elem.querySelector(".music_name_block").text.trim()
    const score = elem.querySelector("td.w_120:last-child").text.trim()
    const icon = elem.querySelector(".music_kind_icon")
    const lv = elem.querySelector(".music_lv_block").text.trim()

    entries.push({
      song: name,
      achievement: parseAchievement(score),
      level: lv,
      difficulty: difficulty,
      kind: icon.getAttribute("src").includes("standard") ? "standard" : "dx",
    })
  }

  return entries
}

function parseFriendCodePage(html) {
  const dom = parse(html)
  const elem = dom.querySelector(".see_through_block .see_through_block")
  return elem.text.trim()
}


async function relogin() {
  const ctx0 = loadContext()
  const [ctx1, response] = await get(ctx0, PAGE_ROOT)
  storeContext(ctx1)

  return response.ok && response.url === PAGE_HOME
}

async function login() {
  const ctx = { cookies: {} }

  let sid = ""
  let password = ""
  if (argv._.length >= 2) {
    sid = argv._[1]
    password = argv._[2]
  } else {
    sid = await read({ prompt: "segaid: " })
    password = await read({ prompt: "password: ", silent: true })
  }

  const [ctx1, response1] = await get(ctx, PAGE_LOGIN)
  const [ctx2, response2] = await post(ctx1, FORM_LOGIN, {
    sid: sid,
    password: password,
    retention: "1"
  })
  storeContext(ctx2)

  return response2.ok && response2.url === PAGE_HOME
}

async function logout() {
  const ctx = { cookies: {} }
  storeContext(ctx)
}

async function fetchProfile() {
  const ctx = loadContext()
  const url = PAGE_HOME
  const [ctx1, response] = await get(ctx, url)
  storeContext(ctx1)

  if (response.ok && response.url === url) {
    return parseHomePage(await response.text())
  } else {
    if (await relogin()) {
      return fetchProfile()
    } else {
      throw new Error("Failed to fetch profile")
    }
  }
}

async function fetchFriendList() {
  const ctx = loadContext()
  const url = PAGE_FRIENDS_PAGE
  const [ctx1, response] = await get(ctx, url)
  storeContext(ctx1)

  if (response.ok && response.url === url) {
    return parseFriendPage(await response.text())
  } else {
    if (await relogin()) {
      return fetchFriendList()
    } else {
      throw new Error("Failed to fetch friend list")
    }
  }
}

async function fetchFriendCode() {
  const ctx = loadContext()
  const url = PAGE_FRIEND_CODE
  const [ctx1, response] = await get(ctx, url)
  storeContext(ctx1)

  if (response.ok && response.url === url) {
    return parseFriendCodePage(await response.text())
  } else {
    if (await relogin()) {
      return fetchFriendCode()
    } else {
      throw new Error("Failed to fetch friend list")
    }
  }
}

async function fetchFriendVersus(idx, difficulty) {
  const ctx = loadContext()
  const url = D_PAGE_FRIEND_VERSUS(idx, difficulty)
  const [ctx1, response] = await get(ctx, url)
  storeContext(ctx1)

  if (response.ok && response.url === url) {
    return parseVersusPage(await response.text(), difficulty)
  } else {
    if (response.url === PAGE_FRIENDS_PAGE) {
      throw new Error("Failed to fetch the friend versus page")
    } else if (await relogin()) {
      return fetchFriendCode()
    } else {
      throw new Error("Failed to fetch friend list")
    }
  }
}

function hasSession() {
  const ctx = loadContext()
  return Object.keys(ctx.cookies).length > 0
}

async function executeCommandLogin() {
  log("executeCommandLogin")
  const result = await login()
  if (result) {
    console.error("OK")
  } else {
    console.error("Error: failed to login")
    process.exit(2)
  }
}

async function executeCommandLogout() {
  log("executeCommandLogout")
  logout()
  console.error("OK")
}

async function executeCommandAccount() {
  log("executeCommandAccount")
  if (!hasSession()) {
    console.error("Error: please login first")
    process.exit(2)
  }

  const profile = await fetchProfile()
  const friendList = await fetchFriendList()
  const friendCode = await fetchFriendCode()

  console.log(JSON.stringify({ profile, friendList, friendCode }, null, 2))
}

async function executeCommandDownload() {
  log("executeCommandDownload")
  if (!hasSession()) {
    console.error("Error: please login first")
    process.exit(2)
  }

  const idx = argv._[1]
  if (!idx) {
    console.error("Missing friend id parameter")
    process.exit(2)
  }

  const result0 = await fetchFriendVersus(idx, 0)
  const result1 = await fetchFriendVersus(idx, 1)
  const result2 = await fetchFriendVersus(idx, 2)
  const result3 = await fetchFriendVersus(idx, 3)
  const result4 = await fetchFriendVersus(idx, 4)
  const result = [...result0, ...result1, ...result2, ...result3, ...result4]

  console.log(JSON.stringify({
    timestamp: ~~(Date.now() / 1000),
    idx: idx,
    records: result,
  }, null, 2))
}

async function main() {
  if (argv._[0] === "login") {
    await executeCommandLogin()
  } else if (argv._[0] === "logout") {
    await executeCommandLogout()
  } else if (argv._[0] === "account") {
    await executeCommandAccount()
  } else if (argv._[0] === "download") {
    await executeCommandDownload()
  } else {
    console.error("Usage: maimainet-cli <...>")
    console.error("  maimainet-cli login")
    console.error("  maimainet-cli logout")
    console.error("  maimainet-cli account")
    console.error("  maimainet-cli download <idx>")
    process.exit(2)
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
