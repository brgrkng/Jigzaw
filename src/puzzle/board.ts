import { generateEdges, pieceOutline, rng, type Point } from './cut'
import { checkDone, groupCenter, mergeNeighbors, rotateGroup, scatter, stickToFrame, turn, type Group } from './state'

export type BoardOptions = {
  image: CanvasImageSource & { width: number; height: number }
  cols: number
  rows: number
  seed: number
  /** Selection outline: blue for whoever started the match, orange for the other player. */
  color: string
  onComplete?(): void
}

const ROTATE_MS = 140
const MIN_ZOOM_FACTOR = 0.6
const MAX_ZOOM = 3

export function mountBoard(host: HTMLElement, opts: BoardOptions) {
  const { image, cols, rows, seed, color } = opts
  const W = image.width, H = image.height
  const geometry = { cols, rows, pw: W / cols, ph: H / rows }
  const { pw, ph } = geometry
  const pz = scatter(geometry, rng(seed ^ 0x9e3779b9))
  const { board } = pz

  // Cut every piece once into its own little bitmap; drawing is then just blitting.
  const edges = generateEdges(cols, rows, seed)
  const pad = Math.ceil(0.4 * Math.max(pw, ph))
  const paths: Path2D[] = []
  const bitmaps: HTMLCanvasElement[] = []
  for (let i = 0; i < cols * rows; i++) {
    const path = new Path2D()
    pieceOutline(i, cols, rows, pw, ph, edges).forEach((side, s) => {
      if (s === 0) path.moveTo(...side[0])
      if (side.length === 2) path.lineTo(...side[1])
      else for (let k = 1; k < side.length; k += 3) path.bezierCurveTo(...side[k], ...side[k + 1], ...side[k + 2])
    })
    path.closePath()
    paths.push(path)
    bitmaps.push(cutPiece(image, path, i % cols * pw, Math.floor(i / cols) * ph, pw, ph, pad))
  }

  host.innerHTML = `
    <canvas class="board-canvas"></canvas>
    <div class="board-hud board-hint">Drag to move · <kbd>Q</kbd> <kbd>E</kbd> or right-click to rotate · Scroll to zoom</div>
    <div class="board-hud board-zoom">
      <button class="btn btn-ghost btn-icon" data-zoom="in" aria-label="Zoom in">+</button>
      <button class="btn btn-ghost btn-icon" data-zoom="out" aria-label="Zoom out">−</button>
      <button class="btn btn-ghost btn-small" data-zoom="fit">Fit</button>
    </div>`
  const canvas = host.querySelector('canvas')!
  const ctx = canvas.getContext('2d')!
  const hitCtx = document.createElement('canvas').getContext('2d')!

  let order = Object.keys(pz.groups) // bottom → top
  let selected: string | null = null
  let drag: { id: string; last: Point } | null = null
  let pan: { x: number; y: number } | null = null
  const tweens = new Map<string, { pivot: Point; dir: number; start: number }>()
  const confetti: { x: number; y: number; vx: number; vy: number; spin: number; color: string; born: number }[] = []
  const cam = { x: 0, y: 0, z: 1 }
  let dirty = true

  const view = () => ({ w: canvas.clientWidth, h: canvas.clientHeight })
  const fitZoom = () => Math.min(view().w / board.w, view().h / board.h)
  function fit() {
    cam.z = fitZoom() * 0.98
    cam.x = board.x + board.w / 2 - view().w / 2 / cam.z
    cam.y = board.y + board.h / 2 - view().h / 2 / cam.z
    dirty = true
  }
  function zoomAt(factor: number, sx: number, sy: number) {
    const z = Math.min(MAX_ZOOM, Math.max(fitZoom() * MIN_ZOOM_FACTOR, cam.z * factor))
    cam.x += sx / cam.z - sx / z
    cam.y += sy / cam.z - sy / z
    cam.z = z
    dirty = true
  }
  const screenPoint = (e: MouseEvent): Point => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const worldPoint = (e: MouseEvent): Point => {
    const [sx, sy] = screenPoint(e)
    return [cam.x + sx / cam.z, cam.y + sy / cam.z]
  }
  const clampToBoard = ([x, y]: Point): Point => [
    Math.min(board.x + board.w, Math.max(board.x, x)),
    Math.min(board.y + board.h, Math.max(board.y, y)),
  ]

  function hitTest([wx, wy]: Point): string | null {
    for (let k = order.length - 1; k >= 0; k--) {
      const grp = pz.groups[order[k]]
      const [lx, ly] = turn([wx - grp.x, wy - grp.y], -grp.rot)
      for (const i of grp.pieces) {
        const px = lx - (i % cols) * pw, py = ly - Math.floor(i / cols) * ph
        if (px < -pad || py < -pad || px > pw + pad || py > ph + pad) continue
        if (hitCtx.isPointInPath(paths[i], px, py)) return order[k]
      }
    }
    return null
  }

  function select(id: string | null) {
    selected = id
    if (id) order = [...order.filter(o => o !== id), id]
    dirty = true
  }

  function rotate(id: string, dir: 1 | -1, pivot?: Point) {
    const grp = pz.groups[id]
    const p = pivot ?? groupCenter(geometry, grp)
    rotateGroup(grp, dir, p)
    tweens.set(id, { pivot: p, dir, start: performance.now() })
    if (!drag) settle(id)
    dirty = true
  }

  /** After a drop or turn: join neighbours, stick to the frame, and check for the win. */
  function settle(id: string) {
    const absorbed = mergeNeighbors(pz, id)
    order = order.filter(o => !absorbed.includes(o))
    const grp = pz.groups[id]
    stickToFrame(pz, grp)
    if (checkDone(pz, grp)) {
      selected = null
      celebrate()
      opts.onComplete?.()
    }
    dirty = true
  }

  // Input
  canvas.addEventListener('contextmenu', e => e.preventDefault())
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId)
    const hit = pz.done ? null : hitTest(worldPoint(e))
    if (e.button === 2) {
      if (hit) { select(hit); rotate(hit, e.shiftKey ? -1 : 1) }
    } else if (e.button === 0 && hit) {
      select(hit)
      drag = { id: hit, last: clampToBoard(worldPoint(e)) }
      canvas.classList.add('is-dragging')
    } else {
      if (e.button === 0) select(null)
      pan = { x: e.clientX, y: e.clientY }
      canvas.classList.add('is-panning')
    }
  })
  canvas.addEventListener('pointermove', e => {
    if (drag) {
      const p = clampToBoard(worldPoint(e))
      const grp = pz.groups[drag.id]
      grp.x += p[0] - drag.last[0]
      grp.y += p[1] - drag.last[1]
      drag.last = p
      dirty = true
    } else if (pan) {
      cam.x -= (e.clientX - pan.x) / cam.z
      cam.y -= (e.clientY - pan.y) / cam.z
      pan = { x: e.clientX, y: e.clientY }
      dirty = true
    }
  })
  const release = () => {
    if (drag) settle(drag.id)
    drag = null
    pan = null
    canvas.classList.remove('is-dragging', 'is-panning')
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    zoomAt(Math.exp(-e.deltaY * 0.0015), ...screenPoint(e))
  }, { passive: false })

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || !selected || pz.done) return
    const key = e.key.toLowerCase()
    if (key === 'q' || key === 'e') rotate(selected, key === 'e' ? 1 : -1, drag?.last)
    if (key === 'escape') select(null)
  }
  window.addEventListener('keydown', onKey)

  host.querySelector('.board-zoom')!.addEventListener('click', e => {
    const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom]')?.dataset.zoom
    const { w, h } = view()
    if (kind === 'fit') fit()
    else if (kind) zoomAt(kind === 'in' ? 1.3 : 1 / 1.3, w / 2, h / 2)
  })

  function celebrate() {
    const colors = ['#ffc93c', '#ff8fb4', '#4fd69c', '#b9a2ff', '#2f7bf5', '#ff8a2a']
    const { w } = view()
    const now = performance.now()
    for (let k = 0; k < 160; k++) {
      confetti.push({
        x: Math.random() * w, y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4,
        spin: Math.random() * Math.PI, color: colors[k % colors.length], born: now,
      })
    }
    host.insertAdjacentHTML('beforeend', `<div class="board-win card" role="status"><h2>You did it!</h2><p>Every piece is home.</p></div>`)
  }

  // Rendering
  const dpr = () => window.devicePixelRatio || 1
  // The view scales with the window: same spot in the middle, same share of the table on screen.
  let last = { w: 0, h: 0 }
  const observer = new ResizeObserver(() => {
    const now = view()
    if (!now.w || !now.h) return
    canvas.width = Math.round(now.w * dpr())
    canvas.height = Math.round(now.h * dpr())
    if (!last.w) fit()
    else {
      const centerX = cam.x + last.w / 2 / cam.z, centerY = cam.y + last.h / 2 / cam.z
      cam.z *= Math.min(now.w / board.w, now.h / board.h) / Math.min(last.w / board.w, last.h / board.h)
      cam.x = centerX - now.w / 2 / cam.z
      cam.y = centerY - now.h / 2 / cam.z
    }
    last = now
    dirty = true
  })
  observer.observe(canvas)

  const ease = (t: number) => 1 - (1 - t) ** 3
  function drawGroup(id: string, grp: Group, now: number) {
    ctx.save()
    const tw = tweens.get(id)
    if (tw) {
      const t = (now - tw.start) / ROTATE_MS
      if (t >= 1) tweens.delete(id)
      else {
        ctx.translate(...tw.pivot)
        ctx.rotate((-tw.dir * Math.PI) / 2 * (1 - ease(t)))
        ctx.translate(-tw.pivot[0], -tw.pivot[1])
      }
    }
    ctx.translate(grp.x, grp.y)
    ctx.rotate((grp.rot * Math.PI) / 2)
    const at = (i: number): Point => [(i % cols) * pw, Math.floor(i / cols) * ph]

    if (id === selected) {
      // Lifted shadow while dragging, then a thick outline; the pieces drawn on top leave only the rim showing.
      if (drag?.id === id) {
        ctx.fillStyle = 'rgba(29, 27, 58, 0.22)'
        const [ox, oy] = turn([5 / cam.z, 7 / cam.z], -grp.rot)
        for (const i of grp.pieces) { ctx.save(); ctx.translate(at(i)[0] + ox, at(i)[1] + oy); ctx.fill(paths[i]); ctx.restore() }
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 7 / cam.z
      ctx.lineJoin = 'round'
      for (const i of grp.pieces) { ctx.save(); ctx.translate(...at(i)); ctx.stroke(paths[i]); ctx.restore() }
    }
    for (const i of grp.pieces) ctx.drawImage(bitmaps[i], at(i)[0] - pad, at(i)[1] - pad)
    ctx.restore()
  }

  let raf = 0
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    if (!dirty && tweens.size === 0 && confetti.length === 0) return
    dirty = false
    const d = dpr()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#e6d9c2'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(d * cam.z, 0, 0, d * cam.z, -cam.x * cam.z * d, -cam.y * cam.z * d)

    // Table, then the frame the picture goes in.
    ctx.fillStyle = '#f4ecdd'
    ctx.strokeStyle = '#1d1b3a'
    ctx.lineWidth = 3 / cam.z
    ctx.beginPath()
    ctx.roundRect(board.x, board.y, board.w, board.h, 40 / cam.z)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fffaf1'
    ctx.fillRect(0, 0, W, H)
    ctx.setLineDash(pz.done ? [] : [14 / cam.z, 10 / cam.z])
    ctx.strokeRect(0, 0, W, H)
    ctx.setLineDash([])

    for (const id of order) drawGroup(id, pz.groups[id], now)

    if (confetti.length) {
      ctx.setTransform(d, 0, 0, d, 0, 0)
      const { h } = view()
      for (let k = confetti.length - 1; k >= 0; k--) {
        const c = confetti[k]
        c.x += c.vx
        c.y += c.vy
        c.spin += 0.15
        if (c.y > h + 20 || now - c.born > 6000) { confetti.splice(k, 1); continue }
        ctx.save()
        ctx.translate(c.x, c.y)
        ctx.rotate(c.spin)
        ctx.fillStyle = c.color
        ctx.fillRect(-5, -3, 10, 6)
        ctx.restore()
      }
    }
  }
  raf = requestAnimationFrame(frame)

  return {
    puzzle: pz,
    /** Call after changing `puzzle` from outside; keeps the stacking order in step with the groups. */
    redraw() {
      order = [...order.filter(id => id in pz.groups), ...Object.keys(pz.groups).filter(id => !order.includes(id))]
      if (selected && !(selected in pz.groups)) selected = null
      dirty = true
    },
    destroy() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('keydown', onKey)
      host.innerHTML = ''
    },
  }
}

/** One piece's bitmap: the image clipped to its outline, with a soft bevel so the cuts read. */
function cutPiece(image: CanvasImageSource, path: Path2D, x: number, y: number, pw: number, ph: number, pad: number) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(pw + 2 * pad)
  c.height = Math.ceil(ph + 2 * pad)
  const g = c.getContext('2d')!
  const bevel = Math.max(1, Math.min(pw, ph) * 0.02)
  g.translate(pad, pad)
  g.save()
  g.clip(path)
  g.drawImage(image, -x, -y)
  g.lineWidth = bevel * 2
  g.translate(-bevel / 2, -bevel / 2)
  g.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  g.stroke(path)
  g.translate(bevel, bevel)
  g.strokeStyle = 'rgba(0, 0, 0, 0.3)'
  g.stroke(path)
  g.restore()
  g.lineWidth = Math.max(1, bevel * 0.5)
  g.strokeStyle = 'rgba(29, 27, 58, 0.45)'
  g.stroke(path)
  return c
}
