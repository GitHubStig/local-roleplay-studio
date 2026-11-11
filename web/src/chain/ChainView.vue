<script setup lang="ts">
import { ask } from '../ask'
import { frameName, framesName } from '../frameName'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import ComposeBox from '../components/ComposeBox.vue'
import FrameImage from '../components/FrameImage.vue'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import FoldedPrompt from '../components/FoldedPrompt.vue'
import FrameTab from '../components/FrameTab.vue'
import ClipOverlay from '../components/ClipOverlay.vue'
import { clipCount, clipsMaking, scrollToClips, usePlayingClip } from '../clips'
import FrameListItem from '../components/FrameListItem.vue'
import PutBackOffer from '../components/PutBackOffer.vue'
import { usePutBack } from '../composables/usePutBack'
import ImageModelPicker from '../components/ImageModelPicker.vue'
import TextModelPicker from '../components/TextModelPicker.vue'
import ModelComparison from '../components/ModelComparison.vue'
import RenderAllButton from '../components/RenderAllButton.vue'
import PanelTabs from '../components/PanelTabs.vue'
import { useImageModels, writtenPart } from '../composables/useSettingsOptions'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import EditedChip from '../components/EditedChip.vue'
import FrameViewer from '../components/FrameViewer.vue'
import JobQueue from '../components/JobQueue.vue'
import { useJobs } from '../composables/useJobs'
import { useJobLink } from '../composables/useJobLink'
import { sessionPath } from '../sessionPath'
import { usePictureEditing } from '../composables/usePictureEditing'
import { showPickedFrame, useFrameKeys } from '../composables/useFrameKeys'
import { jobForming, jobStatus, queueTab, sweepOf } from '../jobs'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useSessionScreen } from '../composables/useSessionScreen'
import { diffWords } from '../diff'
import {
  type Activity,
  changedSinceRender,
  deleteChainFrame,
  saveChainPrompt,
  imageUrl,
  type Outcome,
  type Job,
  streamFrame,
  type ChainFrame,
  type FrameEvent,
  type Made3d,
  undoFrames,
} from '../api'
import { useFeatures } from '../composables/useFeatures'

const props = defineProps<{ id: string }>()

/** The Frame in progress, until it's saved; its picture is a render job after (ADR 0030). */
interface Pending {
  /** Writing, or waiting for a render on the Text Model's machine to finish (`queued`). */
  phase: Activity
  /** Started elsewhere (before a reload, in another tab); followed by polling the Session. */
  detached?: boolean
  /** The Text Model's reasoning so far, when thinking is on. */
  thinking?: string
  cancelling?: boolean
}

const pending = ref<Pending | null>(null)
const { session, loadError, draft, busy, load, leave, cancel, onSwitched, onClipsModel, pictureOf } =
  useSessionScreen(props.id, 'chain', {
    work: pending,
    // A new Chain writes its Opening Frame.
    begin: (s) => (s.frames.length ? undefined : runChainFrame(null)),
    following: (s, followed) => ({ ...followed, phase: s.activity!, detached: true }),
    // The Frame it made is shown.
    onFollowed: () => (viewing.value = null),
    refreshJobs: () => refreshJobs(),
  })
/** An undone Frame's Action, offered beside the box when it held a draft. */
const { offered, putBack, use: usePutBackText, dismiss: dismissPutBack } = usePutBack(draft)
const frameError = ref('')
/**
 * Why the last Action made no Frame (declined; unclear, and the Text Model asks what to change;
 * or it changed nothing in the picture): nothing was saved, and the Action stays in the box to
 * reword.
 */
const notice = ref<{ kind: 'declined' | 'unclear' | 'unchanged'; text: string } | null>(null)
/** Index of the Frame shown in the main panel; null follows the latest. */
const viewing = ref<number | null>(null)
const log = useTemplateRef<HTMLElement>('log')
const panel = ref<'log' | 'queue' | 'prompt'>('log')

/** Viewing preferences, remembered per browser. */
const captionHidden = useStoredFlag('caption-hidden')
/** Render each new Frame as it's made (on), or only write its prompt: this browser's choice. */
const renderFrames = useStoredFlag('chain-render-frames', true)
const removedHidden = useStoredFlag('diff-removed-hidden')

/**
 * The Frame in progress is shown, in its own place at the end of the Frames: while one runs and no
 * earlier Frame was picked. It has no picture until its preview (ComfyUI's) or its image comes.
 */
