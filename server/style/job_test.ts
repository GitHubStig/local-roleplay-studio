import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import { dirSessionStore, type Session } from '../session.ts'
import { promptWith, withTempDir } from '../testing.ts'
import { type Embeddings, type StyleEmbedder, uvStyleEmbedder } from './embedder.ts'
import { embedStyles } from './job.ts'
import { loadStyleCache } from './scores.ts'

const session = (frames: number): Session => ({
  id: 'style-job',
  kind: 'chain',
  brief: 'A tavern',
  scenarioId: null,
  settings: {} as Session['settings'],
  seed: 1,
  createdAt: '2026-10-14T00:00:00.000Z',
  frames: Array.from({ length: frames }, (_, index) => ({
    index,
    action: null,
    narration: `Style ${index}`,
    outcome: 'done' as const,
    prompt: promptWith('standing'),
    pictures: [{ image: `frame-${index}-1a2b3c4d.png`, imageModel: 'qwen-image-2.1' }],
    createdAt: '2026-10-14T00:00:00.000Z',
  })),
})

/** Embeds everything as the same vector, noting what it was asked for. */
function fakeEmbedder(asked: { images: string[]; texts: string[] }[]): StyleEmbedder {
  return {
    embed(req, _signal, onProgress) {
      asked.push(req)
      onProgress?.(req.images.length, req.images.length)
      const v = btoa(String.fromCharCode(...new Uint8Array(new Float32Array([1]).buffer)))
      const out: Embeddings = {
        images: Object.fromEntries(req.images.map((p) => [p, { csd: v, clip: v }])),
        texts: Object.fromEntries(req.texts.map((t) => [t, v])),
      }
      return Promise.resolve(out)
    },
  }
}

Deno.test('embedStyles embeds only what is new, and keeps it in style.json', () =>
  withTempDir(async (root) => {
    const store = dirSessionStore(root)
    const asked: { images: string[]; texts: string[] }[] = []
    const deps = { store, style: fakeEmbedder(asked) }
    const events: unknown[] = []
    const signal = new AbortController().signal
    await store.save(session(2))
    await embedStyles(deps, session(2), (e) => events.push(e), signal)
    await store.save(session(3))
    await embedStyles(deps, session(3), () => {}, signal)
    await embedStyles(deps, session(3), () => {}, signal)
    const dir = store.dir('style-job')
    assertEquals(asked, [
      {
        images: [join(dir, 'frame-0-1a2b3c4d.png'), join(dir, 'frame-1-1a2b3c4d.png')],
        texts: ['Style 0', 'Style 1'],
      },
      { images: [join(dir, 'frame-2-1a2b3c4d.png')], texts: ['Style 2'] },
    ])
    assertEquals(events, [
      { type: 'phase', phase: 'image' },
      { type: 'progress', step: 2, total: 2 },
    ])
    const cache = await loadStyleCache(dir)
    assertEquals(Object.keys(cache!.csd).length, 3)
    // A picture gone from the Session goes from the cache when something new is embedded.
    const remade = session(1)
    remade.frames[0].pictures[0].image = 'frame-0-5e6f7a8b.png'
    await store.save(remade)
    await embedStyles(deps, remade, () => {}, signal)
    assertEquals(Object.keys((await loadStyleCache(dir))!.csd), ['frame-0-5e6f7a8b.png'])
  }))

Deno.test('uvStyleEmbedder passes the request to the script and reads back what it wrote', () =>
  withTempDir(async (dir) => {
    // The command gets `--in <request> --out <embeddings>`, as `Deno.args` 0 to 3.
    const script = `
      const req = JSON.parse(await Deno.readTextFile(Deno.args[1]))
      console.error('Embedded 1 of 1')
      await Deno.writeTextFile(Deno.args[3], JSON.stringify({ images: { [req.images[0]]: { csd: 'a', clip: 'b' } }, texts: {} }))
      console.log('{"pictures": 1}')`
    const progress: number[][] = []
    const out = await uvStyleEmbedder({ command: ['deno', 'eval', script] }).embed(
      { images: [join(dir, 'frame-0.png')], texts: [] },
      new AbortController().signal,
      (done, total) => progress.push([done, total]),
    )
    assertEquals(out, {
      images: { [join(dir, 'frame-0.png')]: { csd: 'a', clip: 'b' } },
      texts: {},
    })
    assertEquals(progress, [[1, 1]])
  }))
