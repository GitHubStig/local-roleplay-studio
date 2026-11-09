<script setup lang="ts">
import { computed, ref } from 'vue'
import { frameName } from '../frameName'
import { type SaveLine, useAutosave } from '../composables/useAutosave'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ItemList from '../components/ItemList.vue'
import SaveStatus from '../components/SaveStatus.vue'
import { imageUrl } from '../api'
import { MUSIC_BEHAVIOURS, MUSIC_VOCALS, type MusicSettings, musicSettingsOf } from '../music'
import {
  type Cue,
  type RoleplayEvent,
  type RoleplayFrame,
  type RoleplaySession,
  type Score,
  saveMusicSettings,
  saveScore,
  TEMPO,
  writeScore,
} from './api'

/**
 * A Roleplay's Music tab, while Music is on (docs/music-plans.md): how the music was directed at
 * the Frame shown, the Cues as a strip across the Frames, its Score, written when asked for (or
 * the first time its music is directed) and edited by hand, and its own Behaviour, Vocals and
 * Music taste. Each part saves itself when the focus leaves it (`useAutosave`); the screen
 * calls `flush` before work that reads them.
 */
const props = defineProps<{
  session: RoleplaySession
  /** The Session's line of saves, shared with its other drafts. */
  line: SaveLine
  /** Something else is being written (a Reply, the Cast). */
  disabled?: boolean
  /** The Frame shown in the Frame tab, if any. */
  frame: RoleplayFrame | null
  /** The Frame's music is being directed, or waits to be. */
  directing?: boolean
}>()
const emit = defineEmits<{
  saved: [session: RoleplaySession]
  /** Direct the music at this Frame (again). */
  direct: [index: number]
  /** Go to this Frame. */
  go: [index: number]
}>()

// --- The Frame's music, and the Cues.

const cues = computed(() => props.session.cues ?? [])
const frameCue = computed(() =>
  props.frame?.music ? cues.value.find((c) => c.id === props.frame!.music!.cue) : undefined
)
/** What the Director decided, in words. */
function decisionText(frame: RoleplayFrame): string {
  const m = frame.music!
  if (m.decision === 'continue') return 'The music continues'
  if (m.decision === 'silence') return m.entry === 'sharp' ? 'The music cuts to silence' : 'The music fades to silence'
  return m.entry === 'sharp' ? 'The music changes sharply' : 'The music changes gently'
}
/** An instrument the Score's palette doesn't have (since edited, or picked outside it): flagged. */
const outside = (instrument: string) =>
  !!props.session.score &&
  !props.session.score.palette.some((p) => p.toLowerCase() === instrument.toLowerCase())

/** How many Frames each Cue lasts: until the next begins, or the latest Frame. */
const cueSpans = computed(() => {
  const count = props.session.frames.length
  return cues.value.map((cue, i) => ({ cue, frames: (cues.value[i + 1]?.start ?? count) - cue.start }))
})
const counts = computed(() => {
  const directed = props.session.frames.filter((f) => f.music)
  const decided = (d: string) => directed.filter((f) => f.music!.decision === d).length
  const music = cueSpans.value.filter((s) => s.cue.values)
  return {
    cues: music.length,
    silences: cueSpans.value.length - music.length,
    average: music.length ? music.reduce((n, s) => n + s.frames, 0) / music.length : 0,
    directed: directed.length,
    changes: decided('transition'),
    continues: decided('continue'),
    silent: decided('silence'),
    stingers: directed.filter((f) => f.music!.stinger).length,
  }
})
const cueTitle = (cue: Cue, frames: number) =>
  `${frameName(cue.start)}, ${frames} Frame${frames === 1 ? '' : 's'}: ${cue.values?.mood ?? 'silence'}`

// --- The Score.

const trimmedScore = (s: Score): Score => ({
  genre: s.genre.trim(),
  palette: s.palette.map((p) => p.trim()).filter(Boolean),
  atmosphere: s.atmosphere.trim(),
  tempo: { slowest: Number(s.tempo.slowest), fastest: Number(s.tempo.fastest) },
  avoid: s.avoid.map((a) => a.trim()).filter(Boolean),
})
/** Why the Score can't be saved yet: what the server would refuse it for. */
function holdScore(score: Score): string | null {
  const s = trimmedScore(score)
  if (!s.genre) return 'the Score needs a genre'
  if (!s.palette.length) return 'the Score needs at least one instrument'
  if (!s.atmosphere) return 'the Score needs an atmosphere'
  const { slowest, fastest } = s.tempo
  if (!Number.isFinite(slowest) || !Number.isFinite(fastest)) return 'the tempo needs two numbers'
  return null
}
const score = useAutosave<Score>({
  source: () => props.session.score ?? null,
  save: async (draft) => {
    const saved = await saveScore(props.session.id, trimmedScore(draft))
    emit('saved', saved)
    return saved.score!
  },
  hold: holdScore,
  normal: trimmedScore,
  line: props.line,
})
const scoreDraft = score.draft