const onPending = computed(() => busy.value && viewing.value === null)
/** The committed Frame shown in the main panel; none while the one in progress is. */
const shown = computed(() => {
  if (onPending.value) return undefined
  const frames = session.value?.frames ?? []
  return viewing.value === null ? frames.at(-1) : frames[viewing.value]
})
const latest = computed(() => session.value?.frames.at(-1))
/** The picture of the Frame in the main panel. */
const picture = computed(() => shown.value && pictureOf(shown.value))
/** A clip playing over its Frame's picture, from the Frame tab's Clip section. */
const playingClip = usePlayingClip(() => shown.value?.index, () => session.value?.settings.imageModel)
/** It's by another Image Model than the Chain's now, or from before its prompt was edited. */
const pictureChanged = computed(() =>
  !!picture.value && changedSinceRender(picture.value, session.value!.settings.imageModel)
)
const { byOf, renderedParts } = useImageModels()
/**
 * Looking at an earlier Frame; the next Action still continues from the latest one. While a Frame
 * runs, any committed Frame is earlier than it.
 */
const viewingOlder = computed(() =>
  !!shown.value && (busy.value || shown.value.index !== latest.value?.index)
)
/** Picks a Frame to show; the latest is followed (null), unless one is in progress after it. */
const pick = (index: number) => {
  viewing.value = index === (session.value?.frames.length ?? 0) - 1 && !busy.value ? null : index
}
/** ↑ and ↓ in the Frames list; from the Frame in progress, ↑ goes to the latest. */
const onFrameKey = useFrameKeys(log, {
  count: () => session.value?.frames.length ?? 0,
  current: () => shown.value?.index ?? session.value?.frames.length ?? 0,
  pick,
})
/** What a Frame is called in a sentence: the Opening, or its number (`frameName`). */
const frameProse = (index: number) => (index === 0 ? 'the Opening' : frameName(index))
/** Its title, in the Frames list's places and the viewers' labels: "Frame 1 · Opening". */
const frameTitle = (index: number) => (index === 0 ? `${frameName(0)} · Opening` : frameName(index))

// Back on the Frames, or with a new one: down to the latest while following it, or else to the
// Frame picked (from the Queue tab, say).
watch([() => session.value?.frames.length, panel], async () => {
  if (viewing.value !== null) return showPickedFrame(log)
  await nextTick()
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
})

function onEvent(event: FrameEvent) {
  const s = session.value!
  switch (event.type) {
    case 'phase':
      pending.value = { ...pending.value, phase: event.phase }
      break
    case 'thinking':
      pending.value = {
        ...pending.value!,
        thinking: (event.restart ? '' : pending.value?.thinking ?? '') + event.text,
      }
      break
    case 'committed':
      s.frames.push(event.frame)
      pending.value = null
      viewing.value = null
      draft.value = ''
      // Its render, queued as it was saved.
      refreshJobs()
      break
    case 'declined':
    case 'unclear':
    case 'unchanged':
      // As in a Roleplay: no Frame, the Action stays in the box, and the reason shows by it.
      pending.value = null
      notice.value = { kind: event.type, text: event.message }
      break
    case 'failed':
    case 'cancelled':
      pending.value = null
      if (event.sessionDiscarded) {
        leave(event.type === 'failed' ? { error: event.message } : {})
      } else if (event.type === 'failed') {
        frameError.value = event.message
      }
      break
  }
}

async function runChainFrame(action: string | null) {
  frameError.value = ''
  notice.value = null
  dismissPutBack()
  pending.value = { phase: 'text' }
  try {
    await streamFrame(props.id, action, onEvent, renderFrames.value)
  } catch (err) {
    frameError.value = (err as Error).message
  } finally {
    pending.value = null
  }
}

function submit() {
  const action = draft.value.trim()
  // While an earlier Frame is shown, the box holds that Frame's Action, not the draft.
  if (action && !busy.value && !viewingOlder.value) runChainFrame(action)
}


// --- Background work: upscales and 3D, queued so the next Action needn't wait for them.

/** Pictures on: a Chain can render as it goes; off, it only writes each Frame's prompt. */
const { on: featureOn } = useFeatures()

const { jobs, jobsFor, hasJob, queue, queueEdit, queueClip, queueAll, dropJob, cancelAll, dismissFinished, retry, refreshJobs } = useJobs(props.id, {
  onSettled: async () => {
    await load()
  },
  onError: (message) => (frameError.value = message),
  reportFailures: true,
  onFailureGone: (message) => {
    if (frameError.value === message) frameError.value = ''
  },
  imageModel: () => session.value?.settings.imageModel,
})
/**
 * The Frames Render all would queue: those with no up-to-date picture by the Chain's Image Model
 * (none by it, or one from before the prompt was edited), and no render queued.
 */
