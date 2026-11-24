/** A Session export's name, and what an import answers. Shared by the server and the web app: types and plain values only. */

/**
 * A Session export's file name, from its title and id: `the-rain-soaked-tavern-20261011-083126-79c6.zip`.
 * The title as lower-case words joined by hyphens, accents dropped, at most 60 characters.
 */
export function exportName(title: string, id: string): string {
  const words = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return `${words ? `${words}-` : ''}${id}.zip`
}

/** The Session a zip was imported as (`POST /api/sessions/import`): always a new id. */
export interface ImportedSession {
  id: string
  kind: 'chain' | 'storyboard' | 'roleplay'
  title: string
}
