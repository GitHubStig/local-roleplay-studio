import { tryOnScopeDispose } from '@vueuse/core'
import { ref, watch } from 'vue'

export interface Preview {
  src: string
  opacity: number
}

/**
 * The picture forming as it's shown over an image (`formingOf`): each preview replaces the last
 * only once it has loaded, and one that fails (none yet, or Settings hide them) keeps the last.
 * When the render ends it stays until the image under it changes (`imageSrc`: the new picture is
 * in), or for `holdMs` if none comes (a Cancel, a failure), so the old picture never flashes back
 * in between.
 */
export function useShownPreview(
  preview: () => Preview | null | undefined,
  imageSrc: () => string | null | undefined,
  holdMs = 1500,
) {
  const shown = ref<Preview | null>(null)
  let done: ReturnType<typeof setTimeout> | undefined
  watch(preview, (next) => {
    clearTimeout(done)
    if (!next) {
      if (shown.value) done = setTimeout(() => (shown.value = null), holdMs)
      return
    }
    const img = new Image()
    img.onload = () => {
      if (preview()?.src === next.src) shown.value = { ...next }
    }
    img.src = next.src
  }, { immediate: true })
  watch(imageSrc, () => {
    if (!preview()) shown.value = null
  })
  tryOnScopeDispose(() => clearTimeout(done))
  return shown
}
