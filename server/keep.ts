/**
 * What to keep of a Session (the Session manager's ticks): the Session as it's left, and the files
 * that go, both from each part's declaration (`sessionParts.ts`), so an export of what's ticked,
 * Remove the rest and deleting an Image Model's pictures keep the same things. Left out means
 * never made: a record goes with its file, so nothing meets a record whose file is missing. The
 * Frames and their text always stay.
 */
import { join } from '@std/path'
import { beforeFacesOf, PARTS, pictureImages, picturesVersions } from './sessionParts.ts'
import { refuseOwnModel, removeFiles } from './pictures.ts'
import { updateSession } from './update.ts'
import { Refusal } from './refusal.ts'
import type { SessionStore } from './session.ts'
import type { Session } from '../shared/session.ts'
import type { PicturesDeleted } from '../shared/pictures.ts'
import { SESSION_PARTS } from '../shared/sessionContents.ts'
import {
  type Amount,
  KEEP_ALL,
  type KeepOptions,
  type LeftOut,
  SOUND_KINDS,
  type SoundKind,
  THREE_D_KINDS,
  type ThreeDKind,
} from '../shared/keep.ts'
import { CLIP_KINDS } from './video/videoGenerator.ts'

/** The Session without what's left out, part by part. */
export const leaving = (session: Session, left: LeftOut): Session =>
  SESSION_PARTS.reduce((s, part) => PARTS[part].leaveOut(s, left), session)

/**
 * The files that go when Session `before` becomes `after`: those its records named and no longer
 * do, and every file of a part left out whole (`paths`: the files in its folder).
 */
export function filesGone(before: Session, after: Session, paths: string[], left: LeftOut) {
  const gone = new Set<string>()
  for (const part of SESSION_PARTS) {
    const declared = PARTS[part]
    const still = new Set(declared.files(after))
    for (const file of declared.files(before)) if (!still.has(file)) gone.add(file)
    if (declared.allGone?.(left)) { for (const p of paths) if (declared.owns(p)) gone.add(p) }
  }
  return [...gone]
}

/** What a choice of ticks leaves out of Session `session` (`paths`: its files): its files, and their bytes. */
export function goneWith(
  session: Session,
  left: LeftOut,
  paths: string[],
  sizes: ReadonlyMap<string, number>,
) {
  const after = leaving(session, left)
  const gone = filesGone(session, after, paths, left)
  return { after, gone, size: gone.reduce((n, f) => n + (sizes.get(f) ?? 0), 0) }
}

