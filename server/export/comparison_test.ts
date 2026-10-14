import { assertEquals, assertMatch, assertRejects } from '@std/assert'
import encodePng from '@jsquash/png/encode.js'
import { join } from '@std/path'
import { withTempDir } from '../testing.ts'
import {
  type ComparisonExport,
  comparisonTitle,
  parseComparisonExport,
  writeComparison,
} from './comparison.ts'

const PAGE = '<title>x</title><script id="comparison" type="application/json">{}</script><p>'

/** An opaque one-colour PNG of this size, as a render is. */
async function png(width: number, height: number): Promise<Uint8Array> {
  const data = new Uint8ClampedArray(width * height * 4).map((_, i) => i % 4 === 3 ? 255 : 200)
  return new Uint8Array(await encodePng(new ImageData(data, width, height)))
}

/** A lossy WebP's size, from its VP8 frame header. */
function webpSize(file: Uint8Array): { width: number; height: number } {
  assertEquals(new TextDecoder().decode(file.slice(8, 16)), 'WEBPVP8 ')
  const view = new DataView(file.buffer, file.byteOffset)
  return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
}

/** The comparison written into a page, as the page reads it back. */
async function pageData(outDir: string) {
  const html = await Deno.readTextFile(join(outDir, 'index.html'))
  return JSON.parse(html.match(/type="application\/json">(.*?)<\/script>/)![1])
}

const comparison: ComparisonExport = {
  models: [{ label: 'A' }, { label: 'B' }],
  rows: [
    {
      name: 'Frame 0',
      prompt: 'A tavern at dusk.',
      caption: 'The tavern, at dusk.',
      pictures: [
        { image: 'frame-0-a.png', upscaled: 'frame-0-a-2048.png' },
        { image: 'frame-0-b.png', stale: true },
      ],
    },
    { name: 'Frame 1', pictures: [{ image: 'frame-1-a.svg' }, null] },
  ],
}

Deno.test('Only pictures named in the Session, a picture or null per model, are exported', () => {
  assertEquals(parseComparisonExport(comparison), comparison)
  const withPicture = (image: string) => ({
    ...comparison,
    rows: [{ name: 'Frame 0', pictures: [{ image }, null] }],
  })
  assertEquals(
    parseComparisonExport(withPicture('../other/frame-0.png')),
    'Pictures must be files in the Session',
  )
  assertEquals(
    parseComparisonExport(withPicture('session.json')),
    'Pictures must be files in the Session',
  )
  assertEquals(
    parseComparisonExport({ ...comparison, rows: [{ name: 'Frame 0', pictures: [null] }] }),
    'Each row needs a picture (or null) per model',
  )
  assertEquals(
    parseComparisonExport({ ...comparison, rows: [{ ...comparison.rows[0], caption: 3 }] }),
    'caption must be text',
  )
  assertEquals(parseComparisonExport({ rows: [] }), 'models must each have a label')
})

Deno.test('The exported page is titled by its day and the seed', () => {
  assertEquals(
    comparisonTitle(new Date(2026, 9, 12, 23, 59), 1282725757),
    '12 Oct 2026 · Seed 1282725757',
  )
  assertEquals(comparisonTitle(new Date(2027, 0, 3), 42), '3 Jan 2027 · Seed 42')
  assertEquals(comparisonTitle(new Date(2026, 8, 1), 42), '1 Sept 2026 · Seed 42')
})