const toRender = computed(() =>
  (session.value?.frames ?? []).filter((f) =>
    !f.pictures.some((p) => p.imageModel === session.value!.settings.imageModel && !p.stale) &&
    !hasJob(f.index, 'render')
  )
)
/** The shown Frame's running job, if it's making a picture: its border sweeps. */
const shownJob = computed(() =>
  jobsFor(shown.value?.index ?? -1).find((j) => j.status === 'running') ?? null
)

/**
 * A render of the shown Frame, queued or running: its picture's badge follows it, as a new Frame's
 * does, in place of "Changed since render".
 */
const shownRender = computed(() =>
  jobsFor(shown.value?.index ?? -1).find((j) => j.kind === 'render' && j.status !== 'failed') ??
    null
)

// --- Looking closer: the picture viewer, and 3D by model (experimental; PictureButtons).

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Editing its picture there (ADR 0021): painting an edit, or watching one being made. */
/** A queued job's Frame, from the Queue tab or a link to it. */
function goToJobFrame(index: number) {
  pick(index)
  panel.value = 'log'
}
/** A clip's Frame, at its Clip section on the picture it's made from. */
async function openClip(job: Job) {
  await onClipsModel(job, (m) => (frameError.value = m))
  pick(job.frameIndex)
  panel.value = 'prompt'
  scrollToClips(log.value)
}
const { painting: paintingPicture, startEdit, showEdit, pick: pickVersion, deleteEdit, deleteUpscale } =
  usePictureEditing(props.id, session, viewingPicture, (m) => (frameError.value = m))
// A job linked to from the queue page opens as this Session's Queue tab opens it.
useJobLink(() => sessionPath(props.id, 'chain'), () => !!session.value, jobs, refreshJobs, {
  go: goToJobFrame,
  edit: showEdit,
  clip: openClip,
  drop: dropJob,
})
/** Which Frame's scene or figure is open, if any. */
const open3d = ref<{ index: number; kind: Made3d } | null>(null)

/** Undo is possible for any Frame after the Opening Frame, while nothing is running. */
const canUndo = computed(() => !busy.value && (session.value?.frames.length ?? 0) > 1)
const undoing = ref(false)
/**
 * The first Frame the main panel's Undo takes back: the latest, or while an earlier Frame is shown,
 * every Frame after it (Undo to a Frame), so it stops on the Frame in view.
 */
const undoFrom = computed(() => (viewingOlder.value ? shown.value!.index + 1 : latest.value?.index))

/**
 * Removes the Frames from `from` on and puts the first one's Action back in the text box to edit
 * and resend; once confirmed, unless it's only the latest, undone where it's shown.
 */
async function undo(from: number, confirm: boolean) {
  const last = session.value?.frames.at(-1)
  const first = session.value?.frames[from]
  if (!canUndo.value || !last || !first || undoing.value) return
  if (confirm) {
    const what = `Undo ${framesName(from, last.index)}, and put ${frameName(from)}'s Action back in ` +
      'the box? Their pictures, and what was made from them, are deleted.'
    if (!(await ask(what, { action: 'Undo', danger: true }))) return
  }
  undoing.value = true
  frameError.value = ''
  try {
    session.value = await undoFrames(props.id, from, last.index)
    viewing.value = null
    putBack(`${frameName(from)}'s Action`, first.action)
  } catch (err) {
    frameError.value = (err as Error).message
  } finally {
    undoing.value = false
  }
}

const deleting = ref(false)

/**
 * Deletes a Frame between the Opening and the latest (which has Undo), once confirmed: its
 * pictures go, and the Frames after it are numbered down. The shown Frame stays shown; the deleted
 * one's place goes to the Frame after it.
 */
async function deleteFrame(frame: ChainFrame) {
  if (busy.value || deleting.value) return
  const what = `Delete ${frameName(frame.index)} and its pictures? The Frames after it are numbered down.`
  if (!(await ask(`${what} This can't be undone.`, { action: 'Delete', danger: true }))) return
  deleting.value = true
  frameError.value = ''
  try {
    const frames = session.value!.frames.length
    session.value = await deleteChainFrame(props.id, frame.index, {
      frames,
      createdAt: frame.createdAt,
    })
    const v = viewing.value
    if (v !== null) pick(v > frame.index ? v - 1 : v)
    viewingPicture.value = null
    open3d.value = null
    refreshJobs()
  } catch (err) {
    frameError.value = (err as Error).message
  } finally {
    deleting.value = false
  }
}

