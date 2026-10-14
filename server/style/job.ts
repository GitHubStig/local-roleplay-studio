import { join } from '@std/path'
import type { JobEmit } from '../jobs.ts'
import { RenderQueue } from '../renderQueue.ts'
import type { Session, SessionStore } from '../session.ts'
import type { StyleEmbedder } from './embedder.ts'
import { loadStyleCache, saveStyleCache, unembedded, withEmbeddings } from './scores.ts'

export interface StyleJobDeps {
  store: SessionStore
  /** CSD and CLIP, when style scores are available. */
  style?: StyleEmbedder
  renderQueue?: RenderQueue
}

/** Why there are no style scores: the embedder is switched off. */
export const STYLE_OFF = "Style scores aren't set up on this server"

/**
 * Embeds the Session's pictures and captions that aren't yet (a `style` job), in its turn behind
 * any render, as both want the GPU. It's light enough (~3 GB) to leave the Text Model loaded. The
 * scores themselves are worked out when asked for (`styleScores`), for whichever base Frame.
 */
export async function embedStyles(
  deps: StyleJobDeps,
  session: Session,
  emit: JobEmit,
  signal: AbortSignal,
): Promise<void> {
  if (!deps.style) throw new Error(STYLE_OFF)
  const dir = deps.store.dir(session.id)
  const todo = unembedded(session, await loadStyleCache(dir))
  if (!todo.images.length && !todo.texts.length) return
  const release = await (deps.renderQueue ?? new RenderQueue()).acquire(
    signal,
    () => emit({ type: 'phase', phase: 'queued' }),
    { light: true },
  )
  try {
    emit({ type: 'phase', phase: 'image' })
    const embedded = await deps.style.embed(
      { images: todo.images.map((f) => join(dir, f)), texts: todo.texts },
      signal,
      (step, total) => emit({ type: 'progress', step, total }),
      (downloading) => emit({ type: 'phase', phase: downloading ? 'download' : 'image' }),
    )
    signal.throwIfAborted()
    // Onto the Session and cache as they are now: Frames may have changed meanwhile.
    const latest = (await deps.store.load(session.id)) ?? session
    await saveStyleCache(dir, latest, withEmbeddings(await loadStyleCache(dir), embedded))
  } finally {
    release()
  }
}
