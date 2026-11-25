# The app on a phone

Every screen of the app in iOS Safari, after the redesign (ADR 0039) had been seen at phone width only in a headless browser. Checked 2026-11-25 on the Mac, on Xcode's iPhone 17 simulator (iOS 27.2, build 24B8117; 402 × 874 pt) with real touches, the iPhone 17e (390 pt wide) for widths. Not on a real phone: what a simulator can't tell (touch on glass, one device's quirks) is still the owner's to check. Sizes are in points.

## How it's driven

- **`xcrun simctl`** boots the simulator, opens a URL (`xcrun simctl openurl <udid> http://127.0.0.1:5180/`) and takes screenshots (`xcrun simctl io <udid> screenshot`). The simulator shares the Mac's network, so the running `deno task dev` is reached as it is.
- **Real touches through XCUITest**: a small Xcode project kept outside the repo, a UI test that reads steps from a file (`tap:X,Y`, `press:X,Y,SECONDS` for a long press, `drag:X1,Y1,X2,Y2,HOLD`, `type:TEXT` on the on-screen keyboard, `tapid:LABEL` by accessibility label, `tree:PATH` for Safari's accessibility tree, `shot:PATH`, `rotate:left|portrait`) and runs them against Safari, about 15 s a run (`xcodebuild build-for-testing` once, then `xcodebuild test-without-building` with `TEST_RUNNER_DRIVE_STEPS=<file>`). The tree gives each button's place and size, which is how the sizes here were measured.
- **Not safaridriver**: on iOS 27.2 the simulator's Safari has no Remote Automation setting, and safaridriver finds no simulator to drive. Nor `idb`: the owner preferred nothing installed beyond Xcode.
- **Things to know**: `typeText` leaves Shift reported as held, so the next Return makes a new line (tap a real key first). XCUITest's landscape screenshots come out portrait-shaped, to be turned; `simctl`'s are already landscape. The simulator plays sound through the Mac's speakers, so music left on there is heard at the desk. "Open in Finder" shows in the simulator because it's at 127.0.0.1 on the app's machine (`fromThisMachine`); a real phone on the network doesn't see it.
- Pictures, clips and music were made on the PC's ComfyUI over the network, voices and 3D on the Mac.

## What works

Every page fits the width, the rail at the bottom; Settings' sections, each changed on the phone and held across a reload (a switch, a radio, a text box, the theme, Dark reading well); the drawer's tabs and All Frames; a long press on a picture (1.2 s) opening the app's picture menu, not Safari's image menu; Return sending a Message (keydown `Enter`, `shiftKey` false); Begin, the Reply streaming in, Suggest, Undo putting the Message back; a Frame pictured on the PC in seconds; music directed and played once the page has been touched; a Chain from a Roleplay Frame, an Action, Cancel and Undo; a Storyboard planned, written and rewritten; export (Safari downloads the zip) and import (the Files picker offers it); renaming in the Session manager; the Queue with work running; Look closer swiping between pictured Frames; a clip made on the PC (1 min 43 s) and played inline with iOS's own controls; a SHARP scene (14 s) and a TripoSplat figure (1 min 20 s) made on the Mac and turned; an Upscale on the PC (17 s); a repaint mask painted by touch, with Undo. Notifications aren't offered, as iOS Safari gives them only to a web app added to the Home Screen.

## What was found and fixed (2026-11-25)

Each a commit of its own; what it was, then what it is now.

- **The on-screen keyboard hid the text box.** iOS Safari lays the page out as if the keyboard weren't there (only the visual viewport shrinks), so a screen sized to the window (`h-dvh`) kept the box behind it, or iOS scrolled the whole page up. Now, while a text field has focus and the visual viewport is much shorter than the page, the screen is pinned to what's seen (`useOnScreenKeyboard`): the box sits on the keyboard, the rail and the picture go, the strip folds to numbers (`fold:`, shared with a short window) and the story keeps its end in view.
- **A line Listened to before it was spoken never played**, and Speak replies never played: iOS lets an audio element play by itself only once it has played from a tap. The first tap or key on a Roleplay plays a moment of silence on its voice player (`useListening`). Speak replies, using the same player, wasn't checked again.
- **Dragging a Beat selected its tile's text** (the drag itself worked). The plan's tiles select no text and open no Safari menu.
- **The Queue's phone column grew to its longest line**, its ✕ and Dismiss off the edge; it now shrinks, and a failure's reason wraps.
- **Re-render had no name** when the toolbar shows only icons; it's titled.
- **The strip's ▦ covered the last tile**; it sits beside the tiles, which scroll on their own.
- **The text box wrapped at half its width**, Suggest, Undo, ⋯ and Send beside what's typed (a draft took five lines). On a phone they go on a row under it; the box is two rows even empty, which the owner took.
- **On its side, a Roleplay's story was a line high** under Safari's bars. With little height (`short:`) the picture and the story sit side by side, as on a wide screen; a Storyboard's Beat and a Chain's Action likewise. Safari's landscape tab bar (several tabs open) still takes room: the app can't hide it, the player can in iOS Settings.
- **The 3D viewer turned far too fast by touch** (a 100 pt drag turned a scene 142°): three.js's OrbitControls turns once round for a drag the canvas's height, a phone's about 250. It turns as on a canvas 600 px tall at the least (60° for the same drag), and on a touch screen its help says pinch and two fingers.
- **The page showed through Look closer and the 3D viewer**, and Look closer's ✕ was 9 pt wide. On a touch screen both are on solid black, and the ✕'s tap area reaches 44 pt.
- **Music played on in a tab left behind.** `simctl openurl` opens a new Safari tab each time, and each tab of the Roleplay read the stored switch (on) and played its own copy of the Track; turning Music off in one left the others playing, as the switch isn't shared between tabs, and the player paused only on leaving the screen, not when its tab was hidden. It fades while its tab is hidden now, and comes back with it.
- **The 3D menu opened in place** where the picture's other menus open as a sheet from the bottom: the toolbar's `backdrop-blur` became the sheet's frame, and its layer was under the text box. A menu's sheet is moved out to the story it's in (`PopMenu`).

## Kept as they are

- **Small touch targets** (the owner, 2026-11-25). Most buttons are 21 to 31 pt, under Apple's 44 pt guideline (WCAG 2.2 asks 24 at its usual level). A prototype at 44 pt made the header 12 pt taller and the toolbar thicker, which costs the screen room immersion needs. Only Listen, an icon in running text (15 to 19 pt), reaches 44 pt, unseen (`tap-around`). Look closer's ← and → stay 22 × 28, 34 pt apart.

## Left, small

- **A tap on the Session's title starts renaming it**, all of it selected, so the next key replaces it; easy by accident when closing a menu. Nothing is saved until Done.
- **The 3D viewer opens with a focus ring on its first button** ("← 30°", "← Side").
- **The repaint box's placeholder is cut mid-word** on its third line.
- **A clip plays with the drawer open over most of it.**
- **"Frame N isn't pictured"** shows on a Frame whose Image Prompt is written but not rendered: in CONTEXT.md's terms it's pictured. Not a phone matter.
- **Not checked**: LiTo (the same viewer as TripoSplat), an edit sent (the Mac's Qwen-Image Edit is a heavy run), pinch and two-finger drag (the driver has one finger), Speak replies after the fix, the keyboard in a Storyboard and on the Scenario page.
