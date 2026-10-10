<script setup lang="ts">
import { useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getHealth, KIND_LABELS } from './api'
import { useCurrentSession } from './composables/useCurrentSession'
import { sessionPath } from './sessionPath'
import ThemeToggle from './components/ThemeToggle.vue'

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
const onSession = computed(() =>
  route.name === 'session' || route.name === 'storyboard' || route.name === 'roleplay'
)

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
  <div class="flex h-screen flex-col bg-canvas text-fg">
    <header class="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
      <div class="flex min-w-0 items-center gap-5">
        <h1 class="shrink-0 text-lg font-semibold">Local Roleplay Studio</h1>
        <!-- The screens as tabs, the one on screen filled. -->
        <nav class="flex min-w-0 items-center gap-1 text-sm" aria-label="Screens">
          <RouterLink
            to="/"
            class="tab"
            exact-active-class="tab-active"
            title="Your Sessions, and new ones"
            data-nav-home
          >
            Home
          </RouterLink>
          <RouterLink to="/settings" class="tab" active-class="tab-active">Settings</RouterLink>
          <RouterLink
            v-if="currentTo"
            :to="currentTo"
            class="tab min-w-0 max-w-80"
            :class="{ 'tab-active': onSession }"
            :title="`The Session opened last${currentSessionTitle ? `: ${currentSessionTitle}` : ''}`"
            data-current-session
          >
            <span class="shrink-0 text-xs uppercase tracking-wide text-muted" data-current-kind>
              {{ KIND_LABELS[currentSessionKind] }}
            </span>
            <span v-if="currentSessionTitle" class="truncate" data-current-title>
              {{ currentSessionTitle }}
            </span>
          </RouterLink>
        </nav>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <!-- A dot while all's well; said in words when the server is down. -->
        <span
          class="flex items-center gap-1.5 text-sm"
          role="status"
          :title="serverOnline === null ? 'Checking the server…' : serverOnline ? 'Server online' : 'Server offline'"
          data-server
        >
          <span
            class="h-2 w-2 rounded-full"
            :class="serverOnline === null ? 'bg-line' : serverOnline ? 'bg-ok' : 'bg-danger'"
          />
          <span v-if="serverOnline === false" class="text-danger">Server offline</span>
        </span>
        <ThemeToggle />
      </div>
    </header>
    <!-- Up to 5 Session screens stay alive while you visit Home, Settings or other Sessions, so
         drafts, the viewed Frame and running Frames survive switching back and forth. -->
    <RouterView v-slot="{ Component, route: r }">
      <KeepAlive :include="['SessionView', 'StoryboardView', 'RoleplayView']" :max="5">
        <component :is="Component" :key="r.path" class="min-h-0 flex-1" />
      </KeepAlive>
    </RouterView>
  </div>
</template>

<style scoped>
@reference "./style.css";

.tab {
  @apply flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-muted hover:text-fg;
}
.tab-active {
  @apply border-line bg-surface font-medium text-fg shadow-sm;
}
</style>
