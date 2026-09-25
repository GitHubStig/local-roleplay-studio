import { extract } from '@std/front-matter/yaml'
import { basename, extname, fromFileUrl, join } from '@std/path'

/** A Scenario file, parsed. See `scenarios/*.md`. */
export interface Scenario {
  /** File name without extension, e.g. `photoshoot`. */
  id: string
  title: string
  description: string
  /** Facts for the Text Model (who, where, the look), given to it verbatim; may be empty. */
  setup: Record<string, unknown>
  /** Standing instructions for the Text Model on every Frame. */
  systemPrompt: string
  /** How to write the opening Scene on the Opening Frame. */
  openingPrompt: string
}

export interface ScenarioSummary {
  id: string
  title: string
  description: string
}

export interface ScenarioLoadError {
  file: string
  message: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Splits a Markdown body into its `## Heading` sections, keyed by lower-cased heading. */
function sections(body: string): Map<string, string> {
  const result = new Map<string, string>()
  let current: string | undefined
  let lines: string[] = []
  const flush = () => {
    if (current !== undefined) result.set(current, lines.join('\n').trim())
  }
  for (const line of body.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      flush()
      current = heading[1].toLowerCase()
      lines = []
    } else {
      lines.push(line)
    }
  }
  flush()
  return result
}

/** Parses a Scenario file's text; throws an Error listing every problem found. */
export function parseScenario(id: string, text: string): Scenario {
  let attrs: unknown
  let body: string
  try {
    ;({ attrs, body } = extract(text))
  } catch (err) {
    throw new Error(`frontmatter: ${(err as Error).message}`)
  }
  if (!isRecord(attrs)) throw new Error('frontmatter must be a YAML mapping')

  const issues: string[] = []
  const str = (key: string) => {
    const v = attrs[key]
    if (typeof v !== 'string' || v.trim() === '') issues.push(`${key} must be a non-empty string`)
    return typeof v === 'string' ? v.trim() : ''
  }
  const title = str('title')
  const description = str('description')

  const setup = attrs.setup ?? {}
  if (!isRecord(setup)) issues.push('setup must be a mapping')

  const parts = sections(body)
  const systemPrompt = parts.get('system') ?? ''
  const openingPrompt = parts.get('opening') ?? ''
  if (!openingPrompt) issues.push('body needs a non-empty "## Opening" section')

  if (issues.length > 0) throw new Error(issues.join('; '))
  return {
    id,
    title,
    description,
    setup: setup as Record<string, unknown>,
    systemPrompt,
    openingPrompt,
  }
}

export interface ScenarioLibrary {
  /** Every valid Scenario, plus a report of the files that failed to parse. */
  list(): Promise<{ scenarios: Scenario[]; errors: ScenarioLoadError[] }>
  get(id: string): Promise<Scenario | undefined>
}

/** Reads Scenarios fresh from `dir` on every call, so edits apply without a restart. */
export function dirScenarioLibrary(dir: string | URL): ScenarioLibrary {
  const root = dir instanceof URL ? fromFileUrl(dir) : dir

  async function list() {
    const scenarios: Scenario[] = []
    const errors: ScenarioLoadError[] = []
    let entries: Deno.DirEntry[]
    try {
      entries = await Array.fromAsync(Deno.readDir(root))
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return { scenarios, errors }
      throw err
    }
    const files = entries
      .filter((e) => e.isFile && extname(e.name) === '.md')
      .map((e) => e.name)
      .sort()
    for (const file of files) {
      try {
        const text = await Deno.readTextFile(join(root, file))
        scenarios.push(parseScenario(basename(file, '.md'), text))
      } catch (err) {
        errors.push({ file, message: (err as Error).message })
      }
    }
    return { scenarios, errors }
  }

  return {
    list,
    async get(id) {
      return (await list()).scenarios.find((s) => s.id === id)
    },
  }
}

export const summarise = ({ id, title, description }: Scenario): ScenarioSummary => ({
  id,
  title,
  description,
})