/**
 * "Text 9.8 s by gemma4:26b · Waited 12.3 s · Image 5.1 s · by Qwen-Image 2.1": writing the Frame, then rendering
 * the picture it shows, once it has one.
 */
function timingsLabel(frame: ChainFrame): string {
  const picture = pictureOf(frame)
  return [writtenPart(frame), ...(picture ? renderedParts(picture) : [])]
    .join(' · ')
}

/** The text box's border sweeps while the Text Model writes the new prompt. */
const writing = computed(() => pending.value?.phase === 'text' && !pending.value.cancelling)

/** The frame's border sweeps while a job renders the shown Frame (or waits to). */
const renderingPhase = computed(() => (onPending.value ? null : sweepOf(shownJob.value?.phase)))

/** The picture forming, over the shown Frame's old picture, while a job renders it on ComfyUI. */
const forming = computed(() => (onPending.value ? null : jobForming(session.value, shownJob.value)))

/** The caption: the shown Frame's Narration; the one in progress has none until it's saved. */
const captionText = computed(() => (onPending.value ? '' : shown.value?.narration ?? ''))

/** The reasoning streaming in, shown in the caption's place while the Frame is written. */
const liveThinking = computed(() =>
  onPending.value && pending.value?.thinking ? pending.value.thinking : ''
)
const thinkingBox = useTemplateRef<HTMLElement>('thinkingBox')
watch(liveThinking, async () => {
  await nextTick()
  thinkingBox.value?.scrollTo({ top: thinkingBox.value.scrollHeight })
})
const captionOutcome = computed(() => (onPending.value ? undefined : shown.value?.outcome))

/** Labels for the Outcomes that leave the Image Prompt unchanged. */
const OUTCOME_LABELS: Partial<Record<Outcome, string>> = {
  declined: 'Declined',
  unclear: "Didn't understand",
}

const phaseLabel = computed(() => {
  if (pending.value?.cancelling) return 'Cancelling…'
  if (pending.value?.phase === 'queued') return 'Waiting for another render…'
  return 'Writing the prompt…'
})

/** A picture rendering, a new Frame's or a re-render's, with its step once it has one. */
function renderingLabel(p: { step: number; total: number } | undefined) {
  const doing = 'Rendering the image…'
  return p ? `${doing} step ${p.step} of ${p.total}` : doing
}
/** A re-render's status, worded as a new Frame's. */
const rerenderLabel = (job: Job) =>
  jobStatus(job, (j) => (j.phase === 'image' ? renderingLabel(j.progress) : undefined))

/** The Frame in progress's index and Action, for its place in the Frames and the Prompt tab. */
const pendingIndex = computed(() => session.value?.frames.length ?? 0)
const pendingAction = computed(() =>
  pending.value?.detached ? 'A Frame in progress' : draft.value.trim() || 'Opening'
)
/** The Frame whose prompt the Prompt tab shows: the shown one, or the one in progress. */
const promptIndex = computed(() => (onPending.value ? pendingIndex.value : shown.value?.index))

/**
 * The shown Frame's Image Prompt as edited by hand, while it is; null otherwise. Showing another
 * Frame drops the edit.
 */
const promptDraft = ref<string | null>(null)
const promptError = ref('')
const savingPrompt = ref(false)
watch(() => shown.value?.index, () => {
  promptDraft.value = null
  promptError.value = ''
})
/** Saves the edited prompt: the Frame's pictures are out of date until rendered again. */
async function savePrompt() {
  const frame = shown.value
  if (!frame || promptDraft.value === null || savingPrompt.value) return
  savingPrompt.value = true
  promptError.value = ''
  try {
    session.value = await saveChainPrompt(props.id, frame.index, promptDraft.value)
    promptDraft.value = null
  } catch (err) {
    promptError.value = (err as Error).message
  } finally {
    savingPrompt.value = false
  }
}

/** The shown Frame's Image Prompt, word-diffed against the Frame before it (none for the Opening). */
const promptDiff = computed(() => {
  const prompt = onPending.value ? undefined : shown.value?.prompt
  if (!prompt || promptIndex.value === undefined) return []
  const before = session.value?.frames[promptIndex.value - 1]
  return before ? diffWords(before.prompt, prompt) : [{ kind: 'same' as const, text: prompt }]
})
</script>

