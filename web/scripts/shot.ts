/**
 * Looks at the running app in a headless browser, for an agent (or anyone) checking a layout or
 * an interaction: opens a page at a window size, optionally after putting values in its
 * localStorage, runs a few steps, and saves screenshots. It prints where each went, what each
 * `eval` step returned, and any errors the page logged.
 *
 * A convenience, not a contract: change it, extend it, or replace it with something better
 * whenever that helps. Nothing in the app or its tests depends on it.
 *
 *   deno task shot <path> [options] [steps]
 *
 * Options:
 *   --size WxH        window size (default 1920x1080)
 *   --out DIR         where screenshots go (default: the system's temp folder)
 *   --name NAME       the first screenshot's name (default: shot); steps name their own
 *   --store key=value put in localStorage before the page loads (repeatable)
 *   --dark            the dark colour scheme
 *   --touch           a phone's touch screen, which can't hover (what hovering shows is always there)
 *   --full            whole-page screenshots, not just the window
 *   --base URL        the app (default http://127.0.0.1:$WEB_PORT, else :5180)
 *   --mock PATH=FILE  answer requests for PATH (a URL pattern, like /api/sessions/x/jobs) with
 *                     FILE's JSON, which only this browser sees: a Frame with made-up jobs, say,
 *                     without queueing real ones (repeatable)
 *
 * Steps, run in order after the page loads, each one argument (a selector is a CSS selector):
 *   click:SELECTOR              dblclick:SELECTOR              hover:SELECTOR
 *   type:SELECTOR=TEXT          fills an input or textarea
 *   key:KEY                     presses a key ("ArrowLeft", "Enter")
 *   drag:SELECTOR=DX,DY         drags an element's centre by DX, DY px
 *   wait:MS                     waits
 *   eval:EXPRESSION             prints what the expression evaluates to in the page
 *   shot:NAME                   saves a screenshot named NAME
 * Without a shot step, one screenshot is saved once the steps are done.
 *
 * The browser is Playwright's Chromium headless shell (`npx playwright-core install
 * chromium-headless-shell` once per machine, if it says it's missing).
 */
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

/** The command line: the path, options (`--store` repeatable) and steps, in one pass. */
const VALUED = new Set(['size', 'out', 'name', 'store', 'base', 'mock'])
let path = '/'
const opts: Record<string, string[]> = {}
const steps: string[] = []
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a.startsWith('--')) {
    const name = a.slice(2)
    ;(opts[name] ??= []).push(VALUED.has(name) ? args[++i] : '')
  } else if (/^[a-z]+:/.test(a)) steps.push(a)
  else path = a
}
const option = (name: string) => opts[name]?.at(-1)
const flag = (name: string) => name in opts

const [width, height] = (option('size') ?? '1920x1080').split('x').map(Number)
const out = resolve(option('out') ?? tmpdir())
const base = option('base') ?? `http://127.0.0.1:${process.env.WEB_PORT ?? 5180}`
const store = Object.fromEntries((opts.store ?? []).map((kv) => {
  const at = kv.indexOf('=')
  return [kv.slice(0, at), kv.slice(at + 1)]
}))

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width, height },
  colorScheme: flag('dark') ? 'dark' : 'light',
  ...(flag('touch') && { hasTouch: true, isMobile: true }),
})
page.on(
  'console',
  (m) =>
    (m.type() === 'error' || process.env.SHOT_CONSOLE) &&
    console.log(`page ${m.type()}: ${m.text()}`),
)
page.on('pageerror', (e) => console.log(`page error: ${e.message}`))
// Answered inside the page, by a fetch wrapped before the app loads: Playwright's routing let the
// first request through now and then (2026-11-12), and the page then showed the real answer.
const mocks: Record<string, unknown> = {}
for (const kv of opts.mock ?? []) {
  const at = kv.indexOf('=')
  mocks[kv.slice(0, at)] = JSON.parse(await Deno.readTextFile(kv.slice(at + 1)))
}
if (Object.keys(mocks).length) {
  await page.addInitScript((mocks) => {
    const real = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href)
      // By the path alone, so a request with a query string is answered too.
      if (url.pathname in mocks) {
        return Promise.resolve(
          new Response(JSON.stringify(mocks[url.pathname]), {
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      return real(input, init)
    }
  }, mocks)
}
if (Object.keys(store).length) {
  await page.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v)
  }, store)
}

async function shot(name: string) {
  const file = join(out, `${name}.png`)
  await page.screenshot({ path: file, fullPage: flag('full') })
  console.log(`saved ${file}`)
}

try {
  await page.goto(new URL(path, base).href, { waitUntil: 'networkidle' })
  let shots = 0
  for (const step of steps) {
    const at = step.indexOf(':')
    const [kind, rest] = [step.slice(0, at), step.slice(at + 1)]
    const eq = rest.lastIndexOf('=')
    const [target, value] = eq >= 0 ? [rest.slice(0, eq), rest.slice(eq + 1)] : [rest, '']
    switch (kind) {
      case 'click':
        await page.click(rest)
        break
      case 'hover':
        await page.hover(rest)
        break
      case 'dblclick':
        await page.dblclick(rest)
        break
      case 'type':
        await page.fill(target, value)
        break
      case 'key':
        await page.keyboard.press(rest)
        break
      case 'drag': {
        const box = await page.locator(target).boundingBox()
        if (!box) throw new Error(`nothing to drag at ${target}`)
        const [dx, dy] = value.split(',').map(Number)
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + dx, y + dy, { steps: 10 })
        await page.mouse.up()
        break
      }
      case 'wait':
        await page.waitForTimeout(Number(rest))
        break
      case 'eval':
        console.log(`${rest} → ${JSON.stringify(await page.evaluate(rest))}`)
        break
      case 'shot':
        await shot(rest)
        shots++
        break
      default:
        throw new Error(`unknown step ${step}`)
    }
    await page.waitForTimeout(100)
  }
  if (!shots) await shot(option('name') ?? 'shot')
} finally {
  await browser.close()
}
