# Plan: every screen, again

A second look at every screen, and the app at phone width, as one piece of work (the owner, 2026-11-11, the Mac). The screens grew a control at a time; this settles what belongs where. It was worked out from screenshots of each screen at 390, 1440, 1920, 2560 and 3440 px and a page of mockups the owner picked from. This file is the plan, updated as it goes; when the work is done its pieces move into the design docs and an ADR, and it's deleted.

**The mockups** are in [screens-mockups.html](screens-mockups.html), which opens in a browser as it is: every screen below drawn in HTML and Tailwind with the app's colours, with the drawer, the themes and the story's edge to click through. Look at them before building a stage, as they show what the owner agreed to more exactly than the words here. To look, take a screenshot of the stage's section (`deno task shot <the file's full path> --base file://`, then an `eval:location.hash='strip'` step) rather than reading the whole file, which is long; for exact classes or colours read only that stage's `<section id="…">` (`found`, `shell`, `strip`, `frame`, `compare`, `scenario`, `pages`, `phone`, `ultrawide`, `look`, `picks`), and the styles and scripts at the top and bottom for the colour tokens and icons. It uses the tavern Scenario's names, invented lines and gradients for pictures, nothing from a Session. The same page is published, private to the owner, at <https://claude.ai/artifact/3BUBmSAK7xqZfT1kWH4tgN>. The file goes when this plan does.

## What was found

- **The story or the picture gets the leftover space.** Every Session screen has a row of settings above its main view and a row of equal-weight buttons below it. The settings rarely change, yet are in view every turn.
- **The Frames list is a sidebar in the middle**, between the main view and the Frame panel, so the screen is three columns of similar weight.
- **The Frame panel is one long column**, and the buttons that act on a picture sit away from it.
- **The Scenario page is one long form** with Start at the very bottom and about twenty Suggest buttons.
- **Settings and the Queue are two different kinds of page.**
- **At phone width the Session screens squash instead of stack**, and the header runs over itself. At 3440 px a Roleplay's words and pictures drift to opposite edges. Home's two columns wait until 2240 px.
- **The "old game" feel comes from boxes inside boxes**, not from the parchment. Dark mode is plain grey, so it has none of the app's character.

## What was decided

Decided by the owner unless marked *assumed* (proposed, shown in a mockup, and not objected to; check before building if in doubt).

- **A rail in place of the header** (*assumed*): icons for Home, the current Session, the Scenario being set up, the Queue; at its foot the server's dot, one theme button and Settings. A tab bar along the bottom at phone width. The Session's title moves into the Session's own bar.
- **The strip view for every kind of Session.** One screen for a Roleplay, a Chain and a Storyboard: the Session's bar, a strip of Frames under it, the picked Frame large, a floating text box at the bottom. No left panel: the strip is the Frames list.
  - A Frame with no picture shows its words in its tile (the Message, or the Beat), so a Roleplay without Pictures and an unrendered Storyboard still read.
  - A button at the end of the strip opens every Frame as a contact sheet with search, for long Sessions.
  - A Roleplay's picture stays put on the left while the story scrolls on the right; scrolling the story moves the picture and the strip, and picking a tile scrolls the story.
  - A Chain shows the Action and its Narration beside the picture.
  - A Storyboard's strip is its Beats in order. While the plan is reviewed, the strip is the Beats as cards to drag, with Write Frames in a docked bar, as there's nothing to type.
  - The strip folds to a thin line when height is short.
