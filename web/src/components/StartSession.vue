<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getScenarios, type ScenarioList } from '../api'
import { useTextModelReady } from '../composables/useTextModelReady'

defineProps<{ error?: string }>()

/** The Brief's length limit, as the server enforces it. */
const BRIEF_MAX = 4000

const router = useRouter()
const list = ref<ScenarioList | null>(null)
const listError = ref('')
const { loaded, loadError: settingsError, blocker: textModelBlocker } = useTextModelReady()
const brief = ref('')

onMounted(async () => {
  try {
    list.value = await getScenarios()
  } catch (err) {
    listError.value = (err as Error).message
  }
})

const loadError = computed(() => listError.value || settingsError.value)

/** Why the Brief can't be opened yet, or null when it can. */
const briefBlocker = computed(() => {
  if (!brief.value.trim()) return 'Write the Brief.'
  if (brief.value.length > BRIEF_MAX) return `Keep the Brief under ${BRIEF_MAX} characters.`
  return null
})

/** Opens the Scenario page on a Scenario, or on the typed Brief. */
function open(to: { id: string } | { brief: string }) {
  if (textModelBlocker.value) return
  router.push('id' in to
    ? { name: 'scenario', params: { id: to.id } }
    : { name: 'scenario', query: { brief: to.brief } })
}
</script>

<template>
  <section class="flex flex-col gap-6" aria-label="Start a new Session">
    <p v-if="loadError" class="text-danger">Could not load Scenarios: {{ loadError }}</p>
    <p v-else-if="!list || !loaded" class="text-muted">Loading…</p>

    <template v-else>
      <p v-if="textModelBlocker" class="text-sm text-warn" data-blocker>{{ textModelBlocker }}</p>

      <div class="flex flex-col gap-3">
        <h3 class="text-sm text-muted">Start from a Scenario, or write your own Brief</h3>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          <button
            v-for="s in list.scenarios"
            :key="s.id"
            type="button"
            class="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface p-3 text-left hover:border-fg disabled:cursor-not-allowed disabled:opacity-60"
            :title="s.description"
            :disabled="!!textModelBlocker"
            :data-scenario="s.id"
            @click="open({ id: s.id })"
          >
            <span class="text-sm font-medium">{{ s.title }}</span>
            <span class="line-clamp-2 text-xs text-muted">{{ s.description }}</span>
          </button>
        </div>
        <div class="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
          <span class="font-medium">Your own Brief</span>
          <textarea
            v-model="brief"
            class="h-28 resize-y rounded border border-line bg-canvas p-2 text-sm"
            placeholder="Who's in it, where, and what's happening, e.g. a lighthouse keeper in a winter storm; I wash up at her door."
            :maxlength="BRIEF_MAX"
            data-brief
          />
          <div class="flex items-center gap-4">
            <button
              type="button"
              class="rounded-lg bg-fg px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50"
              :disabled="briefBlocker !== null || !!textModelBlocker"
              data-open-brief
              @click="open({ brief: brief.trim() })"
            >
              Open
            </button>
            <span v-if="brief && briefBlocker" class="text-sm text-warn">{{ briefBlocker }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="list.errors.length"
        class="rounded-lg border border-line p-4 text-sm text-warn"
        role="alert"
      >
        <p class="mb-1 font-medium">Some Scenario files couldn't be loaded:</p>
        <ul class="list-inside list-disc">
          <li v-for="e in list.errors" :key="e.file">
            <code>{{ e.file }}</code>: {{ e.message }}
          </li>
        </ul>
      </div>

      <p v-if="error" class="text-sm text-danger" role="alert">
        Couldn't start the Session: {{ error }}
      </p>
    </template>
  </section>
</template>
