<script setup lang="ts">
import { useEventListener, useManualRefHistory } from '@vueuse/core'
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import {
  type EditOrder,
  framePicture,
  imageUrl,
  type Job,
  newestImage,
  pickedEdit,
  type Picture,
  type PicturedFrame,
} from '../api'
import { useFeatures } from '../composables/useFeatures'
import ImageViewer from './ImageViewer.vue'
import PaintLayer, { type Sketch } from './PaintLayer.vue'
import PictureVersions, { type VersionEntry } from './PictureVersions.vue'

/**
 * A Session's pictures in the full-window viewer: it opens on one Frame, and ← and → (or ↑ and ↓)
 * step through the Frames that have a picture, showing each one's upscale if it has one. A picture
 * shows as its picked version (ADR 0021); its versions, beside it, pick another. Edit paints over
 * the newest version the area to repaint, and says what to paint there; the edit then shows among
 * the versions while it's made, over what it's made from, with its progress, until it lands.
 */
const props = withDefaults(
  defineProps<{
    sessionId: string
    frames: readonly PicturedFrame[]
    /** The Session's Image Model, which picks the picture each Frame shows. */
    imageModel: string
    /** What a Frame is called in the viewer's label. */
    name?: (index: number) => string
    /** The Session's jobs (`useJobs`): its edits being made, or failed, show as versions. */
    jobs?: readonly Job[]
  }>(),
  { name: (index: number) => `Frame ${index}`, jobs: () => [] },
)
/** The Frame open in the viewer, by index; null keeps it closed. */
const open = defineModel<number | null>('open', { required: true })
/** Painting an edit of the open Frame's picture. */
const painting = defineModel<boolean>('painting', { default: false })
const emit = defineEmits<{
  /** The viewer stepped to Frame `index`, e.g. to scroll what's behind it there. */
  step: [index: number]
  /** Edit Frame `index`'s picture as `order` says. */
  edit: [index: number, order: EditOrder]
  /** Pick version `version` of Frame `index`'s picture. */
  pick: [index: number, version: number]
  /** Delete the newest edit of Frame `index`'s picture. */
  deleteEdit: [index: number]
  /** Cancel an edit being made, or dismiss one that failed. */
  dropJob: [job: Job]
}>()
const { on: featureOn } = useFeatures()

const pictured = computed(() =>
  props.frames.flatMap((f) => {
    const picture = framePicture(f, props.imageModel)
    return picture ? [{ index: f.index, picture }] : []
  })
)
const at = computed(() => pictured.value.findIndex((f) => f.index === open.value))
const current = computed(() => (at.value >= 0 ? pictured.value[at.value] : null))
const picture = computed(() => current.value?.picture)
const edits = computed(() => picture.value?.edits ?? [])

/** The open Frame's edits being made or failed, in the order queued. */
const editJobs = computed(() =>
  props.jobs.filter((j) => j.kind === 'edit' && j.frameIndex === current.value?.index && j.edit)
)
/** The edit being made, if any: no other can be asked for until it lands. */
const inProgress = computed(() => editJobs.value.find((j) => j.status !== 'failed'))

/** The image an edit is made from: the newest version, or for a retry the one before it. */
function sourceOf(p: Picture, retry?: boolean): string {
  return retry ? (p.edits?.at(-2)?.image ?? p.image) : newestImage(p)
}
const fileUrl = (file: string) => imageUrl(props.sessionId, file)

// --- Painting an edit: what it's told, and the area, kept while the dialog stays on the Frame.
interface Draft {
  /** Makes the newest edit again, in its place. */
  retry: boolean
  /** The area painted before, which it starts from (a mask file). */
  base?: string
  instruction: string
  /** A failed edit it's made in place of, dismissed once it's sent. */
  replaces?: Job
}
const draft = ref<Draft | null>(null)
const sketch = ref<Sketch>({ base: true, strokes: [] })
const history = useManualRefHistory(sketch, { clone: true })
const layer = useTemplateRef<InstanceType<typeof PaintLayer>>('layer')
const brush = reactive({ size: 60, erase: false })