- **The floating text box** (*assumed*), on all three kinds: Send and, in a Roleplay, Suggest in view; Undo beside them; the rest (Render all, Score the Roleplay, Chain from Frame) in a menu.
- **A picture's buttons are on the picture** (*assumed*): Re-render, Upscale, Edit, then Clip and 3D as menus that list what's made and what can be made, with a count. Shown on hover, always on a touch screen. Nowhere else.
- **The Frame panel becomes a drawer** (*assumed*), closed until asked for and remembered: Prompt on the picture opens the Image Prompt, who's shown and the timings; Look & Cast and Music are buttons in the Session's bar that open the same drawer, as neither is about one Frame. The Session's models and switches go behind one button in its bar.
- **A Frame's jobs are one line on its picture** (*proposed 2026-11-11, for the owner to confirm*): what's running, how far along, and how many more wait, with a thin bar along the picture's top edge; clicking it lists them, each to cancel, and Cancel all. The button that asked for the work shows a spinner while it runs and a dot while it waits. A failure stays on the line with Retry. Today each job is a boxed row near the top of the Frame tab, which the owner finds messy with several images and clips queued: with seven made-up jobs on a Frame, seven rows sat between who's shown and the Image Prompt. The list keeps the rows' wording ("Lead In clip, 5 s · Krea 2's picture"), and the light that sweeps round a rendering picture stays. A spoken line's work shows by the speaker beside the Reply.
- **Pictures, the table that compares Image Models, becomes the second mode of the All Frames view** (*proposed 2026-11-11, to confirm*), beside the contact sheet, opened by the same button at the end of the strip. The models are chips in one row, on or off, opening on the Session's own and the next two; the prompts column is the Frame's name and three lines; Home's thumbnail is a star on the picture in place of a Thumbnail mode; Export is the filled button. At phone width rows become pages: one Frame at a time, its models down the screen. **Style scores** is the third mode of the same switch (today its button turns into a Pictures button to get back), the Session's own model picked out in ink and the others quieter, in place of bars in a blue that isn't the app's. The Export dialog stays as it is, its tick boxes becoming the app's switches. The exported page is built from the same table, so it takes the same changes; at phone width it shows one model's column now.
- **The Queue inside a Session** (*assumed*): work running shows on its Frame's tile, and the rail's Queue button slides in a panel, this Session's jobs first, with a count on the button. This replaces the Queue tab beside Frames.
- **Immersive is a view of its own**, with its own address: the picture fills the screen, the latest lines over its darker side, the text box, and nothing else.
- **The Scenario page on one page, two columns**: the story on the left, People on the right, Start and the kind of Session in a bar that stays in view. Empty parts fold into one line of chips ("Left to the Text Model: + Wears + Goal"); who plays whom is a chip beside each name; Suggest shows on the part being edited.
- **Settings and the Queue as one kind of page**: sections down the left (grouped as Models and App), rows on the right, with a new Appearance section for the theme. Settings opens as an overlay over the screen it was opened from, with its own address (*assumed*).
- **At phone width** (*proposed 2026-11-11, to confirm; sixteen mockups*) four rules carry every screen: the rail becomes a tab bar; whatever opens beside or over a screen on a desktop (the drawer, the picture's Clip and 3D menus, the Session's models and switches) opens as a sheet from the bottom, the picture still in view; one column in the order it's used (the strip, the picture, the words, the text box); and the main button stays put (Send in the box, Start and Write Frames in a bar). Home is Sessions two across with New at the top, and starting a Session is a screen of its own; the Scenario page is one column with each Person folding closed; a Storyboard's plan is its Beats down the screen; the Queue is a screen from the tab bar; Settings is its list of sections, each opening from it. Held sideways (`short:`), the rail goes back to the side and the strip folds away.
- **Home's two columns from about 1800 px of Home's own width** (*assumed*), by a container query rather than the window's width, as a maximised window on a 1920 screen is often a few pixels short.
- **The look is the soft split, flush.** The story is the full parchment; the tools around it (the rail, the Session's bar, the strip, the drawer, Settings, the Queue) are the same paper, paler and quieter. No sheet edge, margin or shadow around the story: the tone changes and nothing else. Fewer boxes everywhere: lines between things rather than cards inside cards.
- **Dark mode is the soft split's dark**: brown-tinted charcoal tools and a lamplit brown story with parchment-coloured text, in place of today's neutral greys. The app starts in Light rather than System (*assumed*).

Colours tried in the mockups, as a starting point: tools light `#f4eedd` (surface `#faf6ea`, line `#ddd2b5`), story light today's `#ede0bf`; tools dark `#151312` (surface `#1e1b19`, line `#2f2a25`, text `#e9e2d3`), story dark `#241a10` (surface `#2f2317`, line `#453421`, text `#f1e4c6`).

Dropped along the way: a Sessions sidebar (Home does that job); Frames as a list down the left; the Scenario page as sections to click through, or as a document; a split with neutral grey tools (jarring: a second colour family, and a hard-edged block); a sheet with rounded or square corners around the story.

## Stages

Nothing is built yet (2026-11-11): the owner asked for the plan only, to start on a branch of its own in a new session. Each stage is a piece of its own, shown to the owner with before-and-after screenshots at phone, desktop and wide sizes before it's committed.

1. **The rail**, and the tab bar at phone width.
2. **The strip view for a Roleplay**: the Session's bar, the strip, the picture beside the story, the floating box, the picture's buttons, the drawer.
3. **Chain and Storyboard** in the same view, with the Beat cards for a plan.
4. **The contact sheet, and the Queue's slide-in panel** with the count on the rail.
5. **Settings** as an overlay in its new shape, and the Queue page to match.
6. **The Scenario page.**
7. **Home** at wide widths, and the look: the soft split's colours, fewer boxes.
8. **The immersive view**, then **dark mode**.

### Notes for each stage

What was worked out from the code while planning, to start from rather than to follow.

**Seeing a Frame with jobs without running a model.** Answer the page's `GET /api/sessions/:id/jobs` in the headless browser with made-up jobs (Playwright's `page.route`, then `route.fulfill({ json })`), which only that browser sees. Don't edit `queue.json` for it: the server reads it only at startup, and a queued job put back from it really runs. `deno task shot` has no option for this yet; a `--mock PATH=FILE` would be worth adding when stage 2 starts.

**1. The rail** (`web/src/App.vue`, its test, new icons).

