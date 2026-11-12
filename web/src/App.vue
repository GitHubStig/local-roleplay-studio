<script setup lang="ts">
import { useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getHealth, KIND_LABELS } from './api'
import { useCurrentSession } from './composables/useCurrentSession'
import { scenarioPagePath, useScenarioDraft } from './composables/useScenarioDraft'
import { sessionPath } from './sessionPath'
import ConfirmDialog from './components/ConfirmDialog.vue'
import ThemeButton from './components/ThemeButton.vue'
import Icon from './components/Icon.vue'
import QueuePanel from './components/QueuePanel.vue'
import { useQueue } from './composables/useQueue'
import { isOpen } from './jobs'

const serverOnline = ref<boolean | null>(null)
const route = useRoute()
const { currentSessionId, currentSessionKind, currentSessionTitle } = useCurrentSession()

/**
 * Current Session leads back to the Session opened last, saying which kind it is; there's no link
 * while there's none.
 */
const currentTo = computed(() =>
  currentSessionId.value ? sessionPath(currentSessionId.value, currentSessionKind.value) : null
)
/** The Scenario being set up leads back to its page, as the current Session does to it. */
const { scenarioDraft } = useScenarioDraft()
const scenarioTo = computed(() => scenarioDraft.value && scenarioPagePath(scenarioDraft.value.from))
const scenarioTitle = computed(() => {
  const d = scenarioDraft.value
  return d?.scenario?.title ?? (d && 'brief' in d.from ? d.from.brief : '')
})
const onSession = computed(() =>
  route.name === 'session' || route.name === 'storyboard' || route.name === 'roleplay'
)

/** The Queue sliding in from the rail, and how many jobs run or wait, on its button. */
const queueOpen = ref(false)
const { queue } = useQueue()
const queueCount = computed(() => queue.value?.jobs.filter(isOpen).length ?? 0)
/** The Session on screen, whose jobs the panel lists first. */
const sessionOnScreen = computed(() => (onSession.value ? String(route.params.id) : null))

async function checkServer() {
  try {
    serverOnline.value = (await getHealth()).ok
  } catch {
    serverOnline.value = false
  }
}

// Re-checked every 15 s and whenever the window regains focus.
useIntervalFn(checkServer, 15000, { immediateCallback: true })
useEventListener(window, 'focus', checkServer)
</script>

<template>
  <!-- The rail down the left (along the bottom on a phone held upright), the screen beside it. -->
  <div class="flex h-dvh flex-col bg-canvas text-fg sm:flex-row short:flex-row">
    <nav
      class="order-last flex shrink-0 items-center justify-around border-t border-line px-2 py-1 sm:order-first sm:w-12 sm:flex-col sm:justify-start sm:gap-2 sm:border-t-0 sm:border-r sm:px-0 sm:py-3 short:order-first short:w-12 short:flex-col short:justify-start short:gap-2 short:border-t-0 short:border-r short:px-0 short:py-3"
      aria-label="Screens"
      data-rail
    >
      <RouterLink to="/" class="rail-item" exact-active-class="rail-active" title="Home: your Sessions, and new ones" data-nav-home>
        <Icon name="house" />
        <span class="sr-only">Home</span>
      </RouterLink>
      <RouterLink
        v-if="currentTo"
        :to="currentTo"
        class="rail-item"
        :class="{ 'rail-active': onSession }"
        :title="`${KIND_LABELS[currentSessionKind]}${currentSessionTitle ? `: ${currentSessionTitle}` : ''}, the Session opened last`"
        data-current-session
      >
        <Icon name="session" />
        <span class="sr-only">
          <span data-current-kind>{{ KIND_LABELS[currentSessionKind] }}</span>
          <template v-if="currentSessionTitle">: <span data-current-title>{{ currentSessionTitle }}</span></template>
        </span>
      </RouterLink>
      <RouterLink
        v-if="scenarioTo"
        :to="scenarioTo"
        class="rail-item"
        :class="{ 'rail-active': route.name === 'scenario' }"
        :title="`The Scenario you're setting up: ${scenarioTitle}`"
        data-current-scenario
      >
        <Icon name="scenario" />
        <span class="sr-only">Scenario: {{ scenarioTitle }}</span>
      </RouterLink>
      <!-- On a phone the Queue's page; beside a rail, its panel, sliding in over the screen. -->
      <RouterLink to="/queue" class="rail-item relative sm:hidden! short:hidden!" active-class="rail-active" title="Queue: every machine's work, across Sessions" data-nav-queue-page>
        <Icon name="queue" />
        <span class="sr-only">Queue</span>
        <span v-if="queueCount" class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-fg px-1 text-[0.6rem] leading-4 text-canvas tabular-nums">{{ queueCount }}</span>
      </RouterLink>
      <button
        type="button"
        class="rail-item relative hidden! sm:grid! short:grid!"
        :class="{ 'rail-active': queueOpen || route.name === 'queue' }"
        :title="`Queue: ${queueCount ? `${queueCount} running or waiting` : 'nothing running'}`"
        :aria-expanded="queueOpen"
        data-nav-queue
        @click="queueOpen = !queueOpen"
      >
        <Icon name="queue" />
        <span class="sr-only">Queue</span>
        <span v-if="queueCount" class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-fg px-1 text-[0.6rem] leading-4 text-canvas tabular-nums" data-queue-count>{{ queueCount }}</span>
      </button>
      <!-- What's set once in a while, at the rail's foot: not on a phone's tab bar but Settings. -->
      <span
        class="hidden h-9 w-9 place-items-center sm:mt-auto sm:grid short:mt-auto short:grid"
        role="status"
        :title="serverOnline === null ? 'Checking the server…' : serverOnline ? 'Server online' : 'Server offline'"
        data-server
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="serverOnline === null ? 'bg-line' : serverOnline ? 'bg-ok' : 'bg-danger'"
        />
        <span v-if="serverOnline === false" class="sr-only">Server offline</span>
      </span>
      <ThemeButton class="rail-item hidden! sm:grid! short:grid!" />
      <RouterLink to="/settings" class="rail-item" active-class="rail-active" title="Settings" data-nav-settings>
        <Icon name="settings" />
        <span class="sr-only">Settings</span>
      </RouterLink>
    </nav>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- The rail has no room to say it: a line across the top while the server is down. -->
      <p
        v-if="serverOnline === false"
        class="shrink-0 border-b border-line bg-danger px-4 py-1 text-sm text-canvas"
        role="alert"
        data-server-offline
      >
        Server offline: the app can't reach it. Checking again every 15 s.
      </p>
      <!-- The last Session screen stays alive while you visit Home, the Queue or Settings, so its
           draft, the viewed Frame and running Frames survive going there and back. Opening another
           Session replaces it, as only one is in progress at a time. -->
      <RouterView v-slot="{ Component, route: r }">
        <KeepAlive :include="['ChainView', 'StoryboardView', 'RoleplayView']" :max="1">
          <component :is="Component" :key="r.path" class="min-h-0 flex-1" />
        </KeepAlive>
      </RouterView>
    </div>
    <QueuePanel v-model:open="queueOpen" :session-id="sessionOnScreen" />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
@reference "./style.css";

.rail-item {
  @apply grid h-9 w-9 place-items-center rounded-lg text-lg text-muted transition-colors hover:text-fg;
}
.rail-active {
  @apply bg-surface text-fg shadow-sm;
}
</style>
