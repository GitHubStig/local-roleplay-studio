<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  bytes,
  getSessionSizes,
  importSession,
  getSessionsFolder,
  imageUrl,
  KIND_LABELS,
  type SessionsFolderInfo,
  type SessionSizes,
  type SessionSummary,
} from '../api'
import { ago } from '../ago'
import Icon from '../components/Icon.vue'
import SelectField from '../components/SelectField.vue'
import SessionPane from '../components/SessionPane.vue'
import SessionsFolderControl from '../components/SessionsFolderControl.vue'
import { useStoredString } from '../composables/storage'
import { clearCurrentSession, useCurrentSession } from '../composables/useCurrentSession'
import { loadSessions, useSessionList } from '../composables/useSessionList'

/**
 * The Session manager: the Sessions in the Session folder down the left, each with its size, sorted
 * as the player likes; the one selected (`?id=`) on the right (`SessionPane`). On a phone the list
 * is one screen and a Session another. The Session folder is chosen at the top. Sizes are worked
 * out by the server each time the page opens, and again when the folder changes.
 */
const route = useRoute()
const router = useRouter()
const phone = useMediaQuery('(max-width: 639px)')

const { sessions, listError } = useSessionList()
const { currentSessionId } = useCurrentSession()
const sizes = ref<SessionSizes>({})
const folder = ref<SessionsFolderInfo | null>(null)
const problem = ref('')

async function load() {
  problem.value = ''
  try {
    const [, s, f] = await Promise.all([loadSessions(), getSessionSizes(), getSessionsFolder()])
    sizes.value = s
    folder.value = f
  } catch (err) {
    problem.value = (err as Error).message
  }
}
onMounted(load)

/** Another folder in use: its Sessions listed, and Current Session forgotten if it isn't there. */
async function moved() {
  await router.replace({ query: {} })
  await load()
  const id = currentSessionId.value
  if (id && sessions.value && !sessions.value.some((s) => s.id === id)) clearCurrentSession(id)
}

const SORTS = {
  size: 'Biggest first',
  changed: 'Last changed',
  kind: 'Kind',
  title: 'Title',
} as const
type Sort = keyof typeof SORTS
const storedSort = useStoredString('session-manager.sort')
const sort = computed<Sort>({
  get: () => (storedSort.value && storedSort.value in SORTS ? storedSort.value as Sort : 'size'),
  set: (s) => (storedSort.value = s),
})
const byTitle = (a: SessionSummary, b: SessionSummary) => a.title.localeCompare(b.title)
const sorted = computed(() => {
  const list = [...(sessions.value ?? [])]
  const changed = (a: SessionSummary, b: SessionSummary) => b.updatedAt.localeCompare(a.updatedAt)
  const order: Record<Sort, (a: SessionSummary, b: SessionSummary) => number> = {
    size: (a, b) => (sizes.value[b.id] ?? 0) - (sizes.value[a.id] ?? 0) || changed(a, b),
    changed,
    kind: (a, b) => KIND_LABELS[a.kind].localeCompare(KIND_LABELS[b.kind]) || byTitle(a, b),
    title: (a, b) => byTitle(a, b) || changed(a, b),
  }
  return list.sort(order[sort.value])
})
const total = computed(() => Object.values(sizes.value).reduce((a, b) => a + b, 0))

/** The Session asked for; beside the list, the first while none is. */
const asked = computed(() => (typeof route.query.id === 'string' ? route.query.id : null))
const selected = computed(() =>
  sorted.value.find((s) => s.id === asked.value) ?? (phone.value ? null : sorted.value[0] ?? null)
)
/** On a phone, a Session is a screen of its own, which Back leaves; beside the list, it replaces. */
const select = (id: string) => router[phone.value ? 'push' : 'replace']({ query: { id } })

async function deleted() {
  await router.replace({ query: {} })
  sizes.value = await getSessionSizes().catch(() => sizes.value)
}

/** An import under way: the zip's name, how much is sent, and how to stop it. */
const importing = ref<{ name: string; sent: number; total: number; stop: AbortController } | null>(
  null,
)
const importProblem = ref('')
const zipPicker = useTemplateRef<HTMLInputElement>('zipPicker')

/** Uploads the zip picked; once it's unpacked, the new Session is listed and selected. */
async function startImport() {
  const zip = zipPicker.value?.files?.[0]
  if (zipPicker.value) zipPicker.value.value = ''
  if (!zip) return
  importProblem.value = ''
  const stop = new AbortController()
  importing.value = { name: zip.name, sent: 0, total: zip.size, stop }
  try {
    const made = await importSession(zip, (sent, total) => {
      if (importing.value) Object.assign(importing.value, { sent, total })
    }, stop.signal)
    await load()
    await select(made.id)
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      importProblem.value = `Couldn't import ${zip.name}: ${(err as Error).message}`
    }
  } finally {
    importing.value = null
  }
}

const sessionsLabel = (n: number) => `${n} ${n === 1 ? 'Session' : 'Sessions'}`
</script>

