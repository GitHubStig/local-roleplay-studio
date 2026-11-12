import type { InjectionKey, Ref } from 'vue'

/** The shape of the picture a Session's stage shows (`SessionStage` provides it, `SessionPicture` sets it). */
export const PICTURE_RATIO: InjectionKey<Ref<number>> = Symbol('picture ratio')
