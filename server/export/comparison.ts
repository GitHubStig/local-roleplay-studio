import { basename, extname, join } from '@std/path'
import { pngToWebp } from './webp.ts'

/**
 * The Compare dialog as a page of its own (`web/export.html`): a folder with its `index.html` and
 * its pictures as WebP, to open from disk or put on any host. The browser sends what the dialog
 * shows; the pictures are read from the Session's folder.
 */

/** A picture by its files in the Session's folder, as `Picture` names them. */
export interface ExportPicture {
  image: string
  upscaled?: string
  stale?: boolean
}

/** What the Compare dialog sends (`ComparisonExport` in the web app). */
export interface ComparisonExport {
  /**
   * Shown before the page, which then asks the visitor to confirm they're 18 or older, on every
   * visit; absent, the page opens straight away.
   */
  notice?: string
  models: { label: string }[]
  rows: {
    name: string
    prompt?: string
    /** What happens in the Frame, under its picture in the viewer. */
    caption?: string
    pictures: (ExportPicture | null)[]
  }[]
}

/** How pictures are encoded: the viewer's at full size, the table's shrunk. */
export const EXPORT_QUALITY = { full: 90, thumb: 85, thumbHeight: 512 }

/** The longest notice: a sentence or two. */
export const NOTICE_LENGTH = 500

/** A picture file in a Session's folder: a name only (no path), PNG or SVG. */
const PICTURE_FILE = /^[\w-]+\.(png|svg)$/

/** The export, if `body` is one, or what's wrong with it. */
export function parseComparisonExport(body: unknown): ComparisonExport | string {
  const b = body as Partial<ComparisonExport> | undefined
  if (b?.notice !== undefined && (typeof b.notice !== 'string' || !b.notice.trim())) {
    return 'notice must be some text'
  }
  if ((b?.notice?.length ?? 0) > NOTICE_LENGTH) {
    return `notice must be at most ${NOTICE_LENGTH} characters`
  }
  if (!Array.isArray(b?.models) || b.models.some((m) => typeof m?.label !== 'string')) {
    return 'models must each have a label'
  }
  if (!Array.isArray(b.rows)) return 'rows must be a list'
  for (const row of b.rows) {
    if (typeof row?.name !== 'string') return 'Each row needs a name'
    if (row.prompt !== undefined && typeof row.prompt !== 'string') return 'prompt must be text'
    if (row.caption !== undefined && typeof row.caption !== 'string') return 'caption must be text'
    if (!Array.isArray(row.pictures) || row.pictures.length !== b.models.length) {
      return 'Each row needs a picture (or null) per model'
    }
    for (const p of row.pictures) {
      if (p === null) continue
      if (!PICTURE_FILE.test(p?.image) || (p.upscaled && !PICTURE_FILE.test(p.upscaled))) {
        return 'Pictures must be files in the Session'
      }
    }
  }
  return b as ComparisonExport
}

/** "12 Oct 2026" (September is "Sept", as British English has it). */
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** The exported page's title: the day it was exported and the Session's seed. */
export const comparisonTitle = (date: Date, seed: number): string =>
  `${DAY.format(date)} · Seed ${seed}`

/** The page's slot for the comparison, as `web/export.html` has it. */
const DATA_SLOT = /<script id="comparison" type="application\/json">[\s\S]*?<\/script>/

/**
 * Writes the export to `outDir`, replacing what an earlier export left there: `index.html` (from
 * `page`, the built `web/export.html`), `images/` for the viewer and `thumbs/` for the table.
 */
export async function writeComparison(
  sessionDir: string,
  outDir: string,
  page: string,
  comparison: ComparisonExport,
  title: string,
): Promise<{ pictures: number }> {
  if (!DATA_SLOT.test(page)) throw new Error('The export page has no slot for its comparison')
  await Deno.remove(outDir, { recursive: true }).catch((err) => {
    if (!(err instanceof Deno.errors.NotFound)) throw err
  })
  await Deno.mkdir(join(outDir, 'images'), { recursive: true })
  await Deno.mkdir(join(outDir, 'thumbs'), { recursive: true })

  /**
   * Each file written, by where it came from and how, so a picture is encoded once: its path in
   * the export, and its size (but an SVG's).
   */
  const written = new Map<string, Written>()
  type Written = { path: string; width?: number; height?: number }
  async function write(file: string, folder: 'images' | 'thumbs'): Promise<Written> {
    const key = `${folder}/${file}`
    const done = written.get(key)
    if (done) return done
    const data = await Deno.readFile(join(sessionDir, file))
    let out: Written
    if (extname(file) === '.svg') {
      // The placeholder backend's, as it is.
      out = { path: key }
      await Deno.writeFile(join(outDir, key), data)
    } else {
      const webp = await pngToWebp(
        data,
        folder === 'images'
          ? { quality: EXPORT_QUALITY.full }
          : { quality: EXPORT_QUALITY.thumb, maxHeight: EXPORT_QUALITY.thumbHeight },
      )
      out = {
        path: `${folder}/${basename(file, '.png')}.webp`,
        width: webp.width,
        height: webp.height,
      }
      await Deno.writeFile(join(outDir, out.path), webp.data)
    }
    written.set(key, out)
    return out
  }

  const rows = []
  for (const row of comparison.rows) {
    const pictures = []
    for (const p of row.pictures) {
      if (!p) {
        pictures.push(null)
        continue
      }
      const thumb = await write(p.image, 'thumbs')
      pictures.push({
        thumb: thumb.path,
        full: (await write(p.upscaled ?? p.image, 'images')).path,
        ...(thumb.width ? { width: thumb.width, height: thumb.height } : {}),
        ...(p.stale ? { stale: true } : {}),
      })
    }
    rows.push({
      name: row.name,
      ...(row.prompt ? { prompt: row.prompt } : {}),
      ...(row.caption ? { caption: row.caption } : {}),
      pictures,
    })
  }
  const models = comparison.models.map(({ label }) => ({ label }))
  const notice = comparison.notice?.trim()
  const data = JSON.stringify({ title, ...(notice ? { notice } : {}), models, rows })
    // Inside a <script>, so nothing in it may close the tag.
    .replaceAll('<', '\\u003c')
  let html = page.replace(
    DATA_SLOT,
    () => `<script id="comparison" type="application/json">${data}</script>`,
  )
  // Behind an 18+ notice, the page says so to search engines' safe search and content filters too.
  if (notice) html = html.replace('</head>', '<meta name="rating" content="adult" />\n</head>')
  await Deno.writeTextFile(join(outDir, 'index.html'), html)
  return { pictures: rows.flatMap((r) => r.pictures).filter(Boolean).length }
}
