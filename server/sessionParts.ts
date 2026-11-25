/**
 * The parts of a Session's folder, declared in one place: which files each part owns, what it
 * holds, the files its records name, and how what's left out of it goes from a Session's records.
 * The Session manager counts and sizes a Session by it, and its ticks keep or leave out by it
 * (`keep.ts`): an export of what's ticked, Remove the rest, and deleting an Image Model's pictures.
 * What's served from a Session's folder is what a part owns there.
 */
import { join } from '@std/path'
import type { Session, SheetPicture } from '../shared/session.ts'
import type { Picture, PictureEdit, PictureVersion } from '../shared/pictures.ts'
import type { LeftOut } from '../shared/keep.ts'
import {
  SESSION_PARTS,
  type SessionContents,
  type SessionCounts,
  type SessionPart,
} from '../shared/sessionContents.ts'

/** What each part declares. */
interface PartDeclaration {
  /**
   * Whether a file in the Session's folder is this part's, by its path inside it, with `/` between
   * folders (`frame-3-1a2b3c4d.png`, `calls/frame-3.json`).
   */
  owns(path: string): boolean
  /** How many of what it holds there are, from the Session's records (`read` reads a file of it). */
  count(
    session: Session,
    paths: string[],
    read: (path: string) => Promise<string>,
  ): Promise<Partial<SessionCounts>>
  /** The files of it a Session's records name. */
  files(session: Session): string[]
  /**
   * The Session without what's left out of this part, its records changed (the files they no
   * longer name go with them, `keep.ts`).
   */
  leaveOut(session: Session, left: LeftOut): Session
  /** Whether every file it owns goes, named by records or not (the call logs). */
  allGone?(left: LeftOut): boolean
}

/**
 * Frame images: `frame-3-1a2b3c4d.png`, or `frame-3.png` without the unique suffix, edits of them
 * (`edit-3-1a2b3c4d.png`, ADR 0021) and the areas painted for them (`mask-3-1a2b3c4d.png`);
 * `-2048` marks an upscaled one.
 */
const IMAGE_FILE = /^(frame|edit|mask)-\d+(-[0-9a-f]{8})?(-2048)?\.(png|svg)$/
/**
 * A reference sheet (`sheet-kael-1a2b3c4d.png`, `sheets/sheets.ts`), and each of its three views
 * cut from it, and mirrored (`…-view1.png`, `…-view1-mirrored.png`).
 */
const SHEET_FILE = /^sheet-[a-z0-9-]+-[0-9a-f]{8}(-view[123](-mirrored)?)?\.(png|svg)$/
/** The files a made sheet keeps: the sheet, its views and their mirrors. */
export const sheetFiles = (made: SheetPicture | undefined): string[] =>
  made ? [made.file, ...made.views, ...made.mirrored] : []

/** A clip made from a Frame's picture (`clip-3-lead-in-1a2b3c4d.mp4`, `video/makeClip.ts`). */
const CLIP_FILE = /^clip-\d+-[a-z-]+-[0-9a-f]{8}\.mp4$/
/**
 * A Roleplay Frame's 2.5D scene (`scene-3-1a2b3c4d.ply`, SHARP) or 3D figure (`figure-3-…`,
 * TripoSplat; `lito-3-…`, LiTo).
 */
const SCENE_FILE = /^(scene|figure|lito)-\d+-[0-9a-f]{8}\.ply$/
/**
 * A Roleplay's audio: its Character's voice (`voice-1a2b3c4d.wav`, lossless; FLAC from ComfyUI),
 * spoken lines (`speech-3-…`) and spoken thoughts (`thought-3-…`): MP3 (FLAC from ComfyUI), or WAV
 * from before 2026-10-02.
 */
const AUDIO_FILE =
  /^(voice-[0-9a-f]{8}\.(wav|flac)|(speech|thought)-\d+-[0-9a-f]{8}\.(mp3|wav|flac))$/
/** A Cue's track (`music-cue-1a2b3c4d-5e6f7a8b.flac`, `roleplay/music/tracks.ts`). */
const MUSIC_FILE = /^music-cue-[0-9a-f]{8}-[0-9a-f]{8}\.flac$/
/** A Frame's call log (`calls/frame-3.json`), or the setup's (`calls/setup.json`): `calls.ts`. */
const CALL_LOG = /^calls\/(frame-\d+|setup)\.json$/

/** Every picture of every Frame, by every Image Model. */
const picturesOf = (session: Session): Picture[] => session.frames.flatMap((f) => f.pictures)
/** Every version of every picture: each render and each edit. */
const versionsOf = (session: Session): PictureVersion[] =>
  picturesOf(session).flatMap((p) => [p, ...(p.edits ?? [])])

/** The Session with each picture changed by `change`. */
const changePictures = (session: Session, change: (p: Picture) => Picture | null): Session =>
  ({
    ...session,
    frames: session.frames.map((f) => ({
      ...f,
      pictures: f.pictures.map(change).filter((p): p is Picture => p !== null),
    })),
  }) as Session

