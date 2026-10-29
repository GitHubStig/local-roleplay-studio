<script setup lang="ts">
import { useEventListener, useManualRefHistory } from '@vueuse/core'
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import {
  type Clip,
  CLIP_KIND_NAMES,
  editLine,
  type EditOrder,
  framePicture,
  IMAGE_BACKEND_NAMES,
  type ImageBackend,
  imageUrl,
  type Job,
  pickedEdit,
  type Picture,
  type PictureEdit,
  type PicturedFrame,
} from '../api'
import { sortClips } from '../clips'
import { useFeatures } from '../composables/useFeatures'
import { editChoices, useSettingsOptions } from '../composables/useSettingsOptions'
import ClipOverlay from './ClipOverlay.vue'
import ImageViewer from './ImageViewer.vue'
import PaintLayer, { type Sketch } from './PaintLayer.vue'
import PictureVersions, { type VersionEntry } from './PictureVersions.vue'
import Icon from './Icon.vue'
import SelectField from './SelectField.vue'

/**
 * A Session's pictures in the full-window viewer: it opens on one Frame, and ← and → (or ↑ and ↓)
 * step through the Frames that have a picture, showing each one's upscale if it has one. A picture
 * shows as its picked version (ADR 0021); its versions, beside it, by edit model, pick another.
 * Edit paints the area to repaint over the newest version by the edit model chosen (the Original,
 * for its first), and says what to paint there; the edit then shows among the versions while it's
 * made, over what it's made from, with its progress, until it lands. The
 * shown version's clips, under its versions, play over it.
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
  /** Delete edit `version` of Frame `index`'s picture, the newest by its edit model. */
  deleteEdit: [index: number, version: number]
  /** Delete the upscale of the version of Frame `index`'s picture that is shown. */
  deleteUpscale: [index: number]
  /** Cancel an edit being made, or dismiss one that failed. */
  dropJob: [job: Job]
}>()
const { on: featureOn, settings } = useFeatures()
const settingsOptions = useSettingsOptions()
/** Each edit model on each kind of backend that runs it here, Settings' choice to start on. */
const editModels = computed(() =>
  editChoices(
    settingsOptions.value?.editModels,
    settingsOptions.value?.imageBackends,
    (id) => settingsOptions.value?.editModelsOn?.[id],
  )
)

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

/** The edit model a job's edit is made with: the one it names, or else Settings'. */
const jobModel = (job: Job) => job.edit?.model ?? settings.value?.editModel ?? ''
/**
 * The image an edit by `model` is made from: that model's newest version (the Original, for its
 * first), or for a retry the one before it.
 */
function sourceOf(p: Picture, model: string, retry?: boolean): string {
  const line = editLine(p, model)
  return ((retry ? line.at(-2) : line.at(-1)) ?? p).image
}
const fileUrl = (file: string) => imageUrl(props.sessionId, file)

// --- Painting an edit: what it's told, and the area, kept while the dialog stays on the Frame.
interface Draft {
  /** Makes the newest edit again, in its place. */
  retry: boolean
  /** The area painted before, which it starts from (a mask file). */
  base?: string
  instruction: string
  model: string
  /** The kind of backend it would rather run on, as picked here. */
  backend?: ImageBackend
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

const modelLabel = (id: string) => settingsOptions.value?.editModels.find((m) => m.id === id)?.label ?? id
/** "by Qwen-Image 2.1 Edit · mflux": what made an edit, and where, as a render's picture says. */
const editedBy = (e: { editModel: string; imageBackend?: ImageBackend }) =>
  `by ${modelLabel(e.editModel)}` + (e.imageBackend ? ` · ${IMAGE_BACKEND_NAMES[e.imageBackend]}` : '')
/** "Qwen-Image 2.1 Edit, Edit 2": an edit by its number in its model's line. */
const editName = (p: Picture, e: PictureEdit) =>
  `${modelLabel(e.editModel)}, Edit ${editLine(p, e.editModel).indexOf(e) + 1}`

const versions = computed<VersionEntry[]>(() => {
  const p = picture.value
  if (!p) return []
  const picked = viewedJob.value ? -1 : (p.picked ?? 0)
  // A group per edit model, in the order each was first used, its edits being made at its end.
  const models = [...new Set([...edits.value.map((e) => e.editModel), ...editJobs.value.map(jobModel)])]
  return [
    { key: '0', label: 'Original', title: 'As rendered', selected: picked === 0 },
    ...models.flatMap((m) => {
      const line = editLine(p, m)
      return [
        ...line.map((e, i): VersionEntry => {
          const version = edits.value.indexOf(e) + 1
          return {
            key: String(version),
            group: modelLabel(m),
            label: `Edit ${i + 1}`,
            title: `${e.instructions.join('; ')} (${editedBy(e)})`,
            selected: picked === version,
          }
        }),
        ...editJobs.value.filter((j) => jobModel(j) === m).map((j, i): VersionEntry => ({
          key: j.id,
          group: modelLabel(m),
          label: j.edit!.retry ? `Edit ${line.length} · redo` : `Edit ${line.length + i + 1}`,
          title: j.edit!.instruction,
          state: j.status === 'failed' ? 'failed' : 'editing',
          selected: j.id === viewedJobId.value,
        })),
      ]
    }),
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
      src: fileUrl(sourceOf(p, draft.value.model, draft.value.retry)),
      alt: `Picture of ${name}, to paint over`,
      label: `Editing ${name}: paint over what to repaint`,
    }
  }
  const job = viewedJob.value
  if (job) {
    return {
      src: fileUrl(sourceOf(p, jobModel(job), job.edit!.retry)),
      alt: `Picture of ${name}, being edited`,
      label,
      caption: `${editStatus(job)}\n${job.edit!.instruction}`,
      mask: job.edit!.mask,
      rendering: job.status === 'running' ? 'image' as const : job.status === 'queued' ? 'queued' as const : null,
    }
  }
  const edit = pickedEdit(p)
  const version = edit ?? p
  const plain = !!version.upscaled && seeingPlain.value
  return {
    src: fileUrl(plain ? version.image : version.upscaled ?? version.image),
    alt: `Picture of ${name}`,
    label,
    caption: edit
      ? `${editName(p, edit)}: ${edit.instructions.join('; ')}`
      : p.edits?.length || editJobs.value.length
      ? 'The Original, as rendered.'
      : undefined,
  }
})

