<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  type Clip,
  CLIP_KIND_NAMES,
  type ClipKind,
  type ClipOrder,
  writeClipPrompt,
} from '../api'

/**
 * The selected Frame's clips (docs/video-plan.md), in its tab, the same in every kind of Session:
 * pick where the picture sits in the clip, its length and whether anyone speaks; the Text Model
 * writes the prompt from the story, for the player to read and edit; then the clip is queued. The
 * clips already made are listed, to play over the picture, to make again, or to say what was wrong
 * with one, for the Text Model to rewrite its prompt by.
 */
const props = defineProps<{
  sessionId: string
  /** The Frame's index, as the server numbers it. */
  index: number
  /** Its picture's clips, one of each kind. */
  clips?: Clip[]
  /** The next Frame has a picture for Into Next to end on; `nextName` names it. */
  nextPictured: boolean
  nextName: string
  /** The kinds of clip queued or being made of the Frame. */
  making: ClipKind[]
}>()
const emit = defineEmits<{ make: [order: ClipOrder]; play: [clip: Clip] }>()

const KINDS = Object.keys(CLIP_KIND_NAMES) as ClipKind[]
const SECONDS = [3, 4, 5, 6, 8, 10]

const kind = ref<ClipKind>('lead-in')
const seconds = ref(5)
const speech = ref(false)
const prompt = ref('')
const writing = ref(false)
const error = ref('')

/** A prompt carried over a change of kind, by Again. */
let carried: string | null = null
// A prompt is written for one kind of clip (and one Frame): it doesn't carry over to another.
watch([kind, () => props.index], () => {
  prompt.value = carried ?? ''
  carried = null
  error.value = ''
})

const hint = computed(() =>
  ({
    'lead-in': 'Ends on this picture: what leads up to it.',
    'play-out': 'Starts on this picture: what happens next.',
    'idle-loop': 'Starts and ends on this picture: small movement, to loop.',
    'into-next': `Starts on this picture and ends on ${props.nextName}'s.`,
  })[kind.value]
)

/** Make clip, or which kinds are being made meanwhile. */
const makeLabel = computed(() =>
  props.making.length
    ? `Making ${props.making.map((k) => CLIP_KIND_NAMES[k]).join(', ')}…`
    : 'Make clip'
)

/** Writes the prompt; with `revise`, rewrites a clip's by what was wrong with it. */
async function write(revise?: { prompt: string; problem: string }) {
  writing.value = true
  error.value = ''
  prompt.value = ''
  try {
    const ask = { kind: kind.value, seconds: seconds.value, speech: speech.value }
    await writeClipPrompt(props.sessionId, props.index, ask, (event) => {
      if (event.type === 'clip-prompt-part' || event.type === 'clip-prompt') {
        prompt.value = event.text
      } else if (event.type === 'failed') error.value = event.message
    }, revise)
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    writing.value = false
  }
}

function make() {
  const order = { kind: kind.value, prompt: prompt.value.trim(), seconds: seconds.value, speech: speech.value }
  emit('make', order)
}

/** The clip being said what was wrong with (its file), and what. */
const fixing = ref<string | null>(null)
const problem = ref('')
/** Puts the clip back in the form, and has its prompt rewritten by what was wrong. */
async function rewrite(clip: Clip) {
  again(clip)
  const revise = { prompt: clip.prompt, problem: problem.value.trim() }
  fixing.value = null
  problem.value = ''
  // After the form has taken the clip's kind.
  await nextTick()
  await write(revise)
}

/** Puts a clip's order back in the form, to edit and make again. */
function again(clip: Clip) {
  seconds.value = clip.seconds
  speech.value = clip.speech
  if (kind.value === clip.kind) prompt.value = clip.prompt
  else {
    carried = clip.prompt
    kind.value = clip.kind
  }
}
</script>

