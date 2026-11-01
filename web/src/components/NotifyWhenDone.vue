<script setup lang="ts">
import { useWebNotification } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useNotifyWhenDone } from '../composables/useDoneNotice'
import ToggleSwitch from './ToggleSwitch.vue'

/**
 * Settings' switch for a system notification when a Session's queue is done (`useDoneNotice`):
 * turning it on asks the browser's permission, and it stays off if that's refused. Remembered per
 * browser, as the permission is.
 */
const stored = useNotifyWhenDone()
const { isSupported, ensurePermissions } = useWebNotification({ requestPermissions: false })
const blocked = ref(false)
const on = ref(stored.value)
watch(on, async (want) => {
  if (want) {
    blocked.value = !(await ensurePermissions())
    if (blocked.value) on.value = false
  }
  stored.value = on.value
})
</script>

<template>
  <ToggleSwitch v-model="on" title="Notify when the queue is done" :disabled="!isSupported" data-notify-done>
    A system notification once everything queued in a Session has finished, while you're in another
    tab or window.
    <template v-if="!isSupported">This browser can't show notifications.</template>
    <template #after>
      <span v-if="blocked" class="text-sm text-danger" data-notify-blocked>
        The browser didn't allow notifications from this page: allow them in its site settings.
      </span>
    </template>
  </ToggleSwitch>
</template>
