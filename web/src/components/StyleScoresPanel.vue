<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { ApiError, getStyleScores, type Job, listJobs, queueJob } from '../api'
import { useStoredString } from '../composables/storage'
import { useFeatures } from '../composables/useFeatures'
import { jobStatus } from '../jobs'
import { STYLE_MEASURES, type StyleScores } from '../styleScores'

/** The charts, with Observable Plot: loaded only when there are scores to show. */
const StyleCharts = defineAsyncComponent(() => import('./StyleCharts.vue'))

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
  labelOf: (model: string) => string
}>()

const { on } = useFeatures()

const storedBase = useStoredString(`style-base:${props.sessionId}`)
const base = computed({
  get: () => {
    const stored = Number(storedBase.value)
    return props.frames.some((f) => f.index === stored) && storedBase.value !== null
      ? stored
      : props.frames[0]?.index ?? 0
  },
  set: (index: number) => (storedBase.value = String(index)),
})
/** A Frame in the base Frame's list: its name, then the start of its caption. */
const optionText = (f: { name: string; caption?: string }) => {
  const caption = f.caption?.replace(/\s+/g, ' ').trim()
  if (!caption) return f.name
  return `${f.name} · ${caption.length > 60 ? `${caption.slice(0, 59).trimEnd()}…` : caption}`
}
const frameName = (index: number) => props.frames.find((f) => f.index === index)?.name ?? `Frame ${index}`

/** The scores; null before the first scoring; undefined while loading. */
const scores = ref<StyleScores | null | undefined>()
const problem = ref<string | null>(null)
async function load() {
  if (props.models.length < 2) {
    scores.value = null
    problem.value = 'Show at least two models in the table to compare their styles.'
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
watch([base, () => props.models.join()], load)

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
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4" data-style-scores>
    <div class="flex flex-wrap items-end gap-4">
      <label class="flex flex-col gap-1">
        <span class="text-sm text-muted">Base Frame</span>
        <select v-model="base" class="rounded border border-line bg-surface px-2 py-1" data-style-base>
          <option v-for="f in frames" :key="f.index" :value="f.index">{{ optionText(f) }}</option>
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
      The base Frame is the one without a style of its own, often the first or the last. Style is
      measured with CSD, a model trained to tell art styles apart whatever a picture shows, on the
      {{ scores ? `${scores.frames.length} Frames` : 'Frames' }} every shown model pictured.
    </p>
    <p v-if="problem" class="text-danger" data-style-problem>{{ problem }}</p>
    <p v-else-if="scores === null && !scoring" class="text-muted">
      <template v-if="on('style')">Not scored yet: Score embeds the pictures, about a second each.</template>
      <template v-else>Style scores are off: switch them on in Settings (Images).</template>
    </p>

    <template v-if="scores">
      <StyleCharts :scores :label-of="labelOf" :frame-name="frameName" />
      <details class="text-sm">
        <summary class="text-muted">The numbers</summary>
        <table class="mt-2 border-separate border-spacing-x-3 border-spacing-y-1" data-style-table>
          <thead>
            <tr>
              <th class="text-left font-medium">Image Model</th>
              <th v-for="m in STYLE_MEASURES" :key="m.id" class="text-right font-medium">{{ m.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in scores.models" :key="s.model">
              <td>{{ labelOf(s.model) }}</td>
              <td v-for="m in STYLE_MEASURES" :key="m.id" class="text-right tabular-nums">
                {{ m.value(s) === undefined ? '–' : m.format(m.value(s)!) }}
              </td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </div>
</template>