Deno.test('An export is a page with the comparison in it, the pictures as WebP beside it', () =>
  withTempDir(async (dir) => {
    const session = join(dir, 'session')
    const out = join(dir, 'out')
    await Deno.mkdir(session)
    await Deno.writeFile(join(session, 'frame-0-a.png'), await png(400, 1024))
    await Deno.writeFile(join(session, 'frame-0-a-2048.png'), await png(800, 2048))
    await Deno.writeFile(join(session, 'frame-0-b.png'), await png(64, 64))
    await Deno.writeTextFile(join(session, 'frame-1-a.svg'), '<svg/>')
    // What an earlier export left goes.
    await Deno.mkdir(join(out, 'images'), { recursive: true })
    await Deno.writeTextFile(join(out, 'images', 'old.webp'), '')

    assertEquals(await writeComparison(session, out, PAGE, comparison, 'The <Tavern>'), {
      pictures: 3,
    })

    const html = await Deno.readTextFile(join(out, 'index.html'))
    assertMatch(html, /^<title>x<\/title><script id="comparison" type="application\/json">\{/)
    assertMatch(html, /The \\u003cTavern>/)
    assertEquals(await pageData(out), {
      title: 'The <Tavern>',
      models: comparison.models,
      rows: [
        {
          name: 'Frame 0',
          prompt: 'A tavern at dusk.',
          caption: 'The tavern, at dusk.',
          pictures: [
            {
              thumb: 'thumbs/frame-0-a.webp',
              full: 'images/frame-0-a-2048.webp',
              width: 200,
              height: 512,
            },
            {
              thumb: 'thumbs/frame-0-b.webp',
              full: 'images/frame-0-b.webp',
              width: 64,
              height: 64,
              stale: true,
            },
          ],
        },
        {
          name: 'Frame 1',
          pictures: [{ thumb: 'thumbs/frame-1-a.svg', full: 'images/frame-1-a.svg' }, null],
        },
      ],
    })
    const read = (file: string) => Deno.readFile(join(out, file))
    // The viewer's at full size, the table's shrunk to 512 px high, a small one as it is.
    assertEquals(webpSize(await read('images/frame-0-a-2048.webp')), { width: 800, height: 2048 })
    assertEquals(webpSize(await read('thumbs/frame-0-a.webp')), { width: 200, height: 512 })
    assertEquals(webpSize(await read('thumbs/frame-0-b.webp')), { width: 64, height: 64 })
    assertEquals(await Deno.readTextFile(join(out, 'images/frame-1-a.svg')), '<svg/>')
    assertEquals(
      (await Array.fromAsync(Deno.readDir(join(out, 'images')))).map((e) => e.name).sort(),
      ['frame-0-a-2048.webp', 'frame-0-b.webp', 'frame-1-a.svg'],
    )
  }))

Deno.test('An export behind an 18+ notice carries it, and says so to filters', () =>
  withTempDir(async (dir) => {
    const page = `<html><head></head><body>${PAGE}</body></html>`
    const plain = { ...comparison, rows: [] }
    await writeComparison(dir, join(dir, 'plain'), page, plain, 'x')
    const notice = '  Some of these pictures show nude figures.  '
    await writeComparison(dir, join(dir, 'adult'), page, { ...plain, notice }, 'x')

    const html = (name: string) => Deno.readTextFile(join(dir, name, 'index.html'))
    assertEquals((await html('plain')).includes('name="rating"'), false)
    assertEquals((await pageData(join(dir, 'plain'))).notice, undefined)
    assertMatch(await html('adult'), /<meta name="rating" content="adult" \/>\n<\/head>/)
    assertEquals(
      (await pageData(join(dir, 'adult'))).notice,
      'Some of these pictures show nude figures.',
    )
  }))

Deno.test('A notice must be some text, and not too long', () => {
  const with_ = (notice: unknown) => parseComparisonExport({ ...comparison, notice })
  assertEquals(with_('  '), 'notice must be some text')
  assertEquals(with_(18), 'notice must be some text')
  assertEquals(with_('x'.repeat(501)), 'notice must be at most 500 characters')
  assertEquals(typeof with_('Nude figures, as in classical painting.'), 'object')
})

Deno.test('A page without a slot for the comparison is not written into', () =>
  withTempDir(async (dir) => {
    await assertRejects(
      () => writeComparison(dir, join(dir, 'out'), '<p>no slot</p>', comparison, 'x'),
      Error,
      'no slot',
    )
  }))