// --- Which version is shown: the picked one, or an edit being made (by its job).
const viewedJobId = ref<string | null>(null)
const viewedJob = computed(() => editJobs.value.find((j) => j.id === viewedJobId.value))
/** Waiting for the edit just sent to show up in the queue, to show it as it's made. */
let awaitingEdit = false

// A Frame opens on its edit being made, if it has one.
watch(
  () => current.value?.index,
  () => {
    viewedJobId.value = inProgress.value?.id ?? null
    draft.value = null
  },
  { immediate: true },
)
watch(editJobs, (now, before) => {
  const fresh = now.find((j) => !before?.some((b) => b.id === j.id))
  if (awaitingEdit && fresh) {
    viewedJobId.value = fresh.id
    awaitingEdit = false
  }
  // Landed or dropped: the picture then shows its picked version, the new edit if it landed.
  if (viewedJobId.value && !now.some((j) => j.id === viewedJobId.value)) viewedJobId.value = null
})

const versions = computed<VersionEntry[]>(() => {
  const p = picture.value
  if (!p) return []
  const picked = viewedJob.value ? -1 : (p.picked ?? 0)
  return [
    { key: '0', label: 'Original', title: 'As rendered', selected: picked === 0 },
    ...edits.value.map((e, i) => ({
      key: String(i + 1),
      label: `Edit ${i + 1}`,
      title: e.instructions.join('; '),
      selected: picked === i + 1,
    })),
    ...editJobs.value.map((j, i): VersionEntry => ({
      key: j.id,
      label: j.edit!.retry ? `Edit ${edits.value.length} · redo` : `Edit ${edits.value.length + i + 1}`,
      title: j.edit!.instruction,
      state: j.status === 'failed' ? 'failed' : 'editing',
      selected: j.id === viewedJobId.value,
    })),
  ]
})
function choose(key: string) {
  const frame = current.value
  if (!frame) return
  if (editJobs.value.some((j) => j.id === key)) {
    viewedJobId.value = key
    return
  }
  viewedJobId.value = null
  if (Number(key) !== (frame.picture.picked ?? 0)) emit('pick', frame.index, Number(key))
}

/** What an edit being made is doing, in a few words. */
function editStatus(job: Job): string {
  if (job.status === 'failed') return `Failed: ${job.error}`
  if (job.status === 'queued' || job.phase === 'queued') return 'Waiting its turn'
  if (job.phase === 'download') return 'Downloading the edit model (the first time)'
  return job.progress ? `Editing · step ${job.progress.step} of ${job.progress.total}` : 'Editing'
}

const shown = computed(() => {
  const frame = current.value
  if (!frame) return null
  const p = frame.picture
  const name = props.name(frame.index)
  const label = `${name} · ${at.value + 1} of ${pictured.value.length}`
  if (painting.value && draft.value) {
    // What the edit is made from, at its own size: the mask is painted in its pixels.
    return {
      src: fileUrl(sourceOf(p, draft.value.retry)),
      alt: `Picture of ${name}, to paint over`,
      label: `Editing ${name}: paint over what to repaint`,
    }
  }
  const job = viewedJob.value
  if (job) {
    return {
      src: fileUrl(sourceOf(p, job.edit!.retry)),
      alt: `Picture of ${name}, being edited`,
      label,
      caption: `${editStatus(job)}\n${job.edit!.instruction}`,
      mask: job.edit!.mask,
      rendering: job.status === 'running' ? 'image' as const : job.status === 'queued' ? 'queued' as const : null,
    }
  }
  const edit = pickedEdit(p)
  const version = edit ?? p
  return {
    src: fileUrl(version.upscaled ?? version.image),
    alt: `Picture of ${name}`,
    label,
    caption: edit
      ? `Edit ${p.picked}: ${edit.instructions.join('; ')}`
      : p.edits?.length || editJobs.value.length
      ? 'The Original, as rendered.'
      : undefined,
  }
})

function step(by: number) {
  const frame = pictured.value[at.value + by]
  if (!frame) return
  open.value = frame.index
  emit('step', frame.index)
}

