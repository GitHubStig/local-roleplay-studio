<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import {
  type Clip,
  CLIP_KIND_NAMES,
  type ClipKind,
  type ClipOrder,
  writeClipPrompt,
} from '../api'
import { sortClips } from '../clips'

/**
 * The selected Frame's clips (ADR 0025), in its tab, the same in every kind of Session:
 * pick where the picture sits in the clip, its length and whether anyone speaks; the Text Model
 * writes the prompt from the story, for the player to read and edit; then the clip is queued. A
 * kind the picture has a clip of fills the form from it, to change and make again (Redo clip, which
 * replaces it). The clips made are listed, to play over the picture (and stop), or to say what was
 * wrong with one, for the Text Model to rewrite its prompt by.
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
  /** The clip playing over the picture, by its file. */
  playing?: string
}>()
const emit = defineEmits<{ make: [order: ClipOrder]; play: [clip: Clip]; stop: [] }>()

const KINDS = Object.keys(CLIP_KIND_NAMES) as ClipKind[]
const SECONDS = [3, 4, 5, 6, 8, 10]

const kind = ref<ClipKind>('lead-in')
const seconds = ref(5)
const speech = ref(false)
const prompt = ref('')
const writing = ref(false)
const error = ref('')

/** The picture's clip of the kind chosen, if it has one (one of each kind). */
const made = computed(() => props.clips?.find((c) => c.kind === kind.value))
/**
 * The form as the chosen kind's clip was ordered, to make again; for a kind not made yet, an
 * empty prompt, as a prompt is written for one kind (and one Frame) and doesn't carry over.
 */
function fillForm() {
  error.value = ''
  const clip = made.value
  if (!clip) {
    prompt.value = ''
    return
  }
  seconds.value = clip.seconds
  speech.value = clip.speech
  prompt.value = clip.prompt
}
// Another kind, another Frame, or another picture's clip (the Session's Image Model switched).
watch([kind, () => props.index, () => made.value?.file], fillForm, { immediate: true })

const hint = computed(() =>
  ({
    'lead-in': 'Ends on this picture: what leads up to it.',
    'play-out': 'Starts on this picture: what happens next.',
    'idle-loop': 'Starts and ends on this picture: small movement, to loop.',
    'into-next': `Starts on this picture and ends on ${props.nextName}'s.`,
  })[kind.value]
)

/** The picture's clips in the kinds' order. */
const listed = computed(() => sortClips(props.clips))
/** The kind chosen is being made already: one of each kind at a time, the others free meanwhile. */
const makingThis = computed(() => props.making.includes(kind.value))
/** Make clip, Redo clip for a kind the picture has, or that this kind is being made. */
const makeLabel = computed(() =>
  makingThis.value ? `Making ${CLIP_KIND_NAMES[kind.value]}…` : made.value ? 'Redo clip' : 'Make clip'
)
/** The other kinds being made meanwhile, under the buttons. */
const othersMaking = computed(() =>
  props.making.filter((k) => k !== kind.value).map((k) => CLIP_KIND_NAMES[k]).join(', ')
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
const problemBox = useTemplateRef<HTMLTextAreaElement[]>('problemBox')
/**
 * What went wrong?: the clip back in the form, so its prompt shows while it's said what was wrong,
 * and the focus on what was wrong. Again, it closes.
 */
async function toggleFixing(clip: Clip) {
  if (fixing.value === clip.file) {
    fixing.value = null
    return
  }
  again(clip)
  fixing.value = clip.file
  await nextTick()
  problemBox.value?.[0]?.focus()
}
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
  kind.value = clip.kind
  fillForm()
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
        :disabled="writing || makingThis || !prompt.trim() || (kind === 'into-next' && !nextPictured)"
        :title="makingThis
          ? 'This kind of clip is being made of this picture'
          : made
          ? `Make it again as set above, in place of this ${CLIP_KIND_NAMES[kind]} (a few minutes)`
          : 'Make the clip (a few minutes)'"
        data-make-clip
        @click="make"
      >
        {{ makeLabel }}
      </button>
    </div>
    <p v-if="othersMaking" class="text-xs text-muted" data-clips-making>Making {{ othersMaking }} meanwhile.</p>
    <ul v-if="listed.length" class="flex flex-col text-xs" data-clips>
      <li
        v-for="clip in listed"
        :key="clip.file"
        class="flex flex-wrap items-center gap-2 border-t border-line py-1.5"
        :data-clip="clip.kind"
      >
        <span class="w-16 font-medium">{{ CLIP_KIND_NAMES[clip.kind] }}</span>
        <span class="flex-1 text-muted">{{ clip.seconds }} s · {{ clip.speech ? 'with speech' : 'no dialogue' }}</span>
        <button
          type="button"
          class="action"
          :class="{ 'action-on': playing === clip.file }"
          :aria-pressed="playing === clip.file"
          data-play-clip
          @click="playing === clip.file ? emit('stop') : emit('play', clip)"
        >
          {{ playing === clip.file ? 'Stop' : 'Play' }}
        </button>
        <button
          type="button"
          class="action"
          :class="{ 'action-on': fixing === clip.file }"
          title="Say what was wrong with it, for the Text Model to rewrite its prompt"
          data-clip-wrong
          @click="toggleFixing(clip)"
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
            ref="problemBox"
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