/** The Session with every version of every picture (each render and edit) changed by `change`. */
const changeVersions = (
  session: Session,
  change: <V extends PictureVersion>(v: V) => V,
): Session =>
  changePictures(session, (p) => {
    const changed = change(p)
    return p.edits ? { ...changed, edits: p.edits.map((e) => change(e) as PictureEdit) } : changed
  })

/** The picture as it shows now, made its Original: its picked version's files, its history gone. */
function asChosen(p: Picture): Picture {
  const { edits: _, picked, ...render } = p
  const edit = picked ? p.edits?.[picked - 1] : undefined
  if (!edit) return render
  const { file, upscaled, scene, figure, lito, clips } = edit
  const { timings: __, ...kept } = render
  return {
    imageModel: kept.imageModel,
    ...kept.imageBackend && { imageBackend: kept.imageBackend },
    ...kept.stale && { stale: kept.stale },
    file,
    ...upscaled && { upscaled },
    ...scene && { scene },
    ...figure && { figure },
    ...lito && { lito },
    ...clips && { clips },
  }
}

/** The files a picture's records name as pictures: each version's image, upscale and painted area. */
export const pictureImages = (p: Picture): string[] =>
  [p, ...(p.edits ?? [])].flatMap((v) => [
    v.file,
    v.upscaled,
    'mask' in v ? (v as PictureEdit).mask : undefined,
  ]).filter((f): f is string => !!f)

/** A version's 3D, by kind. */
const THREE_D_FIELDS = { scene: 'scene', figure: 'figure', lito: 'lito' } as const

export const PARTS: Record<SessionPart, PartDeclaration> = {
  pictures: {
    owns: (path) => IMAGE_FILE.test(path),
    files: (session) => picturesOf(session).flatMap(pictureImages),
    leaveOut: (session, left) => {
      let s = session
      if (left.chosenOnly) {
        const model = s.settings.imageModel
        s = {
          ...s,
          frames: s.frames.map((f) => {
            const shown = f.pictures.find((p) => p.imageModel === model)
            return { ...f, pictures: shown ? [asChosen(shown)] : [] }
          }),
        } as Session
      }
      if (left.imageModels.length) {
        s = changePictures(s, (p) => left.imageModels.includes(p.imageModel) ? null : p)
      }
      if (left.edits) s = changePictures(s, ({ edits: _, picked: __, ...p }) => p)
      if (left.upscales) {
        s = changeVersions(s, (v) => {
          const kept = { ...v }
          delete kept.upscaled
          return kept
        })
      }
      // The picture chosen for Home goes if it did.
      if (s.thumbnail && !picturesOf(s).some((p) => pictureImages(p).includes(s.thumbnail!))) {
        const { thumbnail: _, ...rest } = s
        s = rest as Session
      }
      return s
    },
    count: (session) => {
      const pictures = picturesOf(session)
      return Promise.resolve({
        pictures: pictures.length,
        imageModels: new Set(pictures.map((p) => p.imageModel)).size,
        edits: pictures.reduce((n, p) => n + (p.edits?.length ?? 0), 0),
      })
    },
  },
  // Never left out: every later picture's face pass needs them, and they're small.
  sheets: {
    owns: (path) => SHEET_FILE.test(path),
    files: (session) =>
      session.kind === 'chain' ? [] : session.sheets.flatMap((s) => sheetFiles(s.made)),
    leaveOut: (session) => session,
    count: (session) =>
      Promise.resolve({
        sheets: session.kind === 'chain' ? 0 : session.sheets.filter((s) => s.made).length,
      }),
  },
  clips: {
    owns: (path) => CLIP_FILE.test(path),
    files: (session) => versionsOf(session).flatMap((v) => (v.clips ?? []).map((c) => c.file)),
    leaveOut: (session, left) =>
      Object.keys(left.clips).length === 0 ? session : changeVersions(session, (v) => {
        if (!v.clips) return v
        const { clips, ...rest } = v
        const kept = clips.filter((c) => !left.clips[c.model]?.includes(c.kind))
        return (kept.length ? { ...rest, clips: kept } : rest) as typeof v
      }),
    count: (session) =>
      Promise.resolve({
        clips: versionsOf(session).reduce((n, v) => n + (v.clips?.length ?? 0), 0),
      }),
  },
  '3d': {
    owns: (path) => SCENE_FILE.test(path),
    files: (session) =>
      versionsOf(session).flatMap((v) => [v.scene?.file, v.figure?.file, v.lito?.file])
        .filter((f): f is string => !!f),
    leaveOut: (session, left) =>
      left.threeD.length === 0 ? session : changeVersions(session, (v) => {
        const kept = { ...v }
        for (const kind of left.threeD) delete kept[THREE_D_FIELDS[kind]]
        return kept
      }),
    count: (session) =>
      Promise.resolve({
        threeD: versionsOf(session).reduce(
          (n, v) => n + [v.scene, v.figure, v.lito].filter(Boolean).length,
          0,
        ),
      }),
  },
  sound: {
    owns: (path) => AUDIO_FILE.test(path) || MUSIC_FILE.test(path),
    // A line's `ref` names the voice it was spoken in, not a file of its own.
    files: (session) =>
      session.kind !== 'roleplay' ? [] : [
        ...session.frames.flatMap((f) => [f.speech?.file, f.thoughtSpeech?.file]),
        session.voice?.ref,
        ...session.cues.map((c) => c.track?.file),
      ].filter((f): f is string => !!f),
    leaveOut: (session, left) => {
      if (session.kind !== 'roleplay' || left.sound.length === 0) return session
      let s = session
      if (left.sound.includes('speech')) {
        s = { ...s, frames: s.frames.map(({ speech: _, thoughtSpeech: __, ...f }) => f) }
      }
      if (left.sound.includes('voices') && s.voice?.ref) {
        const { ref: _, ...voice } = s.voice
        s = { ...s, voice }
      }
      if (left.sound.includes('cues')) s = { ...s, cues: s.cues.map(({ track: _, ...c }) => c) }
      return s
    },
    count: (session) =>
      Promise.resolve(
        session.kind === 'roleplay'
          ? {
            speech: session.frames.reduce(
              (n, f) => n + (f.speech ? 1 : 0) + (f.thoughtSpeech ? 1 : 0),
              0,
            ),
            cues: session.cues.filter((c) => c.track).length,
          }
          : {},
      ),
  },
  calls: {
    owns: (path) => CALL_LOG.test(path),
    // No record names a call log: they go together, or not at all.
    files: () => [],
    leaveOut: (session) => session,
    allGone: (left) => left.calls,
    // Each log is a JSON array of calls; one that can't be read counts none.
    count: async (_session, paths, read) => {
      const logs = paths.filter((p) => CALL_LOG.test(p))
      const lengths = await Promise.all(
        logs.map((p) =>
          read(p).then((text) => {
            const calls = JSON.parse(text)
            return Array.isArray(calls) ? calls.length : 0
          }).catch(() => 0)
        ),
      )
      return { calls: lengths.reduce((a, b) => a + b, 0) }
    },
  },
}

