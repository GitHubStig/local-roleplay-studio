import { useDocumentVisibility, useWebNotification } from '@vueuse/core'
import { useCurrentSession } from './useCurrentSession'
import { useStoredFlag } from './useStoredFlag'

/** Whether to notify when a Session's queue is done (Settings), remembered per browser. */
export const useNotifyWhenDone = () => useStoredFlag('notify-when-done')

/**
 * A system notification when Session `sessionId`'s queue has all finished while the app's tab is
 * hidden, if the player turned it on in Settings (which asks the browser's permission). It's titled
 * with the Session's title (the app's name if that's unknown). Clicking it brings the tab back; it
 * closes by itself once the tab is seen.
 */
export function useDoneNotice(sessionId: string) {
  const on = useNotifyWhenDone()
  const visibility = useDocumentVisibility()
  const { currentSessionId, currentSessionTitle } = useCurrentSession()
  const { show, onClick } = useWebNotification({
    requestPermissions: false,
    title: 'Local Roleplay Studio',
    tag: 'queue-done',
  })
  onClick(() => window.focus())

  /** The queue has just finished, `failed` of its jobs failing. */
  return (failed: number) => {
    if (!on.value || visibility.value !== 'hidden') return
    const title = currentSessionId.value === sessionId ? currentSessionTitle.value : ''
    void show({
      ...(title ? { title } : {}),
      body: failed ? `The queue is done, ${failed} failed.` : 'The queue is done.',
    })
  }
}
