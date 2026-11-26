import type { Ref } from 'vue'
import {
  type Backend,
  BACKEND_WORK,
  type EditModel,
  type Settings,
  type SettingsOptions,
  type Work,
} from '../api'

/**
 * Where each kind of work goes, as `settings` stand (ADR 0022), the way the server's `pickBackend`
 * works it out: for Settings' form as it's changed, and for any screen that needs to know where a
 * job would run (Start's menu, for the face pass).
 */
export function useWhereTo(settings: Ref<Settings | null>, options: Ref<SettingsOptions | null>) {
  /** Whether a Backend can do a kind of work at all: this machine only what it runs itself. */
  const does = (backend: Backend, work: Work) =>
    BACKEND_WORK[backend.kind].includes(work) &&
    (backend.kind !== 'here' || work === 'text' || !!options.value?.here[work]?.available)

  /**
   * Whether a Backend can do this job: a render where its kind of Backend has the Image Model, an
   * edit on its edit model's kind (Settings', unless `editModel` says another).
   */
  function can(backend: Backend, work: Work, editModel = settings.value?.editModel): boolean {
    if (!does(backend, work)) return false
    const kind = backend.kind === 'here' ? 'mflux' : 'comfyui'
    if (work === 'images') {
      return !!options.value?.imageModels[kind]?.some((m) => m.id === settings.value?.imageModel)
    }
    if (work === 'edits') {
      const model = options.value?.editModels.find((m) => m.id === editModel)
      return !model || model.backends.includes(kind)
    }
    return true
  }

  /**
   * Where a kind of work goes: the preferred Backend if it can, else the next listed that can; an
   * edit by Settings' edit model, unless `editModel` says another.
   */
  function whereTo(work: Work, editModel?: EditModel): Backend | undefined {
    if (!settings.value) return undefined
    const { backends, runOn } = settings.value
    return [
      ...backends.filter((b) => b.id === runOn[work]),
      ...backends.filter((b) => b.id !== runOn[work]),
    ].find((b) => can(b, work, editModel ?? settings.value?.editModel))
  }

  return { does, can, whereTo }
}
