/** Small HTTP helpers shared by the app's routes and each Session kind's own routes. */
import { Refusal } from './refusal.ts'
import type { ErrorBody } from '../shared/errors.ts'

export type Params = Record<string, string | undefined>
export type Route = [
  method: string,
  pattern: URLPattern,
  handle: (req: Request, p: Params) => Promise<Response>,
]

export const json = (body: unknown, status = 200) => Response.json(body, { status })
export const error = (message: string, status: number, extra: Omit<ErrorBody, 'error'> = {}) =>
  json({ error: message, ...extra } satisfies ErrorBody, status)

/** Whether the request says its body is JSON. */
export const isJson = (req: Request) =>
  req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json'

/** The request's JSON body, or undefined if it has none or it isn't JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

/** A field of a JSON body that must be text: trimmed, or refused with "<name> is required". */
export function requiredText(body: unknown, name: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[name]
  if (typeof value !== 'string' || !value.trim()) throw new Refusal(`${name} is required`, 400)
  return value.trim()
}

/** Where each request came from, as the server was told when it arrived (`noteClient`). */
const clients = new WeakMap<Request, string>()

/** Notes the address request `req` came from (`Deno.ServeHandlerInfo`'s `remoteAddr`). */
export function noteClient(req: Request, addr: Deno.Addr | undefined) {
  if (addr && 'hostname' in addr) clients.set(req, addr.hostname)
}

/** An address as one thing: lower case, without an IPv6 zone or an IPv4 address's `::ffff:`. */
const plainAddress = (address: string) =>
  address.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '').replace(
    /^::ffff:(\d+\.\d+\.\d+\.\d+)$/,
    '$1',
  )

/** Whether `address` is this machine's: a loopback address, or one of its network interfaces'. */
export function ownAddress(address: string, interfaces = () => Deno.networkInterfaces()): boolean {
  const plain = plainAddress(address)
  if (plain === '::1' || /^127\./.test(plain)) return true
  try {
    return interfaces().some((i) => plainAddress(i.address) === plain)
  } catch {
    return false
  }
}

/**
 * Whether the browser that sent `req` runs on the server's own machine: it connected from one of
 * this machine's addresses (loopback, or the machine's own LAN address when the app is opened at
 * that), and so did whoever a proxy on this machine forwarded it for (Vite's, under `deno task
 * dev`, which says so in `X-Forwarded-For`). Only what this machine shows the player hangs on it
 * (its folder dialog, opening a folder in its file manager), never what anyone may do.
 */
export function fromThisMachine(req: Request, interfaces?: () => Deno.NetworkInterfaceInfo[]) {
  const client = clients.get(req)
  if (!client || !ownAddress(client, interfaces)) return false
  const forwarded = req.headers.get('x-forwarded-for')
  return !forwarded || forwarded.split(',').every((a) => ownAddress(a, interfaces))
}
