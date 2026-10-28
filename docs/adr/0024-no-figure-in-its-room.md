---
status: accepted (a decision not to build; revisit with a new 2.5D library)
---

# A figure isn't placed inside its 2.5D scene

A Frame's 2.5D scene (SHARP) holds the picture's person only as a thin relief that falls apart past ~30° of turn, and a figure (TripoSplat or LiTo) is a whole person that shows well from every side, but alone on black. Combining them, SHARP's room with a figure in the gap where the person was, was tried on 2026-10-04 and worked as an image. Decided with the owner on 2026-10-28 not to build it into the app, and to stop on the idea until a new 2.5D library or framework arrives.

- **It works, but not well enough to ship.** Removing the splats SHARP put inside the person's cut-out mask and placing the figure there (turned to face the camera, scaled to cover the mask; outline fit 0.90–0.95) looks far better than the figure alone on black. But at the picture's own view the person becomes the figure's redrawing (a different face), and at ±30° SHARP alone already held him nearly as well. Keeping the painting's own person in front with the figure behind (a slice, or a crossfade between 20° and 45°) was tried and dropped: smeared at wide angles, a visible join, or a different-looking person once faded. Measurements and the method: [research/image-to-3d.md](../research/image-to-3d.md), "Tried: a figure inside its 2.5D scene" and the two after it.
- **The models won't improve soon.** The owner doubts new TripoSplat or LiTo versions are coming in the near future, so waiting on them isn't worth keeping the thread open.
- **Better to wait for a better 2.5D base** than to patch SHARP's person with a second model. A new 2.5D library or framework is tried on its own merits when one appears, and may make the combination unnecessary.

## Considered Options

- **A "with the room" choice on the figure's viewer**, or a combined file made after both (the plan in open-threads.md). Not built, for the reasons above.
- **Crossfading SHARP's person into the figure by viewing angle.** Seamless, but the person changes face once it fades; the owner judged it not good.

## Consequences

Figures stay on black in their own viewer, and 2.5D scenes keep SHARP's person. Nothing in the code changes.
