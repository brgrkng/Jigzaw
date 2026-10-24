import { get, onValue, ref, remove, runTransaction, serverTimestamp, update } from 'firebase/database'
import { db } from '../firebase'
import { logo, pieceIcon } from '../icons'
import { PLAYER_COLORS, statusOf, USERNAMES, type Player, type Username } from '../players'
import { DIFFICULTIES, type Difficulty } from '../puzzle/cut'
import { scatter } from '../puzzle/state'
import { preparePuzzle, savePuzzle, UPLOAD_COOLDOWN_MS, UploadError, type PuzzleMeta } from '../upload'
import type { Lobby, View } from './lobby'
import { gameKey, renderPlay, type Seat } from './play'

/** The one match the two of you can have going. `from` started it and plays blue. */
type Match = { puzzleId: string; difficulty: Difficulty; from: string; status: 'invited' | 'playing' | 'declined'; restart: boolean }
type Progress = { pct: number; done: boolean }

const DIFFS = Object.keys(DIFFICULTIES) as Difficulty[]
const label = (d: Difficulty) => d[0].toUpperCase() + d.slice(1)
const progressText = (p: Progress) => (p.done ? 'done' : `${p.pct}%`)

export function renderMenu(root: HTMLElement, lobby: Lobby): View {
  let puzzles: [string, PuzzleMeta][] = []
  let progress: Record<string, Progress> = {}
  let match: Match | null = null
  let lastUpload = 0
  let uploading = false
  let playing: (ReturnType<typeof renderPlay> & { key: string }) | null = null
  let players: Player[] = []
  let now = 0
  let picked = ''
  /** This invite was just answered here; don't pop it back up while the database catches up. */
  let answered = false

  const other = () => players.find(p => p.name !== lobby.name)
  const metaOf = (id: string) => puzzles.find(([pid]) => pid === id)?.[1]

  const subs = [
    onValue(ref(db, 'puzzles'), s => {
      puzzles = Object.entries<PuzzleMeta>(s.val() ?? {}).sort((a, b) => b[1].createdAt - a[1].createdAt)
      drawGrid()
      sync()
    }),
    onValue(ref(db, 'progress'), s => { progress = s.val() ?? {}; drawGrid() }),
    onValue(ref(db, 'match'), s => { match = s.val(); sync() }),
    onValue(ref(db, `lastUpload/${lobby.uid}`), s => { lastUpload = s.val() ?? 0; refresh() }),
  ]

  function showMenu() {
    playing?.unmount()
    playing = null
    root.innerHTML = `
      <section class="screen">
        <header class="topbar">
          ${logo}
          <div class="topbar-right">
            ${USERNAMES.map((n, i) => `<span class="chip" data-name="${n}">${pieceIcon(`var(--${i ? 'lilac' : 'pink'})`)}${n}<small></small></span>`).join('')}
            <button class="btn btn-ghost btn-small" data-back>Back to waiting room</button>
          </div>
        </header>
        <div class="menu">
          <div class="menu-toolbar">
            <h1>Your puzzles</h1>
            <div class="upload">
              <p class="upload-status" role="status"></p>
              <button class="btn" data-upload>Upload image</button>
              <input type="file" accept="image/*" hidden />
            </div>
          </div>
          <div class="puzzles"></div>
        </div>

        <dialog class="card picker">
          <form method="dialog">
            <img class="picker-thumb" alt="" />
            <h2>Pick a difficulty</h2>
            <div class="picker-options">
              ${DIFFS.map((d, i) => `
                <label class="option">
                  <input type="radio" name="difficulty" value="${d}" ${i ? '' : 'checked'} />
                  <span class="option-name">${label(d)}</span>
                  <span class="option-count" data-count="${d}"></span>
                </label>`).join('')}
            </div>
            <div class="picker-actions">
              <button class="btn btn-ghost" value="cancel">Cancel</button>
              <button class="btn btn-ghost" value="restart" data-restart>Restart</button>
              <button class="btn" value="start" data-start>Start</button>
            </div>
          </form>
        </dialog>

        <dialog class="card notice waiting-note">
          <form method="dialog">
            <h2 data-waiting></h2>
            <p>They'll get a prompt to join you.</p>
            <div class="picker-actions"><button class="btn btn-ghost" value="cancel">Cancel</button></div>
          </form>
        </dialog>

        <dialog class="card notice invite">
          <form method="dialog">
            <img class="picker-thumb" alt="" />
            <h2 data-invite></h2>
            <p data-invite-detail></p>
            <div class="picker-actions">
              <button class="btn btn-ghost" value="decline">Not now</button>
              <button class="btn" value="accept">Let's play</button>
            </div>
          </form>
        </dialog>
      </section>`

    const input = root.querySelector<HTMLInputElement>('input[type=file]')!
    root.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => lobby.setReady(false)
    root.querySelector<HTMLButtonElement>('[data-upload]')!.onclick = () => input.click()
    input.onchange = () => {
      const file = input.files?.[0]
      input.value = ''
      if (file) upload(file)
    }

    const picker = root.querySelector<HTMLDialogElement>('dialog.picker')!
    const chosen = () => new FormData(picker.querySelector('form')!).get('difficulty') as Difficulty
    const updateActions = () => {
      const p = progress[gameKey(picked, chosen())]
      picker.querySelector<HTMLButtonElement>('[data-restart]')!.hidden = !p
      picker.querySelector<HTMLButtonElement>('[data-start]')!.textContent = p ? 'Resume' : 'Start'
    }
    picker.addEventListener('change', updateActions)
    root.querySelector('.puzzles')!.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
      const meta = card && metaOf(card.dataset.id!)
      if (!meta) return
      picked = card.dataset.id!
      picker.querySelector('img')!.src = meta.thumb
      for (const d of DIFFS) {
        const p = progress[gameKey(picked, d)]
        picker.querySelector(`[data-count="${d}"]`)!.textContent =
          `${meta.cuts[d].cols * meta.cuts[d].rows} pieces${p ? ` · ${progressText(p)}` : ''}`
      }
      updateActions()
      picker.showModal()
    })
    picker.addEventListener('close', () => {
      const action = picker.returnValue
      if (action === 'start' || action === 'restart') invite(picked, chosen(), action === 'restart')
    })

    // These two open and close with the match, so answer on submit/Escape (synchronous) rather than on `close`,
    // which a re-sync can swallow.
    const answer = (dialog: string, act: (value: string) => void) => {
      const box = root.querySelector<HTMLDialogElement>(dialog)!
      box.addEventListener('submit', e => { answered = true; act((e.submitter as HTMLButtonElement | null)?.value ?? '') })
      box.addEventListener('cancel', () => { answered = true; act('') })
    }
    answer('dialog.waiting-note', () => remove(ref(db, 'match')))
    answer('dialog.invite', value => {
      if (match?.status !== 'invited') return
      if (value === 'accept') accept(match)
      else update(ref(db, 'match'), { status: 'declined' })
    })

    drawGrid()
    refresh()
    sync()
  }

  /** Puts the screen in step with the match: the shared board, a waiting note, an invite, or just the menu. */
  function sync() {
    const m = match
    const meta = m && metaOf(m.puzzleId)
    if (m?.status === 'playing') {
      const them = other()
      if (!meta || !them?.uid) return // still loading; called again when it arrives
      const key = gameKey(m.puzzleId, m.difficulty)
      if (playing?.key === key) return
      playing?.unmount()
      const iStarted = m.from === lobby.uid
      const seat = (uid: string, name: Username, starter: boolean): Seat => ({ uid, name, color: starter ? PLAYER_COLORS.blue : PLAYER_COLORS.orange })
      playing = {
        key,
        ...renderPlay(root, {
          puzzleId: m.puzzleId, meta, difficulty: m.difficulty, iStarted,
          me: seat(lobby.uid, lobby.name, iStarted),
          other: seat(them.uid, them.name, !iStarted),
          onExit: () => remove(ref(db, 'match')),
        }),
      }
      return
    }
    if (playing) return showMenu()

    const mine = m?.from === lobby.uid
    if (m?.status !== 'invited') answered = false
    if (m?.status === 'declined' && mine) {
      setStatus(`${other()?.name ?? 'They'} said not now.`, 'error')
      remove(ref(db, 'match'))
    }
    const waiting = root.querySelector<HTMLDialogElement>('dialog.waiting-note')
    const inviteBox = root.querySelector<HTMLDialogElement>('dialog.invite')
    if (!waiting || !inviteBox) return
    waiting.querySelector('[data-waiting]')!.textContent = `Waiting for ${other()?.name ?? 'the other player'}…`
    toggle(waiting, m?.status === 'invited' && mine && !answered)
    const invited = m?.status === 'invited' && !mine && !!meta && !answered
    if (invited) {
      const cut = meta.cuts[m.difficulty]
      const saved = progress[gameKey(m.puzzleId, m.difficulty)]
      inviteBox.querySelector('img')!.src = meta.thumb
      inviteBox.querySelector('[data-invite]')!.textContent = `${players.find(p => p.uid === m.from)?.name ?? 'Someone'} wants to play!`
      inviteBox.querySelector('[data-invite-detail]')!.textContent = `${label(m.difficulty)} · ${cut.cols * cut.rows} pieces · ${
        !saved ? 'new game' : m.restart ? 'starting over' : `picking up at ${progressText(saved)}`}`
    }
    toggle(inviteBox, invited)
  }

  const toggle = (d: HTMLDialogElement, open: boolean) => {
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close('auto')
  }

  async function invite(puzzleId: string, difficulty: Difficulty, restart: boolean) {
    const fresh: Match = { puzzleId, difficulty, from: lobby.uid, status: 'invited', restart }
    const { committed } = await runTransaction(ref(db, 'match'), cur => (cur ? undefined : fresh))
    if (!committed) setStatus('Something is already starting, hang on.', 'error')
  }

  /** Accepting sets up the board when there's no save (or on a restart), then both of you jump in. */
  async function accept(m: Match) {
    const meta = metaOf(m.puzzleId)!
    const key = gameKey(m.puzzleId, m.difficulty)
    const changes: Record<string, unknown> = { 'match/status': 'playing', [`games/${key}/held`]: null }
    const saved = await get(ref(db, `games/${key}/groups`))
    if (m.restart || !saved.exists()) {
      const cut = meta.cuts[m.difficulty]
      const fresh = scatter({ cols: cut.cols, rows: cut.rows, pw: meta.width / cut.cols, ph: meta.height / cut.rows }, Math.random)
      delete changes[`games/${key}/held`]
      changes[`games/${key}`] = { groups: fresh.groups, done: false }
      changes[`progress/${key}`] = { pct: 0, done: false, at: serverTimestamp() }
    }
    await update(ref(db), changes)
  }

  function drawGrid() {
    const box = playing ? null : root.querySelector('.puzzles')
    if (!box) return
    if (!puzzles.length) {
      box.innerHTML = `
        <div class="card empty">
          ${pieceIcon('var(--mint)')}
          <h2>No puzzles yet</h2>
          <p>Upload a photo and it'll be cut into Easy, Medium and Hard puzzles for you both.</p>
        </div>`
      return
    }
    box.innerHTML = '<div class="puzzle-grid"></div>'
    const grid = box.firstElementChild!
    for (const [id, p] of puzzles) {
      const card = document.createElement('button')
      card.className = 'card puzzle-card'
      card.dataset.id = id
      const img = document.createElement('img')
      img.src = p.thumb
      img.alt = `Puzzle uploaded by ${p.by}`
      const meta = document.createElement('span')
      meta.className = 'puzzle-meta'
      meta.textContent = `by ${p.by} · ${new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
      const badges = document.createElement('span')
      badges.className = 'badges'
      for (const d of DIFFS) {
        const pr = progress[gameKey(id, d)]
        if (!pr) continue
        const b = document.createElement('span')
        b.className = `badge${pr.done ? ' badge-done' : ''}`
        b.textContent = `${label(d)} ${progressText(pr)}`
        badges.append(b)
      }
      card.append(img, meta, badges)
      grid.append(card)
    }
  }

  function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
    const el = root.querySelector<HTMLElement>('.upload-status')
    if (!el) return
    el.textContent = text
    el.className = `upload-status ${kind}`
  }

  async function upload(file: File) {
    uploading = true
    refresh()
    setStatus('Cutting your puzzle…')
    try {
      const prepared = await preparePuzzle(file)
      setStatus('Saving…')
      await savePuzzle(lobby.uid, lobby.name, prepared)
      setStatus('Puzzle added!', 'ok')
    } catch (err) {
      console.error(err)
      setStatus(err instanceof UploadError ? err.message : "Upload didn't go through. Try again in a minute.", 'error')
    } finally {
      uploading = false
      refresh()
    }
  }

  /** Player chips and the upload cooldown; called every second by the lobby. */
  function refresh() {
    if (playing) return playing.update(players, now)
    for (const n of USERNAMES) {
      const chip = root.querySelector(`.chip[data-name="${n}"]`)
      if (!chip) continue
      const s = statusOf(players.find(p => p.name === n), now)
      chip.classList.toggle('chip-away', s.kind === 'away')
      chip.querySelector('small')!.textContent = s.kind === 'away' ? s.label : ''
    }
    const button = root.querySelector<HTMLButtonElement>('[data-upload]')
    if (!button) return
    const wait = Math.ceil((lastUpload + UPLOAD_COOLDOWN_MS - now) / 1000)
    button.disabled = uploading || wait > 0
    button.textContent = uploading ? 'Uploading…' : wait > 0 ? `Upload again in ${wait}s` : 'Upload image'
  }

  showMenu()
  return {
    update(p, t) {
      players = p
      now = t
      refresh()
      sync()
    },
    unmount() {
      subs.forEach(unsub => unsub())
      playing?.unmount()
    },
  }
}
