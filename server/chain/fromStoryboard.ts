/**
 * A Chain made from a Storyboard: a new Session holding the Storyboard's Frames up to one of them,
 * to carry on from that Frame by Actions. The Storyboard is left as it is. Done in code, with no
 * Text Model: the Image Prompts keep every word, so the pictures copied with them still show them.
 */
import { join } from '@std/path'
import { joinPrompt, sentences } from '../imagePrompt.ts'
import { shownSubjects } from '../look.ts'
import type { Picture } from '../pictures.ts'
import type {
  ChainFrame,
  ChainSession,
  SessionStore,
  StoryboardFrame,
  StoryboardSession,
} from '../session.ts'

/** The subject sentence of a Frame that shows no one. */
export const NO_ONE = 'No one is in the picture.'

/**
 * One subject sentence for everyone a picture shows, as a Chain's Image Prompt has: each person's
 * identity, word for word, joined by semicolons (a Storyboard's has a sentence or more each).
 */
export function oneSubject(identities: string[]): string {
  const parts = identities.flatMap(sentences).map((s) => s.replace(/[.!?]$/, ''))
  return parts.length ? `${parts.join('; ')}.` : NO_ONE
}

/**
 * A Storyboard Frame's Image Prompt as a Chain's: nine sentences, the first describing everyone
 * shown.
 */
export const chainPrompt = (storyboard: StoryboardSession, frame: StoryboardFrame): string => {
  const look = storyboard.look!
  return joinPrompt(
    oneSubject(shownSubjects(look, frame.shown).map((p) => p.identity)),
    frame.body,
    look.style,
  )
}

/** Two prompts that differ only in where a sentence ends: a picture of one is a picture of both. */
const samePicture = (a: string, b: string) => {
  const words = (s: string) => s.replace(/[.;]\s/g, ' ')
  return words(a) === words(b)
}

export class CopyError extends Error {}

/** A file's name in the Chain: its kind and its new Frame's index, with a fresh suffix. */
const copyName = (file: string, index: number) => {
  const fresh = crypto.randomUUID().slice(0, 8)
  const named = file.replace(/^([a-z]+)-\d+-[0-9a-f]{8}/, `$1-${index}-${fresh}`)
  return named === file ? `${fresh}-${file}` : named
}

/** `picture` with its files renamed for Frame `index`, noting each copy to make. */
function copiedPicture(picture: Picture, index: number, files: [string, string][]): Picture {
  const rename = (file: string) => {
    const to = copyName(file, index)
    files.push([file, to])
    return to
  }
  const { upscaled, scene, figure, lito } = picture
  return {
    ...picture,
    image: rename(picture.image),
    ...(upscaled ? { upscaled: rename(upscaled) } : {}),
    ...(scene ? { scene: { ...scene, file: rename(scene.file) } } : {}),
    ...(figure ? { figure: { ...figure, file: rename(figure.file) } } : {}),
    ...(lito ? { lito: { ...lito, file: rename(lito.file) } } : {}),
  }
}

/**
 * Makes and saves a Chain from `storyboard`'s Frames up to `upTo`, the last of them its latest:
 * the first is its Opening Frame, and each later one has its Beat as the Action. Blocked Frames
 * are left out, and `upTo` can't be one. The Brief, Settings and seed are the Storyboard's, so its
 * pictures are copied with their Frames (under new names), marked out of date where a prompt
 * changed more than where its sentences end (a Frame of no one gains a subject sentence).
 */
export async function chainFromStoryboard(
  store: SessionStore,
  storyboard: StoryboardSession,
  upTo: number,
  chain: Pick<ChainSession, 'id' | 'createdAt' | 'renderFrames'>,
): Promise<ChainSession> {
  const last = storyboard.frames[upTo]
  if (!storyboard.look || !last) throw new CopyError('No such Frame')
  if (storyboard.frames.slice(0, upTo + 1).some((f) => !f.body)) {
    throw new CopyError(`Write the Frames up to Frame ${upTo + 1} first`)
  }
  if (last.blocked) {
    throw new CopyError(`Frame ${upTo + 1} crosses a limit (${last.blocked}): edit it first`)
  }
  const files: [string, string][] = []
  const frames = storyboard.frames.slice(0, upTo + 1).filter((f) => !f.blocked).map(
    (f, index): ChainFrame => {
      const prompt = chainPrompt(storyboard, f)
      const pictures = f.pictures.map((p) => copiedPicture(p, index, files))
      return {
        index,
        action: index === 0 ? null : f.beat,
        narration: index === 0 ? f.beat : `From the Storyboard's Frame ${f.index + 1}.`,
        outcome: 'done',
        prompt,
        pictures: samePicture(prompt, f.prompt)
          ? pictures
          : pictures.map((p) => ({ ...p, stale: true })),
        createdAt: chain.createdAt,
      }
    },
  )
  const session: ChainSession = {
    id: chain.id,
    kind: 'chain',
    brief: storyboard.brief,
    scenarioId: storyboard.scenarioId,
    settings: storyboard.settings,
    seed: storyboard.seed,
    createdAt: chain.createdAt,
    frames,
    ...(chain.renderFrames === undefined ? {} : { renderFrames: chain.renderFrames }),
  }
  const from = store.dir(storyboard.id)
  const to = store.dir(session.id)
  try {
    await Deno.mkdir(to, { recursive: true })
    for (const [a, b] of files) await Deno.copyFile(join(from, a), join(to, b))
    await store.save(session)
  } catch (err) {
    await store.remove(session.id)
    throw err
  }
  return session
}
