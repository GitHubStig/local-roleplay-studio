/**
 * `session.json` at version 2 (2026-11-20): who wrote what is one shape, `Written`, everywhere,
 * every Frame keeps its Image Prompt in `image`: a Chain Frame's always, a Storyboard or Roleplay
 * Frame's once its sentences are written, with what they were written from; and a picture's file
 * is its `file`. A full copy of the types, so a later change to `shared/` leaves it as it
 * was; what each field means is in `shared/`. Each change from version 1 is marked "v2".
 */
import type { V1 } from './v1.ts'

type Outcome = 'done' | 'declined' | 'unclear'

/** v2: added, for the fields below marked v2 */
interface Written {
  model: string
  seconds: number
  thinking?: string
}

interface Subject {
  name: string
  identity: string
}

interface Look {
  subjects: Subject[]
  style: string
}

type ImageBackendKind = 'mflux' | 'comfyui'

type ClipKind = 'lead-in' | 'play-out' | 'idle-loop' | 'into-next'

interface Clip {
  kind: ClipKind
  model: string
  file: string
  prompt: string
  speech: boolean
  seconds: number
  seed: number
  next?: string
  timings: { queued?: number; clip: number }
}

interface Figure {
  file: string
  splats: number
  from: string
  timings: { queued?: number; figure: number }
}

interface Scene {
  file: string
  from: string
  splats: number
  pivot: number
  fov: number
  aspect: number
  timings: { queued?: number; scene: number }
}

interface PictureVersion {
  /** v2: from image */
  file: string
  upscaled?: string
  scene?: Scene
  figure?: Figure
  lito?: Figure
  clips?: Clip[]
}

interface PictureEdit extends PictureVersion {
  instructions: string[]
  editModel: string
  imageBackend?: ImageBackendKind
  seed: number
  mask?: string
  copied?: boolean
  timings?: { queued?: number; edit: number }
}

interface Picture extends PictureVersion {
  imageModel: string
  imageBackend?: ImageBackendKind
  stale?: boolean
  timings?: { queued?: number; image: number }
  edits?: PictureEdit[]
  picked?: number
}

/** v2: prompt moved into each kind's image */
interface FrameBase {
  index: number
  pictures: Picture[]
  createdAt: string
}

/** v2: added */
interface ChainImage {
  prompt: string
}

/** v2: added, from a Storyboard Frame's body, prompt, blocked, timings and textModel */
interface FrameImage {
  body: string
  prompt: string
  blocked?: string
  written: Written
}

interface ChainFrame extends FrameBase {
  /** v2: from prompt */
  image: ChainImage
  /** v2: from timings.text, textModel and thinking */
  written: Written
  action: string | null
  narration: string
  outcome: Outcome
}

interface StoryboardFrame extends FrameBase {
  beat: string
  shown: string[]
  /** v2: from body, prompt, blocked, timings and textModel, once written (a body not '') */
  image?: FrameImage
}

interface Person {
  id: string
  name: string
  looks: string
  wears: string
  personality: string
  speaks: string
  background: string
  goal: string
  truths: string[]
}

interface Scenario {
  id: string
  title: string
  description: string
  opening: string
  place: string
  time: string
  style: string
  music: string
  truths: string[]
  people: Person[]
  player?: string
  character?: string
  created?: string
  modified?: string
}

interface SessionSettings {
  textModel: string
  thinking: boolean
  imageModel: string
  steps: number
  musicBehaviour: 'steady' | 'story' | 'cinematic'
  musicTaste: string
  imageBackend?: ImageBackendKind
}

interface SessionBase {
  id: string
  brief: string | null
  scenarioId: string | null
  scenario?: Scenario
  settings: SessionSettings
  seed: number
  createdAt: string
  thumbnail?: string
}

interface ChainSession extends SessionBase {
  kind: 'chain'
  frames: ChainFrame[]
}

interface StoryboardSession extends SessionBase {
  kind: 'storyboard'
  frameCount: number
  look: Look | null
  frames: StoryboardFrame[]
}

interface Character {
  name: string
  age: number
  appearance: string
  personality: string
  voice: string
  background: string
  goal: string
}

