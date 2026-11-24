<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import {
  bytes,
  CLIP_KIND_NAMES,
  exportName,
  getKeepOptions,
  getSessionContents,
  KEEP_ALL,
  type KeepOptions,
  type KeepPreview,
  type LeftOut,
  previewKeep,
  removeLeftOut,
  SOUND_LABELS,
  THREE_D_LABELS,
  imageUrl,
  KIND_LABELS,
  openSessionFolder,
  PART_LABELS,
  type ServerOs,
  SESSION_PARTS,
  SESSION_TITLE_LENGTH,
  type SessionContents,
  type SessionSummary,
} from '../api'
import { ago } from '../ago'
import { useRename } from '../composables/useRename'
import { deleteSessionAsked } from '../composables/useDeleteSession'
import { sessionPath } from '../sessionPath'
import { canPickFile, exportSession } from '../sessionExport'
import Icon from './Icon.vue'
import KeepTicks from './KeepTicks.vue'
import { ask } from '../ask'
import { useImageModels } from '../composables/useSettingsOptions'

/**
 * A Session on the Session manager: its picture (the one Home shows), which plays it; its title,
 * renamed by clicking it; a folder button that shows its folder in the file manager (only when the
 * browser is on the server's machine, `here`) and a bin that deletes it; then its size on disk,
 * split by part, and how many of each thing it holds, worked out by the server as it's shown.
 */
const props = defineProps<{
  session: SessionSummary
  /** The browser is on the server's machine, so its file manager opens in front of the player. */
  here: boolean
  os: ServerOs
}>()
const emit = defineEmits<{ deleted: []; changed: [] }>()

const title = ref(props.session.title)
watch(() => props.session.title, (t) => (title.value = t))
const { editing, draft, failed, edit, save, cancel } = useRename(
  () => props.session.id,
  title,
  useTemplateRef<HTMLInputElement>('titleField'),
)

const contents = ref<SessionContents | null>(null)
const problem = ref('')
/** What there is to keep or leave out, the ticks taken off, and what they'd keep. */
const options = ref<KeepOptions | null>(null)
const leftOut = ref<LeftOut>({ ...KEEP_ALL })
/** The server's last answer, and the ticks it was for. */
const answered = ref<{ for: string; preview: KeepPreview } | null>(null)
/**
 * What the ticks as they are now keep: none while the answer for them is on its way, so Remove
 * never asks with the size of an earlier choice.
 */
const preview = computed(() =>
  answered.value?.for === JSON.stringify(leftOut.value) ? answered.value.preview : null
)
/** Every tick on: an export is all of it, and Remove has nothing to remove. */
const keepsAll = computed(() => JSON.stringify(leftOut.value) === JSON.stringify(KEEP_ALL))

async function loadContents(id: string) {
  problem.value = ''
  try {
    const [got, keep] = await Promise.all([getSessionContents(id), getKeepOptions(id)])
    if (id !== props.session.id) return
    contents.value = got
    options.value = keep
  } catch (err) {
    problem.value = `Couldn't work out what it holds: ${(err as Error).message}`
  }
}
watch(() => props.session.id, (id) => {
  contents.value = null
  options.value = null
  answered.value = null
  leftOut.value = { ...KEEP_ALL }
  void loadContents(id)
}, { immediate: true })

/** What the ticks keep, asked of the server as they settle; the last asked wins. */
let asking: AbortController | null = null
watchDebounced(leftOut, async (left) => {
  asking?.abort()
  if (keepsAll.value) return (answered.value = null)
  const mine = (asking = new AbortController())
  try {
    const asked = JSON.stringify(left)
    answered.value = { for: asked, preview: await previewKeep(props.session.id, left, mine.signal) }
  } catch (err) {
    if (!mine.signal.aborted) problem.value = (err as Error).message
  }
}, { debounce: 200, deep: true })

const keeping = computed(() => (keepsAll.value ? contents.value?.size ?? 0 : preview.value?.kept ?? 0))