<template>
  <div class="overflow-y-auto" data-session-manager>
    <!-- A phone, a Session picked: its screen, with the way back to the list. -->
    <div v-if="phone && selected" class="flex flex-col">
      <div class="border-b border-line px-4 py-1">
        <RouterLink to="/sessions" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-fg" data-back-to-list>
          <Icon name="chevron-left" />
          Session manager
        </RouterLink>
      </div>
      <SessionPane :session="selected" :here="folder?.here ?? false" :os="folder?.os ?? 'other'" class="p-4" @deleted="deleted" />
    </div>

    <div v-else class="mx-auto flex max-w-[96rem] flex-col gap-4 p-6 max-sm:p-4">
      <header class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 class="text-xl font-semibold">Session manager</h1>
        <SessionsFolderControl v-model:info="folder" class="min-w-0 flex-[1_1_28rem]" @moved="moved" />
        <span v-if="sessions?.length" class="text-sm text-muted" data-folder-total>{{ bytes(total) }} in this folder</span>
        <input ref="zipPicker" type="file" accept=".zip,application/zip" class="hidden" data-import-file @change="startImport" />
        <button
          type="button"
          class="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50 max-sm:w-full"
          :disabled="importing !== null"
          title="Import a Session export as a new Session in this folder"
          data-import
          @click="zipPicker?.click()"
        >
          Import a zip…
        </button>
      </header>
      <div v-if="importing" role="status" class="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm" data-importing>
        <span class="min-w-0 truncate">Importing <b>{{ importing.name }}</b></span>
        <span class="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-canvas">
          <span class="block h-full bg-info transition-[width]" :style="{ width: `${importing.total ? (importing.sent / importing.total) * 100 : 0}%` }" />
        </span>
        <span class="text-muted tabular-nums">
          {{ importing.sent < importing.total ? `uploading · ${bytes(importing.sent)} of ${bytes(importing.total)}` : 'unpacking…' }}
        </span>
        <button type="button" class="rounded border border-line px-2.5 py-1 hover:border-fg" data-import-cancel @click="importing.stop.abort()">
          Cancel
        </button>
      </div>
      <p v-if="importProblem" class="text-sm text-danger" role="alert" data-import-error>{{ importProblem }}</p>
      <p v-if="listError || problem" class="text-danger" role="alert">Couldn't load the Sessions: {{ listError || problem }}</p>

      <div class="flex flex-wrap items-start gap-4">
        <section
          aria-label="Sessions"
          class="min-w-0 flex-[1_1_22rem] overflow-hidden rounded-xl border border-line bg-surface sm:max-w-md"
          data-session-list
        >
          <div class="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <strong>{{ sessionsLabel(sessions?.length ?? 0) }}</strong>
            <label class="flex items-center gap-1.5 text-sm text-muted">
              Sort
              <SelectField v-model="sort" compact class="rounded border border-line bg-canvas py-0.5 pl-2 text-fg" data-sort>
                <option v-for="(label, key) in SORTS" :key="key" :value="key">{{ label }}</option>
              </SelectField>
            </label>
          </div>
          <p v-if="sessions && !sessions.length" class="p-4 text-sm text-muted" data-no-sessions>
            No Sessions in this folder yet.
          </p>
          <ul>
            <li v-for="s in sorted" :key="s.id" class="border-b border-line/60 last:border-b-0">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-canvas"
                :class="{ 'bg-canvas shadow-[inset_3px_0_0_var(--color-fg)]': !phone && s.id === selected?.id }"
                :aria-current="!phone && s.id === selected?.id ? 'true' : undefined"
                data-session-row
                @click="select(s.id)"
              >
                <span class="h-12 w-12 shrink-0 overflow-hidden rounded bg-canvas sm:h-9 sm:w-13">
                  <img v-if="s.thumbnail" :src="imageUrl(s.id, s.thumbnail)" alt="" class="h-full w-full object-cover" loading="lazy" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate font-medium">{{ s.title }}</span>
                  <span class="truncate text-xs text-muted">
                    {{ KIND_LABELS[s.kind] }} · {{ s.frames }} {{ s.frames === 1 ? 'Frame' : 'Frames' }} · {{ ago(s.updatedAt) }}
                  </span>
                </span>
                <span class="shrink-0 text-sm text-muted tabular-nums" data-session-size>
                  {{ s.id in sizes ? bytes(sizes[s.id]) : '' }}
                </span>
                <Icon v-if="phone" name="chevron-right" class="text-muted" />
              </button>
            </li>
          </ul>
        </section>

        <SessionPane
          v-if="!phone && selected"
          :key="selected.id"
          :session="selected"
          :here="folder?.here ?? false"
          :os="folder?.os ?? 'other'"
          class="min-w-0 flex-[999_1_34rem] rounded-xl border border-line bg-surface p-5"
          @deleted="deleted"
        />
      </div>
    </div>
  </div>
</template>
