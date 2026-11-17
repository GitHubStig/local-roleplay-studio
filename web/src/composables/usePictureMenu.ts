import { computed, inject, type InjectionKey, provide, ref } from 'vue'
import { type JobKind, type PicturedFrame, shownPicture } from '../api'
import { contextMenus, type MenuAt } from '../contextMenu'

/** What a Session's screen lets its picture menu do, and what it reads. */
export interface PictureMenuSession {
  sessionId: string
  frames: readonly PicturedFrame[]
  imageModel: string
  thumbnail?: string
  hasJob: (index: number, kind: JobKind) => boolean
  /** Frame `index` can be rendered now. */
  canRender: (index: number) => boolean
  /** Why nothing can be queued for now. */
  busy?: string
  queue: (kind: JobKind, index: number) => void
  /** Open Frame `index`'s picture to paint an edit. */
  edit: (index: number) => void
  /** Open Frame `index`'s picture in the viewer. */
  look: (index: number) => void
  /** The Session changed here (its thumbnail). */
  changed: () => void
}

/** The picture a menu is open on: its Frame, the version's image file, and where it opened. */
export interface PictureMenuTarget {
  index: number
  image: string
  at: MenuAt
}

export type PictureMenu = ReturnType<typeof providePictureMenu>
const KEY: InjectionKey<PictureMenu> = Symbol('picture menu')

/**
 * A Session screen's menu for a picture, opened by right-clicking it (or a long press) wherever it
 * shows: the stage, the strip, All Frames and Compare. The screen provides it, with what it can do,
 * and shows it (`PictureMenu`); what shows a picture opens it through `usePictureMenu`.
 */
export function providePictureMenu(session: () => PictureMenuSession | null) {
  const target = ref<PictureMenuTarget | null>(null)
  const listeners = contextMenus()
  const menu = {
    session: computed(session),
    target,
    /** Opens it on Frame `index`'s picture: `image`, a version of one of its pictures, or else the one it shows. */
    open(at: MenuAt, index: number, image?: string) {
      const s = session()
      const frame = s?.frames.find((f) => f.index === index)
      const file = image ?? (frame && shownPicture(frame, s!.imageModel)?.image)
      target.value = file ? { index, image: file, at } : null
    },
    close: () => (target.value = null),
    /** The listeners that open it on Frame `index`'s picture (`contextMenus`). */
    on: (index: number, image?: string) => listeners((at) => menu.open(at, index, image)),
  }
  provide(KEY, menu)
  return menu
}

/** The screen's picture menu, if there is one (there isn't on the exported page, or in a test). */
export const usePictureMenu = () => inject(KEY, null)
