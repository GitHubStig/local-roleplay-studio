/** Small HTTP helpers shared by the app's routes and each Session kind's own routes. */

export type Params = Record<string, string | undefined>
export type Route = [
  method: string,
  pattern: URLPattern,
  handle: (req: Request, p: Params) => Promise<Response>,
]

export const json = (body: unknown, status = 200) => Response.json(body, { status })
export const error = (message: string, status: number, extra: object = {}) =>
  json({ error: message, ...extra }, status)

/** The request's JSON body, or undefined if it has none or it isn't JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}
