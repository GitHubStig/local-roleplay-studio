<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import {
  type Clip,
  CLIP_KIND_NAMES,
  type ClipKind,
  type ClipOrder,
  writeClipPrompt,
} from '../api'
import { type ClipMaking, clipsByKind, useVideoModels } from '../clips'
import ClipCompare from './ClipCompare.vue'

/**
 * The selected Frame's clips (ADR 0025), in its tab, the same in every kind of Session:
 * pick where the picture sits in the clip, its length, whether anyone speaks and the video model
 * (the last picked in the Session, else Settings' default); the Text Model writes the prompt from
 * the story, for the player to read and edit; then the clip is queued. Each video model keeps a clip
 * of each kind. A kind the picture has a clip of fills the form from it: the chosen model's, to
 * change and make again (Redo clip, which replaces it), or else another model's, so the same prompt
 * goes to the next model to compare. Under the prompt, Change it has the Text Model rewrite it by
 * what the player says should change, before the clip is made. The clips made are listed by kind,
 * to play over the picture (and stop), to say what was wrong with one (that fills the same box, for
 * the same rewrite), or, for a kind made by two models or more, to compare side by side.
 */
const props = defineProps<{
  sessionId: string
  /** The Frame's index, as the server numbers it. */
  index: number
  /** Its picture's clips, one of each kind per video model. */
  clips?: Clip[]
  /** The next Frame has a picture for Into Next to end on; `nextName` names it. */
  nextPictured: boolean
  nextName: string
  /** The clips queued or being made of the Frame, by kind and video model. */
  making: ClipMaking[]
  /** The clip playing over the picture, by its file. */
  playing?: string
}>()
const emit = defineEmits<{ make: [order: ClipOrder]; play: [clip: Clip]; stop: [] }>()

const KINDS = Object.keys(CLIP_KIND_NAMES) as ClipKind[]
const { models, labelOf, silent: makesNoSound, chosen: model } = useVideoModels(() => props.sessionId)
/** The video model makes no sound (Wan 2.2), so there's no speech to ask for. */
const silent = computed(() => makesNoSound(model.value))
/** The kind compared side by side, while the comparison is open. */
const comparing = ref<ClipKind | null>(null)
const SECONDS = [3, 4, 5, 6, 8, 10]

const kind = ref<ClipKind>('lead-in')
const seconds = ref(5)
const speech = ref(false)
const prompt = ref('')
const writing = ref(false)
const error = ref('')

/** The picture's clip of the kind chosen by the video model chosen, if it has one. */
const made = computed(() => props.clips?.find((c) => c.kind === kind.value && c.model === model.value))
/**
 * The form as the chosen kind's clip was ordered, to make again: the chosen model's, else another
 * model's, so the same prompt can be compared; for a kind not made yet, an empty prompt, as a
 * prompt is written for one kind (and one Frame) and doesn't carry over.
 */
function fillForm() {
  error.value = ''
  const clip = made.value ?? props.clips?.find((c) => c.kind === kind.value)
  if (!clip) {
    prompt.value = ''
    return
  }
  seconds.value = clip.seconds
  speech.value = clip.speech
  prompt.value = clip.prompt
}
// Another kind, another Frame, another picture's clip (the Session's Image Model switched), or
// another video model's.
watch([kind, () => props.index, () => made.value?.file], fillForm, { immediate: true })

const hint = computed(() =>
  ({
    'lead-in': 'Ends on this picture: what leads up to it.',
    'play-out': 'Starts on this picture: what happens next, as the Text Model decides.',
    'idle-loop': 'Starts and ends on this picture: small movement, to loop.',
    'into-next': `Starts on this picture and ends on ${props.nextName}'s.`,
  })[kind.value]
)

/** The picture's clips by kind, in the kinds' order. */
const listed = computed(() => clipsByKind(props.clips))
/** Whose clip a clip being made is: one ordered without a model is Settings' default's. */
const makingBy = (m: ClipMaking) => m.model ?? model.value
/**
 * The kind chosen is being made already by the model chosen: one of each kind per model at a
 * time, the others free meanwhile.
 */
const makingThis = computed(() =>
  props.making.some((m) => m.kind === kind.value && makingBy(m) === model.value)
)
/** Make clip, Redo clip for a kind the picture has, or that this kind is being made. */
const makeLabel = computed(() =>
  makingThis.value ? `Making ${CLIP_KIND_NAMES[kind.value]}…` : made.value ? 'Redo clip' : 'Make clip'
)
/** The other kinds being made meanwhile, under the buttons. */
const othersMaking = computed(() =>
  props.making.filter((m) => m.kind !== kind.value || makingBy(m) !== model.value)
    .map((m) => CLIP_KIND_NAMES[m.kind] + (models.value.length > 1 ? ` by ${labelOf(makingBy(m))}` : ''))
    .join(', ')
)

