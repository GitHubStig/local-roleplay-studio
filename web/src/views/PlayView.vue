<script setup lang="ts">
import StartSession from '../components/StartSession.vue'

// Sessions arrive with the Turn engine; until then Play is the Start Session screen.
function start(scenarioId: string) {
  console.info(`Session start requested for Scenario "${scenarioId}"`)
}
</script>

<template>
  <StartSession @start="start" />
</template>
