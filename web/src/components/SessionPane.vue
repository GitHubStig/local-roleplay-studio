<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import {
  getSessionContents,
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
import { bytes } from '../bytes'
import { useRename } from '../composables/useRename'
import { deleteSessionAsked } from '../composables/useDeleteSession'
import { sessionPath } from '../sessionPath'
import Icon from './Icon.vue'

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
const emit = defineEmits<{ deleted: [] }>()

const title = ref(props.session.title)
watch(() => props.session.title, (t) => (title.value = t))
const { editing, draft, failed, edit, save, cancel } = useRename(
  () => props.session.id,
  title,
  useTemplateRef<HTMLInputElement>('titleField'),
)

const contents = ref<SessionContents | null>(null)
const problem = ref('')
watch(() => props.session.id, async (id) => {
  contents.value = null
  problem.value = ''
  try {
    const got = await getSessionContents(id)
    if (id === props.session.id) contents.value = got
  } catch (err) {
    problem.value = `Couldn't work out what it holds: ${(err as Error).message}`
  }
}, { immediate: true })

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
            :disabled="session.activity !== null"
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
  </section>
</template>