function startDraft(next: Draft) {
  draft.value = next
  sketch.value = { base: true, strokes: [] }
  history.clear()
  painting.value = true
}
/** A new edit; one already begun on this Frame carries on. */
function editNew() {
  if (draft.value && !draft.value.retry && !draft.value.replaces) painting.value = true
  else startDraft({ retry: false, instruction: '' })
}
/** The newest edit made again: its area and instruction, to change before it's sent. */
function redoNewest() {
  const newest = edits.value.at(-1)
  if (!newest) return
  startDraft({ retry: true, base: newest.mask, instruction: newest.instructions.join('; ') })
}
/** A failed edit asked for again, as it was, to change before it's sent. */
function redoFailed(job: Job) {
  const { instruction, mask, retry } = job.edit!
  startDraft({ retry: !!retry, base: mask, instruction, replaces: job })
}
function addStroke(stroke: Sketch['strokes'][number]) {
  sketch.value = { ...sketch.value, strokes: [...sketch.value.strokes, stroke] }
  history.commit()
}
function clearSketch() {
  sketch.value = { base: false, strokes: [] }
  history.commit()
}
function send() {
  const frame = current.value
  const d = draft.value
  const told = d?.instruction.trim()
  if (!frame || !d || !told) return
  const mask = layer.value?.mask()
  emit('edit', frame.index, { instruction: told, ...(mask && { mask }), ...(d.retry && { retry: true }) })
  if (d.replaces) emit('dropJob', d.replaces)
  awaitingEdit = true
  draft.value = null
  painting.value = false
}
function close() {
  draft.value = null
  painting.value = false
  open.value = null
}
function deleteNewest() {
  const frame = current.value
  if (!frame || !edits.value.length) return
  if (!confirm(`Delete Edit ${edits.value.length} of ${props.name(frame.index)}? This can't be undone.`)) return
  emit('deleteEdit', frame.index)
}

// Asked to paint (Edit on the screen): a new edit, unless one is being made, which then shows.
watch(
  painting,
  (now) => {
    if (!now || draft.value) return
    if (inProgress.value) {
      painting.value = false
      viewedJobId.value = inProgress.value.id
    } else startDraft({ retry: false, instruction: '' })
  },
  { immediate: true },
)

/** ⌘Z and ⇧⌘Z (Ctrl on a PC) undo and redo strokes, outside the instruction box. */
useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  if (!painting.value || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
  if ((e.target as HTMLElement).closest('textarea, input')) return
  e.preventDefault()
  if (e.shiftKey) history.redo()
  else history.undo()
})

/** The newest edit is the one shown: Redo and Delete act on it. */
const newestShown = computed(() =>
  !viewedJob.value && !!edits.value.length && (picture.value?.picked ?? 0) === edits.value.length
)
/** An action's button, on a dark backing: the screen behind shows through the dialog's backdrop. */
const action =
  'shrink-0 rounded-lg border border-white/30 bg-black/70 px-2 py-1 text-left hover:text-white disabled:opacity-40'
</script>

