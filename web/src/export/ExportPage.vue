<script setup lang="ts">
import type { Comparison } from '../comparison'
import ComparisonTable from '../components/ComparisonTable.vue'
import ThemeToggle from '../components/ThemeToggle.vue'

/**
 * The exported comparison page: the Compare dialog's table alone, without its header, and the
 * app's theme toggle in a corner, remembered by the browser it's opened in.
 */
defineProps<Comparison>()
</script>

<template>
  <ComparisonTable :models :rows />
  <div class="fixed right-3 bottom-3 z-30 rounded-lg bg-canvas/90 shadow-md" data-export-theme>
    <ThemeToggle />
  </div>
</template>
