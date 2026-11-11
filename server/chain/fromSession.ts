/**
 * A Chain made from another Session, to carry on from one of its Frames by Actions (ADR 0018): a
 * Storyboard's Frames up to one of them, or a Roleplay's pictured Frame as its Opening Frame. The
 * Session it's made from is left as it is. Done in code, with no Text Model: the Image Prompts keep
 * every word, so the pictures copied with them still show them.
 */
import { frameName } from '../frames.ts'
import { join } from '@std/path'
import { joinPrompt, sentences } from '../imagePrompt.ts'
import { shownSubjects } from '../look.ts'
import { editLine } from '../pictures.ts'
import type { Picture, PictureVersion } from '../../shared/pictures.ts'
import type { SessionStore } from '../session.ts'
import type { ChainFrame, ChainSession, Look, StoryboardSession } from '../../shared/session.ts'
import type { RoleplaySession } from '../../shared/roleplay.ts'
import { Refusal } from '../refusal.ts'

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
export const chainPrompt = (look: Look, frame: { body: string; shown: string[] }): string =>
  joinPrompt(
    oneSubject(shownSubjects(look, frame.shown).map((p) => p.identity)),
    frame.body,
    look.style,
  )

/** Two prompts that differ only in where a sentence ends: a picture of one is a picture of both. */
const samePicture = (a: string, b: string) => {
  const words = (s: string) => s.replace(/[.;]\s/g, ' ')
  return words(a) === words(b)
}

export class CopyError extends Refusal {}

/** A file's name in the Chain: its kind and its new Frame's index, with a fresh suffix. */
const copyName = (file: string, index: number) => {
  const fresh = crypto.randomUUID().slice(0, 8)
  const named = file.replace(/^([a-z]+)-\d+-[0-9a-f]{8}/, `$1-${index}-${fresh}`)
  return named === file ? `${fresh}-${file}` : named
}

/**
 * `picture` with its files renamed for Frame `index`, noting each copy to make: its render, and its
 * picked edit if it has one (ADR 0021), still picked, with every instruction that led to it in its
 * edit model's line. The other edits, the painted areas and the clips stay behind (a clip into the
 * next Frame would end on a picture the Chain may not have).
 */
