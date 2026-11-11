/**
 * The camera bench's scene and Actions (docs/camera-plans.md): a small bedroom with two people,
 * written by hand as a Chain's nine sentences, and the camera Actions applied to it.
 */

/** What the Chain is told the story is, standing in for a Scenario. */
export const BRIEF = 'Ana packs a suitcase in her small bedroom while Tom leans in the doorway, talking.'

/** The nine sentences, one per aspect, the camera fourth. */
export const SCENE = [
  'Ana is a woman in her late twenties, slim, with olive skin, a long dark brown braid and a narrow face with thick eyebrows; Tom is a man in his early thirties, tall and broad-shouldered, with pale freckled skin, short copper-red hair and a short beard.',
  'Ana sits on the edge of the bed with both feet on the floor, holding a folded white shirt in both hands over an open suitcase beside her; Tom leans his right shoulder against the door frame, arms crossed over his chest, his left ankle crossed over his right.',
  'Ana looks up at Tom with a small, tired smile; Tom watches her with raised eyebrows, mid-sentence.',
  'An eye-level full shot from across the room, both of them in frame from head to toe, with a 35 mm lens.',
  'Ana wears a mustard-yellow knit sweater, faded blue jeans and white canvas sneakers; Tom wears a dark green flannel shirt with rolled sleeves, charcoal chinos and brown leather boots.',
  'A small bedroom with white walls and a wooden floor: a double bed with a grey blanket against the left wall, a tall wooden wardrobe beside it, a window on the back wall, and an open white door on the right where Tom stands; a blue suitcase lies open on the bed.',
  'Soft daylight comes through the window on the back wall, even across the room, with gentle shadows on the floor.',
  'Muted natural colors: white walls, warm wood, grey and blue, with the mustard sweater and the green shirt as the brightest notes.',
  'A realistic photograph, natural and candid, in sharp focus with fine detail.',
].join(' ')

/** Each applied to the scene on its own. */
export const ACTIONS = [
  // Angles.
  'Low angle.',
  'High angle.',
  'Dutch angle.',
  "Bird's-eye view.",
  'Overhead shot, looking straight down from the ceiling.',
  "Worm's-eye view.",
  // Shot types.
  'Wide shot of the whole room.',
  'Medium shot.',
  'Close-up.',
  'Extreme close-up.',
  "POV from Tom's eyes.",
  "Over Tom's shoulder, looking at Ana.",
  'Over the shoulder shot.',
  // Targets, by name or not.
  "Close-up on Ana's face.",
  'Close-up on her hands.',
  "Focus on Tom's boots.",
  "Ana's upper body, from the waist up.",
  'Show Tom from the waist down.',
  "Close-up on Tom's chest and shoulders.",
  "Show Ana's legs.",
  // Combinations.
  "Low angle close-up on Tom's face.",
  'From above, both of them full body.',
  'Dutch angle, medium shot of Ana.',
  // A camera with something else.
  'Ana closes the suitcase. Low angle.',
  "Tom laughs. Close-up on his face.",
  // Loose.
  'Zoom in.',
  'Zoom out.',
  'Show Tom from behind.',
  'From the window.',
  'Put the camera in the doorway.',
]

/** Actions in a row, each on the last one's prompt: does the camera stay, and come back? */
export const SEQUENCES = [
  ["Close-up on Ana's face.", 'Ana stands up.', 'Back to the full shot of both of them.'],
  ['Low angle.', 'Tom walks over and sits beside her.', 'Overhead shot.'],
]

/** The close-ups on someone, or a part of them, that cut the scene down in Stage 1: rendered both ways. */
export const TARGETS = [
  "Close-up on Ana's face.",
  'Close-up on her hands.',
  "Focus on Tom's boots.",
  "Ana's upper body, from the waist up.",
  "Close-up on Tom's chest and shoulders.",
  "Low angle close-up on Tom's face.",
  'Dutch angle, medium shot of Ana.',
  "Tom laughs. Close-up on his face.",
]

/** Angles, rendered with the scene whole, the camera sentence in its place and first. */
export const ANGLES = ['Low angle.', 'High angle.', 'Overhead shot, looking straight down from the ceiling.', 'Dutch angle.']

/** Camera moves as edits of the baseline picture, each saying what the new picture shows. */
export const EDITS = [
  'The same room and the same two people, seen from a low angle: the camera near the floor, looking up at them.',
  'The same room and the same two people, seen from a high angle: the camera near the ceiling, looking down at them.',
  'The same room and the same two people, seen from directly overhead, looking straight down at the floor, the bed and them.',
  'The same picture with the camera tilted to one side, a Dutch angle, the walls and the door frame leaning.',
  "A close-up of the woman's face, filling the picture, in the same room and light.",
  "A close-up of the woman's hands holding the white shirt, filling the picture.",
  "A close-up of the man's brown leather boots on the wooden floor, filling the picture.",
  "Seen over the man's shoulder: the back of his head and shoulder large in the foreground, the woman on the bed facing the camera.",
]

