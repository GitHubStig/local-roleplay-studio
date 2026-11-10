import type { Cast } from './api'

/**
 * One box of the Cast. `start`: how things were when the scene began (who's who, their age and
 * looks, where it starts); fixed once it has begun, as the story moves on from it (the server
 * refuses a change too).
 */
export type CastField = {
  group: keyof Cast
  key: string
  label: string
  long?: boolean
  start?: boolean
}
const CAST_FIELDS: CastField[] = [
  { group: 'character', key: 'name', label: 'Name', start: true },
  { group: 'character', key: 'age', label: 'Age', start: true },
  { group: 'character', key: 'appearance', label: 'Appearance', long: true, start: true },
  { group: 'character', key: 'personality', label: 'Personality', long: true },
  { group: 'character', key: 'voice', label: 'Way of speaking', long: true },
  { group: 'character', key: 'background', label: 'Background', long: true },
  { group: 'character', key: 'goal', label: 'Goal', long: true },
  { group: 'persona', key: 'name', label: 'Name', start: true },
  {
    group: 'persona',
    key: 'role',
    label: 'Who they are to the Character',
    long: true,
    start: true,
  },
  { group: 'persona', key: 'appearance', label: 'Appearance', long: true, start: true },
  { group: 'setting', key: 'place', label: 'Place', long: true, start: true },
  { group: 'setting', key: 'time', label: 'Time', long: true, start: true },
  { group: 'setting', key: 'weather', label: 'Weather', long: true, start: true },
  { group: 'truths', key: 'truths', label: 'What holds whatever anyone does', long: true },
  {
    group: 'others',
    key: 'others',
    label: 'Who else is in the story, and who they are',
    long: true,
  },
]
/** The Cast's parts that are lists, edited as a box each (`ItemList`), and what one item is. */
export const LIST_NOUNS = { truths: 'Truth', others: 'person' } as const
const LIST_GROUPS = Object.keys(LIST_NOUNS) as (keyof typeof LIST_NOUNS)[]
export const isList = (g: keyof Cast): g is (typeof LIST_GROUPS)[number] =>
  (LIST_GROUPS as readonly string[]).includes(g)

/** Every section and part that collapses on its own, by id. */
export const CAST_SECTION_IDS = [
  'character',
  'persona',
  'setting',
  'others',
  'truths',
  'start',
  'start.character',
  'start.persona',
  'start.setting',
] as const

/**
 * The Cast's sections: in review, a group each, all editable. Once begun, how it started first,
 * read-only (a part per group), then what still steers the Character.
 */
export type CastSection = {
  id: string
  title: string
  preview: string
  locked?: boolean
  /** A part with an `id` collapses on its own, its boxes inside it not. */
  parts: { id?: string; title?: string; preview?: string; fields: CastField[] }[]
}

/** The sections of the Cast as edited (`draft`), named as the screen names the two people. */
export function castSectionsOf(
  draft: Cast | null | undefined,
  begun: boolean,
  names: { character: string; persona: string },
): CastSection[] {
  const groups: { id: keyof Cast; title: string; preview: string }[] = [
    { id: 'character', title: 'Character', preview: names.character },
    { id: 'persona', title: 'You play', preview: names.persona },
    { id: 'setting', title: 'Where it starts', preview: draft?.setting.place ?? '' },
  ]
  const fields = (g: keyof Cast, start?: boolean) =>
    CAST_FIELDS.filter((f) => f.group === g && (start === undefined || !!f.start === start))
  // Not part of how it started: editable before and after it begins.
  const list = (id: (typeof LIST_GROUPS)[number], title: string): CastSection => ({
    id,
    title,
    preview: draft?.[id]?.filter((t) => t.trim()).join(' · ') || 'none',
    parts: [{ fields: fields(id) }],
  })
  const truths = list('truths', 'Truths')
  const others = list('others', 'Others in the story')
  if (!begun) {
    return [
      ...groups.map((g) => ({
        id: g.id,
        title: g.title,
        preview: g.preview,
        parts: [{ fields: fields(g.id) }],
      })),
      others,
      truths,
    ]
  }
  return [
    {
      id: 'start',
      title: 'At the start',
      preview: draft
        ? `${draft.character.name}, ${draft.character.age} · ${draft.persona.name} · ${draft.setting.place}`
        : '',
      locked: true,
      parts: groups.map((g) => ({
        id: `start.${g.id}`,
        title: g.title,
        preview: g.preview,
        fields: fields(g.id, true),
      })),
    },
    {
      id: 'character',
      title: 'Character',
      preview: names.character,
      parts: [{ fields: fields('character', false) }],
    },
    others,
    truths,
  ]
}
