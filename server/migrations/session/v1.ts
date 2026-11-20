/**
 * `session.json` at version 1 (2026-11-20): the shape every Session had before versions began,
 * unchanged, now numbered. A full copy of the types, so a later change to `shared/` leaves it as
 * it was; what each field means is in `shared/`. The next version copies this file whole and marks
 * what it changes (ADR 0041).
 */

type Outcome = 'done' | 'declined' | 'unclear'

interface FrameTimings {
  text: number
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
  image: string
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

interface FrameBase {
  index: number
  prompt: string
  pictures: Picture[]
  createdAt: string
}

interface ChainFrame extends FrameBase {
  timings: FrameTimings
  textModel: string
  action: string | null
  narration: string
  outcome: Outcome
  thinking?: string
}

interface StoryboardFrame extends FrameBase {
  timings?: FrameTimings
  textModel?: string
  beat: string
  body: string
  shown: string[]
  blocked?: string
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
  model: string
  timings: { text: number }
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
  thinking?: string
  timings: { text: number }
  textModel: string
  body?: string
  prompt?: string
  blocked?: string
  shown?: string[]
  clothing?: string
  pictureTimings?: { text: number }
  pictureModel?: string
  pictureThinking?: string
  pictures: Picture[]
  speech?: Speech
  thoughtSpeech?: Speech
  music?: FrameMusic
  createdAt: string
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
  lookTimings?: { text: number }
  lookModel?: string
  lookThinking?: string
  voice?: RoleplayVoice
  score?: Score
  scoreTimings?: { text: number }
  scoreModel?: string
  scoreThinking?: string
  cues: Cue[]
  hindsight?: {
    model: string
    chunks: number
    courses: string[]
    timings: { text: number }
  }
  frames: RoleplayFrame[]
}

type Session = ChainSession | StoryboardSession | RoleplaySession

export type V1 = Session

/** A file from before versions: already this shape, so only numbered. */
export const v1 = (doc: unknown): V1 => doc as V1
