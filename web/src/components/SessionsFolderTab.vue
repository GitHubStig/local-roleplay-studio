<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  checkSessionsFolder,
  type FolderCheck,
  getSessionsFolder,
  moveSessionsFolder,
  pickSessionsFolder,
  type SessionsFolder,
} from '../api'
import Icon from './Icon.vue'

/**
 * The Sessions tab: the folder Sessions are kept in, and how many are there. A folder is chosen
 * with the machine's dialog, checked (its Sessions counted), and only moved to once the player
 * confirms, when it applies at once.
 */
const folder = ref<SessionsFolder | null>(null)
/** The folder chosen and checked, waiting for the player to confirm. */
const chosen = ref<FolderCheck | null>(null)
const working = ref(false)
const problem = ref('')
const moved = ref(false)

const sessions = (n: number) => `${n} ${n === 1 ? 'Session' : 'Sessions'}`
const isDefault = computed(() => folder.value?.inUse === folder.value?.default)

async function attempt(work: () => Promise<void>) {
  working.value = true
  problem.value = ''
  moved.value = false
  try {
    await work()
  } catch (err) {
    problem.value = err instanceof Error ? err.message : String(err)
  } finally {
    working.value = false
  }
}

onMounted(() =>
  attempt(async () => {
    folder.value = await getSessionsFolder()
  })
)

/** Waits for the player to confirm a folder, unless it's the one in use: then nothing is pending. */
async function consider(path: string) {
  const checked = await checkSessionsFolder(path)
  chosen.value = checked.same ? null : checked
}

const choose = () =>
  attempt(async () => {
    const { path } = await pickSessionsFolder()
    if (path) await consider(path)
  })

const chooseDefault = () => attempt(() => consider(''))

const apply = () =>
  attempt(async () => {
    if (!chosen.value) return
    folder.value = await moveSessionsFolder(chosen.value.path)
    chosen.value = null
    moved.value = true
  })
</script>

<template>
  <div class="card">
    <div class="flex flex-col gap-1">
      <label for="sessions-folder" class="font-medium">Session folder</label>
      <div class="flex gap-2">
        <input
          id="sessions-folder"
          :value="folder?.inUse ?? ''"
          type="text"
          class="field min-w-0 flex-1"
          readonly
          data-sessions-folder
        />
        <button
          type="button"
          class="rounded border border-line px-2 text-muted hover:text-fg disabled:opacity-50"
          title="Choose another folder"
          aria-label="Choose another folder"
          :disabled="working || !folder"
          data-choose-folder
          @click="choose"
        >
          <Icon name="folder" class="h-5 w-5" />
        </button>
      </div>
      <span v-if="folder" class="text-sm text-muted" data-sessions-in-use>
        {{ sessions(folder.count) }} here<template v-if="isDefault">
          (the app's own folder)</template>.
        <button
          v-if="!isDefault"
          type="button"
          class="underline hover:text-fg"
          :disabled="working"
          data-use-default
          @click="chooseDefault"
        >
          Go back to the app's own folder
        </button>
      </span>
    </div>

    <div
      v-if="chosen"
      class="flex flex-col gap-3 rounded border border-line p-3"
      data-folder-chosen
    >
      <p class="text-sm">
        Use <code>{{ chosen.path }}</code>?
        <template v-if="chosen.exists">It holds {{ sessions(chosen.count) }}.</template>
        <template v-else>It doesn't exist yet, and will be made.</template>
      </p>
      <p class="text-sm text-muted">
        This applies at once. Sessions in the current folder stay there and won't be listed until
        you go back to it.
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded border border-line px-3 py-1 text-sm hover:border-info disabled:opacity-50"
          :disabled="working"
          data-folder-apply
          @click="apply"
        >
          Use this folder
        </button>
        <button
          type="button"
          class="rounded border border-line px-3 py-1 text-sm text-muted hover:text-fg"
          :disabled="working"
          data-folder-cancel
          @click="chosen = null"
        >
          Cancel
        </button>
      </div>
    </div>

    <p v-if="moved" class="text-sm text-ok" data-folder-moved>Now using this folder.</p>
    <p v-if="problem" class="text-sm text-danger" data-folder-error>{{ problem }}</p>
  </div>
</template>

<style scoped>
@reference "../style.css";

.card {
  @apply flex min-w-0 flex-col gap-5 rounded-lg border border-line bg-surface/40 p-4;
}
</style>
