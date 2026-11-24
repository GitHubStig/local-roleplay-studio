<script setup lang="ts">
import { computed } from 'vue'
import {
  type Amount,
  bytes,
  CLIP_KIND_NAMES,
  type ClipKind,
  type KeepOptions,
  type KeepPreview,
  type LeftOut,
  SOUND_LABELS,
  type SoundKind,
  THREE_D_LABELS,
  type ThreeDKind,
} from '../api'
import { useImageModels } from '../composables/useSettingsOptions'
import KeepRow from './KeepRow.vue'

/**
 * What to keep of a Session: a row per part (pictures, clips, 3D, sound, call logs), each saying
 * what's kept and how much, opening to its ticks. A tick means keep; what's unticked is
 * `leftOut`, which the pane exports without or removes. What's made from a picture goes with it,
 * so a tick with nothing left once the pictures' ticks have taken theirs (`preview.after`) greys
 * out.
 */
const props = defineProps<{ options: KeepOptions; preview: KeepPreview | null }>()
const left = defineModel<LeftOut>({ required: true })
const { labelOf, videoLabelOf } = useImageModels()

/** What there'd still be of an option once the pictures' ticks have taken theirs. */
const after = computed(() => props.preview?.after ?? props.options)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const amount = (a: Amount, one: string) => `${plural(a.count, one)} · ${bytes(a.size)}`

const change = (patch: Partial<LeftOut>) => (left.value = { ...left.value, ...patch })
const toggle = <T,>(list: T[], item: T, keep: boolean) =>
  keep ? list.filter((x) => x !== item) : [...list, item]

// Pictures.
const modelKept = (model: string) => !left.value.imageModels.includes(model)
const keptModels = computed(() => props.options.imageModels.filter((m) => modelKept(m.model)))
const picturesSummary = computed(() => {
  if (left.value.chosenOnly) return 'Chosen picture only'
  const o = props.options
  const parts = [`${keptModels.value.length} of ${plural(o.imageModels.length, 'Image Model')}`]
  if (o.upscales.count && left.value.upscales) parts.push('no upscales')
  if (o.edits.count && left.value.edits) parts.push('no edits')
  return parts.join(', ')
})
const picturesSize = computed(() => {
  const o = props.options
  if (left.value.chosenOnly) return o.chosen.size
  return Math.max(
    0,
    keptModels.value.reduce((n, m) => n + m.pictures, 0) -
      (left.value.upscales ? after.value.upscales.size : 0) -
      (left.value.edits ? after.value.edits.size : 0),
  )
})

// Clips, each video model's kinds in the order they're listed everywhere.
const KIND_ORDER = Object.keys(CLIP_KIND_NAMES)
const kindsOf = (kinds: { kind: ClipKind }[]) =>
  [...kinds].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
const clipsLeft = (model: string) => left.value.clips[model] ?? []
const clipKept = (model: string, kind: ClipKind) => !clipsLeft(model).includes(kind)
const clipAfter = (model: string, kind: ClipKind) =>
  after.value.clips.find((c) => c.model === model)?.kinds.find((k) => k.kind === kind) ??
    { count: 0, size: 0 }
function setClip(model: string, kind: ClipKind, keep: boolean) {
  const kinds = toggle(clipsLeft(model), kind, keep)
  const { [model]: _, ...others } = left.value.clips
  change({ clips: kinds.length ? { ...others, [model]: kinds } : others })
}
function setClipModel(model: string, keep: boolean) {
  const { [model]: _, ...others } = left.value.clips
  const all = props.options.clips.find((c) => c.model === model)!.kinds.map((k) => k.kind)
  change({ clips: keep ? others : { ...others, [model]: all } })
}
const clipTotals = computed(() => {
  let kept = 0
  let all = 0
  let size = 0
  for (const c of props.options.clips) {
    for (const k of c.kinds) {
      const there = clipAfter(c.model, k.kind)
      all += k.count
      if (clipKept(c.model, k.kind)) {
        kept += there.count
        size += there.size
      }
    }
  }
  return { kept, all, size }
})

// 3D and sound.
const threeDAfter = (kind: ThreeDKind) =>
  after.value.threeD.find((t) => t.kind === kind) ?? { count: 0, size: 0 }
const threeDSize = computed(() =>
  props.options.threeD.filter((t) => !left.value.threeD.includes(t.kind))
    .reduce((n, t) => n + threeDAfter(t.kind).size, 0)
)
const soundSize = computed(() =>
  props.options.sound.filter((s) => !left.value.sound.includes(s.kind))
    .reduce((n, s) => n + s.size, 0)
)
const keptOf = <K extends string>(all: { kind: K }[], gone: K[], labels: Record<K, string>) => {
  const kept = all.filter((a) => !gone.includes(a.kind))
  return kept.length === all.length ? 'all' : kept.length ? kept.map((a) => labels[a.kind]).join(', ') : 'none'
}
</script>

