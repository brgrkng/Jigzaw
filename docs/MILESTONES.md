# Jigzaw — milestones

A private, real-time co-op jigsaw for Mesba and Kazi. Upload a photo, get Easy / Medium / Hard puzzles
cut from it, and solve them together on two desktop browsers.

Each milestone ends with a short "Test it" list. We fix bugs found there before starting the next one.

## Confirmed intent

- **Players:** only Mesba and Kazi, email/password sign-in (usernames map to `<name>@jigzaw.game`).
- **Waiting room:** both players must be ready. Being offline for more than 30 seconds (closed tab, closed browser, lost wifi) un-readies you. A quick refresh doesn't.
- **Main menu:** a grid of puzzles with an **Upload image** button above it, and an empty state when there are none. Pick a puzzle, then a difficulty; the other player gets an accept/decline prompt. Accept opens the board, decline returns to the menu.
- **Puzzles:** Easy ≈ 50, Medium ≈ 150, Hard ≈ 300 pieces (a 4th tier is planned for later). We keep the photo's aspect ratio and pick the grid that keeps pieces closest to square, so counts are targets, not exact. Only extreme panoramas (wider than about 3:1) get cropped.
- **Uploads:** image files only, ≤ 25 MB, ≥ ~1.2 MP (so every Hard piece is at least ~64 px), with an upload cooldown. Images are downscaled in the browser before saving.
- **Board:** a large, zoomable play area with a frame outline in the middle. Click a piece to select it; the selection is outlined in the player's color (blue for whoever started the match, orange for the other player). Move pieces, and rotate them in 90° steps both ways.
- **Locks:** a piece or group held by one player can't be grabbed by the other. Trying plays `meep_merp.mp3`, a placeholder you'll replace with your own file.
- **Snapping:** a piece snaps only to its correct neighbor, with the correct connector and the correct rotation. Joined pieces then move and rotate as one group.
- **Frame:** the border is sticky. Any edge piece with the right rotation slides flush onto the matching border, and corner pieces onto their corners. The frame only locks a group once the whole puzzle is a single group inside it, which is the win.
- **Saves:** one save per puzzle per difficulty, kept automatically after every move. You choose Resume or Restart, and either goes through accept/decline. If either player exits, or drops for more than 30 seconds, both go back to the menu.
- **Stack:** Vite + TypeScript (no UI framework), Canvas 2D board, Firebase Auth + Realtime Database (no Cloud Storage, so we stay on the free Spark plan), hosted on GitHub Pages.
- **Out of scope for now:** phone/touch, the 4th tier, sign-up or more users, deleting or renaming puzzles, solo play, chat, scoring and timers.

## M1 — Foundations: sign-in and waiting room ✅

- Vite + TS scaffold with the theme: Fredoka + Nunito fonts, chunky ink outlines, solid offset shadows, no gradients.
- Firebase emulators (Auth + RTDB) for local dev. `npm run dev` starts everything and creates both users.
- Database rules: only the two accounts can read, and each player can only write their own record.
- Sign-in screen.
- Waiting room with live presence: ready toggle, a "Reconnecting… Ns" countdown, and auto un-ready after 30 seconds.
- Placeholder main menu (header plus the empty state) shown once both players are ready.

**Test it**
- [ ] Two browser tabs: sign in as Mesba in one and Kazi in the other.
- [ ] Wrong password or an unknown username shows a friendly error.
- [ ] Ready up in both tabs → both move to the main menu.
- [ ] Close one tab → the other shows a countdown, and after 30 s goes back to the waiting room with that player not ready.
- [ ] Refresh a tab within 30 s → you stay ready.

## M2 — Puzzle generator and solo board 🧪 ready to test

- Seeded piece-shape generator with classic and modern connector variants. The same seed always gives the same pieces, so we only save `seed + grid` per difficulty.
- Grid sizing for 50 / 150 / 300 that respects the aspect ratio.
- Canvas board: pan and zoom, the frame outline, and scattered, randomly rotated pieces.
- Select (outlined), drag, and rotate (Q / E keys, or right-click and Shift + right-click).
- Neighbor snapping and grouping, sticky frame borders, and a completion lock with a little celebration.
- Runs solo from a local image (dev-only page) so the feel can be tuned before networking.

**Test it**: run `npm run dev`, open http://localhost:5173/?solo#board, and use **Choose image** to try your own photos.
- [ ] Finish an Easy puzzle alone; check that snapping only works with the correct rotation.
- [ ] Edge and corner pieces slide onto the frame border.
- [ ] Zoom and pan stay smooth with 300 pieces.

## M3 — Upload and puzzle library

- Upload button with checks: file type, ≤ 25 MB, ≥ ~1.2 MP, and a cooldown enforced in the database rules, not just the UI.
- Downscale in the browser (~2560 px long edge JPEG) plus a thumbnail, then save the image and all three difficulty definitions to RTDB.
- Main-menu puzzle grid with thumbnails, the empty state, and a difficulty picker.

**Test it**
- [ ] Upload a big photo and see it appear for both players.
- [ ] A tiny or non-image file is rejected with a clear reason.
- [ ] A second upload right away is blocked by the cooldown.

## M4 — Live co-op match

- Match invite: the other player gets an accept/decline prompt. The starter is blue, the other orange.
- Shared board state in RTDB: positions, rotations and groups sync live.
- Piece and group locks via database transactions, plus `meep_merp.mp3` on a denied grab.
- Each player sees the other's selection outlined in their color.
- Exit, or a drop longer than 30 s, sends both players back to the menu.

**Test it**
- [ ] Two tabs solve a Medium puzzle together.
- [ ] Grabbing what the other player holds plays the sound and does nothing else.
- [ ] Declining an invite returns both to the menu.

## M5 — Saves and resume

- The game state persists per puzzle + difficulty, saved after every move.
- Progress % shown on each difficulty, and Resume / Restart, both going through the invite.

**Test it**
- [ ] Quit halfway, sign out, come back the next day, and Resume puts every piece where it was.
- [ ] Restart resets to a fresh scatter.

## M6 — Deploy

- A real Firebase project (Spark plan): enable Email/Password, **disable sign-up**, create the two users, and paste the web config.
- Deploy rules, plus a GitHub Actions workflow to GitHub Pages.
- Two-device test over the internet.

You can move this earlier whenever you want to test on two real devices. It only needs your Firebase project.

## Later

- Phone and touch support.
- The 4th difficulty tier.
