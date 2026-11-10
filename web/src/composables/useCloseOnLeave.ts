import { onDeactivated, type Ref } from 'vue'

/**
 * Closes these modal dialogs when their screen is left while one is open (kept alive, it's taken
 * out of the page). A dialog taken out of the page stops being modal but stays open, so on coming
 * back it would sit inline over the screen, with no backdrop. Each dialog's `close` event follows,
 * so its own handler tidies up as for any close.
 */
export function useCloseOnLeave(...dialogs: Readonly<Ref<HTMLDialogElement | null>>[]) {
  onDeactivated(() => {
    for (const dialog of dialogs) if (dialog.value?.open) dialog.value.close()
  })
}
