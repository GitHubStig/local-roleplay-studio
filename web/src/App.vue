<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getHealth } from './api'
import { useCurrentSession } from './composables/useCurrentSession'
import ThemeToggle from './components/ThemeToggle.vue'

const serverOnline = ref<boolean | null>(null)
const route = useRoute()
const { currentSessionId } = useCurrentSession()

/** Play returns to the Session in progress, if any. */
const playTo = computed(() => (currentSessionId.value ? `/sessions/${currentSessionId.value}` : '/'))
const onPlay = computed(() => route.name === 'play' || route.name === 'session')

onMounted(async () => {
  try {
    serverOnline.value = (await getHealth()).ok
  } catch {
    serverOnline.value = false
  }
})
</script>

<template>
  <div class="flex h-screen flex-col bg-canvas text-fg">
    <header class="flex items-center justify-between border-b border-line px-4 py-3">
      <nav class="flex items-center gap-4">
        <h1 class="text-lg font-semibold">RPG</h1>
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
    <!-- The Session screen stays alive while visiting Settings, so a running Turn survives. -->
    <RouterView v-slot="{ Component, route: r }">
      <KeepAlive include="SessionView" :max="1">
        <component :is="Component" :key="r.path" class="min-h-0 flex-1" />
      </KeepAlive>
    </RouterView>
  </div>
</template>
