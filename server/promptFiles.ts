import { stringify } from '@std/yaml'

/**
 * Prompts live as Markdown files in `server/prompts/`, so they can be read and edited as the
 * model sees them. A file is read fresh on every call (edits apply without a restart), and:
 *
 * - `<!-- … -->` comments are notes for whoever edits the file; they're removed.
 * - `{{name}}` or `{{name.field}}` is replaced with a value: text as is, a number as digits, and
 *   an object or array as a YAML block.
 *
 * A placeholder with no value is an error, so a typo never reaches the model.
 */
const ROOT = new URL('./prompts/', import.meta.url)

export type PromptValues = Record<string, unknown>

export class PromptError extends Error {}

function lookup(values: PromptValues, path: string): unknown {
  let value: unknown = values
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || !(key in value)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return stringify(value as Record<string, unknown>, { lineWidth: 100 }).trim()
}

/** Reads `name` (e.g. `roleplay/character`, without `.md`) and fills in its placeholders. */
export async function loadPrompt(name: string, values: PromptValues = {}): Promise<string> {
  const text = await Deno.readTextFile(new URL(`${name}.md`, ROOT))
  return fill(name, text, values)
}

function fill(name: string, text: string, values: PromptValues): string {
  const withoutNotes = text.replace(/<!--[\s\S]*?-->/g, '')
  const parts: string[] = []
  let last = 0
  for (const match of withoutNotes.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    parts.push(withoutNotes.slice(last, match.index))
    last = match.index + match[0].length
    const key = match[1]
    const value = lookup(values, key)
    if (value === undefined || value === null) {
      throw new PromptError(`Prompt ${name}: nothing to fill in {{${key}}}`)
    }
    parts.push(asText(value))
  }
  parts.push(withoutNotes.slice(last))
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}