/** What there is to keep or leave out of a Session, each with its bytes on its own. */
export function keepOptions(
  session: Session,
  sizes: ReadonlyMap<string, number>,
  calls: number,
): KeepOptions {
  const amount = (files: string[], count: number): Amount => ({
    count,
    size: [...new Set(files)].reduce((n, f) => n + (sizes.get(f) ?? 0), 0),
  })
  const pictures = session.frames.flatMap((f) => f.pictures)
  const byModel = Map.groupBy(pictures, (p) => p.imageModel)
  const gone = (left: Partial<LeftOut>) =>
    goneWith(session, { ...KEEP_ALL, ...left }, [], sizes).gone
  const versions = pictures.flatMap(picturesVersions)
  const clips = versions.flatMap((v) => v.clips ?? [])
  const clipModels = Map.groupBy(clips, (c) => c.model)
  const threeD = (kind: ThreeDKind) => versions.map((v) => v[kind]).filter((x) => !!x)
  const roleplay = session.kind === 'roleplay' ? session : null
  const sound: Record<SoundKind, string[]> = {
    speech: roleplay?.frames.flatMap((f) => [f.speech?.file, f.thoughtSpeech?.file])
      .filter((f): f is string => !!f) ?? [],
    voices: roleplay?.voice?.ref ? [roleplay.voice.ref] : [],
    cues: roleplay?.cues.flatMap((c) => c.track ? [c.track.file] : []) ?? [],
  }
  const chosen = leaving(session, { ...KEEP_ALL, chosenOnly: true })
  const callLogs = [...sizes.keys()].filter((p) => PARTS.calls.owns(p))
  return {
    imageModel: session.settings.imageModel,
    imageModels: [...byModel].map(([model, of]) => ({
      model,
      ...amount(gone({ imageModels: [model] }), of.length),
      pictures: amount(of.flatMap(pictureImages), 0).size,
    })),
    upscales: amount(gone({ upscales: true }), versions.filter((v) => v.upscaled).length),
    edits: amount(gone({ edits: true }), pictures.reduce((n, p) => n + (p.edits?.length ?? 0), 0)),
    beforeFaces: amount(gone({ beforeFaces: true }), beforeFacesOf(session).length),
    chosen: amount(
      PARTS.pictures.files(chosen),
      chosen.frames.reduce((n, f) => n + f.pictures.length, 0),
    ),
    clips: [...clipModels].map(([model, of]) => ({
      model,
      kinds: CLIP_KINDS.flatMap((kind) => {
        const these = of.filter((c) => c.kind === kind)
        return these.length ? [{ kind, ...amount(these.map((c) => c.file), these.length) }] : []
      }),
    })),
    threeD: THREE_D_KINDS.map((kind) => {
      const made = threeD(kind)
      return { kind, ...amount(made.map((m) => m!.file), made.length) }
    }).filter((t) => t.count),
    sound: SOUND_KINDS.map((kind) => ({ kind, ...amount(sound[kind], sound[kind].length) }))
      .filter((s) => s.count),
    calls: amount(callLogs, calls),
  }
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/** What's left out, as the browser sent it, checked; refused if it isn't that shape. */
export function leftOutFrom(value: unknown): LeftOut {
  const v = value as Partial<Record<keyof LeftOut, unknown>> | null
  const bad = (what: string) => new Refusal(`What's left out isn't right: ${what}`, 400)
  if (typeof v !== 'object' || v === null) throw bad('send an object')
  for (const key of ['upscales', 'edits', 'beforeFaces', 'chosenOnly', 'calls'] as const) {
    if (typeof v[key] !== 'boolean') throw bad(`${key} must be true or false`)
  }
  if (!isStrings(v.imageModels)) throw bad('imageModels must be a list of names')
  if (
    !isStrings(v.threeD) || !v.threeD.every((k) => (THREE_D_KINDS as readonly string[]).includes(k))
  ) {
    throw bad(`threeD must list some of ${THREE_D_KINDS.join(', ')}`)
  }
  if (
    !isStrings(v.sound) || !v.sound.every((k) => (SOUND_KINDS as readonly string[]).includes(k))
  ) {
    throw bad(`sound must list some of ${SOUND_KINDS.join(', ')}`)
  }
  const clips = v.clips as Record<string, unknown> | null
  if (typeof clips !== 'object' || clips === null || !Object.values(clips).every(isStrings)) {
    throw bad('clips must map video models to kinds of clip')
  }
  return v as LeftOut
}

/** Every file in a Session's folder, by path, with its size. */
export const sizesIn = (files: { path: string; size: number }[]) =>
  new Map(files.map((f) => [f.path, f.size]))

/**
 * Deletes every picture by one Image Model, with everything made from it; not the Session's own
 * model. Sends back the Session, and how many pictures went.
 */
export async function deleteModelPictures(
  store: SessionStore,
  session: Session,
  model: string,
): Promise<PicturesDeleted> {
  let files: string[] = []
  let deleted = 0
  const left = { ...KEEP_ALL, imageModels: [model] }
  const updated = await updateSession(store, session.id, session.kind, (latest: Session) => {
    refuseOwnModel(latest, model)
    deleted = latest.frames.reduce(
      (n, f) => n + f.pictures.filter((p) => p.imageModel === model).length,
      0,
    )
    const after = leaving(latest, left)
    files = filesGone(latest, after, [], left)
    return after
  })
  await removeFiles(store.dir(session.id), files)
  return { session: updated, deleted }
}

/**
 * Leaves out of Session `session` (in folder `dir`, holding `paths`) what `left` names, in place:
 * its records saved without it, then its files deleted. The bytes freed.
 */
export async function removeLeftOut(
  store: SessionStore,
  session: Session,
  left: LeftOut,
  files: { path: string; size: number }[],
): Promise<{ session: Session; freed: number }> {
  const sizes = sizesIn(files)
  let gone: string[] = []
  const updated = await updateSession(store, session.id, session.kind, (latest: Session) => {
    const after = leaving(latest, left)
    gone = filesGone(latest, after, files.map((f) => f.path), left)
    return after
  })
  await removeFiles(store.dir(session.id), gone)
  // An emptied call log folder goes too.
  if (left.calls) await Deno.remove(join(store.dir(session.id), 'calls')).catch(() => {})
  return { session: updated, freed: gone.reduce((n, f) => n + (sizes.get(f) ?? 0), 0) }
}