// --- The Roleplay's own music settings.

const music = useAutosave<MusicSettings>({
  source: () => musicSettingsOf(props.session.settings),
  save: async (draft) => {
    const saved = await saveMusicSettings(props.session.id, { ...draft, taste: draft.taste.trim() })
    emit('saved', saved)
    return musicSettingsOf(saved.settings)
  },
  normal: (m) => ({ ...m, taste: m.taste.trim() }),
  line: props.line,
})
const musicDraft = music.draft

/** Saves both parts; false if either is left unsaved. */
const flush = async () => (await music.flush()) && (await score.flush())

// --- Writing the Score.

const writing = ref(false)
const thinking = ref('')
const failed = ref<string | null>(null)

function onEvent(event: RoleplayEvent) {
  if (event.type === 'thinking') thinking.value = (event.restart ? '' : thinking.value) + event.text
  else if (event.type === 'score') emit('saved', event.session)
  else if (event.type === 'failed') failed.value = event.message
}

/** Writes the Score, or writes it again, after saving the taste and any edits to it. */
async function write() {
  failed.value = null
  if (!(await flush())) {
    failed.value = "Not written: an edit isn't saved"
    return
  }
  writing.value = true
  thinking.value = ''
  try {
    await writeScore(props.session.id, onEvent)
  } catch (err) {
    failed.value = (err as Error).message
  } finally {
    writing.value = false
  }
}

defineExpose({ flush })
</script>