interface Persona {
  name: string
  role: string
  appearance: string
}

interface Setting {
  place: string
  time: string
  weather: string
}

interface Cast {
  character: Character
  persona: Persona
  setting: Setting
  truths: string[]
  others: string[]
}

interface Reply {
  internal: string
  actions: string
  dialogue: string
}

interface CueTrack {
  file: string
  seconds: number
  bpm: number
  seed: number
  timings: { queued?: number; music: number }
}

interface Score {
  genre: string
  palette: string[]
  atmosphere: string
  tempo: { slowest: number; fastest: number }
  avoid: string[]
}

type Decision = 'continue' | 'transition' | 'silence'

type Entry = 'gentle' | 'sharp'

interface FrameMusic {
  cue: string
  reading: string
  decision: Decision
  entry: Entry
  line: string
  /** v2: from model and timings.text */
  written: Written
  hindsight?: true
  stinger?: { reading: string; line: string }
}

type CueKey =
  | 'C major'
  | 'Db major'
  | 'D major'
  | 'Eb major'
  | 'E major'
  | 'F major'
  | 'Gb major'
  | 'G major'
  | 'Ab major'
  | 'A major'
  | 'Bb major'
  | 'B major'
  | 'C minor'
  | 'C# minor'
  | 'D minor'
  | 'Eb minor'
  | 'E minor'
  | 'F minor'
  | 'F# minor'
  | 'G minor'
  | 'G# minor'
  | 'A minor'
  | 'Bb minor'
  | 'B minor'

interface CueValues {
  mood: string
  energy: 'calm' | 'restrained' | 'building' | 'intense'
  density: 'sparse' | 'layered' | 'full'
  tempo: 'slow' | 'moderate' | 'fast'
  instruments: string[]
  vocals: 'none' | 'choir'
  shape: 'intimate' | 'uneasy' | 'reflective' | 'sacred' | 'danger'
  key: CueKey
  caption: string
  lyrics: string
}

interface Cue {
  id: string
  start: number
  values?: CueValues
  entry: Entry
  reading: string
  line: string
  steer?: string
  track?: CueTrack
}

interface Delivery {
  pace: 'normal' | 'slow' | 'fast'
  sound: 'none' | 'sigh' | 'laughter' | 'cough'
}

interface Speech {
  file: string
  ref: string
  timings: { queued?: number; audio: number }
  delivery?: Delivery
  undirected?: string
}

interface RoleplayFrame {
  index: number
  message: string | null
  reply: Reply
  outcome?: string
  /** v2: from timings.text, textModel and thinking */
  written: Written
  /**
   * v2: from body, prompt, blocked, shown, clothing, pictureTimings.text, pictureModel and
   * pictureThinking, once pictured (a body)
   */
  image?: RoleplayImage
  pictures: Picture[]
  speech?: Speech
  thoughtSpeech?: Speech
  music?: FrameMusic
  createdAt: string
}

/** v2: added */
interface RoleplayImage extends FrameImage {
  shown: string[]
  clothing: string
}

interface RoleplayVoice {
  description: string
  ref?: string
  model?: string
  takes?: number
}

interface RoleplaySession extends SessionBase {
  kind: 'roleplay'
  cast: Cast | null
  look: Look | null
  /** v2: from lookTimings.text, lookModel and lookThinking */
  lookWritten?: Written
  voice?: RoleplayVoice
  score?: Score
  /** v2: from scoreTimings.text, scoreModel and scoreThinking */
  scoreWritten?: Written
  cues: Cue[]
  /** v2: model and timings.text moved into written */
  hindsight?: {
    chunks: number
    courses: string[]
    written: Written
  }
  frames: RoleplayFrame[]
}

type Session = ChainSession | StoryboardSession | RoleplaySession

export type V2 = Session

type From<T> = T extends readonly (infer E)[] ? E : never
type FrameV1<K extends V1['kind']> = From<Extract<V1, { kind: K }>['frames']>

/** Who wrote it, from version 1's model, seconds and reasoning, which were always kept together. */
const written = (model: string, timings: { text: number }, thinking?: string): Written => ({
  model,
  seconds: timings.text,
  ...(thinking !== undefined && { thinking }),
})

