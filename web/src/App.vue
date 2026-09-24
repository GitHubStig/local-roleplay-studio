<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getHealth } from './api'
import ThemeToggle from './components/ThemeToggle.vue'

const serverOnline = ref<boolean | null>(null)

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
        <RouterLink to="/" class="text-sm text-muted" active-class="!text-fg">
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
    <RouterView :key="$route.path" class="min-h-0 flex-1" />
  </div>
</template>
