import { onValue, ref } from 'firebase/database'
import { db } from '../firebase'
import { logo, pieceIcon } from '../icons'
import { PLAYER_COLORS, statusOf, USERNAMES, type Player } from '../players'
import { DIFFICULTIES, type Difficulty } from '../puzzle/cut'
import { preparePuzzle, savePuzzle, UPLOAD_COOLDOWN_MS, UploadError, type PuzzleMeta } from '../upload'
import type { Lobby, View } from './lobby'
import { renderPlay } from './play'

const label = (d: Difficulty) => d[0].toUpperCase() + d.slice(1)

export function renderMenu(root: HTMLElement, lobby: Lobby): View {
  let puzzles: [string, PuzzleMeta][] = []
  let lastUpload = 0
  let uploading = false
  let playing: { unmount(): void } | null = null
  let players: Player[] = []
  let now = 0

  const subs = [
    onValue(ref(db, 'puzzles'), s => {
      puzzles = Object.entries<PuzzleMeta>(s.val() ?? {}).sort((a, b) => b[1].createdAt - a[1].createdAt)
      drawGrid()
    }),
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
              ${Object.keys(DIFFICULTIES).map((d, i) => `
                <label class="option">
                  <input type="radio" name="difficulty" value="${d}" ${i ? '' : 'checked'} />
                  <span class="option-name">${label(d as Difficulty)}</span>
                  <span class="option-count" data-count="${d}"></span>
                </label>`).join('')}
            </div>
            <p class="hint">Solo preview for now: match invites arrive in M4.</p>
            <div class="picker-actions">
              <button class="btn btn-ghost" value="cancel">Cancel</button>
              <button class="btn" value="start">Start</button>
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

    const dialog = root.querySelector('dialog')!
    let picked = ''
    root.querySelector('.puzzles')!.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
      const meta = card && puzzles.find(([id]) => id === card.dataset.id)?.[1]
      if (!meta) return
      picked = card.dataset.id!
      dialog.querySelector('img')!.src = meta.thumb
      for (const d of Object.keys(DIFFICULTIES) as Difficulty[]) {
        dialog.querySelector(`[data-count="${d}"]`)!.textContent = `${meta.cuts[d].cols * meta.cuts[d].rows} pieces`
      }
      dialog.showModal()
    })
    dialog.addEventListener('close', () => {
      const meta = puzzles.find(([id]) => id === picked)?.[1]
      if (dialog.returnValue !== 'start' || !meta) return
      const difficulty = new FormData(dialog.querySelector('form')!).get('difficulty') as Difficulty
      playing = renderPlay(root, { id: picked, meta, difficulty, color: PLAYER_COLORS.blue, onExit: showMenu })
    })

    drawGrid()
    refresh()
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
      card.append(img, meta)
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
    if (playing) return
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
    },
    unmount() {
      subs.forEach(unsub => unsub())
      playing?.unmount()
    },
  }
}
