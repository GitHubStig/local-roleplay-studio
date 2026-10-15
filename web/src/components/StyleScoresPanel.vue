<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, getStyleScores, type Job, listJobs, queueJob } from '../api'
import { useStyleBase } from '../composables/useStyleBase'
import { useFeatures } from '../composables/useFeatures'
import { jobStatus } from '../jobs'
import type { StyleScores } from '../styleScores'
import StyleScoresView from './StyleScoresView.vue'

/**
 * The Compare dialog's style scores: how varied each shown Image Model's art style is across the
 * Frames, against a base Frame the player picks (remembered per Session in this browser). Score
 * embeds the pictures in the background (a `style` job, CSD and CLIP); after that the scores come
 * back at once for any base Frame or set of models, and Score again takes in pictures made since.
 */
const props = defineProps<{
  sessionId: string
  /** The Image Models shown in the table (ids), in its order. */
  models: readonly string[]
  /**
   * The Frames with pictures, in order, with what each is called and what happens in it (its
   * picture's caption: a Chain Frame's Narration), to tell them apart in the base Frame's list.
   */
  frames: readonly { index: number; name: string; caption?: string }[]
  /** The Frames every shown model pictured (indexes): the only ones the scores can compare. */
  shared: readonly number[]
  /** How many Frames each shown model pictured, to say which keep the shared ones too few. */
  pictured: Record<string, number>
  labelOf: (model: string) => string
  /** Every Frame shares one style (a Storyboard's, a Roleplay's): see `StyleMeasure`. */
  oneStyle?: boolean
}>()

const { on } = useFeatures()

const base = useStyleBase(props.sessionId, () => props.shared)
/** The base Frame's choices: the shared Frames. */
const baseFrames = computed(() => props.frames.filter((f) => props.shared.includes(f.index)))
/** A Frame in the base Frame's list: its name, then the start of its caption. */
const optionText = (f: { name: string; caption?: string }) => {
  const caption = f.caption?.replace(/\s+/g, ' ').trim()
  if (!caption) return f.name
  return `${f.name} · ${caption.length > 60 ? `${caption.slice(0, 59).trimEnd()}…` : caption}`
}

/** The scores; null before the first scoring; undefined while loading. */
const scores = ref<StyleScores | null | undefined>()
const problem = ref<string | null>(null)
async function load() {
  if (props.models.length < 2) {
    scores.value = null
    problem.value = 'Show at least two models in the table to compare their styles.'
    return
  }
  if (props.shared.length < 2) {
    // Said by `shownProblem`, which names the models as their names load.
    scores.value = null
    problem.value = null
    return
  }
  try {
    scores.value = await getStyleScores(props.sessionId, base.value, props.models)
    problem.value = null
  } catch (err) {
    scores.value = null
    problem.value = err instanceof ApiError && err.status === 404 ? null : (err as Error).message
  }
}
watch([base, () => props.models.join(), () => props.shared.join()], load)

/**
 * Why fewer than two Frames can be compared: the shown models that pictured fewest, by name, to
 * hide. "FLUX.2 Klein 4B pictured only 1 Frame: hide its column to compare the rest."
 */
const tooFew = computed(() => {
  const counts = props.models.map((m) => props.pictured[m] ?? 0)
  const fewest = props.models.filter((m) => (props.pictured[m] ?? 0) < Math.max(...counts))
  if (!fewest.length) return 'Fewer than two Frames have a picture by every shown model.'
  const named = fewest.map((m) => {
    const n = props.pictured[m] ?? 0
    return `${props.labelOf(m)} pictured only ${n} ${n === 1 ? 'Frame' : 'Frames'}`
  })
  const columns = fewest.length === 1 ? 'its column' : 'their columns'
  return `${named.join(', and ')}: hide ${columns} to compare the rest.`
})
const shownProblem = computed(() =>
  props.models.length >= 2 && props.shared.length < 2 ? tooFew.value : problem.value
)

/** The scoring job, while it's queued, running, or failed. */
const job = ref<Job | null>(null)
async function refreshJob() {
  const was = job.value
  job.value = (await listJobs(props.sessionId).catch(() => [])).find((j) => j.kind === 'style') ??
    null
  if (was && !job.value) await load()
  if (!job.value || job.value.status === 'failed') pause()
}
const { pause, resume } = useIntervalFn(refreshJob, 1000, { immediate: false })
onMounted(async () => {
  await Promise.all([load(), refreshJob()])
  if (job.value && job.value.status !== 'failed') resume()
})

async function score() {
  problem.value = null
  try {
    const queued = await queueJob(props.sessionId, 'style', 0)
    job.value = queued.find((j) => j.kind === 'style') ?? null
    resume()
  } catch (err) {
    problem.value = (err as Error).message
  }
}
const scoring = computed(() => !!job.value && job.value.status !== 'failed')
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4" data-style-scores>
    <div class="flex flex-wrap items-end gap-4">
      <label class="flex min-w-0 max-w-full flex-col gap-1">
        <span class="text-sm text-muted">Base Frame</span>
        <select
          v-model="base"
          class="max-w-full rounded border border-line bg-surface px-2 py-1"
          data-style-base
        >
          <option v-for="f in baseFrames" :key="f.index" :value="f.index">
            {{ optionText(f) }}
          </option>
        </select>
      </label>
      <button
        v-if="on('style')"
        type="button"
        class="rounded-lg bg-fg px-4 py-1.5 font-medium text-canvas disabled:opacity-50"
        :disabled="scoring"
        data-style-score
        @click="score"
      >
        {{ scores ? 'Score again' : 'Score' }}
      </button>
      <span v-if="job" class="text-sm" :class="job.status === 'failed' ? 'text-danger' : 'text-muted'">
        {{ jobStatus(job) }}
      </span>
      <span v-else-if="scores?.unembedded" class="text-sm text-muted">
        {{ scores.unembedded }} new {{ scores.unembedded === 1 ? 'picture or caption' : 'pictures and captions' }}
        since: Score again to take them in.
      </span>
    </div>
    <p class="max-w-prose text-sm text-muted">
      <template v-if="oneStyle">
        Every Frame here shares the Look's style, so any Frame will do as the base, and lower
        numbers mean a steadier style.
      </template>
      <template v-else>
        The base Frame is the one without a style of its own, often the first or the last.
      </template>
    </p>
    <p v-if="shownProblem" class="text-danger" data-style-problem>{{ shownProblem }}</p>
    <p v-else-if="scores === null && !scoring" class="text-muted">
      <template v-if="on('style')">Not scored yet: Score embeds the pictures, about a second each.</template>
      <template v-else>Style scores are off: switch them on in Settings (Images).</template>
    </p>

    <StyleScoresView v-if="scores" :scores :label-of="labelOf" :frames :one-style />
  </div>
</template>
