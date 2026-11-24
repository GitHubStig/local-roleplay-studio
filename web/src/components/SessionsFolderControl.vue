<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import {
  ApiError,
  checkSessionsFolder,
  type FolderCheck,
  forgetSessionsFolder,
  type KnownFolder,
  moveSessionsFolder,
  pickSessionsFolder,
  type SessionsFolderInfo,
} from '../api'
import PopMenu from './PopMenu.vue'
import SelectField from './SelectField.vue'

/**
 * The Session folder, at the top of the Session manager: the folders offered (the app's own and
 * those used before, each with how many Sessions it holds, or "not connected"), switched to by
 * picking one. Change… chooses another: with the machine's dialog when the browser is on the
 * server's machine, or else by typing its full path; it's checked, then used once the player
 * confirms. Changing the folder never moves a Session: those in the old one stay there. Forget
 * stops offering a folder, as the list could show a private folder's path to anyone using the app.
 */
const emit = defineEmits<{ moved: [] }>()
/** The folders, as the page loaded them (it reads `here` and `os` too); changed here as they change. */
const info = defineModel<SessionsFolderInfo | null>('info', { required: true })

/** The folder chosen and checked, waiting for the player to confirm. */
const chosen = ref<FolderCheck & { ok: true } | null>(null)
/** Typing a folder's path, away from the server's machine (or where it has no dialog). */
const typing = ref(false)
const typed = ref('')
const working = ref(false)
const problem = ref('')
const field = useTemplateRef<HTMLInputElement>('pathField')

const sessions = (n: number) => `${n} ${n === 1 ? 'Session' : 'Sessions'}`
const label = (f: KnownFolder) =>
  `${f.path}${f.default ? " (the app's own)" : ''} · ${f.count === null ? 'not connected' : sessions(f.count)}`
/** What Forget offers: a folder used before, not the one in use. */
const forgettable = computed(() =>
  info.value?.folders.filter((f) => !f.default && f.path !== info.value?.inUse) ?? []
)

async function attempt(work: () => Promise<void>) {
  working.value = true
  problem.value = ''
  try {
    await work()
  } catch (err) {
    problem.value = err instanceof Error ? err.message : String(err)
  } finally {
    working.value = false
  }
}

async function use(path: string) {
  info.value = await moveSessionsFolder(path)
  chosen.value = null
  typing.value = false
  emit('moved')
}

/** Picking a folder offered: switched to at once, as it's been used before. */
const pick = (path: string) => {
  if (path === info.value?.inUse) return
  return attempt(() => use(path))
}

/** Waits for the player to confirm a folder, unless it's the one in use. */
async function consider(path: string) {
  const checked = await checkSessionsFolder(path)
  chosen.value = checked.ok && !checked.same ? checked : null
}

const startTyping = async () => {
  typing.value = true
  typed.value = ''
  await nextTick()
  field.value?.focus()
}

const change = () =>
  attempt(async () => {
    chosen.value = null
    if (!info.value?.here) return startTyping()
    try {
      const { path } = await pickSessionsFolder()
      if (path) await consider(path)
    } catch (err) {
      // No dialog on this machine (a Linux without zenity, say): the path is typed instead.
      if (err instanceof ApiError && err.status === 409) return startTyping()
      throw err
    }
  })

const checkTyped = () => attempt(() => consider(typed.value))

const forget = (path: string, close: () => void) => {
  close()
  return attempt(async () => {
    info.value = await forgetSessionsFolder(path)
  })
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2" data-sessions-folder-control>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <label for="sessions-folder" class="text-xs font-semibold uppercase tracking-wide text-muted">Session folder</label>
      <SelectField
        id="sessions-folder"
        :model-value="info?.inUse ?? ''"
        class="field min-w-0 py-1 text-sm"
        :disabled="working || !info"
        data-sessions-folder
        @update:model-value="(p) => pick(String(p))"
      >
        <option v-for="f in info?.folders ?? []" :key="f.path" :value="f.path" :disabled="f.count === null">
          {{ label(f) }}
        </option>
      </SelectField>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded border border-line px-3 py-1 text-sm hover:border-fg disabled:opacity-50"
          :title="info?.here ? 'Choose another folder' : 'Type the full path of another folder on the server\'s machine'"
          :disabled="working || !info"
          data-choose-folder
          @click="change"
        >
          Change…
        </button>
        <PopMenu v-if="forgettable.length" align="end" panel-class="w-96 max-w-[90vw] p-1 text-sm">
          <template #button="{ toggle }">
            <button
              type="button"
              class="rounded px-2 py-1 text-sm text-muted hover:text-fg"
              title="Stop offering a folder used before; its Sessions stay where they are"
              :disabled="working"
              data-forget-folders
              @click="toggle"
            >
              Forget…
            </button>
          </template>
          <template #default="{ close }">
            <p class="px-2 py-1 text-xs text-muted">Stop offering it here. Its Sessions stay where they are.</p>
            <button
              v-for="f in forgettable"
              :key="f.path"
              type="button"
              class="block w-full truncate rounded-lg px-2 py-1.5 text-left hover:bg-canvas"
              :title="f.path"
              data-forget-folder
              @click="forget(f.path, close)"
            >
              {{ f.path }}
            </button>
          </template>
        </PopMenu>
      </div>
    </div>

    <form v-if="typing" class="flex min-w-0 flex-wrap items-center gap-2" data-folder-typed @submit.prevent="checkTyped">
      <input
        ref="pathField"
        v-model="typed"
        type="text"
        class="field min-w-0 flex-1 py-1 text-sm"
        :placeholder="info?.os === 'windows' ? 'D:\\Sessions' : '/Volumes/Archive/Sessions'"
        aria-label="The folder's full path, on the server's machine"
        data-folder-path
      />
      <button type="submit" class="rounded border border-line px-3 py-1 text-sm hover:border-fg disabled:opacity-50" :disabled="working || !typed.trim()">
        Check
      </button>
      <button type="button" class="px-2 py-1 text-sm text-muted hover:text-fg" @click="typing = false">Cancel</button>
      <span class="basis-full text-xs text-muted">A folder on the server's machine, by its full path.</span>
    </form>

    <div v-if="chosen" class="flex flex-col gap-2 rounded border border-line p-3 text-sm" data-folder-chosen>
      <p>
        Use <code class="break-all">{{ chosen.path }}</code>?
        <template v-if="chosen.exists">It holds {{ sessions(chosen.count) }}.</template>
        <template v-else>It doesn't exist yet, and will be made.</template>
      </p>
      <p class="text-muted">
        This applies at once. Sessions in the current folder stay there, and are listed again when you go back to it.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded border border-line px-3 py-1 hover:border-info disabled:opacity-50"
          :disabled="working"
          data-folder-apply
          @click="attempt(() => use(chosen!.path))"
        >
          Use this folder
        </button>
        <button type="button" class="rounded border border-line px-3 py-1 text-muted hover:text-fg" :disabled="working" data-folder-cancel @click="chosen = null">
          Cancel
        </button>
      </div>
    </div>

    <p v-if="problem" class="text-sm text-danger" role="alert" data-folder-error>{{ problem }}</p>
  </div>
</template>