<template>
  <section class="flex flex-col gap-2 border-t border-line pt-3" data-frame-clips>
    <h3 class="text-xs font-medium text-muted">Clip</h3>
    <div role="radiogroup" aria-label="Kind of clip" class="flex overflow-hidden rounded-md border border-line text-xs">
      <button
        v-for="k in KINDS"
        :key="k"
        type="button"
        role="radio"
        class="flex-1 border-l border-line px-1 py-1 text-muted first:border-l-0 aria-checked:bg-fg aria-checked:text-canvas disabled:opacity-40"
        :aria-checked="kind === k"
        :disabled="k === 'into-next' && !nextPictured"
        :title="k === 'into-next' && !nextPictured ? `${nextName} needs a picture to end on` : undefined"
        :data-clip-kind="k"
        @click="kind = k"
      >
        {{ CLIP_KIND_NAMES[k] }}
      </button>
    </div>
    <p class="text-xs text-muted">{{ hint }}</p>
    <p
      v-if="kind === 'into-next'"
      class="rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn"
      data-into-next-warning
    >
      Works when the two pictures show the same place. If {{ nextName }} looks like somewhere else, a
      Lead In on {{ nextName }} joins better.
    </p>
    <div class="flex items-center gap-3 text-xs">
      <label class="flex items-center gap-1.5">
        Length
        <select v-model.number="seconds" class="rounded border border-line bg-surface px-1 py-0.5" data-clip-seconds>
          <option v-for="s in SECONDS" :key="s" :value="s">{{ s }} s</option>
        </select>
      </label>
      <label class="flex cursor-pointer items-center gap-1.5">
        <input v-model="speech" type="checkbox" data-clip-speech />
        With speech
      </label>
    </div>
    <textarea
      v-model="prompt"
      rows="5"
      class="w-full resize-y rounded border border-line bg-surface p-2 text-xs leading-relaxed"
      :class="{ 'render-sweep': writing }"
      :placeholder="writing ? 'Writing…' : 'What happens in the clip: Write prompt has the Text Model write it from the story, to edit here.'"
      :readonly="writing"
      aria-label="The clip's prompt"
      data-clip-prompt
    />
    <p v-if="error" class="text-xs text-danger" role="alert">{{ error }}</p>
    <div class="flex items-center gap-2">
      <button type="button" class="action" :disabled="writing" data-write-clip-prompt @click="write()">
        {{ prompt ? 'Write again' : 'Write prompt' }}
      </button>
      <button
        type="button"
        class="action"
        :disabled="writing || !!making.length || !prompt.trim() || (kind === 'into-next' && !nextPictured)"
        :title="making.length ? 'A clip is being made of this Frame' : 'Make the clip (a few minutes)'"
        data-make-clip
        @click="make"
      >
        {{ makeLabel }}
      </button>
    </div>
    <ul v-if="clips?.length" class="flex flex-col text-xs" data-clips>
      <li
        v-for="clip in clips"
        :key="clip.file"
        class="flex flex-wrap items-center gap-2 border-t border-line py-1.5"
        :data-clip="clip.kind"
      >
        <span class="w-16 font-medium">{{ CLIP_KIND_NAMES[clip.kind] }}</span>
        <span class="flex-1 text-muted">{{ clip.seconds }} s · {{ clip.speech ? 'with speech' : 'no dialogue' }}</span>
        <button type="button" class="action" data-play-clip @click="emit('play', clip)">Play</button>
        <button
          type="button"
          class="action"
          title="Put its prompt back above, to change and make again"
          data-clip-again
          @click="again(clip)"
        >
          Again
        </button>
        <button
          type="button"
          class="action"
          :class="{ 'action-on': fixing === clip.file }"
          title="Say what was wrong with it, for the Text Model to rewrite its prompt"
          data-clip-wrong
          @click="fixing = fixing === clip.file ? null : clip.file"
        >
          What went wrong?
        </button>
        <form
          v-if="fixing === clip.file"
          class="flex w-full flex-col gap-1.5"
          data-clip-problem
          @submit.prevent="rewrite(clip)"
        >
          <textarea
            v-model="problem"
            rows="2"
            class="w-full resize-y rounded border border-line bg-surface p-2 text-xs"
            placeholder="What you saw, and what should happen instead: she walks out of the door; she should stay at the table and put the coin down."
            aria-label="What was wrong with the clip"
          />
          <button type="submit" class="action self-start" :disabled="!problem.trim() || writing">
            Rewrite the prompt
          </button>
        </form>
      </li>
    </ul>
  </section>
</template>
