import { useEventListener, useIntervalFn } from '@vueuse/core'
import { computed, onActivated, onDeactivated, onScopeDispose, type Ref, ref, watch } from 'vue'
import { useStoredFlag } from '../composables/useStoredFlag'
import { useStoredString } from '../composables/storage'
import { imageUrl } from '../api'
import type { Cue, RoleplayFrame, RoleplaySession } from './api'
import { MusicEngine, type MusicPosition } from './musicEngine'

/** How many decoded tracks are kept: a minute of music is about 20 MB once decoded. */
const KEPT = 3

/**
 * What should be playing at `frame`: its Cue's track, or silence (null) for a silence; or undefined
 * when that can't be said yet, so what's playing plays on: a Frame not directed, or a track not made.
 */
export function musicAt(
  session: Pick<RoleplaySession, 'cues'> | null | undefined,
  frame: Pick<RoleplayFrame, 'music'> | null | undefined,
): { file: string | null; entry: Cue['entry'] } | undefined {
  const cue = frame?.music && session?.cues?.find((c) => c.id === frame.music!.cue)
  if (!cue) return undefined
  if (!cue.values) return { file: null, entry: cue.entry }
  return cue.track ? { file: cue.track.file, entry: cue.entry } : undefined
}

/**
 * The Roleplay's music, for the whole page, so a dialog or a tab doesn't touch it: whether it plays and
 * how loud are remembered per browser. It follows `frame`, the one in view: within one Cue nothing
 * happens; another Cue crossfades. It lowers while `speaking`, pauses while a video with sound is open, and fades when the page is left, as the
 * app keeps a Roleplay's page alive behind others (and a second Roleplay would play over it). A browser lets sound start only after
 * the player has touched the page, so music left on starts at the first touch.
 */
export function useMusicPlayer(opts: {
  sessionId: string
  session: Ref<RoleplaySession | null | undefined>
  frame: Ref<RoleplayFrame | null | undefined>
  speaking: Ref<boolean>
}) {
  const on = useStoredFlag('roleplay-music-playing')
  const storedVolume = useStoredString('roleplay-music-volume')
  const volume = computed({
    get: () => Number(storedVolume.value ?? 0.6),
    set: (v: number) => (storedVolume.value = String(v)),
  })
  const target = computed(() => musicAt(opts.session.value, opts.frame.value))

  let ctx: AudioContext | undefined
  let engine: MusicEngine | undefined
  const tracks = new Map<string, Promise<AudioBuffer>>()

  function load(file: string): Promise<AudioBuffer> {
    const kept = tracks.get(file)
    if (kept) {
      tracks.delete(file)
      tracks.set(file, kept)
      return kept
    }
    const decoding = fetch(imageUrl(opts.sessionId, file))
      .then((res) => res.arrayBuffer())
      .then((bytes) => ctx!.decodeAudioData(bytes))
    decoding.catch(() => tracks.delete(file))
    tracks.set(file, decoding)
    for (const old of [...tracks.keys()].slice(0, -KEPT)) tracks.delete(old)
    return decoding
  }

  /** The page is behind another: the music waits to come back. */
  let away = false
  /**
   * The videos that have played and are still on the page. One paused or at its last frame may be
   * played again, so the music waits until it's closed (the owner).
   */
  const videos = new Set<HTMLVideoElement>()
  const hushed = ref(false)
  function checkVideos() {
    // A video taken off the page says nothing where it can be heard, so each is asked.
    for (const v of videos) if (!v.isConnected) videos.delete(v)
    // One with its sound off leaves the music be: comparing clips mutes all but the one heard.
    hushed.value = [...videos].some((v) => !v.muted && v.volume > 0)
  }
  // Their events don't bubble, but can be caught on the way down.
  function videoEvent(e: Event) {
    if (!(e.target instanceof HTMLVideoElement)) return
    if (e.type === 'playing') videos.add(e.target)
    checkVideos()
  }
  for (const type of ['playing', 'volumechange']) {
    useEventListener(document, type, videoEvent, { capture: true })
  }
  watch(hushed, (now) => engine?.setHushed(now))

  function follow() {
    if (!on.value || away) return
    ctx ??= new AudioContext()
    if (!engine) {
      engine = new MusicEngine(ctx, load)
      engine.setVolume(volume.value)
      engine.setDucked(opts.speaking.value)
      if (hushed.value) engine.setHushed(true)
    }
    if (ctx.state === 'suspended' && !hushed.value) ctx.resume()
    if (target.value) {
      engine.play(target.value.file, target.value.entry)?.catch((err) =>
        console.warn(`Couldn't play the music: ${err.message}`)
      )
    }
  }

  watch([on, () => target.value?.file], () => {
    if (on.value) follow()
    else engine?.stop()
  }, { immediate: true })
  watch(volume, (v) => engine?.setVolume(v))
  watch(opts.speaking, (speaking) => engine?.setDucked(speaking))
  /** Where the track playing is, read a few times a second. */
  const position = ref<MusicPosition | null>(null)
  useIntervalFn(() => {
    checkVideos()
    position.value = on.value ? engine?.position ?? null : null
  }, 250)
  // Music left on, on a page just opened: sound may only start once the player has touched it.
  useEventListener(document, 'pointerdown', () => {
    if (on.value && ctx?.state === 'suspended' && !hushed.value) ctx.resume()
  })
  onDeactivated(() => {
    away = true
    engine?.leave()
  })
  onActivated(() => {
    away = false
    follow()
  })
  onScopeDispose(() => {
    engine?.stop()
    setTimeout(() => ctx?.close(), 200)
  })

  return { on, volume, target, position }
}