/** What the ticks leave out, in words, for Remove's question. */
const { labelOf, videoLabelOf } = useImageModels()
function leftOutWords(left: LeftOut): string[] {
  const words: string[] = []
  if (left.chosenOnly) words.push('every picture but the one each Frame shows')
  if (left.imageModels.length && !left.chosenOnly) {
    words.push(`the pictures by ${left.imageModels.map(labelOf).join(' and ')}`)
  }
  if (left.upscales) words.push('the upscales')
  if (left.edits) words.push('the edits and their painted areas')
  for (const [model, kinds] of Object.entries(left.clips)) {
    words.push(`${videoLabelOf(model)}'s ${kinds.map((k) => CLIP_KIND_NAMES[k]).join(', ')} clips`)
  }
  for (const k of left.threeD) words.push(`the ${THREE_D_LABELS[k]}`)
  for (const k of left.sound) words.push(`the ${SOUND_LABELS[k].toLowerCase()}`)
  if (left.calls) words.push('the call logs')
  return words
}

const removing = ref(false)
async function removeRest() {
  const p = preview.value
  if (!p) return
  const question = `Remove ${leftOutWords(leftOut.value).join('; ')} from this Session (${
    bytes(p.leftOut)
  })? What's made from them goes too; its Frames and their text stay. This can't be undone.`
  if (!(await ask(question, { action: 'Remove', danger: true }))) return
  problem.value = ''
  removing.value = true
  try {
    await removeLeftOut(props.session.id, leftOut.value)
    leftOut.value = { ...KEEP_ALL }
    await loadContents(props.session.id)
    emit('changed')
  } catch (err) {
    problem.value = `Couldn't remove it: ${(err as Error).message}`
  } finally {
    removing.value = false
  }
}

const openLabel = computed(() =>
  props.os === 'mac' ? 'Open in Finder' : props.os === 'windows' ? 'Open in Explorer' : 'Open folder'
)
async function openFolder() {
  problem.value = ''
  try {
    await openSessionFolder(props.session.id)
  } catch (err) {
    problem.value = (err as Error).message
  }
}

/** The export under way: bytes written so far, and how to stop it. */
const exporting = ref<{ written: number; stop: AbortController } | null>(null)
/** What the last export came to, said under its button. */
const exported = ref('')
async function startExport() {
  problem.value = ''
  exported.value = ''
  const stop = new AbortController()
  exporting.value = { written: 0, stop }
  try {
    const end = await exportSession(
      props.session.id,
      exportName(title.value, props.session.id),
      (written) => exporting.value && (exporting.value.written = written),
      stop.signal,
      keepsAll.value ? undefined : leftOut.value,
    )
    exported.value = end === 'saved'
      ? 'Saved.'
      : end === 'download'
      ? 'Downloading: your browser shows how far it has got.'
      : ''
  } catch (err) {
    problem.value = `Couldn't export it: ${(err as Error).message}`
  } finally {
    exporting.value = null
  }
}

async function remove() {
  problem.value = ''
  try {
    if (await deleteSessionAsked(props.session)) emit('deleted')
  } catch (err) {
    problem.value = `Couldn't delete it: ${(err as Error).message}`
  }
}

const started = computed(() =>
  new Date(props.session.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: new Date(props.session.createdAt).getFullYear() === new Date().getFullYear()
      ? undefined
      : 'numeric',
  })
)

