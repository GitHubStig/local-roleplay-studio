/**
 * The camera moves the Edit dialog offers: picking one writes its wording into the edit's box, for
 * the player to change (who it's of, above all) before sending. Each kind of move is worded as the
 * camera bench found works on Qwen-Image 2.1 Turbo Edit (docs/bench/camera/README.md): an angle or
 * a viewpoint as the move and one line keeping the rest, a close-up as what the result shows, as a
 * clause keeping everything keeps everyone in frame. No names: an edit model doesn't know them.
 */
export interface CameraMove {
  group: 'Angle' | 'Close-up' | 'Viewpoint'
  label: string
  instruction: string
}

const KEEP = 'Keep everything else exactly as in the image.'

export const CAMERA_MOVES: readonly CameraMove[] = [
  {
    group: 'Angle',
    label: 'Low angle',
    instruction: `Move the camera down near the floor, looking up at them: a low angle. ${KEEP}`,
  },
  {
    group: 'Angle',
    label: 'High angle',
    instruction: `Move the camera up near the ceiling, looking down at them: a high angle. ${KEEP}`,
  },
  {
    // Weak on today's edit models (a high angle, or a seated person moved to the floor), kept
    // for better ones.
    group: 'Angle',
    label: 'Overhead',
    instruction:
      `Move the camera directly overhead, looking straight down at the floor and them. ${KEEP}`,
  },
  {
    group: 'Close-up',
    label: 'Face',
    instruction:
      "A close-up of the woman's face, filling the picture, in the same place and light.",
  },
  {
    group: 'Close-up',
    label: 'Eyes',
    instruction: "An extreme close-up of the woman's eyes, filling the picture.",
  },
  {
    group: 'Close-up',
    label: 'Hands',
    instruction: "A close-up of the woman's hands, filling the picture.",
  },
  {
    group: 'Close-up',
    label: 'Legs',
    instruction: "A close-up of the woman's legs, filling the picture.",
  },
  {
    group: 'Close-up',
    label: 'Feet',
    instruction: "A close-up of the woman's feet, filling the picture.",
  },
  {
    group: 'Viewpoint',
    label: 'Over the shoulder',
    instruction:
      `Move the camera behind the man, looking over his shoulder at the woman: the back of his head and shoulder large in the foreground. ${KEEP}`,
  },
  {
    group: 'Viewpoint',
    label: 'From behind',
    instruction: `Move the camera behind the woman, seeing her from behind. ${KEEP}`,
  },
]

/** The moves by group, in order, for the dropdown's option groups. */
export const CAMERA_GROUPS = (['Angle', 'Close-up', 'Viewpoint'] as const).map((group) => ({
  group,
  moves: CAMERA_MOVES.filter((m) => m.group === group),
}))
