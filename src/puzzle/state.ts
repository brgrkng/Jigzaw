import type { Point } from './cut'

/** Quarter turns clockwise. */
export type Rot = 0 | 1 | 2 | 3

/**
 * Pieces that move together. (x, y) is where the solved image's top-left corner would sit in the world,
 * rotated by `rot` around it. Two groups with the same rot fit together exactly when their (x, y) match,
 * and a group is solved when it sits at (0, 0) with rot 0, which is where the frame is.
 */
export type Group = { x: number; y: number; rot: Rot; pieces: number[] }

export type Geometry = { cols: number; rows: number; pw: number; ph: number }

export type Puzzle = Geometry & { groups: Record<string, Group>; done: boolean }

/** Clockwise quarter turn in screen coordinates (y points down). */
export const turn = ([x, y]: Point, rot: number): Point => {
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [x, y] = [-y, x]
  return [x, y]
}

export const snapDistance = (g: Geometry) => 0.22 * Math.min(g.pw, g.ph)

const cellOf = (g: Geometry, i: number) => ({ row: Math.floor(i / g.cols), col: i % g.cols })

/** World position of a point given in solved-image coordinates. */
export const toWorld = (grp: Group, p: Point): Point => {
  const [x, y] = turn(p, grp.rot)
  return [grp.x + x, grp.y + y]
}

export function groupCenter(g: Geometry, grp: Group): Point {
  let sx = 0, sy = 0
  for (const i of grp.pieces) {
    const { row, col } = cellOf(g, i)
    sx += (col + 0.5) * g.pw
    sy += (row + 0.5) * g.ph
  }
  return toWorld(grp, [sx / grp.pieces.length, sy / grp.pieces.length])
}

export function rotateGroup(grp: Group, dir: 1 | -1, pivot: Point) {
  const [x, y] = turn([grp.x - pivot[0], grp.y - pivot[1]], dir)
  grp.x = pivot[0] + x
  grp.y = pivot[1] + y
  grp.rot = ((grp.rot + dir + 4) % 4) as Rot
}

/**
 * Joins group `id` with every neighbouring group it lines up with. Returns the ids that were absorbed.
 * `canJoin` can rule groups out, like the one the other player is holding.
 */
export function mergeNeighbors(pz: Puzzle, id: string, canJoin: (gid: string) => boolean = () => true): string[] {
  const grp = pz.groups[id]
  const near = snapDistance(pz)
  const absorbed: string[] = []
  let merged = true
  while (merged) {
    merged = false
    const owner = new Map<number, string>()
    for (const [gid, other] of Object.entries(pz.groups)) for (const i of other.pieces) owner.set(i, gid)

    for (const i of grp.pieces) {
      const { row, col } = cellOf(pz, i)
      const neighbors = [row > 0 && i - pz.cols, row < pz.rows - 1 && i + pz.cols, col > 0 && i - 1, col < pz.cols - 1 && i + 1]
      for (const n of neighbors) {
        if (n === false) continue
        const gid = owner.get(n)
        if (!gid || gid === id || !canJoin(gid)) continue
        const other = pz.groups[gid]
        if (other.rot !== grp.rot) continue
        if (Math.abs(other.x - grp.x) > near || Math.abs(other.y - grp.y) > near) continue
        grp.x = other.x
        grp.y = other.y
        grp.pieces.push(...other.pieces)
        delete pz.groups[gid]
        absorbed.push(gid)
        merged = true
        break
      }
      if (merged) break
    }
  }
  return absorbed
}

/**
 * The frame border is sticky: a correctly rotated group holding edge pieces slides flush onto the matching
 * border when it's dropped close to it, but can still move along it.
 */
export function stickToFrame(pz: Puzzle, grp: Group) {
  if (grp.rot !== 0) return
  const near = snapDistance(pz)
  const W = pz.cols * pz.pw, H = pz.rows * pz.ph
  const cells = grp.pieces.map(i => cellOf(pz, i))
  const rowEdge = cells.filter(c => c.row === 0 || c.row === pz.rows - 1)
  const colEdge = cells.filter(c => c.col === 0 || c.col === pz.cols - 1)
  // Only when those edge pieces are actually alongside the frame, not out past its ends.
  const alongX = rowEdge.some(c => grp.x + (c.col + 0.5) * pz.pw > 0 && grp.x + (c.col + 0.5) * pz.pw < W)
  const alongY = colEdge.some(c => grp.y + (c.row + 0.5) * pz.ph > 0 && grp.y + (c.row + 0.5) * pz.ph < H)
  if (alongX && Math.abs(grp.y) < near) grp.y = 0
  if (alongY && Math.abs(grp.x) < near) grp.x = 0
}

/** The frame only locks once everything is one group sitting in it. */
export function checkDone(pz: Puzzle, grp: Group) {
  const near = snapDistance(pz)
  if (grp.pieces.length !== pz.cols * pz.rows || grp.rot !== 0) return false
  if (Math.abs(grp.x) > near || Math.abs(grp.y) > near) return false
  grp.x = 0
  grp.y = 0
  pz.done = true
  return true
}

/** The table: the frame plus plenty of room around it. */
export function tableFor(g: Geometry) {
  const W = g.cols * g.pw, H = g.rows * g.ph
  const margin = 0.6 * Math.max(W, H)
  return { x: -margin, y: -margin, w: W + 2 * margin, h: H + 2 * margin }
}

/** Share of possible joins made so far: 0 when every piece is loose, 100 when it's one group. */
export const progressOf = (pz: Puzzle) => {
  const n = pz.cols * pz.rows
  return Math.round(((n - Object.keys(pz.groups).length) / (n - 1)) * 100)
}

/** Fresh puzzle: one group per piece, randomly rotated and scattered around the frame on a jittered grid. */
export function scatter(g: Geometry, random: () => number): Puzzle {
  const W = g.cols * g.pw, H = g.rows * g.ph
  const board = tableFor(g)
  const slot = 1.7 * Math.max(g.pw, g.ph)

  const slots: Point[] = []
  for (let y = board.y + slot / 2; y < board.y + board.h - slot / 2; y += slot) {
    for (let x = board.x + slot / 2; x < board.x + board.w - slot / 2; x += slot) {
      const clearOfFrame = x < -slot / 2 || x > W + slot / 2 || y < -slot / 2 || y > H + slot / 2
      if (clearOfFrame) slots.push([x + (random() - 0.5) * slot * 0.25, y + (random() - 0.5) * slot * 0.25])
    }
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }

  const groups: Record<string, Group> = {}
  for (let i = 0; i < g.cols * g.rows; i++) {
    const { row, col } = cellOf(g, i)
    // ponytail: falls back to random spots if the grid runs out; hasn't happened for 50/150/300.
    const at = slots[i] ?? [board.x + random() * board.w, board.y + random() * board.h]
    const rot = Math.floor(random() * 4) as Rot
    const [cx, cy] = turn([(col + 0.5) * g.pw, (row + 0.5) * g.ph], rot)
    groups[`g${i}`] = { x: at[0] - cx, y: at[1] - cy, rot, pieces: [i] }
  }
  return { ...g, groups, done: false }
}
