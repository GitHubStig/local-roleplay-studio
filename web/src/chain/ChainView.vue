<script setup lang="ts">
import SessionBar from '../components/SessionBar.vue'
import { ask } from '../ask'
import { frameName, framesName } from '../frameName'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import CollapsibleTextarea from '../components/CollapsibleTextarea.vue'
import FoldedPrompt from '../components/FoldedPrompt.vue'
import { clipCount, clipsMaking, usePlayingClip } from '../clips'
import FloatingBox from '../components/FloatingBox.vue'
import FrameClips from '../components/FrameClips.vue'
import FrameStrip, { type StripTile } from '../components/FrameStrip.vue'
import Icon from '../components/Icon.vue'
import PopMenu from '../components/PopMenu.vue'
import PutBackOffer from '../components/PutBackOffer.vue'
import SessionDrawer from '../components/SessionDrawer.vue'
import SessionPicture from '../components/SessionPicture.vue'
import SessionSettings from '../components/SessionSettings.vue'
import SessionStage from '../components/SessionStage.vue'
import { imageRatioOf } from '../components/sessionPictureRatio'
import ToggleSwitch from '../components/ToggleSwitch.vue'
import { usePutBack } from '../composables/usePutBack'
import { useDrawer } from '../composables/useDrawer'
import ModelComparison from '../components/ModelComparison.vue'
import { useImageModels, writtenPart } from '../composables/useSettingsOptions'
import Frame3dViewers from '../components/Frame3dViewers.vue'
import FrameViewer from '../components/FrameViewer.vue'
import { useJobs } from '../composables/useJobs'
import { useJobLink } from '../composables/useJobLink'
import { sessionPath } from '../sessionPath'
import { usePictureEditing } from '../composables/usePictureEditing'
import { jobForming, sweepOf } from '../jobs'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useSessionScreen } from '../composables/useSessionScreen'
import { diffWords } from '../diff'
import {
  type Activity,
  changedSinceRender,
  deleteChainFrame,
  saveChainPrompt,
  imageUrl,
  pickedEdit,
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
/** The drawer beside the story: the shown Frame's Image Prompt, its changes marked. */
const { tab: drawer, toggle: toggleDrawer } = useDrawer<'prompt'>('chain-drawer', 'prompt')

/** Viewing preferences, remembered per browser. */
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
/** What a Frame is called in a sentence: the Opening, or its number (`frameName`). */
const frameProse = (index: number) => (index === 0 ? 'the Opening' : frameName(index))
/** Its title, in the Frames list's places and the viewers' labels: "Frame 1 · Opening". */
const frameTitle = (index: number) => (index === 0 ? `${frameName(0)} · Opening` : frameName(index))


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

const { jobs, jobsFor, hasJob, workOn, workOf, dropEach, queue, queueEdit, queueClip, queueAll, dropJob, retry, refreshJobs } = useJobs(props.id, {
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

/** The Frames as the strip shows them: each picture, or its Action, and the work on it. */
const tiles = computed<StripTile[]>(() =>
  (session.value?.frames ?? []).map((f) => ({
    index: f.index,
    thumb: pictureOf(f) ? imageUrl(props.id, pictureOf(f)!.image) : null,
    words: f.action ?? 'Opening',
    working: workOn(f.index),
    dimmed: !!pictureOf(f) && changedSinceRender(pictureOf(f)!, session.value!.settings.imageModel),
    clips: clipCount(pictureOf(f), session.value!.settings.imageModel),
  }))
)
/** The picture shown is by the Chain's Image Model, so it can have clips. */
const ownPicture = computed(() =>
  !!picture.value && picture.value.imageModel === session.value?.settings.imageModel
)
/** How many clips the Clip menu says the picture has, or null for no Clip menu. */
const clipsMenu = computed(() =>
  picture.value && featureOn.value('video')
    ? (pickedEdit(picture.value) ?? picture.value).clips?.length ?? 0
    : null
)

// --- Looking closer: the picture viewer, and 3D by model (experimental; PictureButtons).

/** The Frame whose picture is open in the viewer, if any. */
const viewingPicture = ref<number | null>(null)
/** Editing its picture there (ADR 0021): painting an edit, or watching one being made. */
/** A queued job's Frame, from the Queue tab or a link to it. */
function goToJobFrame(index: number) {
  pick(index)
}
/** A clip's Frame, at its Clip section on the picture it's made from. */
async function openClip(job: Job) {
  await onClipsModel(job, (m) => (frameError.value = m))
  pick(job.frameIndex)
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

/** How the shown picture's edge sweeps: while a job renders it, slower while that waits its turn. */
const sweep = computed(() =>
  renderingPhase.value === 'queued' ? 'queued' : renderingPhase.value ? 'running' : null
)

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
  <div class="flex min-h-0 min-w-0 flex-col">
    <p v-if="loadError" class="p-6 text-danger">Could not load this Session: {{ loadError }}</p>

    <template v-else-if="session">
      <SessionBar kind="Chain" :title="session.title ?? ''" :status="busy ? phaseLabel : undefined">
        <!-- Until the All Frames view takes it (stage 4 of the screens plan). -->
        <span v-if="featureOn('images')" class="max-md:hidden"><ModelComparison
          :session-id="session.id"
          :frames="session.frames"
          :image-model="session.settings.imageModel"
          :thumbnail="session.thumbnail"
          :name="frameTitle"
          :caption="(f) => f.narration"
          @changed="load(); refreshJobs()"
        /></span>
        <SessionSettings
          :session="session"
          title="This Chain"
          @switched="onSwitched"
          @failed="(message) => (frameError = message)"
        >
          <ToggleSwitch v-if="featureOn('images')" v-model="renderFrames" title="Render each Frame" data-render-frames>
            Off: each Action writes only the new prompt, and you render the Frames you want
          </ToggleSwitch>
        </SessionSettings>
      </SessionBar>

      <FrameStrip
        v-if="session.frames.length || busy"
        :tiles="tiles"
        :picked="onPending ? null : shown?.index ?? null"
        @pick="pick"
      >
        <template #end>
          <!-- The Frame in progress, in its place at the end: picked to show it again. -->
          <button
            v-if="busy"
            type="button"
            class="grid h-12 w-20 shrink-0 place-items-center rounded border border-dashed border-line text-muted render-sweep [@media(max-height:640px)]:h-6 [@media(max-height:640px)]:w-9"
            :class="{ 'ring-2 ring-fg ring-offset-1 ring-offset-canvas': onPending }"
            :title="`${frameName(pendingIndex)}: ${phaseLabel}`"
            :aria-current="onPending"
            data-pending-frame
            @click="viewing = null"
          ><Icon name="spinner" class="animate-spin" /></button>
        </template>
      </FrameStrip>

      <div class="flex min-h-0 flex-1">
        <SessionStage :ratio="imageRatioOf(session)" :pictured="featureOn('images') || !!picture">
          <template #picture>
            <SessionPicture
              :name="shown ? frameName(shown.index) : frameName(pendingIndex)"
              :label="shown ? `${frameName(shown.index)} of ${(busy ? pendingIndex : latest!.index) + 1}${pictureChanged ? ` · changed since render ${byOf(picture!)}` : ''}` : undefined"
              :src="picture ? imageUrl(session.id, picture.upscaled ?? picture.image) : null"
              :picture="picture"
              :dimmed="pictureChanged"
              :preview="forming"
              :sweep="sweep"
              :jobs="shown ? jobsFor(shown.index) : []"
              :has-job="(kind) => !!shown && hasJob(shown.index, kind)"
              :working="shown ? workOf(shown.index) : undefined"
              :can-render="!!shown"
              :clips="clipsMenu"
              :playing="playingClip && playingClip.index === shown?.index ? { src: imageUrl(session.id, playingClip.clip.file), clip: playingClip.clip } : null"
              @queue="(kind) => queue(kind, shown!.index)"
              @view="(kind) => (open3d = { index: shown!.index, kind })"
              @edit="startEdit(shown!.index)"
              @open="viewingPicture = shown!.index"
              @prompt="toggleDrawer('prompt')"
              @retry="retry"
              @drop="dropJob"
              @cancel-all="(list) => dropEach(list)"
              @stop-clip="playingClip = null"
            >
              <template #clip>
                <p v-if="!ownPicture" class="text-xs text-muted" data-clips-other-model>
                  Clips are made of a picture by the Chain's Image Model: render this Frame with it first.
                </p>
                <FrameClips
                  v-else-if="shown && picture"
                  :session-id="session.id"
                  :index="shown.index"
                  :clips="(pickedEdit(picture) ?? picture).clips"
                  :next-pictured="!!session.frames[shown.index + 1] && !!pictureOf(session.frames[shown.index + 1])"
                  :next-name="frameName(shown.index + 1)"
                  :making="clipsMaking(jobsFor(shown.index), picture.imageModel)"
                  :playing="playingClip?.index === shown.index ? playingClip.clip.file : undefined"
                  @make="(order) => queueClip(shown!.index, order)"
                  @play="(clip) => (playingClip = { index: shown!.index, clip })"
                  @stop="playingClip = null"
                />
              </template>
              <template #empty>
                <span class="text-muted" data-empty>
                  <template v-if="onPending">{{ phaseLabel }}</template>
                  <template v-else-if="shown && workOn(shown.index)">{{ frameName(shown.index) }} is being rendered</template>
                  <template v-else-if="shown">{{ frameName(shown.index) }} isn't rendered</template>
                  <template v-else>No picture yet</template>
                </span>
                <button
                  v-if="shown && !workOn(shown.index) && featureOn('images')"
                  type="button"
                  class="rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas"
                  data-render-it
                  @click="queue('render', shown.index)"
                >
                  Render it
                </button>
              </template>
              <template #overlay>
                <button
                  v-if="viewingOlder"
                  type="button"
                  class="shrink-0 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white backdrop-blur-sm hover:bg-black/75"
                  :title="`Back to ${busy ? 'the Frame in progress' : `the latest, ${frameName(latest!.index)}`}`"
                  data-viewing
                  @click="viewing = null"
                >
                  Back to the latest
                </button>
              </template>
            </SessionPicture>
          </template>

          <!-- Beside the picture: the Action that made it, and what it changed. -->
          <template #side>
            <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2" data-chain-side>
              <template v-if="onPending">
                <section>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Action</h3>
                  <p class="mt-1 text-lg font-medium" data-pending-action>{{ pendingAction }}</p>
                </section>
                <p class="animate-pulse text-sm text-muted">{{ phaseLabel }}</p>
                <section v-if="liveThinking" data-thinking>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Thinking</h3>
                  <p
                    ref="thinkingBox"
                    class="mt-1 max-h-[50dvh] overflow-y-auto whitespace-pre-line text-xs italic leading-relaxed text-muted"
                  >{{ liveThinking }}</p>
                </section>
              </template>
              <template v-else-if="shown">
                <section>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Action</h3>
                  <p class="mt-1 text-lg font-medium" data-action>{{ shown.action ?? 'Opening' }}</p>
                </section>
                <section v-if="captionText">
                  <h3 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    What changed
                    <span
                      v-if="captionOutcome && OUTCOME_LABELS[captionOutcome]"
                      class="rounded-full px-2 py-0.5 normal-case tracking-normal"
                      :class="captionOutcome === 'declined' ? 'bg-warn/15 text-warn' : 'bg-info/15 text-info'"
                      data-outcome
                    >{{ OUTCOME_LABELS[captionOutcome] }}</span>
                  </h3>
                  <p
                    class="mt-1 whitespace-pre-line text-sm leading-relaxed"
                    :class="{ 'text-warn': captionOutcome === 'declined', 'text-info': captionOutcome === 'unclear' }"
                    data-caption
                  >{{ captionText }}</p>
                </section>
                <button
                  type="button"
                  class="w-fit text-sm text-muted underline underline-offset-2 hover:text-fg"
                  data-see-changes
                  @click="drawer = 'prompt'"
                >
                  {{ shown.index > 0 ? "See the prompt's changes" : 'See the prompt' }}
                </button>
              </template>
            </div>
          </template>

          <template #box>
            <FloatingBox
              v-model="draft"
              :placeholder="viewingOlder
                ? `Viewing ${frameProse(shown!.index)}: go back to the latest to change it`
                : 'What to change…'"
              :disabled="viewingOlder"
              :busy="busy"
              :cancelling="pending?.cancelling"
              :working="writing"
              :data-writing="writing ? '' : undefined"
              @send="submit"
              @cancel="cancel"
            >
              <template #notice>
                <PutBackOffer
                  v-if="offered && !frameError && !notice"
                  :offered="offered"
                  @use="usePutBackText"
                  @dismiss="dismissPutBack"
                />
                <p
                  v-else-if="frameError || notice"
                  class="truncate px-2 text-sm"
                  :class="frameError ? 'text-danger' : notice?.kind === 'declined' ? 'text-warn' : 'text-info'"
                  :title="frameError || notice?.text"
                  role="alert"
                  data-frame-notice
                >
                  {{ frameError || notice?.text }}
                </p>
              </template>
              <template v-if="!busy">
                <button
                  type="button"
                  class="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-canvas hover:text-fg disabled:opacity-50"
                  :disabled="!canUndo || undoing"
                  :title="viewingOlder
                    ? `Undo every Frame after ${frameProse(shown!.index)}, back to it, and put the next Action back in the box`
                    : 'Undo the latest Frame and put its Action back in the box'"
                  :aria-label="viewingOlder ? `Undo to ${frameName(shown!.index)}` : 'Undo'"
                  data-undo-main
                  @click="undo(undoFrom!, viewingOlder)"
                >
                  <Icon name="undo" /><span v-if="viewingOlder" class="max-sm:hidden">to {{ frameName(shown!.index) }}</span>
                </button>
                <PopMenu v-if="session.frames.length" align="end" side="above" panel-class="w-72 p-1 text-sm" data-more-menu>
                  <template #button="{ open, toggle }">
                    <button
                      type="button"
                      class="rounded-lg px-2 py-1.5 hover:bg-canvas hover:text-fg"
                      :class="{ 'bg-canvas text-fg': open }"
                      title="More"
                      aria-label="More"
                      data-more
                      @click="toggle"
                    >
                      <Icon name="dots" />
                    </button>
                  </template>
                  <template #default="{ close }">
                    <button
                      v-if="featureOn('images')"
                      type="button"
                      class="menu-row"
                      :disabled="!toRender.length"
                      title="Queue a render of every Frame not rendered yet by this Image Model"
                      data-render-all
                      @click="queueAll('render', toRender.map((f) => f.index)); close()"
                    >
                      Render all<span v-if="toRender.length" class="ml-auto text-muted tabular-nums" data-render-count>{{ toRender.length }}</span>
                    </button>
                    <!-- Between the Opening and the latest, which has Undo. -->
                    <button
                      v-if="viewingOlder && shown!.index > 0"
                      type="button"
                      class="menu-row text-danger"
                      :disabled="deleting"
                      :title="`Delete ${frameName(shown!.index)} and its pictures; the Frames after it are numbered down`"
                      data-delete-frame
                      @click="deleteFrame(shown!); close()"
                    >
                      Delete {{ frameName(shown!.index) }}
                    </button>
                  </template>
                </PopMenu>
              </template>
            </FloatingBox>
          </template>
        </SessionStage>

        <SessionDrawer
          v-model="drawer"
          :tabs="[{ id: 'prompt', label: promptIndex !== undefined ? `${frameName(promptIndex)}'s prompt` : 'Prompt' }]"
        >
          <template #prompt>
            <div class="p-4 text-sm" data-prompt-panel>
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
            </div>
          </template>
        </SessionDrawer>
      </div>
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
