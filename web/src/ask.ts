import { useConfirmDialog } from '@vueuse/core'
import { shallowRef } from 'vue'

export interface Question {
  message: string
  /** The button that agrees, saying what it does ("Delete"), not "OK". */
  action: string
  /** Agreeing loses something: the button is red, and the focus starts on Cancel. */
  danger?: boolean
}

/** One question at a time for the whole app, shown by `ConfirmDialog`, which `App` mounts once. */
export const question = shallowRef<Question | null>(null)
export const { isRevealed: asking, confirm: agree, cancel: decline, reveal } = useConfirmDialog()

/**
 * Asks the player before doing something, in place of the browser's `confirm()`, and answers
 * whether they agreed. Unlike `confirm()`, the page goes on running while it waits.
 */
export async function ask(message: string, options: Omit<Question, 'message'>): Promise<boolean> {
  // A question still open is declined, so whoever asked it isn't left waiting.
  if (asking.value) decline()
  question.value = { message, ...options }
  return !(await reveal()).isCanceled
}
