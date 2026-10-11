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
  title: string
  models: { label: string }[]
  rows: { name: string; prompt?: string; pictures: (ExportPicture | null)[] }[]
}

/** How pictures are encoded: the viewer's at full size, the table's shrunk. */
export const EXPORT_QUALITY = { full: 90, thumb: 85, thumbHeight: 512 }

/** A picture file in a Session's folder: a name only (no path), PNG or SVG. */
const PICTURE_FILE = /^[\w-]+\.(png|svg)$/

/** The export, if `body` is one, or what's wrong with it. */
export function parseComparisonExport(body: unknown): ComparisonExport | string {
  const b = body as Partial<ComparisonExport> | undefined
  if (typeof b?.title !== 'string') return 'title must be a string'
  if (!Array.isArray(b.models) || b.models.some((m) => typeof m?.label !== 'string')) {
    return 'models must each have a label'
  }
  if (!Array.isArray(b.rows)) return 'rows must be a list'
  for (const row of b.rows) {
    if (typeof row?.name !== 'string') return 'Each row needs a name'
    if (row.prompt !== undefined && typeof row.prompt !== 'string') return 'prompt must be text'
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
): Promise<{ pictures: number }> {
  if (!DATA_SLOT.test(page)) throw new Error('The export page has no slot for its comparison')
  await Deno.remove(outDir, { recursive: true }).catch((err) => {
    if (!(err instanceof Deno.errors.NotFound)) throw err
  })
  await Deno.mkdir(join(outDir, 'images'), { recursive: true })
  await Deno.mkdir(join(outDir, 'thumbs'), { recursive: true })

  /** Each file written, by where it came from and how, so a picture is encoded once. */
  const written = new Map<string, string>()
  async function write(file: string, folder: 'images' | 'thumbs'): Promise<string> {
    const key = `${folder}/${file}`
    const done = written.get(key)
    if (done) return done
    const data = await Deno.readFile(join(sessionDir, file))
    // An SVG (the placeholder backend's) goes as it is.
    const out = extname(file) === '.svg' ? key : `${folder}/${basename(file, '.png')}.webp`
    await Deno.writeFile(
      join(outDir, out),
      extname(file) === '.svg' ? data : await pngToWebp(
        data,
        folder === 'images'
          ? { quality: EXPORT_QUALITY.full }
          : { quality: EXPORT_QUALITY.thumb, maxHeight: EXPORT_QUALITY.thumbHeight },
      ),
    )
    written.set(key, out)
    return out
  }

  const rows = []
  for (const row of comparison.rows) {
    const pictures = []
    for (const p of row.pictures) {
      pictures.push(
        p && {
          thumb: await write(p.image, 'thumbs'),
          full: await write(p.upscaled ?? p.image, 'images'),
          ...(p.stale ? { stale: true } : {}),
        },
      )
    }
    rows.push({ name: row.name, ...(row.prompt ? { prompt: row.prompt } : {}), pictures })
  }
  const models = comparison.models.map(({ label }) => ({ label }))
  const data = JSON.stringify({ title: comparison.title, models, rows })
    // Inside a <script>, so nothing in it may close the tag.
    .replaceAll('<', '\\u003c')
  await Deno.writeTextFile(
    join(outDir, 'index.html'),
    page.replace(
      DATA_SLOT,
      () => `<script id="comparison" type="application/json">${data}</script>`,
    ),
  )
  return { pictures: rows.flatMap((r) => r.pictures).filter(Boolean).length }
}
