/** How a spoken line is directed. Shared by the server and the web app: types and plain values only. */

/** How a line is delivered, beyond its words: a pace, and a sound just before it. */
export interface Delivery {
  pace: 'normal' | 'slow' | 'fast'
  sound: 'none' | 'sigh' | 'laughter' | 'cough'
}