/** The part a file in a Session's folder belongs to, by its path there; null for none. */
export const partOf = (path: string): SessionPart | null =>
  SESSION_PARTS.find((part) => PARTS[part].owns(path)) ?? null

/**
 * Whether a file at the top of a Session's folder is one it serves: a picture, reference sheet,
 * clip, 3D, audio or music file (not its text, its call logs or a cache).
 */
export const servedFile = (file: string): boolean =>
  !file.includes('/') && partOf(file) !== null && partOf(file) !== 'calls'

/** Every file in folder `dir`, however deep, by its path there with `/` between folders, and its size. */
export async function filesIn(dir: string): Promise<{ path: string; size: number }[]> {
  const found: { path: string; size: number }[] = []
  async function walk(sub: string) {
    let entries: Deno.DirEntry[]
    try {
      entries = await Array.fromAsync(Deno.readDir(join(dir, sub)))
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return
      throw err
    }
    await Promise.all(entries.map(async (e) => {
      const path = sub ? `${sub}/${e.name}` : e.name
      if (e.isDirectory) return walk(path)
      if (!e.isFile) return
      // A file removed meanwhile is left out.
      const size = await Deno.stat(join(dir, path)).then((s) => s.size, () => null)
      if (size !== null) found.push({ path, size })
    }))
  }
  await walk('')
  return found
}

/** Bytes on disk in a Session's folder `dir`. */
export const sizeOf = async (dir: string): Promise<number> =>
  (await filesIn(dir)).reduce((n, f) => n + f.size, 0)

/** What Session `session`, in folder `dir`, holds: its size by part, and its counts. */
export async function contentsOf(session: Session, dir: string): Promise<SessionContents> {
  const files = await filesIn(dir)
  const parts = Object.fromEntries(SESSION_PARTS.map((p) => [p, 0])) as Record<SessionPart, number>
  let rest = 0
  for (const f of files) {
    const part = partOf(f.path)
    if (part) parts[part] += f.size
    else rest += f.size
  }
  const paths = files.map((f) => f.path)
  const read = (path: string) => Deno.readTextFile(join(dir, path))
  const counted = await Promise.all(SESSION_PARTS.map((p) => PARTS[p].count(session, paths, read)))
  const counts: SessionCounts = {
    frames: session.frames.length,
    pictures: 0,
    imageModels: 0,
    edits: 0,
    sheets: 0,
    clips: 0,
    speech: 0,
    threeD: 0,
    cues: 0,
    calls: 0,
    ...Object.assign({}, ...counted),
  }
  return { size: rest + SESSION_PARTS.reduce((n, p) => n + parts[p], 0), parts, rest, counts }
}
