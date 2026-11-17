import { hasVersion, type Picture, setThumbnail } from './api'

/**
 * Whether a picture is what shows its Session on Home: `chosen` by the player, `automatic` as the
 * newest picture until they choose, or neither. `home` is `homeImage`'s answer, `thumbnail` the
 * Session's own.
 */
export type Star = 'chosen' | 'automatic' | undefined
export const starOf = (picture: Picture, home: string | null, thumbnail?: string): Star =>
  home && hasVersion(picture, home) ? (home === thumbnail ? 'chosen' : 'automatic') : undefined

/** What a picture's star says, as a tooltip. */
export const STARS = {
  chosen: "This Session's thumbnail on Home, as you chose it: click to stop using it",
  automatic: "This Session's thumbnail on Home for now, as its newest picture: click to keep it",
  none: "Use it as this Session's thumbnail on Home",
}

/** What choosing it does, as a menu's row. */
export const STAR_ACTIONS = {
  chosen: "Stop using as Home's thumbnail",
  automatic: "Keep as Home's thumbnail",
  none: "Use as Home's thumbnail",
}

/** Chooses `image` (a picture's version) to show the Session on Home; on the one chosen, back to the newest. */
export const toggleThumbnail = (sessionId: string, image: string, star: Star) =>
  setThumbnail(sessionId, star === 'chosen' ? null : image)