/** The size bar's pieces, each part's colour, and what's in none (its text and caches) last. */
const COLOURS: Record<(typeof SESSION_PARTS)[number] | 'rest', string> = {
  pictures: 'bg-fg',
  clips: 'bg-info',
  '3d': 'bg-warn',
  sound: 'bg-ok',
  calls: 'bg-muted',
  rest: 'bg-line',
}
const pieces = computed(() => {
  const c = contents.value
  if (!c) return []
  return [
    ...SESSION_PARTS.map((p) => ({ key: p, label: PART_LABELS[p], size: c.parts[p] })),
    { key: 'rest' as const, label: 'Text and caches', size: c.rest },
  ].filter((p) => p.size > 0).map((p) => ({ ...p, share: c.size ? (p.size / c.size) * 100 : 0 }))
})

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)
const counts = computed(() => {
  const c = contents.value?.counts
  if (!c) return []
  const roleplay = props.session.kind === 'roleplay'
  return [
    { n: c.frames, label: plural(c.frames, 'Frame') },
    {
      n: c.pictures,
      label: `${plural(c.pictures, 'Picture')}${c.imageModels ? ` · ${c.imageModels} ${plural(c.imageModels, 'Image Model')}` : ''}`,
    },
    { n: c.edits, label: plural(c.edits, 'Edit') },
    { n: c.clips, label: plural(c.clips, 'Video clip') },
    ...(roleplay ? [{ n: c.speech, label: 'Speech and thoughts' }] : []),
    { n: c.threeD, label: '3D' },
    ...(roleplay ? [{ n: c.cues, label: plural(c.cues, 'Music cue') }] : []),
    { n: c.calls, label: plural(c.calls, 'Call log', 'Call logs') },
  ]
})
</script>

