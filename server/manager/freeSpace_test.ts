import { assertEquals } from '@std/assert'
import { freeSpace, freeSpaceCommand, parseFree } from './freeSpace.ts'

Deno.test("Free space is read from df's table, or from the number Windows prints", () => {
  const df = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n' +
    '/dev/disk3s5 971350180 512 43000000 52% /System/Volumes/Data\n'
  assertEquals(parseFree(df, 'darwin'), 43000000 * 1024)
  assertEquals(parseFree('44031000576\r\n', 'windows'), 44031000576)
  assertEquals(parseFree('', 'windows'), null)
  assertEquals(parseFree('nonsense', 'linux'), null)
})

Deno.test("This machine says how much room its temp folder's drive has", async () => {
  const dir = await Deno.makeTempDir()
  const free = await freeSpace(dir)
  await Deno.remove(dir)
  assertEquals(typeof free === 'number' && free > 0, true)
})

Deno.test('A relative path is read as from the current folder', async () => {
  const free = await freeSpace('.')
  assertEquals(typeof free === 'number' && free > 0, true)
})

Deno.test("A path never enters PowerShell's script, so a space can't split it nor a `;` run", () => {
  const path = 'D:\\My Sessions;calc'
  const [cmd, args, env] = freeSpaceCommand(path, 'windows')
  assertEquals(cmd, 'powershell')
  assertEquals(args.some((a) => a.includes(path)), false)
  assertEquals(env, { LRS_FREE_PATH: path })
  assertEquals(freeSpaceCommand('/Volumes/A b', 'darwin'), [
    'df',
    ['-Pk', '--', '/Volumes/A b'],
    {},
  ])
})
