import { assertEquals, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { dataDirs, type DataPlace, makeDataDirs } from './dataDirs.ts'

const place = (over: Partial<DataPlace>, env: Record<string, string> = {}): DataPlace => ({
  standalone: true,
  os: 'darwin',
  env: (name) => env[name],
  root: '/repo',
  ...over,
})

Deno.test('a clone keeps its data in the repo', () => {
  assertEquals(dataDirs(place({ standalone: false }, { HOME: '/Users/p' })), {
    settings: join('/repo', 'settings.json'),
    queue: join('/repo', 'queue.json'),
    scenarios: join('/repo', 'scenarios'),
    sessions: join('/repo', 'sessions'),
    exports: join('/repo', 'exports'),
  })
})

Deno.test('An install copies its Python tools beside its Sessions; a clone runs its own', () => {
  assertEquals(dataDirs(place({ standalone: false }, { DATA_DIR: '/data' })).python, undefined)
  assertEquals(dataDirs(place({}, { DATA_DIR: '/data' })).python, join('/data', 'python'))
  const support = join('/Users/p', 'Library', 'Application Support', 'Local Roleplay Studio')
  assertEquals(dataDirs(place({}, { HOME: '/Users/p' })).python, join(support, 'python'))
  const windows = dataDirs(place({ os: 'windows' }, {
    USERPROFILE: 'C:\\Users\\p',
    LOCALAPPDATA: 'C:\\Users\\p\\AppData\\Local',
  }))
  assertEquals(
    windows.python,
    join('C:\\Users\\p\\AppData\\Local', 'Local Roleplay Studio', 'python'),
  )
})

Deno.test('DATA_DIR puts it all in one folder, from a clone or an install', () => {
  for (const standalone of [false, true]) {
    const dirs = dataDirs(place({ standalone }, { DATA_DIR: '/data', HOME: '/Users/p' }))
    assertEquals(dirs.settings, join('/data', 'settings.json'))
    assertEquals(dirs.exports, join('/data', 'exports'))
  }
})

Deno.test('an install on a Mac uses Application Support, with exports in Documents', () => {
  const dirs = dataDirs(place({}, { HOME: '/Users/p' }))
  const support = join('/Users/p', 'Library', 'Application Support', 'Local Roleplay Studio')
  assertEquals(dirs.settings, join(support, 'settings.json'))
  assertEquals(dirs.sessions, join(support, 'sessions'))
  assertEquals(dirs.exports, join('/Users/p', 'Documents', 'Local Roleplay Studio'))
})

Deno.test('an install on Windows keeps only Settings roaming', () => {
  const dirs = dataDirs(place({ os: 'windows' }, {
    USERPROFILE: 'C:\\Users\\p',
    APPDATA: 'C:\\Users\\p\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\p\\AppData\\Local',
  }))
  assertEquals(
    dirs.settings,
    join('C:\\Users\\p\\AppData\\Roaming', 'Local Roleplay Studio', 'settings.json'),
  )
  assertEquals(
    dirs.sessions,
    join('C:\\Users\\p\\AppData\\Local', 'Local Roleplay Studio', 'sessions'),
  )
  assertEquals(
    dirs.queue,
    join('C:\\Users\\p\\AppData\\Local', 'Local Roleplay Studio', 'queue.json'),
  )
})

Deno.test('an install on Linux follows XDG, or its defaults when unset', () => {
  const set = dataDirs(place({ os: 'linux' }, {
    HOME: '/home/p',
    XDG_CONFIG_HOME: '/c',
    XDG_DATA_HOME: '/d',
    XDG_STATE_HOME: '/s',
  }))
  assertEquals(set.settings, join('/c', 'Local Roleplay Studio', 'settings.json'))
  assertEquals(set.sessions, join('/d', 'Local Roleplay Studio', 'sessions'))
  assertEquals(set.queue, join('/s', 'Local Roleplay Studio', 'queue.json'))
  const unset = dataDirs(place({ os: 'linux' }, { HOME: '/home/p' }))
  assertEquals(unset.settings, join('/home/p', '.config', 'Local Roleplay Studio', 'settings.json'))
  assertEquals(unset.queue, join('/home/p', '.local/state', 'Local Roleplay Studio', 'queue.json'))
})

Deno.test('an install with no home folder asks for DATA_DIR', () => {
  assertThrows(() => dataDirs(place({})), Error, 'DATA_DIR')
})

Deno.test('the folders Settings and the queue are written in are made', async () => {
  const root = await Deno.makeTempDir()
  try {
    const dirs = dataDirs(place({ os: 'linux' }, { HOME: root }))
    await makeDataDirs(dirs)
    await Deno.writeTextFile(dirs.settings, '{}')
    await Deno.writeTextFile(dirs.queue, '{}')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