- The header's `<nav>` becomes the rail: on the left from the `sm` breakpoint and on a phone held sideways (the `short:` variant), along the bottom below it. The app's outer box should be `h-dvh` rather than `h-screen`, so a phone's address bar doesn't hide the tab bar.
- Icons only, each with its name for screen readers and as a tooltip: Home, the current Session (its kind and title in the tooltip), the Scenario being set up, the Queue; then the server's dot, the theme button and Settings.
- One theme button that steps through Light, Dark and System, its icon showing which. `ThemeToggle` stays for the exported comparison page. The corner toggle at phone width goes.
- The server's dot has no room for "Server offline" beside it in a rail: say it in a line across the top of the screen instead.
- New icons to draw: the Session, the Scenario, a sun, a moon, a screen (for System).
- **Until stage 2, a Session's title would show nowhere** but the rail's tooltip, as it's in the header now. Either build stages 1 and 2 together, or give the Session screens a bare title bar in stage 1.
- The app's name also leaves the screen with the header. Home is the place for it.
- The Queue's count on the rail waits for stage 4, which needs one shared poll of `/api/queue` (the Queue page has its own now, every 2 s).

**2. The strip view for a Roleplay** (`web/src/roleplay/RoleplayView.vue`, `FrameTab`, `FrameListItem`, `PictureButtons`, `Frame3dButtons`, `FrameClips`, `ComposeBox`, `PanelTabs`).

- Build the strip, the Session's bar, the drawer and the picture's toolbar as shared components at the top of `web/src/components/`, as stage 3 uses all four.
- The settings row above the story (Text Model, Image Model, steps, Pictures, Render replies, Score as you play, the music volume) moves into one popover from the Session's bar.
- A clip's settings (video model, length, speech, its prompt) move from the panel into a small dialog opened from the picture's Clip menu.
- To settle: how the story's scrolling picks the Frame (the exchange nearest the middle, most likely), and what the picture's side shows for a Frame not pictured.
- The toolbar's words drop to icons when the picture is narrow (a container query on the toolbar).
- A Frame's jobs as one line on the picture replace `FrameJobs`' rows; the list behind it is the same rows, so its Retry and Cancel carry over.

**3. Chain and Storyboard** (`web/src/chain/ChainView.vue`, `web/src/storyboard/StoryboardView.vue`).

- A Chain: the Action and Narration beside the picture; the prompt with its changes marked in the drawer.
- A Storyboard: the Beat, who it shows and the Frame's seven sentences beside the picture; Render all in the Session's bar; an unrendered Frame's empty picture holds its own Render button.
- A plan being reviewed: the strip as Beat cards (the drag is `useDragReorder`), the picked Beat's editor and the Look below, Write Frames in a docked bar.

**4. The contact sheet and the Queue panel.**

- One shared poll of the queue for the rail's count, the panel and the Queue page.
- The panel lists this Session's jobs first, then the rest by machine, and links to the full page. A Session's own Queue tab goes once it's in.
- Pictures (`ModelComparison`, `ComparisonTable`) moves in as the All Frames view's second mode, with its phone layout; the `Pictures` button above a Session goes.
- The contact sheet's search reads Messages and Replies (a Roleplay), Actions and Narrations (a Chain), Beats (a Storyboard), all of which the page already holds.

**5. Settings and the Queue page** (`web/src/views/SettingsView.vue`, `QueueView.vue`, `router.ts`).

- Nine tabs become a list down the left, grouped as Models (Text, Images, Voice, Music, Clips, 3D) and App (Machines, Sessions, Appearance, Advanced); a setting is a row with its control on the right.
- As an overlay with its own address, Settings is a route drawn over the Session kept alive behind it (`KeepAlive` already keeps it), closed by Esc.
- At phone width the list is the first screen and each section opens from it.
- Images and Music use three columns of cards at ultrawide widths now; decide then whether two sections side by side is worth keeping.

**6. The Scenario page** (`web/src/scenario/ScenarioView.vue`, `ScenarioField`, `SuggestButton`, `TruthList`).

- With three or more People the right column scrolls by itself.
- Chain and Storyboard don't need who plays whom; the chips beside each name show for a Roleplay only.

**7. Home and the look** (`web/src/views/HomeView.vue`, `web/src/style.css`).

- Home's `wide:` classes become a container query at about 1800 px; the resizable split between its two panes stays.
- The soft split needs a second set of colour tokens for the story's area, set on the element that holds it, so everything inside takes them without each component knowing.

**8. The immersive view and dark mode.**

- Immersive needs a picture: a Roleplay played without Pictures shows the story on a plain dark ground.
- Dark mode's tokens replace `:root.dark`'s neutral greys; `index.html`'s pre-paint script decides the theme before the app loads, which is where starting in Light is set.

## Not checked yet

- A real phone: the screenshots were a headless browser's, which shows layout but not touch, the on-screen keyboard or the notch. With the keyboard up, the text box should ride above it and the strip fold away; that's untried.
- A fresh export: the one looked at was from 2026-10-17, and named its Frames "The Opening, Frame 1, Frame 2" where the app says "Frame 1 · Opening, Frame 2, Frame 3". Check whether a new one still does.
- A Frame with jobs really queued: it was seen with made-up jobs (below), not real ones.
- A Storyboard's plan while it's reviewed, which was drawn from the code.
- The Windows PC.