/** Writes the prompt; with `revise`, rewrites a clip's by what was wrong with it. */
async function write(revise?: { prompt: string; problem: string }) {
  writing.value = true
  error.value = ''
  prompt.value = ''
  try {
    const ask = { kind: kind.value, seconds: seconds.value, speech: speech.value && !silent.value }
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
  const order = {
    kind: kind.value,
    prompt: prompt.value.trim(),
    seconds: seconds.value,
    speech: speech.value && !silent.value,
    // None until the models load: the server takes Settings' default.
    ...(model.value && { model: model.value }),
  }
  emit('make', order)
}

/** What should change in the prompt, said in the Change it box. */
const change = ref('')
const changeBox = useTemplateRef<HTMLInputElement>('changeBox')
/** The prompt as it was before the last rewrite, to go back to. */
const before = ref<string | null>(null)

/** Rewrites the prompt in the box (edits and all) by what was said should change. */
async function rewrite() {
  const revise = { prompt: prompt.value, problem: change.value.trim() }
  const was = prompt.value
  change.value = ''
  await write(revise)
  before.value = was
}
function undoRewrite() {
  if (before.value === null) return
  prompt.value = before.value
  before.value = null
}
// A rewrite undone belongs to the prompt it was made on.
watch([kind, () => props.index], () => (before.value = null))

/**
 * What went wrong? on a clip: its order back in the form, so its prompt shows, and the focus in
 * the Change it box.
 */
async function toggleFixing(clip: Clip) {
  again(clip)
  await nextTick()
  changeBox.value?.focus()
}

/** Puts a clip's order back in the form, to edit and make again by its video model. */
function again(clip: Clip) {
  kind.value = clip.kind
  model.value = clip.model
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
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <label v-if="models.length > 1" class="flex items-center gap-1.5">
        Video model
        <select v-model="model" class="rounded border border-line bg-surface px-1 py-0.5" data-clip-model>
          <option v-for="m in models" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1.5">
        Length
        <select v-model.number="seconds" class="rounded border border-line bg-surface px-1 py-0.5" data-clip-seconds>
          <option v-for="s in SECONDS" :key="s" :value="s">{{ s }} s</option>
        </select>
      </label>
      <label v-if="!silent" class="flex cursor-pointer items-center gap-1.5">
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
    <form v-if="prompt.trim() && !writing" class="flex items-center gap-2" data-clip-change @submit.prevent="rewrite">
      <input
        ref="changeBox"
        v-model="change"
        type="text"
        class="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs"
        placeholder="Change it: she stays at the table and puts the coin down"
        aria-label="What should change in the prompt"
      />
      <button type="submit" class="action" :disabled="!change.trim()">Rewrite</button>
      <button v-if="before !== null" type="button" class="action" data-undo-rewrite @click="undoRewrite">
        Undo
      </button>
    </form>
    <p v-if="othersMaking" class="text-xs text-muted" data-clips-making>Making {{ othersMaking }} meanwhile.</p>
    <ul v-if="listed.length" class="flex flex-col text-xs" data-clips>
      <li v-for="group in listed" :key="group.kind" class="border-t border-line py-1" :data-clip="group.kind">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ CLIP_KIND_NAMES[group.kind] }}</span>
          <button
            v-if="group.clips.length > 1"
            type="button"
            class="action ml-auto"
            :title="`Play each model's ${CLIP_KIND_NAMES[group.kind]} side by side, together`"
            data-compare-clips
            @click="comparing = group.kind"
          >
            Compare
          </button>
        </div>
        <div
          v-for="clip in group.clips"
          :key="clip.file"
          class="flex flex-wrap items-center gap-2 py-0.5 pl-3"
          :data-clip-by="clip.model"
        >
          <span class="flex-1 text-muted">
            {{ labelOf(clip.model) }} · {{ clip.seconds }} s ·
            {{ makesNoSound(clip.model) ? 'no sound' : clip.speech ? 'with speech' : 'no dialogue' }}
          </span>
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
            title="Say what was wrong with it, for the Text Model to rewrite its prompt"
            data-clip-wrong
            @click="toggleFixing(clip)"
          >
            Change it
          </button>
        </div>
      </li>
    </ul>
    <ClipCompare :session-id="sessionId" :clips="clips ?? []" :kind="comparing" @close="comparing = null" />
  </section>
</template>
