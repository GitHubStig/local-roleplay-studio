<script setup lang="ts">
import { ref } from 'vue'
import { type SaveLine, useAutosave } from '../composables/useAutosave'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import ItemList from '../components/ItemList.vue'
import SaveStatus from '../components/SaveStatus.vue'
import { MUSIC_BEHAVIOURS, MUSIC_VOCALS, type MusicSettings, musicSettingsOf } from '../music'
import {
  type RoleplayEvent,
  type RoleplaySession,
  type Score,
  saveMusicSettings,
  saveScore,
  TEMPO,
  writeScore,
} from './api'

/**
 * A Roleplay's Music tab, while Music is on (docs/music-plans.md): its Score, written when asked
 * for (or the first time its music is directed) and edited by hand, and its own Behaviour, Vocals
 * and Music taste. Each part saves itself when the focus leaves it (`useAutosave`); the screen
 * calls `flush` before work that reads them.
 */
const props = defineProps<{
  session: RoleplaySession
  /** The Session's line of saves, shared with its other drafts. */
  line: SaveLine
  /** Something else is being written (a Reply, the Cast). */
  disabled?: boolean
}>()
const emit = defineEmits<{ saved: [session: RoleplaySession] }>()

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
