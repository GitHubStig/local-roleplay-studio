import { assertEquals, assertMatch, assertRejects } from '@std/assert'
import encodePng from '@jsquash/png/encode.js'
import { join } from '@std/path'
import { withTempDir } from '../testing.ts'
import { type ComparisonExport, parseComparisonExport, writeComparison } from './comparison.ts'

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
  title: 'The <Tavern>',
  models: [{ label: 'A' }, { label: 'B' }],
  rows: [
    {
      name: 'Frame 0',
      prompt: 'A tavern at dusk.',
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
  assertEquals(parseComparisonExport({ models: [], rows: [] }), 'title must be a string')
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

    assertEquals(await writeComparison(session, out, PAGE, comparison), { pictures: 3 })

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
          pictures: [
            { thumb: 'thumbs/frame-0-a.webp', full: 'images/frame-0-a-2048.webp' },
            { thumb: 'thumbs/frame-0-b.webp', full: 'images/frame-0-b.webp', stale: true },
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

Deno.test('A page without a slot for the comparison is not written into', () =>
  withTempDir(async (dir) => {
    await assertRejects(
      () => writeComparison(dir, join(dir, 'out'), '<p>no slot</p>', comparison),
      Error,
      'no slot',
    )
  }))
