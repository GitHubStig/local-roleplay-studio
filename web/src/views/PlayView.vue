<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createSession } from '../api'
import StartSession from '../components/StartSession.vue'

const route = useRoute()
const router = useRouter()
/** Why the last attempt to start failed, e.g. the Opening Turn errored. */
const error = ref(typeof route.query.error === 'string' ? route.query.error : '')

async function start(scenarioId: string) {
  error.value = ''
  try {
    const session = await createSession(scenarioId)
    router.push(`/sessions/${session.id}`)
  } catch (err) {
    error.value = (err as Error).message
  }
}
</script>

<template>
  <StartSession :error="error" @start="start" />
</template>
