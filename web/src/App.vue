<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getHealth } from './api'

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
  <div class="flex h-screen flex-col bg-neutral-950 text-neutral-100">
    <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
      <nav class="flex items-center gap-4">
        <h1 class="text-lg font-semibold">RPG</h1>
        <RouterLink to="/" class="text-sm text-neutral-400" active-class="!text-neutral-100">
          Play
        </RouterLink>
        <RouterLink to="/settings" class="text-sm text-neutral-400" active-class="!text-neutral-100">
          Settings
        </RouterLink>
      </nav>
      <span class="text-sm text-neutral-400">
        server:
        <span v-if="serverOnline === null">checking…</span>
        <span v-else-if="serverOnline" class="text-emerald-400">online</span>
        <span v-else class="text-red-400">offline</span>
      </span>
    </header>
    <RouterView class="min-h-0 flex-1" />
  </div>
</template>
