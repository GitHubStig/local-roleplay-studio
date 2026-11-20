import { extname, join } from '@std/path'
import { serveDir, serveFile } from '@std/http/file-server'

/**
 * Serves the built web app (`web/dist`, from `deno task build`), so the server alone is the app,
 * as an install needs: there's no Vite dev server there. An address with no file extension is one
 * of the app's own (`/settings/images`, `/roleplay/<id>`), answered with `index.html` so the app
 * opens there on a refresh or a link. A missing build says how to make one.
 */
export function webApp(dir: string): (req: Request) => Promise<Response> {
  return async (req) => {
    const { pathname } = new URL(req.url)
    const page = extname(pathname) === ''
    const res = page
      ? await serveFile(req, join(dir, 'index.html'))
      : await serveDir(req, { fsRoot: dir, quiet: true })
    if (page && res.status === 404) {
      return new Response(
        "The web app isn't built: run `deno task build`, or open the dev server (`deno task dev`, port 5180).\n",
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      )
    }
    // The page is checked each time, so a new build is picked up; Vite names the rest by their
    // content, so a file there never changes.
    if (res.ok && page) res.headers.set('Cache-Control', 'no-cache')
    if (res.ok && pathname.startsWith('/assets/')) {
      res.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    }
    return res
  }
}
