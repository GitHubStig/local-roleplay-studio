export interface JsonStreamHandlers {
  /** A value of the top-level object has finished: an object or array under `key`. */
  value?: (key: string, value: unknown) => void
  /** An object or array element inside the top-level array under `key` has finished. */
  element?: (key: string, index: number, value: unknown) => void
  /** A string value of the top-level object has finished, e.g. a Roleplay reply's field. */
  text?: (key: string, value: string) => void
}

/**
 * Reads a JSON object as it streams in, and reports each top-level container value, and each
 * container element of a top-level array, the moment it is complete. It lets a long reply (a
 * Storyboard's Look, Beats and Frames) be shown piece by piece while the Text Model still writes.
 * Containers are reported through `value`, top-level strings through `text`; numbers and other
 * plain values are left to the final parse.
 */
export class JsonStreamReader {
  #text = ''
  #pos = 0
  #inString = false
  #escaped = false
  #stringStart = -1
  /** The most recent string at the top level: the key of whatever opens next. */
  #lastKey = ''
  /** At the top level, between a key's colon and the next comma: a string here is a value. */
  #afterColon = false
  #stack: { open: '{' | '['; key: string; start: number }[] = []
  #counts = new Map<string, number>()
  #on: JsonStreamHandlers

  constructor(on: JsonStreamHandlers) {
    this.#on = on
  }

  feed(chunk: string): void {
    this.#text += chunk
    for (; this.#pos < this.#text.length; this.#pos++) {
      const c = this.#text[this.#pos]
      if (this.#inString) {
        if (this.#escaped) this.#escaped = false
        else if (c === '\\') this.#escaped = true
        else if (c === '"') {
          this.#inString = false
          if (this.#stack.length === 1) {
            const raw = this.#text.slice(this.#stringStart, this.#pos + 1)
            if (this.#afterColon) this.#on.text?.(this.#lastKey, JSON.parse(raw))
            else this.#lastKey = JSON.parse(raw)
          }
        }
        continue
      }
      if (c === '"') {
        this.#inString = true
        this.#stringStart = this.#pos
      } else if (this.#stack.length === 1 && (c === ':' || c === ',')) {
        this.#afterColon = c === ':'
      } else if (c === '{' || c === '[') {
        const key = this.#stack.length === 1 ? this.#lastKey : this.#stack.at(-1)?.key ?? ''
        this.#stack.push({ open: c, key, start: this.#pos })
      } else if (c === '}' || c === ']') {
        const closed = this.#stack.pop()
        if (!closed) continue
        const depth = this.#stack.length
        const parent = this.#stack.at(-1)
        const value = () => JSON.parse(this.#text.slice(closed.start, this.#pos + 1))
        if (depth === 1) {
          this.#on.value?.(closed.key, value())
        } else if (depth === 2 && parent?.open === '[') {
          const index = this.#counts.get(parent.key) ?? 0
          this.#counts.set(parent.key, index + 1)
          this.#on.element?.(parent.key, index, value())
        }
      }
    }
  }
}
