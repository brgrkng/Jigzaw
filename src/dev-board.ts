// Dev-only solo board (open /#board while `npm run dev` is running) for tuning the puzzle feel before networking.
import { logo } from './icons'
import { PLAYER_COLORS } from './players'
import { mountBoard } from './puzzle/board'
import { DIFFICULTIES, gridFor, type Difficulty } from './puzzle/cut'

const MAX_EDGE = 2560

export function runDevBoard(root: HTMLElement) {
  root.innerHTML = `
    <section class="screen board-screen">
      <header class="topbar">
        ${logo}
        <div class="topbar-right">
          <div class="segmented" role="group" aria-label="Difficulty">
            ${Object.keys(DIFFICULTIES).map(d => `<button class="btn btn-small" data-difficulty="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}
          </div>
          <label class="btn btn-ghost btn-small">Choose image<input type="file" accept="image/*" hidden /></label>
          <button class="btn btn-ghost btn-small" data-shuffle>Shuffle</button>
        </div>
      </header>
      <div class="board-host"></div>
    </section>`

  const host = root.querySelector<HTMLElement>('.board-host')!
  let difficulty: Difficulty = 'easy'
  let image: CanvasImageSource & { width: number; height: number } = sampleImage()
  let board: ReturnType<typeof mountBoard> | undefined

  function start() {
    board?.destroy()
    const { cols, rows } = gridFor(image.width, image.height, DIFFICULTIES[difficulty])
    board = mountBoard(host, { image, cols, rows, seed: Math.floor(Math.random() * 2 ** 31), color: PLAYER_COLORS.blue })
    Object.assign(window, { board }) // poke at it from the console
    root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.difficulty === difficulty)))
  }

  root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => {
    b.onclick = () => { difficulty = b.dataset.difficulty as Difficulty; start() }
  })
  root.querySelector<HTMLButtonElement>('[data-shuffle]')!.onclick = start
  root.querySelector<HTMLInputElement>('input[type=file]')!.onchange = async e => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const full = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(full.width, full.height))
    image = scale === 1 ? full : await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * scale), resizeHeight: Math.round(full.height * scale), resizeQuality: 'high',
    })
    start()
  }
  start()
}

/** A cheerful, busy test picture so pieces are tellable apart without uploading anything. */
function sampleImage() {
  const c = document.createElement('canvas')
  c.width = 1600
  c.height = 1200
  const g = c.getContext('2d')!
  const ink = '#1d1b3a'
  g.lineWidth = 8
  g.strokeStyle = ink
  g.fillStyle = '#8fd3ff'
  g.fillRect(0, 0, 1600, 1200)
  const blob = (x: number, y: number, r: number, fill: string) => {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.stroke()
  }
  blob(1280, 240, 150, '#ffc93c')
  for (const [x, y] of [[260, 200], [380, 170], [500, 210], [760, 320], [860, 290]]) blob(x, y, 80, '#ffffff')
  blob(300, 1500, 800, '#4fd69c')
  blob(1300, 1550, 800, '#3cbf86')
  const stripes = ['#ff8fb4', '#ffc93c', '#4fd69c', '#2f7bf5', '#b9a2ff', '#ff8a2a']
  stripes.forEach((s, k) => { g.fillStyle = s; g.fillRect(0, 1040 + k * 27, 1600, 27) })
  for (let k = 0; k < 40; k++) blob(80 + ((k * 397) % 1440), 820 + ((k * 211) % 200), 18 + (k % 4) * 6, stripes[k % stripes.length])
  g.font = '700 220px Fredoka, system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillStyle = '#ffffff'
  g.lineWidth = 14
  g.strokeText('JIGZAW', 800, 640)
  g.fillText('JIGZAW', 800, 640)
  return c
}