function copiedPicture(picture: Picture, index: number, files: [string, string][]): Picture {
  const rename = (file: string) => {
    const to = copyName(file, index)
    files.push([file, to])
    return to
  }
  const copied = <V extends PictureVersion>(version: V): V => {
    const { upscaled, scene, figure, lito, clips: _, ...rest } = version
    return {
      ...rest as V,
      image: rename(version.image),
      ...(upscaled ? { upscaled: rename(upscaled) } : {}),
      ...(scene ? { scene: { ...scene, file: rename(scene.file) } } : {}),
      ...(figure ? { figure: { ...figure, file: rename(figure.file) } } : {}),
      ...(lito ? { lito: { ...lito, file: rename(lito.file) } } : {}),
    }
  }
  const { edits, picked, ...render } = picture
  const edit = picked ? edits?.[picked - 1] : undefined
  if (!edit) return copied(render)
  const { mask: _, ...made } = edit
  const line = editLine(picture, edit.editModel)
  return {
    ...copied(render),
    edits: [{
      ...copied(made),
      instructions: line.slice(0, line.indexOf(edit) + 1).flatMap((e) => e.instructions),
      copied: true,
    }],
    picked: 1,
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
  chain: Pick<ChainSession, 'id' | 'createdAt'>,
): Promise<ChainSession> {
  const last = storyboard.frames[upTo]
  if (!storyboard.look || !last) throw new CopyError('No such Frame')
  if (storyboard.frames.slice(0, upTo + 1).some((f) => !f.body)) {
    throw new CopyError(`Write the Frames up to ${frameName(upTo)} first`)
  }
  if (last.blocked) {
    throw new CopyError(`${frameName(upTo)} crosses a limit (${last.blocked}): edit it first`)
  }
  const files: [string, string][] = []
  const frames = storyboard.frames.slice(0, upTo + 1).filter((f) => !f.blocked).map(
    (f, index): ChainFrame => {
      const prompt = chainPrompt(storyboard.look!, f)
      return {
        index,
        action: index === 0 ? null : f.beat,
        narration: index === 0 ? f.beat : `From the Storyboard's ${frameName(f.index)}.`,
        outcome: 'done',
        prompt,
        pictures: matching(prompt, f.prompt, f.pictures.map((p) => copiedPicture(p, index, files))),
        // Written (its body is checked above), so it has both.
        timings: f.timings!,
        textModel: f.textModel!,
        createdAt: chain.createdAt,
      }
    },
  )
  return await saveCopy(store, storyboard, frames, files, chain)
}

/**
 * Makes and saves a Chain whose Opening Frame is `roleplay`'s Frame `index`: its Image Prompt as
 * nine sentences (everyone shown joined into one subject sentence) and its pictures, so the Chain
 * starts from exactly that picture. It needs an Image Prompt that crosses no Limit. The Brief,
 * Settings and seed are the Roleplay's; the conversation stays behind.
 */
export async function chainFromRoleplay(
  store: SessionStore,
  roleplay: RoleplaySession,
  index: number,
  chain: Pick<ChainSession, 'id' | 'createdAt'>,
): Promise<ChainSession> {
  const frame = roleplay.frames[index]
  if (!frame) throw new CopyError('No such Frame')
  if (!roleplay.look || frame.body === undefined || !frame.prompt) {
    throw new CopyError(`Picture ${frameName(index)} first: a Chain starts from its Image Prompt`)
  }
  if (frame.blocked) {
    throw new CopyError(
      `${frameName(index)} crosses a limit (${frame.blocked}): picture it again first`,
    )
  }
  const files: [string, string][] = []
  const prompt = chainPrompt(roleplay.look, { body: frame.body, shown: frame.shown ?? [] })
  const opening: ChainFrame = {
    index: 0,
    action: null,
    narration: `From the Roleplay's ${frameName(index)}.`,
    outcome: 'done',
    prompt,
    pictures: matching(prompt, frame.prompt, frame.pictures.map((p) => copiedPicture(p, 0, files))),
    timings: frame.pictureTimings ?? { text: 0 },
    textModel: frame.pictureModel ?? frame.textModel,
    createdAt: chain.createdAt,
  }
  return await saveCopy(store, roleplay, [opening], files, chain)
}

/** `pictures`, marked out of date unless `prompt` shows what `was` did. */
const matching = (prompt: string, was: string, pictures: Picture[]) =>
  samePicture(prompt, was) ? pictures : pictures.map((p) => ({ ...p, stale: true }))

/**
 * Saves a Chain of `frames` made from `from`, with its Brief, Scenario, Settings and seed, copying
 * `files` across; on any failure nothing of it is left.
 */
async function saveCopy(
  store: SessionStore,
  from: StoryboardSession | RoleplaySession,
  frames: ChainFrame[],
  files: [string, string][],
  chain: Pick<ChainSession, 'id' | 'createdAt'>,
): Promise<ChainSession> {
  const session: ChainSession = {
    id: chain.id,
    kind: 'chain',
    brief: from.brief,
    scenarioId: from.scenarioId,
    ...from.scenario && { scenario: from.scenario },
    settings: from.settings,
    seed: from.seed,
    createdAt: chain.createdAt,
    frames,
  }
  const source = store.dir(from.id)
  const to = store.dir(session.id)
  try {
    await Deno.mkdir(to, { recursive: true })
    for (const [a, b] of files) await Deno.copyFile(join(source, a), join(to, b))
    await store.save(session)
  } catch (err) {
    await store.remove(session.id)
    throw err
  }
  return session
}