<template>
  <section class="flex min-w-0 flex-col gap-5" aria-label="The Session" data-session-pane>
    <div class="flex flex-wrap items-start gap-4">
      <!-- Its picture is its Play button. -->
      <RouterLink
        :to="sessionPath(session.id, session.kind)"
        class="group relative grid h-40 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-canvas sm:h-36 sm:w-56"
        :aria-label="`Play ${title}`"
        data-session-play
      >
        <img v-if="session.thumbnail" :src="imageUrl(session.id, session.thumbnail)" alt="" class="absolute inset-0 h-full w-full object-cover" />
        <p v-else-if="session.excerpt" class="absolute inset-0 line-clamp-6 p-3 font-serif text-sm italic text-muted">
          {{ session.excerpt }}
        </p>
        <span class="relative flex items-center gap-1.5 rounded-full bg-surface/95 px-4 py-2 font-semibold text-fg shadow group-hover:bg-surface">
          <Icon name="play" />
          Play
        </span>
      </RouterLink>
      <div class="flex min-w-60 flex-1 items-start justify-between gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <input
            v-if="editing"
            ref="titleField"
            v-model="draft"
            :maxlength="SESSION_TITLE_LENGTH"
            aria-label="Title"
            class="field min-w-0 py-0.5 text-xl font-semibold"
            data-session-title-field
            @keydown.enter.prevent="save"
            @keydown.escape.prevent="cancel"
            @blur="save"
          >
          <h2 v-else class="min-w-0 text-xl font-semibold" data-session-title>
            <button type="button" class="-mx-1 max-w-full rounded px-1 text-left hover:bg-canvas" title="Rename" data-session-rename @click="edit">
              {{ title }}
            </button>
          </h2>
          <span class="text-sm text-muted">
            {{ KIND_LABELS[session.kind] }} · started {{ started }} · last changed {{ ago(session.updatedAt) }}
          </span>
          <span v-if="failed" class="text-sm text-danger" role="alert">{{ failed }}</span>
        </div>
        <div class="flex shrink-0 gap-1.5">
          <button
            v-if="here"
            type="button"
            class="grid h-10 w-10 place-items-center rounded-lg border border-line text-lg hover:border-fg"
            :title="openLabel"
            :aria-label="openLabel"
            data-open-folder
            @click="openFolder"
          >
            <Icon name="folder" />
          </button>
          <button
            type="button"
            class="grid h-10 w-10 place-items-center rounded-lg border border-danger/40 text-lg text-danger hover:border-danger disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
            :title="session.activity ? 'Work is running in this Session: wait for it, or cancel it, to delete it' : 'Delete Session…'"
            aria-label="Delete Session…"
            :disabled="session.activity !== null || exporting !== null || removing"
            data-delete
            @click="remove"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </div>

    <p v-if="problem" class="text-sm text-danger" role="alert">{{ problem }}</p>

    <div class="flex flex-col gap-2" data-session-size>
      <strong v-if="contents">{{ bytes(contents.size) }} on disk</strong>
      <strong v-else class="text-muted">Working out its size…</strong>
      <div
        class="flex h-3.5 overflow-hidden rounded-full bg-canvas"
        role="img"
        :aria-label="pieces.map((p) => `${p.label} ${bytes(p.size)}`).join(', ')"
      >
        <span v-for="p in pieces" :key="p.key" :class="COLOURS[p.key]" :style="{ width: `${p.share}%` }" />
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted sm:flex sm:flex-wrap">
        <span v-for="p in pieces" :key="p.key" class="flex items-center gap-1.5" :data-part="p.key">
          <span class="h-2.5 w-2.5 rounded-sm" :class="COLOURS[p.key]" />
          {{ p.label }} {{ bytes(p.size) }}
        </span>
      </div>
    </div>

    <ul v-if="counts.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-session-counts>
      <li v-for="c in counts" :key="c.label" class="rounded-lg border border-line bg-canvas px-3 py-2">
        <div class="text-lg font-semibold tabular-nums">{{ c.n }}</div>
        <div class="text-xs text-muted">{{ c.label }}</div>
      </li>
    </ul>

    <!-- What to keep: the ticks, then what they keep, Remove the rest… and Export ticked. An export
         streams, into the file picked where the browser has a Save dialog, with how far it's got;
         elsewhere it's a plain download. -->
    <section aria-label="What to keep" class="flex flex-col rounded-lg border border-line" data-export>
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line px-4 py-3">
        <strong>What to keep</strong>
        <span class="text-sm text-muted">Export writes what's ticked. Remove deletes what isn't.</span>
      </div>
      <KeepTicks v-if="options" v-model="leftOut" :options="options" :preview="answered?.preview ?? null" />
      <div v-if="exporting" role="status" class="flex flex-col gap-2 bg-canvas px-4 py-3" data-exporting>
        <div class="flex items-center gap-3 text-sm">
          <span class="min-w-0 flex-1">
            Zipping into your file · {{ bytes(exporting.written) }}<template v-if="keeping"> of about {{ bytes(keeping) }}</template>
          </span>
          <button type="button" class="rounded border border-line px-2.5 py-1 hover:border-fg" data-export-cancel @click="exporting.stop.abort()">
            Cancel
          </button>
        </div>
        <span class="h-1.5 overflow-hidden rounded-full bg-surface">
          <span
            class="block h-full bg-info transition-[width]"
            :style="{ width: `${keeping ? Math.min(100, (exporting.written / keeping) * 100) : 0}%` }"
          />
        </span>
        <span class="text-xs text-muted">Nothing is kept on the server: it's zipped as it downloads. The Session can't change until it's done.</span>
      </div>
      <div v-else class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        <span class="text-sm text-muted" data-keeping>
          <template v-if="exported">{{ exported }}</template>
          <template v-else-if="keepsAll">All of it, {{ contents ? bytes(contents.size) : '' }}, {{ canPickFile() ? 'into a file you pick' : 'as a download' }}, to import here or on another machine.</template>
          <template v-else-if="preview">Keeping about {{ bytes(preview.kept) }} · leaving out {{ bytes(preview.leftOut) }}</template>
          <template v-else>Working out what that keeps…</template>
        </span>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:border-danger disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
            :disabled="keepsAll || !preview || session.activity !== null || removing"
            :title="keepsAll ? 'Untick what to remove first' : session.activity ? 'Work is running in this Session: wait for it, or cancel it' : 'Delete what isn\'t ticked from this Session'"
            data-remove-rest
            @click="removeRest"
          >
            Remove the rest…
          </button>
          <button
            type="button"
            class="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="session.activity !== null || removing || (!keepsAll && !preview)"
            :title="session.activity ? 'Work is running in this Session: wait for it, or cancel it, to export it' : undefined"
            data-export-start
            @click="startExport"
          >
            {{ keepsAll ? 'Export' : 'Export ticked' }}
          </button>
        </div>
      </div>
    </section>
  </section>
</template>
