/**
 * What Frame `index` is called on every screen, the same in every kind of Session: numbered from 1,
 * so index 0 (a Chain's or a Roleplay's Opening) is Frame 1. As the server names it in its messages.
 */
export const frameName = (index: number) => `Frame ${index + 1}`