<template>
  <ImageViewer
    :src="shown?.src ?? null"
    :alt="shown?.alt"
    :label="shown?.label"
    :caption="shown?.caption"
    :rendering="shown && 'rendering' in shown ? shown.rendering : null"
    :has-previous="at > 0"
    :has-next="at >= 0 && at < pictured.length - 1"
    :painting="painting"
    @previous="step(-1)"
    @next="step(1)"
    @close="close"
    @stop-painting="painting = false"
  >
    <template v-if="current && !painting" #side="{ vertical }">
      <PictureVersions :versions="versions" :vertical="vertical" @choose="choose">
        <template v-if="viewedJob">
          <button
            v-if="viewedJob.status !== 'failed'"
            type="button"
            :class="action"
            data-cancel-edit
            @click="emit('dropJob', viewedJob)"
          >
            Cancel edit
          </button>
          <template v-else>
            <button
              v-if="featureOn('edits')"
              type="button"
              :class="action"
              data-redo-edit
              @click="redoFailed(viewedJob)"
            >
              Redo edit
            </button>
            <button type="button" :class="action" data-delete-edit @click="emit('dropJob', viewedJob)">
              Delete edit
            </button>
          </template>
        </template>
        <template v-else-if="newestShown && !inProgress">
          <button
            v-if="featureOn('edits') && !edits.at(-1)!.copied"
            type="button"
            :class="action"
            title="Change its area or instruction, and make it again"
            data-redo-edit
            @click="redoNewest"
          >
            Redo edit
          </button>
          <button type="button" :class="action" data-delete-edit @click="deleteNewest">
            Delete edit
          </button>
        </template>
        <button
          v-if="featureOn('edits')"
          type="button"
          :class="action"
          :disabled="!!inProgress"
          :title="inProgress ? 'Being edited: wait for it first' : 'Repaint part of the picture'"
          data-edit
          @click="editNew"
        >
          Edit
        </button>
      </PictureVersions>
    </template>
    <template v-if="painting && draft" #layer="{ size }">
      <PaintLayer
        ref="layer"
        :width="size.width"
        :height="size.height"
        :sketch="sketch"
        :base="draft.base && fileUrl(draft.base)"
        :size="brush.size"
        :erase="brush.erase"
        @stroke="addStroke"
      />
    </template>
    <template v-else-if="shown && 'mask' in shown && shown.mask" #layer="{ size }">
      <PaintLayer
        :width="size.width"
        :height="size.height"
        :sketch="{ base: true, strokes: [] }"
        :base="fileUrl(shown.mask)"
        readonly
      />
    </template>
    <template v-if="painting && draft" #below>
      <div class="flex flex-col gap-2 text-sm text-white/80" data-paint-tools>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="inline-flex overflow-hidden rounded-lg border border-white/30" role="group">
            <button
              v-for="tool in [{ erase: false, label: 'Brush' }, { erase: true, label: 'Eraser' }]"
              :key="tool.label"
              type="button"
              class="px-2 py-1"
              :class="brush.erase === tool.erase ? 'bg-white/90 text-black' : 'hover:text-white'"
              :aria-pressed="brush.erase === tool.erase"
              @click="brush.erase = tool.erase"
            >
              {{ tool.label }}
            </button>
          </div>
          <label class="flex items-center gap-2">
            Size
            <input v-model.number="brush.size" type="range" min="8" max="240" data-brush-size />
          </label>
          <button
            type="button"
            class="hover:text-white disabled:opacity-40"
            :disabled="!history.canUndo.value"
            title="Undo (⌘Z)"
            @click="history.undo()"
          >
            Undo
          </button>
          <button
            type="button"
            class="hover:text-white disabled:opacity-40"
            :disabled="!history.canRedo.value"
            title="Redo (⇧⌘Z)"
            @click="history.redo()"
          >
            Redo
          </button>
          <button type="button" class="hover:text-white" @click="clearSketch">Clear</button>
        </div>
        <div class="flex items-end gap-2">
          <textarea
            v-model="draft.instruction"
            rows="2"
            maxlength="1000"
            class="min-w-0 flex-1 resize-none rounded-lg border border-white/30 bg-black/40 p-2 text-white placeholder:text-white/50"
            placeholder="What to paint there, e.g. “a hand reaching forward, index finger extended”"
            data-edit-instruction
            @keydown.enter.exact.prevent="send"
          />
          <button
            type="button"
            class="rounded-lg bg-white/90 px-4 py-2 font-medium text-black disabled:opacity-40"
            :disabled="!draft.instruction.trim()"
            data-send-edit
            @click="send"
          >
            {{ draft.retry ? 'Make again' : 'Send' }}
          </button>
          <button type="button" class="px-2 py-2 hover:text-white" title="Back to the picture (Esc)" @click="painting = false">
            Back
          </button>
        </div>
        <p class="text-xs text-white/60">
          Say what to paint, not what's wrong. With nothing painted, the whole picture is repainted.
          <template v-if="draft.retry">It replaces Edit {{ edits.length }}.</template>
        </p>
      </div>
    </template>
  </ImageViewer>
</template>
