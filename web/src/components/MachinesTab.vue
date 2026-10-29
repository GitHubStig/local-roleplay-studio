<script setup lang="ts">
import { computed } from 'vue'
import {
  type Availability,
  type Backend,
  type BackendKind,
  BACKEND_NAMES,
  type ComfyStatus,
  type Feature,
  type TextModelOptions,
} from '../api'
import ComfyStatusLine from './ComfyStatusLine.vue'
import Icon from './Icon.vue'

/**
 * Settings' Machines tab (ADR 0022): the Backends there are, this machine's own first until moved,
 * each with its address and whether it answers. Each tab chooses which one its work prefers; a job
 * goes to the next listed that can do it when that one can't, so the order matters.
 */
const props = defineProps<{
  /** What this machine runs itself. */
  here: Record<Feature, Availability>
  /** Each ComfyUI's check, by id. */
  comfy: Record<string, ComfyStatus | 'checking'>
  /** What each text Backend lists, by id. */
  text: Record<string, TextModelOptions>
  /** The Backends with an API key saved. */
  apiKeysSet: string[]
}>()
const backends = defineModel<Backend[]>('backends', { required: true })
/** New API keys typed, by Backend id. */
const apiKeys = defineModel<Record<string, string>>('apiKeys', { required: true })
const emit = defineEmits<{
  /** Check a ComfyUI again. */
  check: [backend: Backend]
  /** Take a Backend off the list. */
  remove: [index: number]
  /** Save a Backend's API key ('' removes it). */
  saveKey: [id: string, key: string]
}>()

/** Each kind's usual address, shown until one is typed. */
const PLACEHOLDERS: Record<Exclude<BackendKind, 'here'>, string> = {
  comfyui: 'http://127.0.0.1:8188',
  ollama: 'http://localhost:11434',
  openai: 'http://localhost:1234/v1',
}
/** What each kind is for, said as it's added. */
const HINTS: Record<Exclude<BackendKind, 'here'>, string> = {
  comfyui: "Pictures, Upscale, edits, voices and clips, with the model's files installed there.",
  ollama: 'The Text Model. Empty for Ollama on this machine.',
  openai:
    'The Text Model, with the API version as the server documents it: LM Studio http://localhost:1234/v1, llama.cpp http://localhost:8080/v1, OpenRouter https://openrouter.ai/api/v1. Renders can unload a model from Ollama to free memory, not from these.',
}
const ADDABLE = ['comfyui', 'ollama', 'openai'] as const

/** What this machine's own Backend runs. */
const hereRuns = computed(() => {
  const names: [Feature, string][] = [
    ['images', 'pictures, Upscale and edits with mflux'],
    ['voices', 'voices with the voice service'],
    ['scenes', 'SHARP'],
    ['figures', 'TripoSplat'],
    ['lito', 'LiTo'],
    ['style', 'the style scores'],
  ]
  const runs = names.filter(([f]) => props.here[f]?.available).map(([, name]) => name)
  return runs.length ? `Runs ${runs.join(', ')}.` : 'Runs none of the extras itself.'
})

/** The machine a Backend is on, by its address. */
function machineOf(backend: Backend) {
  if (backend.kind === 'here' || !backend.address) return 'on this machine'
  try {
    return `on ${new URL(backend.address).hostname}`
  } catch {
    return ''
  }
}

/** A Backend of `kind`, its id the kind's name, numbered if that's taken. */
function add(kind: Exclude<BackendKind, 'here'>) {
  const taken = new Set(backends.value.map((b) => b.id))
  let id: string = kind
  for (let n = 2; taken.has(id); n++) id = `${kind}-${n}`
  backends.value.push({ id, kind, address: '' })
}

/** Moves a Backend earlier (-1) or later (1) in the order jobs try them. */
function move(index: number, by: -1 | 1) {
  const list = backends.value
  ;[list[index], list[index + by]] = [list[index + by], list[index]]
}

/** A key typed is saved when the field is left (not while it's typed). */
function keyTyped(id: string) {
  const key = apiKeys.value[id]?.trim()
  if (key) emit('saveKey', id, key)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">
      Where the work runs. Each tab chooses which of these its work prefers; when that one can't do a
      job (it hasn't the model), the job goes to the next one listed here that can.
    </p>
    <ol class="flex flex-col gap-3">
      <li
        v-for="(b, i) in backends"
        :key="b.id"
        class="flex flex-col gap-2 rounded-lg border border-line bg-surface/40 p-3"
        :data-backend="b.id"
      >
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ BACKEND_NAMES[b.kind] }}</span>
          <span class="text-sm text-muted">{{ machineOf(b) }}</span>
          <span class="ml-auto flex items-center gap-1 text-muted">
            <button
              type="button"
              class="rounded p-1 hover:text-fg disabled:opacity-30"
              title="Try it before the one above"
              :disabled="i === 0"
              data-move-up
              @click="move(i, -1)"
            >
              <Icon name="chevron-up" />
            </button>
            <button
              type="button"
              class="rounded p-1 hover:text-fg disabled:opacity-30"
              title="Try it after the one below"
              :disabled="i === backends.length - 1"
              data-move-down
              @click="move(i, 1)"
            >
              <Icon name="chevron-down" />
            </button>
            <button
              v-if="b.kind !== 'here'"
              type="button"
              class="rounded px-2 py-0.5 text-sm hover:text-danger"
              data-remove-backend
              @click="emit('remove', i)"
            >
              Remove
            </button>
          </span>
        </div>

        <p v-if="b.kind === 'here'" class="text-sm text-muted">{{ hereRuns }}</p>
        <template v-else>
          <input
            v-model.trim="b.address"
            class="field"
            :placeholder="PLACEHOLDERS[b.kind]"
            :aria-label="`${BACKEND_NAMES[b.kind]} address`"
            data-backend-address
          />
          <span class="text-sm text-muted">{{ HINTS[b.kind] }}</span>
          <ComfyStatusLine
            v-if="b.kind === 'comfyui'"
            :status="comfy[b.id] ?? null"
            @check="emit('check', b)"
          />
          <template v-else>
            <span v-if="text[b.id]?.textModelsError" class="text-sm text-warn" data-text-status>
              {{ text[b.id].textModelsError }}
            </span>
            <span v-else-if="text[b.id]" class="text-sm text-ok" data-text-status>
              Up: {{ text[b.id].textModels.length }} models.
            </span>
          </template>
          <div v-if="b.kind === 'openai'" class="flex flex-col gap-1">
            <input
              v-model="apiKeys[b.id]"
              type="password"
              autocomplete="off"
              class="field"
              aria-label="API key"
              data-api-key
              :placeholder="
                apiKeysSet.includes(b.id)
                  ? 'API key saved; type a new one to replace it'
                  : 'API key: none (a local server needs none)'
              "
              @change="keyTyped(b.id)"
            />
            <span class="text-sm text-muted">
              Kept in settings.json on this machine, never sent back to the browser.
              <button
                v-if="apiKeysSet.includes(b.id)"
                type="button"
                class="underline"
                data-remove-api-key
                @click="emit('saveKey', b.id, '')"
              >
                Remove the saved key
              </button>
            </span>
          </div>
        </template>
      </li>
    </ol>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="kind in ADDABLE"
        :key="kind"
        type="button"
        class="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface"
        :data-add-backend="kind"
        @click="add(kind)"
      >
        <Icon name="plus" />
        {{ BACKEND_NAMES[kind] }}
      </button>
    </div>
  </div>
</template>
