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
  <div class="flex h-screen bg-neutral-950 text-neutral-100">
    <main class="flex flex-1 flex-col gap-4 p-4">
      <header class="flex items-center justify-between">
        <h1 class="text-lg font-semibold">RPG</h1>
        <span class="text-sm text-neutral-400">
          server:
          <span v-if="serverOnline === null">checking…</span>
          <span v-else-if="serverOnline" class="text-emerald-400">online</span>
          <span v-else class="text-red-400">offline</span>
        </span>
      </header>
      <section
        class="flex flex-1 items-center justify-center rounded-lg border border-neutral-800 text-neutral-500"
      >
        Scene image
      </section>
      <textarea
        class="h-24 resize-none rounded-lg border border-neutral-800 bg-neutral-900 p-3"
        placeholder="Your Action…"
        disabled
      />
    </main>
    <aside class="w-80 border-l border-neutral-800 p-4 text-neutral-500">Turn Log</aside>
  </div>
</template>