<template>
  <div class="flex flex-col" data-keep-ticks>
    <KeepRow data-keep-row="pictures" name="Pictures" :status="picturesSummary" :size="bytes(picturesSize)">
      <div class="flex flex-col gap-1.5 px-4 pb-3 pl-7 text-sm">
        <label class="flex items-center gap-2" :title="`Per Frame, only the picture it shows now, by ${labelOf(options.imageModel)}; a Frame without one is left not yet pictured`">
          <input type="checkbox" :checked="left.chosenOnly" data-keep-chosen @change="change({ chosenOnly: ($event.target as HTMLInputElement).checked })" />
          Chosen picture only <span class="text-muted">· {{ amount(options.chosen, 'picture') }}</span>
        </label>
        <label
          v-for="m in options.imageModels"
          :key="m.model"
          class="flex items-center gap-2"
          :class="{ 'text-muted': left.chosenOnly }"
        >
          <input
            type="checkbox"
            :checked="!left.chosenOnly && modelKept(m.model)"
            :disabled="left.chosenOnly"
            :data-keep-model="m.model"
            @change="change({ imageModels: toggle(left.imageModels, m.model, ($event.target as HTMLInputElement).checked) })"
          />
          {{ labelOf(m.model) }}<template v-if="m.model === options.imageModel"> (the Session's)</template>
          <span class="text-muted">· {{ amount(m, 'picture') }}</span>
        </label>
        <label v-if="options.upscales.count" class="flex items-center gap-2" :class="{ 'text-muted': !after.upscales.count }">
          <input type="checkbox" :checked="!left.upscales" :disabled="!after.upscales.count" data-keep-upscales @change="change({ upscales: !($event.target as HTMLInputElement).checked })" />
          Upscales <span class="text-muted">· {{ amount(after.upscales, 'upscale') }}</span>
        </label>
        <label v-if="options.edits.count" class="flex items-center gap-2" :class="{ 'text-muted': !after.edits.count }">
          <input type="checkbox" :checked="!left.edits" :disabled="!after.edits.count" data-keep-edits @change="change({ edits: !($event.target as HTMLInputElement).checked })" />
          Edits and their painted areas <span class="text-muted">· {{ amount(after.edits, 'edit') }}</span>
        </label>
        <span class="text-xs text-muted">What's made from a picture goes with it: its upscale, edits, clips and 3D.</span>
      </div>
    </KeepRow>

    <KeepRow v-if="options.clips.length" data-keep-row="clips" name="Clips" :status="`${clipTotals.kept} of ${clipTotals.all}`" :size="bytes(clipTotals.size)">
      <div class="flex flex-col gap-2 px-4 pb-3 pl-7 text-sm">
        <div v-for="c in options.clips" :key="c.model" class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label class="flex w-40 items-center gap-2 font-medium max-sm:w-full">
            <input
              type="checkbox"
              :checked="c.kinds.some((k) => clipKept(c.model, k.kind))"
              :indeterminate="c.kinds.some((k) => clipKept(c.model, k.kind)) && c.kinds.some((k) => !clipKept(c.model, k.kind))"
              :data-keep-clip-model="c.model"
              @change="setClipModel(c.model, ($event.target as HTMLInputElement).checked)"
            />
            {{ videoLabelOf(c.model) }}
          </label>
          <!-- Its kinds beside it; on a phone, on lines of their own under it. -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 max-sm:pl-6">
          <label
            v-for="k in kindsOf(c.kinds)"
            :key="k.kind"
            class="flex items-center gap-1.5"
            :class="{ 'text-muted': !clipAfter(c.model, k.kind).count }"
          >
            <input
              type="checkbox"
              :checked="clipKept(c.model, k.kind)"
              :disabled="!clipAfter(c.model, k.kind).count"
              :data-keep-clip="`${c.model} ${k.kind}`"
              @change="setClip(c.model, k.kind, ($event.target as HTMLInputElement).checked)"
            />
            {{ CLIP_KIND_NAMES[k.kind] }} {{ clipAfter(c.model, k.kind).count }}
          </label>
          </div>
        </div>
      </div>
    </KeepRow>

    <KeepRow v-if="options.threeD.length" data-keep-row="3d" name="3D" :status="keptOf(options.threeD, left.threeD, THREE_D_LABELS)" :size="bytes(threeDSize)">
      <div class="flex flex-col gap-1.5 px-4 pb-3 pl-7 text-sm">
        <label v-for="t in options.threeD" :key="t.kind" class="flex items-center gap-2" :class="{ 'text-muted': !threeDAfter(t.kind).count }">
          <input
            type="checkbox"
            :checked="!left.threeD.includes(t.kind)"
            :disabled="!threeDAfter(t.kind).count"
            :data-keep-3d="t.kind"
            @change="change({ threeD: toggle(left.threeD, t.kind, ($event.target as HTMLInputElement).checked) })"
          />
          {{ THREE_D_LABELS[t.kind] }} <span class="text-muted">· {{ amount(threeDAfter(t.kind), 'file') }}</span>
        </label>
      </div>
    </KeepRow>

    <KeepRow v-if="options.sound.length" data-keep-row="sound" name="Sound" :status="keptOf(options.sound, left.sound, SOUND_LABELS)" :size="bytes(soundSize)">
      <div class="flex flex-col gap-1.5 px-4 pb-3 pl-7 text-sm">
        <label v-for="s in options.sound" :key="s.kind" class="flex items-center gap-2">
          <input
            type="checkbox"
            :checked="!left.sound.includes(s.kind)"
            :data-keep-sound="s.kind"
            @change="change({ sound: toggle(left.sound, s.kind as SoundKind, ($event.target as HTMLInputElement).checked) })"
          />
          {{ SOUND_LABELS[s.kind] }} <span class="text-muted">· {{ amount(s, 'file') }}</span>
        </label>
        <p v-if="left.sound.includes('voices')" class="text-warn" data-keep-voice-warning>
          Without its voice, the Session can't speak until a new one is made.
        </p>
      </div>
    </KeepRow>

    <KeepRow v-if="options.calls.count || options.calls.size" data-keep-row="calls" name="Call logs" :status="left.calls ? 'none' : `all · ${options.calls.count}`" :size="bytes(left.calls ? 0 : options.calls.size)">
      <div class="px-4 pb-3 pl-7 text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" :checked="!left.calls" data-keep-calls @change="change({ calls: !($event.target as HTMLInputElement).checked })" />
          Every call logged <span class="text-muted">· {{ amount(options.calls, 'call') }}</span>
        </label>
      </div>
    </KeepRow>
  </div>
</template>
