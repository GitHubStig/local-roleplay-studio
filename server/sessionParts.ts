/**
 * The parts of a Session's folder, declared in one place: which files each part owns, and what it
 * holds. The Session manager counts and sizes a Session by it; what's served from a Session's
 * folder is what a part owns there. (Exporting a part and clearing it from a Session are to come,
 * here too: docs/session-manager-plans.md.)
 */
import { join } from '@std/path'
import type { Session } from '../shared/session.ts'
import type { Picture, PictureVersion } from '../shared/pictures.ts'
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
}

/**
 * Frame images: `frame-3-1a2b3c4d.png`, or `frame-3.png` without the unique suffix, edits of them
 * (`edit-3-1a2b3c4d.png`, ADR 0021) and the areas painted for them (`mask-3-1a2b3c4d.png`);
 * `-2048` marks an upscaled one.
 */
const IMAGE_FILE = /^(frame|edit|mask)-\d+(-[0-9a-f]{8})?(-2048)?\.(png|svg)$/
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

export const PARTS: Record<SessionPart, PartDeclaration> = {
  pictures: {
    owns: (path) => IMAGE_FILE.test(path),
    count: (session) => {
      const pictures = picturesOf(session)
      return Promise.resolve({
        pictures: pictures.length,
        imageModels: new Set(pictures.map((p) => p.imageModel)).size,
        edits: pictures.reduce((n, p) => n + (p.edits?.length ?? 0), 0),
      })
    },
  },
  clips: {
    owns: (path) => CLIP_FILE.test(path),
    count: (session) =>
      Promise.resolve({
        clips: versionsOf(session).reduce((n, v) => n + (v.clips?.length ?? 0), 0),
      }),
  },
  '3d': {
    owns: (path) => SCENE_FILE.test(path),
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
 * Whether a file at the top of a Session's folder is one it serves: a picture, clip, 3D, audio or
 * music file (not its text, its call logs or a cache).
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
    clips: 0,
    speech: 0,
    threeD: 0,
    cues: 0,
    calls: 0,
    ...Object.assign({}, ...counted),
  }
  return { size: rest + SESSION_PARTS.reduce((n, p) => n + parts[p], 0), parts, rest, counts }
}
