/** A Session's picture shape until one has loaded: its image size from Settings, else 3:2. */
export const imageRatioOf = (
  session: { imageSize?: { width: number; height: number } } | null | undefined,
) => session?.imageSize ? session.imageSize.width / session.imageSize.height : 1.5