<template>
  <div class="flex min-h-0">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Session: {{ loadError }}</p>

    <template v-else-if="session">
      <main class="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <!-- The Chain's switches, above the picture, as a Roleplay's are above its conversation. -->
        <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
          <TextModelPicker
            :session="session"
            @switched="onSwitched"
            @failed="(message) => (frameError = message)"
          />
          <template v-if="featureOn('images')">
            <ImageModelPicker
              :session="session"
              @switched="onSwitched"
              @failed="(message) => (frameError = message)"
            />
            <ModelComparison
              :session-id="session.id"
              :frames="session.frames"
              :image-model="session.settings.imageModel"
              :thumbnail="session.thumbnail"
              :name="frameTitle"
              :caption="(f) => f.narration"
              @changed="load(); refreshJobs()"
            />
            <label
              class="flex cursor-pointer items-center gap-1.5 text-muted"
              title="Off: each Action writes only the new prompt, and you render the Frames you want"
            >
              <input v-model="renderFrames" type="checkbox" data-render-frames />
              Render each Frame
            </label>
          </template>
        </div>
        <FrameImage
          :src="picture ? imageUrl(session.id, picture.upscaled ?? picture.image) : null"
          :alt="shown?.prompt"
          :rendering="renderingPhase"
          :preview="forming"
          :hide-size="busy || pictureChanged"
          :empty-text="busy ? undefined : shown ? 'Not rendered yet' : 'No image yet'"
          :expected-size="session.imageSize"
          @open="viewingPicture = shown!.index"
        >
          <EditedChip
            :picture="picture"
            class="absolute right-3"
            :class="viewingOlder ? 'top-14' : 'top-3'"
          />
          <ClipOverlay
            v-if="playingClip && playingClip.index === shown?.index"
            :src="imageUrl(session.id, playingClip.clip.file)"
            :clip="playingClip.clip"
            @close="playingClip = null"
          />
          <div
            v-if="viewingOlder"
            class="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/70 py-1 pl-3 pr-1 text-sm text-white"
            data-viewing
          >
            <span>Viewing {{ frameProse(shown!.index) }} of {{ (busy ? pendingIndex : latest!.index) + 1 }}</span>
            <button
              type="button"
              class="rounded-full bg-white/15 px-2.5 py-0.5 hover:bg-white/25"
              @click="viewing = null"
            >
              Back to latest
            </button>
          </div>

          <div
            v-if="busy"
            class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            role="status"
          >
            <span class="animate-pulse">{{ phaseLabel }}</span>
          </div>
          <div
            v-else-if="shownRender"
            class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            role="status"
            data-rerendering
          >
            <span class="animate-pulse">{{ rerenderLabel(shownRender) }}</span>
          </div>
          <div
            v-else-if="pictureChanged"
            class="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
            data-changed
          >
            Changed since render · {{ byOf(picture!) }}
          </div>

          <div
            v-if="liveThinking && !captionHidden"
            class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/60 to-transparent px-5 pb-4 pt-12 text-white"
            data-thinking
          >
            <span class="mb-1 inline-block animate-pulse text-xs font-medium text-white/80">
              Thinking…
            </span>
            <p
              ref="thinkingBox"
              class="max-h-28 overflow-y-auto whitespace-pre-line text-xs italic leading-relaxed text-white/70"
            >
              {{ liveThinking }}
            </p>
          </div>

          <template v-else-if="captionText">
            <div
              v-if="!captionHidden"
              class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/60 to-transparent px-5 pb-4 pt-12 text-white"
            >
              <span
                v-if="captionOutcome && OUTCOME_LABELS[captionOutcome]"
                class="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="captionOutcome === 'declined'
                ? 'bg-amber-300/20 text-amber-300'
                : 'bg-sky-300/20 text-sky-300'"
                data-outcome
              >
                {{ OUTCOME_LABELS[captionOutcome] }}
              </span>
              <p
                class="max-h-24 overflow-y-auto pr-10 text-sm leading-relaxed"
                :class="{
                  'text-amber-300': captionOutcome === 'declined',
                  'text-sky-300': captionOutcome === 'unclear',
                }"
                data-caption
              >
                {{ captionText }}
              </p>
              <button
                type="button"
                class="absolute bottom-3 right-3 rounded px-1.5 text-xs text-white/70 hover:text-white"
                title="Hide caption"
                @click="captionHidden = true"
              >
                Hide
              </button>
            </div>
            <button
              v-else
              type="button"
              class="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white"
              @click="captionHidden = false"
            >
              Show caption
            </button>
          </template>
        </FrameImage>

        <div class="flex shrink-0 flex-col gap-2">
          <!-- The sweep shows here while the Text Model writes, then moves to the image. -->
          <div
            class="flex rounded-lg"
            :class="{ 'render-sweep': writing }"
            :data-writing="writing ? '' : undefined"
          >
            <!-- An earlier Frame shows the Action that made it, read-only (still selectable to copy). -->
            <textarea
              v-if="viewingOlder"
              :value="shown!.action ?? ''"
              rows="3"
              class="flex-1 cursor-default resize-none rounded-lg border border-dashed border-line bg-canvas p-3 text-muted"
              placeholder="The Opening Frame has no Action."
              readonly
              :aria-label="`The Action sent on ${frameProse(shown!.index)}`"
              data-past-action
            />
            <ComposeBox
              v-else
              v-model="draft"
              placeholder="What to change… (Enter to send, Shift+Enter for a new line)"
              :disabled="busy"
              @send="submit"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!busy"
              type="button"
              class="rounded-lg bg-fg px-4 py-2 font-medium text-canvas disabled:opacity-50"
              :disabled="!draft.trim() || viewingOlder"
              @click="submit"
            >
              Send
            </button>
            <button
              v-else
              type="button"
              class="rounded-lg border border-danger px-4 py-2 font-medium text-danger disabled:opacity-50"
              :disabled="pending?.cancelling"
              @click="cancel"
            >
              Cancel
            </button>
            <RenderAllButton
              v-if="featureOn('images') && session.frames.length"
              :count="toRender.length"
              title="Queue a render of every Frame not rendered yet by this Image Model"
              @render="queueAll('render', toRender.map((f) => f.index))"
            />
            <PutBackOffer
              v-if="offered && !frameError && !notice"
              :offered="offered"
              @use="usePutBackText"
              @dismiss="dismissPutBack"
            />
            <p
              v-else
              class="min-w-0 flex-1 truncate text-sm"
              :class="frameError ? 'text-danger' : notice?.kind === 'declined' ? 'text-warn' : 'text-info'"
              :title="frameError || notice?.text"
              role="alert"
              data-frame-notice
            >
              {{ frameError || notice?.text }}
            </p>
            <button
              type="button"
              class="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              :disabled="!canUndo || undoing"
              :title="viewingOlder
                ? `Undo every Frame after ${frameProse(shown!.index)}, back to it, and put the next Action back in the box`
                : 'Undo the latest Frame and put its Action back in the box'"
              data-undo-main
              @click="undo(undoFrom!, viewingOlder)"
            >
              {{ viewingOlder ? `Undo to ${frameName(shown!.index)}` : 'Undo' }}
            </button>
          </div>
        </div>

      </main>

      <aside class="flex w-80 flex-col border-l border-line xl:w-auto xl:flex-row">
        <!-- Narrow windows: one panel at a time. From xl up: the Prompt beside the others. -->
        <div class="xl:hidden">
          <PanelTabs
            v-model="panel"
            :tabs="[
              { id: 'log', label: 'Frames' },
              { id: 'queue', ...queueTab(jobs) },
              { id: 'prompt', label: 'Frame' },
            ]"
          />
        </div>

        <section
          class="min-h-0 flex-1 flex-col xl:w-72 xl:flex-none xl:border-r xl:border-line"
          :class="panel === 'prompt' ? 'hidden xl:flex' : 'flex'"
          data-log-panel
        >
          <div class="hidden xl:block">
            <PanelTabs
              v-model="panel"
              :tabs="[{ id: 'log', label: 'Frames' }, { id: 'queue', ...queueTab(jobs) }]"
            />
          </div>
          <!-- The queue: what's running, queued and failed; click one to go to its Frame. -->
          <div v-if="panel === 'queue'" class="min-h-0 flex-1 overflow-y-auto" data-queue>
            <JobQueue
              :jobs="jobs"
              empty="Nothing queued. Render, Render all and Upscale add work here, to run while you carry on."
              :name="frameTitle"
              @go="goToJobFrame"
              @clip="openClip"
              @edit="showEdit"
              @retry="retry"
              @drop="dropJob"
              @cancel-all="cancelAll"
              @dismiss-finished="dismissFinished"
            />
          </div>
          <ol
            v-show="panel !== 'queue'"
            ref="log"
            class="flex-1 overflow-y-auto"
            role="tabpanel"
            @keydown="onFrameKey"
          >
          <li v-for="frame in session.frames" :key="frame.index" class="group relative">
            <FrameListItem
              :thumb="pictureOf(frame) && imageUrl(session.id, pictureOf(frame)!.image)"
              :number="frame.index + 1"
              :current="shown?.index === frame.index"
              :clips="clipCount(pictureOf(frame), session.settings.imageModel)"
              data-frame
              @click="pick(frame.index)"
            >
                <!-- Capped here; the Prompt tab and the text box show it in full. -->
                <span class="line-clamp-2 font-medium" :title="frame.action ?? undefined" data-action>
                  {{ frame.action ?? 'Opening' }}
                </span>
                <span
                  v-if="OUTCOME_LABELS[frame.outcome]"
                  class="text-xs font-medium"
                  :class="frame.outcome === 'declined' ? 'text-warn' : 'text-info'"
                >
                  {{ OUTCOME_LABELS[frame.outcome] }}
                </span>
                <span
                  class="line-clamp-3 text-muted"
                  :class="{
                    'text-warn': frame.outcome === 'declined',
                    'text-info': frame.outcome === 'unclear',
                  }"
                >
                  {{ frame.narration }}
                </span>
            </FrameListItem>
            <button
              v-if="canUndo && frame.index === session.frames.at(-1)?.index"
              type="button"
              class="absolute right-2 top-2 rounded border border-line bg-canvas px-2 py-0.5 text-xs text-muted opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
              :disabled="undoing"
              title="Undo this Frame"
              data-undo
              @click="undo(frame.index, false)"
            >
              Undo
            </button>
            <button
              v-else-if="!busy && frame.index > 0"
              type="button"
              class="absolute right-2 top-2 rounded border border-line bg-canvas px-2 py-0.5 text-xs text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
              :disabled="deleting"
              title="Delete this Frame and its pictures"
              data-delete-frame
              @click="deleteFrame(frame)"
            >
              Delete
            </button>
          </li>
          <!-- The Frame in progress, in its place from the start: picked to show it again. -->
          <li v-if="busy">
            <button
              type="button"
              class="flex w-full gap-3 border-b border-line p-3 text-left text-sm hover:bg-surface"
              :class="{ 'bg-surface': onPending }"
              :aria-current="onPending"
              data-pending-frame
              @click="viewing = null"
            >
              <span
                class="flex h-20 w-14 shrink-0 animate-pulse items-center justify-center rounded border border-dashed border-line text-xs text-muted"
              >
                {{ pendingIndex + 1 }}
              </span>
              <span class="flex min-w-0 flex-col gap-1">
                <span class="line-clamp-2 font-medium">{{ pendingAction }}</span>
                <span class="animate-pulse text-xs text-info">{{ phaseLabel }}</span>
              </span>
            </button>
          </li>
          </ol>
        </section>

        <section
          class="min-h-0 flex-1 flex-col xl:w-[28rem] xl:flex-none"
          :class="panel === 'prompt' ? 'flex' : 'hidden xl:flex'"
          data-prompt-panel
        >
          <h2 class="hidden border-b border-line px-4 py-2 text-sm font-medium xl:block">
            Frame
          </h2>
          <div class="flex-1 overflow-y-auto p-4 text-sm" role="tabpanel">
          <FrameTab
            :picture="picture"
            :has-job="(kind) => !!shown && hasJob(shown.index, kind)"
            :can-render="!!shown && !onPending"
            @queue="(kind) => queue(kind, shown!.index)"
            @view="(kind) => (open3d = { index: shown!.index, kind })"
            @edit="startEdit(shown!.index)"
            :clips="shown && !onPending
              ? {
                sessionId: session.id,
                index: shown.index,
                nextPictured: !!session.frames[shown.index + 1] && !!pictureOf(session.frames[shown.index + 1]),
                nextName: frameName(shown.index + 1),
                imageModel: session.settings.imageModel,
                making: clipsMaking(jobsFor(shown.index), pictureOf(shown)?.imageModel),
                playing: playingClip?.index === shown.index ? playingClip.clip.file : undefined,
              }
              : undefined"
            @clip="(order) => queueClip(shown!.index, order)"
            @play="(clip) => (playingClip = { index: shown!.index, clip })"
            @stop="playingClip = null"
          >
          <template v-if="shown">
            <div class="mb-1 flex items-start gap-2">
              <p class="flex-1 text-muted">
                {{ frameName(promptIndex!) }} · {{ shown ? shown.action ?? 'Opening' : pendingAction }}
              </p>
              <button
                v-if="shown && !onPending && promptDraft === null"
                type="button"
                class="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted hover:text-fg"
                title="Edit this Frame's Image Prompt by hand; its pictures are then out of date"
                data-edit-prompt
                @click="promptDraft = shown.prompt"
              >
                Edit
              </button>
            </div>
            <p class="mb-3 text-xs text-muted" data-timings>
              {{ timingsLabel(shown) }}
            </p>
            <form
              v-if="promptDraft !== null"
              class="flex flex-col gap-2"
              data-prompt-editor
              @submit.prevent="savePrompt"
            >
              <CollapsibleTextarea id="chain.prompt" v-model="promptDraft" label="Image Prompt" />
              <p class="text-xs text-muted">
                Saving marks this Frame's pictures out of date until rendered again. The Frames
                after it keep their own prompts.
              </p>
              <p v-if="promptError" class="text-xs text-danger" role="alert">{{ promptError }}</p>
              <div class="flex gap-2">
                <button
                  type="submit"
                  class="rounded border border-line px-3 py-1 text-xs disabled:opacity-50"
                  :disabled="busy || savingPrompt || promptDraft.trim() === shown?.prompt"
                  :title="busy ? 'Wait for the Frame in progress' : undefined"
                >
                  Save
                </button>
                <button
                  type="button"
                  class="rounded px-3 py-1 text-xs text-muted hover:text-fg"
                  @click="promptDraft = null"
                >
                  Cancel
                </button>
              </div>
            </form>
            <FoldedPrompt v-else :preview="shown.prompt">
              <div
                v-if="promptIndex! > 0"
                class="flex flex-col gap-1 text-xs text-muted"
              >
                <label class="flex w-fit cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    :checked="!removedHidden"
                    data-show-removed
                    @change="removedHidden = !($event.target as HTMLInputElement).checked"
                  />
                  Show removed words
                </label>
                <p>
                  <span class="rounded bg-info/20 px-1 text-fg">added</span>
                  <template v-if="!removedHidden">
                    and <span class="text-danger line-through">removed</span>
                  </template>
                  since {{ frameName(promptIndex! - 1) }}.
                </p>
              </div>
              <p class="leading-relaxed" data-prompt>
                <template v-for="(part, i) in promptDiff" :key="i">
                  <span
                    v-if="part.kind !== 'removed' || !removedHidden"
                    :class="{
                      'rounded bg-info/20 text-fg': part.kind === 'added',
                      'text-danger line-through opacity-70': part.kind === 'removed',
                    }"
                    :data-diff="part.kind"
                  >{{ part.text }}</span><template
                    v-if="part.kind !== 'removed' || !removedHidden"
                  >{{ ' ' }}</template>
                </template>
              </p>
            </FoldedPrompt>
            <details v-if="shown?.thinking" :key="`thinking-${shown.index}`" class="mt-4 text-muted">
              <summary class="cursor-pointer select-none">Thinking</summary>
              <p class="mt-1 whitespace-pre-line text-xs leading-relaxed" data-frame-thinking>
                {{ shown.thinking }}
              </p>
            </details>
          </template>
          <p v-else-if="onPending" class="animate-pulse text-muted">Writing the prompt…</p>
          <p v-else class="text-muted">No prompt yet.</p>
          </FrameTab>
          </div>
        </section>
      </aside>
    </template>

    <p v-else class="p-6 text-muted">Loading…</p>

    <FrameViewer
      v-if="session"
      v-model:open="viewingPicture"
      v-model:painting="paintingPicture"
      :session-id="session.id"
      :frames="session.frames"
      :image-model="session.settings.imageModel"
      :name="frameTitle"
      :jobs="jobs"
      @edit="queueEdit"
      @pick="pickVersion"
      @delete-edit="deleteEdit"
      @delete-upscale="deleteUpscale"
      @drop-job="dropJob"
    />
    <Frame3dViewers
      v-if="session"
      v-model:open="open3d"
      :session-id="session.id"
      :frames="session.frames"
      :image-model="session.settings.imageModel"
      :name="frameTitle"
    />
  </div>
</template>
