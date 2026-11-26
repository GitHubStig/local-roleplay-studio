/**
 * `session.json` at version 5 (2026-11-25): reference sheets (docs/reference-sheets-plans.md). A
 * Session says whether it has them (`settings.sheets`), a Storyboard or a Roleplay keeps a sheet per
 * Subject of its Look, each written Frame keeps its expression sentence apart, for the face pass
 * to name, and a picture keeps its face pass (`faces`, added with stage 4 while no Session had one). A full copy of version 4's types, so a later change to `shared/` leaves it as it was;
 * what each field means is in `shared/`. The change from version 4 is marked "v5".
 */
import type { V4 } from './v4.ts'

type Outcome = 'done' | 'declined' | 'unclear'

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

/** v5: added */
interface Sheet {
  subject: string
  ticked: boolean
  identity: string
  seed: number
  made?: SheetPicture
}

/** v5: added */
interface SheetPicture {
  file: string
  views: [string, string, string]
  mirrored: [string, string, string]
  imageModel: string
  createdAt: string
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

interface FacePass {
  subjects: string[]
  seed: number
  without: boolean
  other: PictureVersion
  timings: { find: number; faces: number }
}

interface Picture extends PictureVersion {
  imageModel: string
  imageBackend?: ImageBackendKind
  stale?: boolean
  timings?: { queued?: number; image: number }
  edits?: PictureEdit[]
  picked?: number
  faces?: FacePass
}

interface FrameBase {
  index: number
  pictures: Picture[]
  createdAt: string
}

interface ChainImage {
  prompt: string
}

interface FrameImage {
  body: string
  /** v5: added */
  expression: string
  prompt: string
  blocked?: string
  written: Written
}

interface ChainFrame extends FrameBase {
  image: ChainImage
  written: Written
  action: string | null
  narration: string
  outcome: Outcome
}

interface StoryboardFrame extends FrameBase {
  beat: string
  shown: string[]
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
  /** v5: added */
  sheets: boolean
}

interface SessionBase {
  id: string
  title: string
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
  /** v5: added */
  sheets: Sheet[]
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
  written: Written
  image?: RoleplayImage
  pictures: Picture[]
  speech?: Speech
  thoughtSpeech?: Speech
  music?: FrameMusic
  createdAt: string
}

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
  lookWritten?: Written
  lookBehindCast: boolean
  /** v5: added */
  sheets: Sheet[]
  voice?: RoleplayVoice
  score?: Score
  scoreWritten?: Written
  cues: Cue[]
  hindsight?: {
    chunks: number
    courses: string[]
    written: Written
  }
  frames: RoleplayFrame[]
}

type Session = ChainSession | StoryboardSession | RoleplaySession

export type V5 = Session

type FramesOf<K> = Extract<V4, { kind: K }>['frames'][number]

/** A written Storyboard Frame, its expression sentence not known: it was never kept apart. */
function storyboardFrame({ image, ...frame }: FramesOf<'storyboard'>): StoryboardFrame {
  return image ? { ...frame, image: { ...image, expression: '' } } : frame
}

/** A pictured Roleplay Frame, its expression sentence not known, likewise. */
function roleplayFrame({ image, ...frame }: FramesOf<'roleplay'>): RoleplayFrame {
  return image ? { ...frame, image: { ...image, expression: '' } } : frame
}

/**
 * Version 4 to 5: no Session before it has sheets, as they're settled before the story begins;
 * a Storyboard or a Roleplay has none yet, and no Frame's expression sentence is known.
 */
export function v5(doc: V4): V5 {
  const settings = { ...doc.settings, sheets: false }
  if (doc.kind === 'chain') return { ...doc, settings }
  if (doc.kind === 'storyboard') {
    return { ...doc, settings, sheets: [], frames: doc.frames.map(storyboardFrame) }
  }
  return { ...doc, settings, sheets: [], frames: doc.frames.map(roleplayFrame) }
}