/** The same where version 1's were optional: absent only when the thing was never written. */
function writtenIf(model?: string, timings?: { text: number }, thinking?: string) {
  return model !== undefined && timings !== undefined
    ? written(model, timings, thinking)
    : undefined
}

/**
 * Version 1 kept who wrote a Frame's sentences beside them, optional, but always had them for a
 * written Frame (every Session on the Mac did, 2026-11-20): one without can't be made into an
 * image, so it fails, saying which, rather than claim a model that didn't write it.
 */
function required(record: Written | undefined, frame: number, what: string): Written {
  if (!record) throw new Error(`Frame ${frame + 1}'s ${what} don't say which model wrote them`)
  return record
}

const blockedOf = (blocked?: string) => blocked !== undefined ? { blocked } : {}

type PictureV1 = FrameV1<'chain'>['pictures'][number]

/** A picture's image, and each of its edits', as `file`. */
const pictureOf = ({ image, edits, ...rest }: PictureV1): Picture => ({
  ...rest,
  file: image,
  ...(edits && { edits: edits.map(({ image, ...edit }) => ({ ...edit, file: image })) }),
})

const chainFrame = (
  { prompt, timings, textModel, thinking, pictures, ...rest }: FrameV1<'chain'>,
): ChainFrame => ({
  ...rest,
  image: { prompt },
  pictures: pictures.map(pictureOf),
  written: written(textModel, timings, thinking),
})

function storyboardFrame(frame: FrameV1<'storyboard'>): StoryboardFrame {
  const { body, prompt, blocked, timings, textModel, pictures, ...kept } = frame
  const rest = { ...kept, pictures: pictures.map(pictureOf) }
  if (body === '') return rest
  const record = required(writtenIf(textModel, timings), frame.index, 'sentences')
  return { ...rest, image: { body, prompt, ...blockedOf(blocked), written: record } }
}

function roleplayFrame(frame: FrameV1<'roleplay'>): RoleplayFrame {
  const {
    timings,
    textModel,
    thinking,
    body,
    prompt,
    blocked,
    shown,
    clothing,
    pictureTimings,
    pictureModel,
    pictureThinking,
    music,
    pictures,
    ...rest
  } = frame
  const image = body === undefined ? undefined : {
    body,
    prompt: prompt ?? '',
    ...blockedOf(blocked),
    shown: shown ?? [],
    clothing: clothing ?? '',
    written: required(
      writtenIf(pictureModel, pictureTimings, pictureThinking),
      frame.index,
      'picture sentences',
    ),
  }
  return {
    ...rest,
    written: written(textModel, timings, thinking),
    pictures: pictures.map(pictureOf),
    ...(image && { image }),
    ...(music && { music: musicOf(music) }),
  }
}

function musicOf(
  { model, timings, ...rest }: NonNullable<FrameV1<'roleplay'>['music']>,
): FrameMusic {
  return { ...rest, written: written(model, timings) }
}

/**
 * Version 1 to 2: each record of who wrote what into one `written`; each Frame's Image Prompt,
 * with what it was written from, into its `image`; and a picture's file, as `file`, so it isn't
 * confused with that.
 */
export function v2(doc: V1): V2 {
  if (doc.kind === 'chain') return { ...doc, frames: doc.frames.map(chainFrame) }
  if (doc.kind === 'storyboard') return { ...doc, frames: doc.frames.map(storyboardFrame) }
  const {
    lookTimings,
    lookModel,
    lookThinking,
    scoreTimings,
    scoreModel,
    scoreThinking,
    hindsight,
    ...rest
  } = doc
  const look = writtenIf(lookModel, lookTimings, lookThinking)
  const score = writtenIf(scoreModel, scoreTimings, scoreThinking)
  return {
    ...rest,
    ...(look && { lookWritten: look }),
    ...(score && { scoreWritten: score }),
    ...(hindsight && {
      hindsight: {
        chunks: hindsight.chunks,
        courses: hindsight.courses,
        written: written(hindsight.model, hindsight.timings),
      },
    }),
    frames: doc.frames.map(roleplayFrame),
  }
}
