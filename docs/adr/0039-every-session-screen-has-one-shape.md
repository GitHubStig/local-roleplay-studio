---
status: accepted
---

# Every Session screen has one shape, and the app works at phone width

By 2026-11-11 the screens had grown a control at a time. Screenshots of each at 390, 1440, 1920, 2560 and 3440 px showed the same problems everywhere:

- the story or the picture got the room left over, under a row of rarely changed settings and over a row of equal buttons;
- the Frames list sat as a sidebar in the middle, so every Session was three columns of the same weight;
- the Frame panel was one long column, and the buttons acting on a picture sat away from it;
- the Scenario page was one long form with Start at its foot;
- Settings and the Queue were two kinds of page;
- at phone width the Session screens squashed rather than stacked;
- the "old game" feel came from boxes inside boxes, and dark mode was plain grey.

A page of mockups was drawn and the owner picked from it; the work was built in stages on the `screens` branch (2026-11-12 to 13, on the Mac). Every screen before (`main`) and after, side by side at desktop, phone, dark and wide sizes, with what changed and what was weighed, is in [retrospectives/screens-redesign](../retrospectives/screens-redesign/index.html) (open it in a browser). The mockups and the plan are in git history (`docs/screens-mockups.html`, `docs/screens-plans.md`, deleted after this ADR).

## Decision

- **A rail in place of the header**: Home, the Session in progress, the Scenario being set up, the Queue; at its foot the server's dot, the theme and Settings. A tab bar along the bottom on a phone. A Session's title is in its own bar.
- **The strip view for every kind of Session** (`SessionBar`, `FrameStrip`, `SessionStage`, `SessionPicture`): a strip of Frames under the Session's bar, the picked Frame's picture large beside what goes with it (a Roleplay's story, a Chain's Action, a Storyboard's Beat), and a text box floating over the foot. The strip is the Frames list; a Frame with no picture shows its words in its tile. Beside a story the side keeps a book-page width; beside an Action or a Beat it's narrower, so the picture has the room.
- **A picture's buttons are on the picture** (`PictureToolbar`): Re-render, Upscale, Edit, Clip and 3D, on hover, always on a touch screen. Clip opens the Frame's clips in the drawer beside the picture, never over it, and a playing clip has only its own controls on it.
- **A drawer in place of the Frame panel** (`SessionDrawer`), closed until asked for: the picked Frame's Image Prompt, its Clips, the Look and Cast, the Music. The Session's models and switches are one popover behind the Image Model's name in its bar.
- **A Frame's jobs are one line on its picture**, its edge sweeping while work runs on it; the rail's Queue slides in a panel, this Session's jobs first.
- **Every Frame at once** (`AllFrames`), from the end of the strip, over the Session's own area with the rail beside it: All Frames (a contact sheet with search), Compare (the old Pictures table, `ComparisonTable`, shared with the exported page) and Scores. A star on a picture makes it Home's thumbnail.
- **Settings over the screen it was opened from**, at its own address (`/settings/<section>`): sections down the left, grouped as Models and App, a row per setting, and an Appearance section for the theme. The Queue page takes the same shape.
- **The Scenario page on one page**: the story beside the People, Start and the kind of Session in a bar always in view, blank parts folded into one line of chips, who plays whom a chip beside each name.
- **Home by its own width**: two panes from 1000 px of Home, the second foldable; nothing on Home goes by the window's width, as a maximised window on a 1920 screen is often a little short of it.
- **At phone width, four rules**: the rail becomes a tab bar; whatever opens beside or over a screen on a desktop opens as a sheet from the bottom; one column in the order it's used; the main button stays put.
- **The soft split**: the story is parchment, the tools around it the same paper, paler, with no edge between them but the change of tone, and lines between things rather than cards inside cards. Dark mode is the same split in brown-tinted charcoal and lamplit brown. The app follows the system's theme until the player picks one.

## Considered Options

- **A Sessions sidebar**: Home does that job.
- **Frames as a list down the left**: the three columns the work set out to remove.
- **Neutral grey tools beside the parchment**: a second colour family, and a hard-edged block. A sheet with corners around the story looked like a card again.
- **Starting in Light**: the owner chose to keep following the system.
- **The Scenario page as sections to click through, or as a document**: one page shows the whole story at once.
- **The Session's models as a bare icon, by name, or as a tab in the drawer** (drawn for the owner): the Image Model's name, as it's the one to see.
- **Home's two columns from 1800 px**, as planned: below it Start something new was first a button opening it over the Sessions, then a strip along the top that pushed them down. Two panes from 1000 px keep one layout at every desktop width. Two layouts only (two panes or the phone's) was offered and not taken.
- **A Storyboard's plan as every Beat down the page, or a grid of large cards**: the strip of Beat cards stays, with the Look under the picked Beat.
- **A setting for the strip's size**: the size follows the screen instead.
- **Thumbnail stars shown faint on every picture**: cluttered; a right-click menu on a picture is an open thread.
- **An immersive view**, the picture filling the screen: drawn, and moved to an open thread before it was built.

## Consequences

- **A Session screen stays alive behind Settings** and isn't deactivated there, so its music and a playing clip carry on; it catches up when its own address comes back (`useSessionScreen`).
- **One set of shared components** draws every kind of Session, so a change to the strip, the picture or the drawer lands on all three.
- **Not checked yet**: the Windows PC (the owner will, once merged), and a real phone (touch, the on-screen keyboard over the text box). Before this work the app was only ever seen in a browser's phone view.
