<script setup lang="ts">
import type { BackendGroup } from '../composables/useSettingsOptions'

/**
 * The options of a list of models across Image backends (`backendGroups`), for inside a
 * `<select>`: a group per backend, each model named with its backend, or a plain list where
 * there's one backend.
 */
defineProps<{ groups: BackendGroup[] }>()
</script>

<template>
  <template v-if="groups.length < 2">
    <option v-for="m in groups[0]?.models" :key="m.value" :value="m.value">{{ m.label }}</option>
  </template>
  <optgroup v-for="g in groups" v-else :key="g.backend" :label="g.name">
    <option v-for="m in g.models" :key="m.value" :value="m.value">
      {{ m.label }} · {{ g.name }}
    </option>
  </optgroup>
</template>
