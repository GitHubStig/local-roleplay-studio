import { useEventListener } from '@vueuse/core'
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  type Ref,
  ref,
} from 'vue'
import { useRouter } from 'vue-router'
import {
  ApiError,
  cancelFrame,
  changedSinceRender,
  getSession,
  type PicturedFrame,
  type Session,
  type SessionKind,
  shownPicture,
} from '../api'
import { sessionPath } from '../sessionPath'
import { clearCurrentSession, setCurrentSession } from './useCurrentSession'
import { useStoredText } from './useStoredText'

/** What a screen's own work in progress has, whatever else it tracks. */
export interface ScreenWork {
  /** Started elsewhere (before a reload, in another tab); followed by polling the Session. */
  detached?: boolean
  cancelling?: boolean
}

/**
 * What every Session screen does the same way: loading its Session (sending it to its own kind's
 * screen, or Home if it's gone), starting on first open, catching up when it's shown again (it's
 * kept alive in the background), following work started elsewhere, Cancel, and the warning before
 * a reload drops work it's running. `work` is the screen's own work in progress: what it holds
 * while running is up to the screen.
 */
export function useSessionScreen<K extends SessionKind, W extends ScreenWork>(
  id: string,
  kind: K,
  opts: {
    work: Ref<W | null>
    /** What the screen starts on first open, with nothing running: the opening, the plan, the Cast. */
    begin: (session: Extract<Session, { kind: K }>) => Promise<void> | void
    /**
     * The work to show for work running elsewhere, from the Session as loaded: `followed` is what
     * was shown at the last poll, null at the first.
     */
    following: (session: Extract<Session, { kind: K }>, followed: W | null) => W
    /** Called when the work followed has ended. */
    onFollowed?: () => void
    /** Loads the Session's jobs, on first open and each time it's shown again. */
    refreshJobs?: () => void
  },
) {
  type S = Extract<Session, { kind: K }>
  const router = useRouter()
  const session = ref<S | null>(null) as Ref<S | null>
  const loadError = ref('')
  /** The unsent message or Action, remembered per Session so it survives a reload. */
  const draft = useStoredText(`draft:${id}`)
  const { work } = opts
  const busy = computed(() => work.value !== null)

  // A kept-alive screen keeps running in the background; it must only navigate while on screen.
  let onScreen = true
  /** Where to go once back on screen, if the Session went away while in the background. */
  let leaveOnReturn: { path: string; query: Record<string, string> } | null = null

  function leave(query: Record<string, string> = {}) {
    clearCurrentSession(id)
    draft.value = ''
    if (onScreen) router.replace({ path: '/', query })
    else leaveOnReturn = { path: '/', query }
  }

  /** Loads the Session; false if it couldn't be (gone: the player is sent Home). */
  async function load(): Promise<boolean> {
    try {
      const loaded = await getSession(id)
      // Each kind has its own screen.
      if (loaded.kind !== kind) {
        router.replace(sessionPath(id, loaded.kind))
        return false
      }
      session.value = loaded as S
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        leave()
        return false
      }
      loadError.value = (err as Error).message
      return false
    }
    loadError.value = ''
    // Current Session leads back to the Session opened last.
    setCurrentSession(id, kind, session.value?.title)
    return true
  }

  let started = false
  let starting = false
  /** First successful load: follow work already running, or begin. */
  async function start() {
    if (started || starting) return
    starting = true
    try {
      if (!(await load())) return
      started = true
    } finally {
      starting = false
    }
    opts.refreshJobs?.()
    if (session.value!.activity) follow()
    else await opts.begin(session.value!)
  }
  onMounted(start)

  // Coming back to a kept-alive Session: pick up changes made elsewhere (another tab, a delete
  // from Home), unless work is running here. Retries if the first load failed. Vue also calls
  // this right after the first mount, which `start` already covers.
  let firstActivation = true
  onActivated(async () => {
    onScreen = true
    if (firstActivation) return (firstActivation = false)
    if (leaveOnReturn) return router.replace(leaveOnReturn)
    if (!started) return start()
    opts.refreshJobs?.()
    if (!busy.value && (await load()) && session.value!.activity) follow()
  })
  onDeactivated(() => (onScreen = false))

  // --- Work this screen didn't start (page reloaded, another tab): show it and allow Cancel.
  let followTimer: ReturnType<typeof setTimeout> | undefined
  function follow() {
    work.value = opts.following(session.value!, null)
    const poll = async () => {
      if (!(await load())) return (work.value = null)
      if (session.value!.activity) {
        work.value = opts.following(session.value!, work.value)
        followTimer = setTimeout(poll, 1500)
      } else {
        work.value = null
        opts.onFollowed?.()
      }
    }
    followTimer = setTimeout(poll, 1500)
  }
  onBeforeUnmount(() => clearTimeout(followTimer))

  async function cancel() {
    if (work.value) work.value = { ...work.value, cancelling: true }
    await cancelFrame(id)
  }

  // Reloading, closing the tab or leaving the site drops this page's connection to running work,
  // which cancels it; the browser asks first ("Leave site?"). It can't show our own wording. Work
  // this page is only following (started elsewhere) isn't affected, so no warning for that.
  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (busy.value && !work.value?.detached) {
      e.preventDefault()
      e.returnValue = '' // older browsers need this as well
    }
  })

  /** The Session switched Image Model: it comes back without what only a load adds. */
  function onImageModel(switched: S) {
    session.value = { ...session.value!, ...switched }
  }
  /** The picture a Frame shows, by the Session's Image Model if it has one. */
  const pictureOf = (frame: PicturedFrame) =>
    shownPicture(frame, session.value!.settings.imageModel)
  /** A Frame's picture is changed since render: its prompt changed, or it's by another model. */
  const changed = (frame: PicturedFrame) => {
    const picture = pictureOf(frame)
    return !!picture && changedSinceRender(picture, session.value!.settings.imageModel)
  }

  return { session, loadError, draft, busy, load, leave, cancel, onImageModel, pictureOf, changed }
}