/** Each move as an operation, for the wordings that lead with it. */
export const MOVES = [
  'Move the camera down near the floor, looking up at them: a low angle.',
  'Move the camera up near the ceiling, looking down at them: a high angle.',
  'Move the camera directly overhead, looking straight down at the floor, the bed and them.',
  'Tilt the camera to one side, a Dutch angle, so the walls and the door frame lean.',
  "Move the camera in to a close-up of the woman's face, filling the picture.",
  "Move the camera in to a close-up of the woman's hands holding the white shirt, filling the picture.",
  "Move the camera down to a close-up of the man's brown leather boots on the wooden floor, filling the picture.",
  'Move the camera behind the man in the doorway, looking over his shoulder at the woman: the back of his head and shoulder large in the foreground.',
]

/** Ways of telling an edit model a move: B, a template found online, keeping everything first; C, as Qwen's prompt enhancer advises, the move first and one line for what stays. */
export const WORDINGS: Record<string, (move: string) => string> = {
  B: (move) =>
    `Keep the exact same two people, clothing, lighting, and room from the image. ${move} Keep the woman in the mustard-yellow sweater sitting on the bed on the left and the man in the green flannel shirt leaning in the doorway on the right, maintaining their exact poses.`,
  C: (move) => `${move} Keep everything else exactly as in the image.`,
}

/** A second picture for the wider check: one man alone, portrait-shaped, another room. */
export const SOLO = [
  'Marco is a man in his fifties, stocky, with tanned skin, a grey crew cut, a broad nose and a short grey beard.',
  'He stands at a kitchen counter, his weight on his left leg, slicing a round loaf of bread on a wooden board with a long knife in his right hand, his left hand holding the loaf.',
  'He looks down at the bread, concentrating, his lips pressed together.',
  'An eye-level full shot from the kitchen doorway, all of him in frame from head to toe, with a 35 mm lens.',
  'He wears a faded navy apron over a white T-shirt, olive cargo trousers and black clogs.',
  'A small kitchen with pale green tiles: a wooden counter along the back wall, a window above it, shelves of jars on the left, a tiled floor in black and white squares.',
  'Morning daylight from the window over the counter, soft and even.',
  'Fresh, light colors: pale green, warm wood, white, with the navy apron as the darkest note.',
  'A realistic photograph, natural and candid, in sharp focus with fine detail.',
].join(' ')

/** The best wording found for each kind of move (README: three wordings): the result for a close-up, the move and one line keeping the rest otherwise. */
const keep = (move: string) => `${move} Keep everything else exactly as in the image.`
export const BEST_TWO = [
  keep(MOVES[0]),
  keep(MOVES[1]),
  keep(MOVES[2]),
  keep(MOVES[3]),
  EDITS[4],
  EDITS[5],
  EDITS[6],
  keep(MOVES[7]),
]
export const BEST_SOLO = [
  keep('Move the camera down near the floor, looking up at him: a low angle.'),
  keep('Move the camera up near the ceiling, looking down at him: a high angle.'),
  keep('Move the camera directly overhead, looking straight down at the counter, the floor and him.'),
  keep('Tilt the camera to one side, a Dutch angle, so the counter and the shelves lean.'),
  "A close-up of the man's face, filling the picture, in the same kitchen and light.",
  "A close-up of the man's hands slicing the bread on the board, filling the picture.",
  "A close-up of the man's black clogs on the tiled floor, filling the picture.",
  keep('Move the camera behind the man, looking over his shoulder at the bread and the window: the back of his head and shoulder large in the foreground.'),
]

/** Moves not yet tried, for the picker: on the bedroom (two people) and the kitchen (one man). */
export const UNTRIED: Record<'two' | 'solo', string[]> = {
  two: [
    'A shot of the woman from the waist up, filling the picture, in the same room and light.',
    "A close-up of the woman's legs, filling the picture.",
    'Move the camera back to show more of the room around them. Keep everything else exactly as in the image.',
    "Seen through the man's eyes from the doorway: the woman on the bed as he sees her, his hands just visible at the bottom of the picture.",
    "An extreme close-up of the woman's eyes, filling the picture.",
    'Move the camera behind the woman, seeing her from behind. Keep everything else exactly as in the image.',
  ],
  solo: [
    'A shot of the man from the waist up, filling the picture, in the same kitchen and light.',
    "A close-up of the man's legs, filling the picture.",
    'Move the camera back to show more of the kitchen around him. Keep everything else exactly as in the image.',
    "Seen through the man's eyes: the bread and the knife on the board as he sees them, his hands at the bottom of the picture.",
    "An extreme close-up of the man's eyes, filling the picture.",
    'Move the camera behind the man, seeing him from behind. Keep everything else exactly as in the image.',
  ],
}