<template>
  <div class="flex flex-col text-sm" data-music>
    <!-- First, so the strip stays put as the Frame below it changes length. -->
    <section v-if="cueSpans.length" class="flex flex-col gap-2 border-b border-line p-4" data-cues>
      <h2 class="text-base font-semibold">Cues</h2>
      <div class="flex h-6 w-full overflow-hidden rounded border border-line" data-cue-strip>
        <button
          v-for="({ cue, frames }, i) in cueSpans"
          :key="cue.id"
          type="button"
          class="h-full border-r border-canvas last:border-r-0"
          :class="[
            cue.values ? (i % 2 ? 'bg-fg/50' : 'bg-fg/75') : 'bg-line',
            frameCue?.id === cue.id ? 'outline outline-2 -outline-offset-2 outline-warn' : '',
          ]"
          :style="{ flexGrow: frames }"
          :title="cueTitle(cue, frames)"
          :data-cue="cue.id"
          @click="emit('go', cue.start)"
        />
      </div>
      <p class="text-xs text-muted" data-cue-counts>
        {{ counts.cues }} Cue{{ counts.cues === 1 ? '' : 's' }}<template v-if="counts.silences">
          and {{ counts.silences }} silence{{ counts.silences === 1 ? '' : 's' }}</template>,
        {{ counts.average.toFixed(1) }} Frames each on average · of {{ counts.directed }} Frames
        directed: {{ counts.continues }} continued, {{ counts.changes }} changed,
        {{ counts.silent }} fell silent<template v-if="counts.stingers">,
          {{ counts.stingers }} with a stinger</template>
      </p>
      <details v-if="session.hindsight" class="text-xs text-muted" data-hindsight>
        <summary class="cursor-pointer select-none">
          Last scored with hindsight in {{ session.hindsight.timings.text.toFixed(0) }} s by
          {{ session.hindsight.model }}, in {{ session.hindsight.chunks }}
          part{{ session.hindsight.chunks === 1 ? '' : 's' }}
        </summary>
        <p
          v-for="(course, i) in session.hindsight.courses"
          :key="i"
          class="mt-1 leading-relaxed"
          data-hindsight-course
        >{{ course }}</p>
      </details>
    </section>

    <section v-if="frame" class="flex flex-col gap-2 border-b border-line p-4" data-frame-music>
      <div class="flex items-baseline gap-1.5">
        <h2 class="shrink-0 text-base font-semibold">{{ frameName(frame.index) }}</h2>
        <span class="min-w-0 truncate text-muted">· its music</span>
        <button
          type="button"
          class="action ml-auto shrink-0"
          :disabled="directing || disabled"
          data-direct
          @click="emit('direct', frame.index)"
        >
          {{ frame.music ? 'Direct again' : 'Direct' }}
        </button>
      </div>
      <p v-if="directing" class="animate-pulse text-muted">Directing the music…</p>
      <template v-if="frame.music">
        <p class="font-medium" data-decision>{{ decisionText(frame) }}</p>
        <blockquote v-if="frame.music.line" class="border-l-2 border-line pl-2 italic" data-line>
          {{ frame.music.line }}
        </blockquote>
        <p v-if="frame.music.reading" class="leading-relaxed" data-reading>{{ frame.music.reading }}</p>
        <div v-if="frame.music.stinger" class="flex flex-col gap-1 rounded border border-line p-2" data-stinger>
          <p class="font-medium">A stinger here, over the music</p>
          <blockquote v-if="frame.music.stinger.line" class="border-l-2 border-line pl-2 italic">
            {{ frame.music.stinger.line }}
          </blockquote>
          <p class="leading-relaxed">{{ frame.music.stinger.reading }}</p>
        </div>
        <div v-if="frameCue" class="rounded border border-line p-2" data-frame-cue>
          <p class="text-xs text-muted">
            Cue from {{ frameName(frameCue.start) }}<template v-if="frameCue.start !== frame.index">
              · <button type="button" class="underline hover:text-fg" @click="emit('go', frameCue.start)">go there</button></template>
          </p>
          <template v-if="frameCue.values">
            <p class="mt-1">{{ frameCue.values.mood }}</p>
            <p class="text-xs text-muted">
              {{ frameCue.values.energy }} · {{ frameCue.values.density }} · {{ frameCue.values.tempo }}
              <template v-if="frameCue.values.vocals !== 'none'"> · {{ frameCue.values.vocals }}</template>
            </p>
            <p class="mt-1 flex flex-wrap gap-1" data-cue-instruments>
              <span
                v-for="i in frameCue.values.instruments"
                :key="i"
                class="rounded bg-surface px-1.5 py-0.5 text-xs"
                :class="{ 'text-warn': outside(i) }"
                :title="outside(i) ? 'Not in the Score\'s instruments' : undefined"
                :data-outside="outside(i) || undefined"
              >{{ i }}<template v-if="outside(i)"> (not in the Score)</template></span>
            </p>
            <audio
              v-if="frameCue.track"
              class="mt-2 w-full"
              controls
              preload="none"
              :src="imageUrl(session.id, frameCue.track.file)"
              data-cue-track
            />
            <p v-if="frameCue.track" class="mt-1 text-xs text-muted" data-cue-track-timings>
              {{ frameCue.track.seconds }} s at {{ frameCue.track.bpm }} beats a minute, in
              {{ frameCue.values.key }}, made in {{ frameCue.track.timings.music.toFixed(0) }} s
            </p>
          </template>
          <p v-else class="mt-1 text-muted">Silence</p>
        </div>
        <p v-if="frame.music.hindsight" class="text-xs text-muted" data-direct-timings>
          Scored with hindsight by {{ frame.music.model }}<template v-if="frame.music.timings.text">,
            its Cue written in {{ frame.music.timings.text.toFixed(1) }} s</template>
        </p>
        <p v-else class="text-xs text-muted" data-direct-timings>
          Directed in {{ frame.music.timings.text.toFixed(1) }} s by {{ frame.music.model }}
        </p>
      </template>
      <p v-else-if="!directing" class="text-muted">
        Not directed yet: Score as you play directs each new reply, Direct does this one, and Score
        the Roleplay does them all.
      </p>
    </section>

    <!-- Its border sweeps while the Score is written, or written again. -->
    <section class="flex flex-col gap-3 border-b border-line p-4" :class="{ 'render-sweep': writing }" data-score>
      <div class="flex items-baseline gap-1.5">
        <h2 class="shrink-0 text-base font-semibold">Score</h2>
        <span class="min-w-0 truncate text-muted">· the sound every Cue shares</span>
        <button
          type="button"
          class="action ml-auto shrink-0"
          :disabled="writing || disabled || !session.cast"
          data-write-score
          @click="write"
        >
          {{ session.score ? 'Write again' : 'Write the Score' }}
        </button>
      </div>
      <p v-if="session.score && session.scoreTimings" class="text-xs text-muted" data-score-timings>
        Written in {{ session.scoreTimings.text.toFixed(1) }} s<template v-if="session.scoreModel">
          by {{ session.scoreModel }}</template>
      </p>
      <p v-if="failed" class="text-danger" role="alert">{{ failed }}</p>
      <p v-if="writing" class="animate-pulse text-muted">Writing the Score…</p>
      <p v-else-if="!scoreDraft" class="text-muted">
        No Score yet. It's written from the Cast, the Brief, the Scenario's Music and the taste
        below, when you ask, or once the music follows the story.
      </p>

      <form
        v-if="scoreDraft"
        class="flex flex-col gap-3"
        data-score-form
        @submit.prevent="score.flush"
        @focusout="score.onFocusout"
      >
        <label class="flex flex-col gap-1 text-xs text-muted">
          Genre
          <input v-model="scoreDraft.genre" class="field text-sm" :disabled="writing" data-score-genre />
        </label>
        <ItemList
          v-model="scoreDraft.palette"
          label="Instruments"
          noun="instrument"
          :disabled="writing"
          data-score-palette
          @removed="score.flush"
        />
        <CollapsibleTextarea
          id="roleplay.music.atmosphere"
          v-model="scoreDraft.atmosphere"
          label="Atmosphere"
          :disabled="writing"
        />
        <fieldset class="flex items-center gap-2 text-xs text-muted" data-score-tempo>
          <legend class="mb-1">Tempo, in beats per minute</legend>
          <input
            v-model.number="scoreDraft.tempo.slowest"
            type="number"
            :min="TEMPO.slowest"
            :max="TEMPO.fastest"
            class="field w-20 text-sm"
            aria-label="Slowest"
            :disabled="writing"
          />
          to
          <input
            v-model.number="scoreDraft.tempo.fastest"
            type="number"
            :min="TEMPO.slowest"
            :max="TEMPO.fastest"
            class="field w-20 text-sm"
            aria-label="Fastest"
            :disabled="writing"
          />
        </fieldset>
        <ItemList
          v-model="scoreDraft.avoid"
          label="Avoid (never sent to the music model)"
          noun="thing to avoid"
          :disabled="writing"
          data-score-avoid
          @removed="score.flush"
        />
        <SaveStatus
          :status="score.status.value"
          :can-revert="score.canRevert.value"
          :disabled="writing"
          @revert="score.revert"
        />
      </form>
      <details v-if="writing ? thinking : session.scoreThinking" class="text-xs text-muted">
        <summary class="cursor-pointer select-none">Reasoning</summary>
        <p class="mt-1 whitespace-pre-wrap leading-relaxed">{{ writing ? thinking : session.scoreThinking }}</p>
      </details>
    </section>

    <form
      v-if="musicDraft"
      class="flex flex-col gap-4 p-4"
      data-music-settings
      @submit.prevent="music.flush"
      @focusout="music.onFocusout"
    >
      <div class="flex items-baseline gap-1.5">
        <h2 class="shrink-0 text-base font-semibold">This Roleplay's music</h2>
        <span class="min-w-0 truncate text-muted">· kept from Settings as it started</span>
      </div>
      <fieldset class="flex flex-col gap-1" data-music-behaviour>
        <legend class="mb-1 font-medium">Behaviour</legend>
        <label v-for="b in MUSIC_BEHAVIOURS" :key="b.id" class="flex items-start gap-2">
          <input v-model="musicDraft.behaviour" type="radio" :value="b.id" class="mt-1" @change="music.flush" />
          <span><span class="font-medium">{{ b.label }}</span>: {{ b.about }}</span>
        </label>
      </fieldset>
      <fieldset class="flex flex-col gap-1" data-music-vocals>
        <legend class="mb-1 font-medium">Vocals</legend>
        <label v-for="v in MUSIC_VOCALS" :key="v.id" class="flex items-center gap-2">
          <input v-model="musicDraft.vocals" type="radio" :value="v.id" @change="music.flush" />
          {{ v.label }}
        </label>
      </fieldset>
      <CollapsibleTextarea
        id="roleplay.music.taste"
        v-model="musicDraft.taste"
        label="Music taste: what you like and what to avoid, for the Score"
        placeholder="Orchestral, no electronic instruments, ambience over melody…"
      />
      <SaveStatus :status="music.status.value" :can-revert="music.canRevert.value" @revert="music.revert" />
    </form>
  </div>
</template>
