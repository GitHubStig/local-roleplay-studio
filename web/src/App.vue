<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getHealth } from './api'
import { useCurrentSession } from './composables/useCurrentSession'
import ThemeToggle from './components/ThemeToggle.vue'

const serverOnline = ref<boolean | null>(null)
const route = useRoute()
const { currentSessionId } = useCurrentSession()

/** Play returns to the Session in progress, if any. */
const playTo = computed(() => (currentSessionId.value ? `/sessions/${currentSessionId.value}` : '/'))
const onPlay = computed(() => route.name === 'session')

async function checkServer() {
  try {
    serverOnline.value = (await getHealth()).ok
  } catch {
    serverOnline.value = false
  }
}

// Re-checked every 15 s and whenever the window regains focus.
let healthTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  checkServer()
  healthTimer = setInterval(checkServer, 15000)
  window.addEventListener('focus', checkServer)
})
onBeforeUnmount(() => {
  clearInterval(healthTimer)
  window.removeEventListener('focus', checkServer)
})
</script>

<template>
  <div class="flex h-screen flex-col bg-canvas text-fg">
    <header class="flex items-center justify-between border-b border-line px-4 py-3">
      <nav class="flex items-center gap-4">
        <h1 class="text-lg font-semibold">
          <RouterLink to="/" title="Home: your Sessions and new ones">RPG</RouterLink>
        </h1>
        <RouterLink :to="playTo" class="text-sm text-muted" :class="{ '!text-fg': onPlay }">
          Play
        </RouterLink>
        <RouterLink to="/settings" class="text-sm text-muted" active-class="!text-fg">
          Settings
        </RouterLink>
      </nav>
      <div class="flex items-center gap-4">
        <span class="text-sm text-muted">
          server:
          <span v-if="serverOnline === null">checking…</span>
          <span v-else-if="serverOnline" class="text-ok">online</span>
          <span v-else class="text-danger">offline</span>
        </span>
        <ThemeToggle />
      </div>
    </header>
    <!-- Up to 5 Session screens stay alive while you visit Home, Settings or other Sessions, so
         drafts, the viewed Turn and running Turns survive switching back and forth. -->
    <RouterView v-slot="{ Component, route: r }">
      <KeepAlive include="SessionView" :max="5">
        <component :is="Component" :key="r.path" class="min-h-0 flex-1" />
      </KeepAlive>
    </RouterView>
  </div>
</template>