// --- The picked version's upscale: shown by default, looked at without it only here.
/** The version shown without its upscale, to compare. Back to the upscale on another Frame or version. */
const seeingPlain = ref(false)
watch(() => [current.value?.index, picture.value?.picked ?? 0], () => (seeingPlain.value = false))
/** The picked version's upscale, when it has one and no edit is being viewed in its place. */
const upscale = computed(() => {
  const p = picture.value
  return p && !viewedJob.value ? (pickedEdit(p) ?? p).upscaled : undefined
})
// --- The shown version's clips (ADR 0025), one playing over it at a time.
const clips = computed(() => {
  const p = picture.value
  return p && !viewedJob.value && !painting.value ? sortClips((pickedEdit(p) ?? p).clips) : []
})
const playing = ref<Clip | null>(null)
// It stops on another Frame or version, or once a new clip of its kind replaces it.
watch(clips, (now) => {
  if (playing.value && !now.some((c) => c.file === playing.value!.file)) playing.value = null
})

function deleteUpscale() {
  const frame = current.value
  if (!frame || !upscale.value) return
  if (!confirm(`Delete the upscale of ${props.name(frame.index)}? This can't be undone.`)) return
  seeingPlain.value = false
  emit('deleteUpscale', frame.index)
}

function step(by: number) {
  const frame = pictured.value[at.value + by]
  if (!frame) return
  open.value = frame.index
  emit('step', frame.index)
}

/**
 * The model and kind of backend an edit starts on: the one it asks for if that runs here, or else
 * Settings' edit model, where Settings send edits.
 */
