import { useDocumentVisibility, useWebNotification } from '@vueuse/core'
import { useCurrentSession } from './useCurrentSession'
import { useStoredFlag } from './useStoredFlag'

/** Whether to notify when a Session's queue is done (Settings), remembered per browser. */
export const useNotifyWhenDone = () => useStoredFlag('notify-when-done')

/**
 * A system notification when a Session's queue has all finished while the app's tab is hidden, if
 * the player turned it on in Settings (which asks the browser's permission): from the Session's
 * screen (`useJobs`) or the Queue page, whichever is open. It's titled with the Session's title
 * (the app's name if that's unknown). Clicking it brings the tab back; it closes by itself once
 * the tab is seen.
 */
export function useDoneNotice() {
  const on = useNotifyWhenDone()
  const visibility = useDocumentVisibility()
  const { currentSessionId, currentSessionTitle } = useCurrentSession()
  const { show, onClick } = useWebNotification({
    requestPermissions: false,
    title: 'Local Roleplay Studio',
    tag: 'queue-done',
  })
  onClick(() => globalThis.focus())

  /**
   * Session `sessionId`'s queue has just finished, `failed` of its jobs failing; `title` is its
   * title, if known (else the current Session's, if it's that one).
   */
  return (sessionId: string, failed: number, title?: string) => {
    if (!on.value || visibility.value !== 'hidden') return
    title ||= currentSessionId.value === sessionId ? currentSessionTitle.value : ''
    void show({
      ...(title ? { title } : {}),
      body: failed ? `The queue is done, ${failed} failed.` : 'The queue is done.',
    })
  }
}