const startOn = (model?: string, backend?: ImageBackend) => {
  const choice = editModels.value.startOn({ model, backend }, { model: settings.value?.editModel })
  return choice ? { model: choice.model, backend: choice.backend } : { model: model ?? '', backend }
}
/** Starts painting an edit, on the model it asks for if that runs here, or else Settings'. */
function startDraft(next: Omit<Draft, 'model'> & { model?: string }) {
  draft.value = { ...next, ...startOn(next.model, next.backend) }
  sketch.value = { base: true, strokes: [] }
  history.clear()
  painting.value = true
}
// One begun before the edit models loaded moves onto one that runs here.
watch(editModels, () => {
  if (draft.value) Object.assign(draft.value, startOn(draft.value.model, draft.value.backend))
})
/** The draft's model and kind of backend, as the dropdown's one value. */
const draftChoice = computed({
  get: () => draft.value ? `${draft.value.backend ?? ''}/${draft.value.model}` : '',
  set(value: string) {
    const choice = editModels.value.choices.find((c) => c.value === value)
    if (draft.value && choice) Object.assign(draft.value, { model: choice.model, backend: choice.backend })
  },
})
/** A new edit; one already begun on this Frame carries on. */
function editNew() {
  if (draft.value && !draft.value.retry && !draft.value.replaces) painting.value = true
  else startDraft({ retry: false, instruction: '' })
}
/** The edit shown, the newest by its model, made again: its area and instruction, to change first. */
function redoNewest() {
  const newest = newestShown.value
  if (!newest) return
  startDraft({
    retry: true,
    base: newest.mask,
    instruction: newest.instructions.join('; '),
    model: newest.editModel,
    backend: newest.imageBackend,
  })
}
/** A failed edit asked for again, as it was, to change before it's sent. */
function redoFailed(job: Job) {
  const { instruction, model, backend, mask, retry } = job.edit!
  startDraft({ retry: !!retry, base: mask, instruction, model, backend, replaces: job })
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
  emit('edit', frame.index, {
    instruction: told,
    ...(d.model && { model: d.model }),
    ...(d.backend && { backend: d.backend }),
    ...(mask && { mask }),
    ...(d.retry && { retry: true }),
  })
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
  const newest = newestShown.value
  if (!frame || !newest) return
  const name = editName(frame.picture, newest)
  if (!confirm(`Delete ${name} of ${props.name(frame.index)}? This can't be undone.`)) return
  emit('deleteEdit', frame.index, frame.picture.picked!)
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

/** The edit shown, when it's the newest by its edit model: Redo and Delete act on it. */
const newestShown = computed(() => {
  const p = picture.value
  const edit = p && !viewedJob.value ? pickedEdit(p) : undefined
  return edit && editLine(p!, edit.editModel).at(-1) === edit ? edit : undefined
})
/** How the draft's edit model likes to be told what to paint. */
const prompting = computed(() =>
  settingsOptions.value?.editModels.find((m) => m.id === draft.value?.model)?.prompting
)
/** The edit a retry replaces: the newest by the draft's model. */
const replacing = computed(() => {
  const p = picture.value
  const newest = p && draft.value?.retry ? editLine(p, draft.value.model).at(-1) : undefined
  return newest && editName(p!, newest)
})
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
            v-if="featureOn('edits') && !newestShown.copied"
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
        <template v-if="upscale">
          <button
            type="button"
            :class="[action, 'cursor-pointer whitespace-nowrap select-none', !seeingPlain && 'border-white/90 bg-white/90 text-black hover:text-black']"
            :aria-pressed="!seeingPlain"
            title="Look at this picture with and without its upscale"
            data-toggle-upscale
            @click="seeingPlain = !seeingPlain"
          >
            Upscaled
          </button>
          <button type="button" :class="[action, 'whitespace-nowrap select-none']" data-delete-upscale @click="deleteUpscale">
            Delete upscale
          </button>
        </template>
        <div
          v-if="clips.length"
          class="flex overflow-hidden rounded-lg border border-white/30 bg-black/70"
          :class="vertical ? 'flex-col' : 'flex-wrap'"
          role="group"
          aria-label="Clips of the picture"
          data-viewer-clips
        >
          <button
            v-for="c in clips"
            :key="c.file"
            type="button"
            class="flex items-center gap-1.5 px-2 py-1 text-left"
            :class="playing?.file === c.file ? 'bg-white/90 text-black' : 'hover:text-white'"
            :aria-pressed="playing?.file === c.file"
            :title="c.prompt"
            :data-play-clip="c.kind"
            @click="playing = playing?.file === c.file ? null : c"
          >
            <Icon :name="playing?.file === c.file ? 'stop' : 'play'" />
            <span class="whitespace-nowrap">{{ CLIP_KIND_NAMES[c.kind] }}</span>
          </button>
        </div>
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
    <template v-if="playing" #over>
      <ClipOverlay
        :src="fileUrl(playing.file)"
        :clip="playing"
        @close="playing = null"
      />
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
          <label v-if="editModels.choices.length > 1" class="flex items-center gap-2">
            Edit model
            <SelectField
              v-model="draftChoice"
              compact
              :disabled="draft.retry"
              :title="draft.retry ? 'A redo is made by the model that made the edit' : 'Each model edits from its own newest version, or the Original'"
              class="rounded-lg border border-white/30 bg-black/40 p-1.5 text-white"
              data-edit-model
            >
              <option v-for="c in editModels.choices" :key="c.value" :value="c.value">
                {{ c.label }}
              </option>
            </SelectField>
          </label>
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
          <span v-if="prompting" class="block text-white/80" data-edit-prompting>{{ prompting }}</span>
          Say what to paint, not what's wrong. Painted more than one area? Say what goes in each:
          “on his face: …; on the gun: …”. With nothing painted, the whole picture is repainted.
          <template v-if="replacing">It replaces {{ replacing }}.</template>
        </p>
      </div>
    </template>
  </ImageViewer>
</template>
