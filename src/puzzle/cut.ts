export const DIFFICULTIES = { easy: 30, medium: 100, hard: 200 } as const
export type Difficulty = keyof typeof DIFFICULTIES

/** 600×600 (or the same pixel count in another shape): Hard pieces come out ~42px across at the smallest. */
export const MIN_PIXELS = 360_000

/** Grid closest to `target` pieces whose pieces are closest to square, keeping the image's aspect ratio. */
export function gridFor(width: number, height: number, target: number) {
  const aspect = width / height
  let best = { cols: 2, rows: 2, score: Infinity }
  for (let cols = 2; cols <= target; cols++) {
    const ideal = cols / aspect
    for (let rows = Math.max(2, Math.floor(ideal) - 1); rows <= Math.ceil(ideal) + 1; rows++) {
      // Hitting the piece count matters more than perfectly square pieces.
      const score = Math.abs(cols * rows - target) / target + 0.5 * Math.abs(Math.log((aspect * rows) / cols))
      if (score < best.score) best = { cols, rows, score }
    }
  }
  return { cols: best.cols, rows: best.rows }
}

/** mulberry32: tiny seeded PRNG, so a seed always cuts the same puzzle. */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One connector. s: which side the knob sticks out to. t: knob size, w: head width,
 * a..e: jitter (baseline wobble, knob offset along the edge, knob height, lean).
 */
export type Edge = { s: 1 | -1; t: number; w: number; a: number; b: number; c: number; d: number; e: number }

// Classic round knob, a wide "mushroom" head, a slim tall knob, and a leaning one.
const STYLES = [
  { t: [0.095, 0.11], w: [0.95, 1.05], lean: 0.015 },
  { t: [0.085, 0.095], w: [1.18, 1.3], lean: 0.015 },
  { t: [0.105, 0.115], w: [0.8, 0.9], lean: 0.01 },
  { t: [0.09, 0.105], w: [0.95, 1.1], lean: 0.045 },
]

export function generateEdges(cols: number, rows: number, seed: number) {
  const r = rng(seed)
  const between = ([lo, hi]: number[]) => lo + r() * (hi - lo)
  const jitter = (j: number) => (r() * 2 - 1) * j
  const edge = (): Edge => {
    const style = STYLES[Math.floor(r() * STYLES.length)]
    return {
      s: r() < 0.5 ? 1 : -1,
      t: between(style.t),
      w: between(style.w),
      a: jitter(0.04),
      b: jitter(0.04),
      c: jitter(0.03),
      d: (r() < 0.5 ? -1 : 1) * style.lean,
      e: jitter(0.04),
    }
  }
  // h[(r - 1) * cols + c]: edge on top of row r. v[r * (cols - 1) + (c - 1)]: edge left of column c.
  const h = Array.from({ length: (rows - 1) * cols }, edge)
  const v = Array.from({ length: rows * (cols - 1) }, edge)
  return { h, v }
}

export type Point = [number, number]

/** The 10 control points of a connector running from `from` to `to`, sized by its length. */
function edgePoints(e: Edge, from: Point, to: Point): Point[] {
  const dx = to[0] - from[0], dy = to[1] - from[1]
  // Normal (−dy, dx) points down for a left→right edge and left for a top→bottom edge; scale by s.
  const nx = -dy * e.s, ny = dx * e.s
  const { t, w, a, b, c, d } = e
  const uv: Point[] = [
    [0, 0], [0.2, a], [0.5 + b + d, -t + c], [0.5 - t * w + b, t + c],
    [0.5 - 2 * t * w + b - d, 3 * t + c], [0.5 + 2 * t * w + b - d, 3 * t + c], [0.5 + t * w + b, t + c],
    [0.5 + b + d, -t + c], [0.8, e.e], [1, 0],
  ]
  return uv.map(([u, v]) => [from[0] + u * dx + v * nx, from[1] + u * dy + v * ny])
}

/**
 * Outline of piece i, clockwise, in coordinates relative to its cell's top-left corner.
 * Each entry is a straight side (2 points) or a connector (10 points: start + 3 cubic Béziers).
 */
export function pieceOutline(i: number, cols: number, rows: number, pw: number, ph: number, edges: ReturnType<typeof generateEdges>) {
  const row = Math.floor(i / cols), col = i % cols
  const x0 = col * pw, y0 = row * ph
  const rel = (pts: Point[]) => pts.map(([x, y]): Point => [x - x0, y - y0])
  const corner = (cx: number, cy: number): Point => [cx * pw, cy * ph]
  const hEdge = (r: number, c: number) => edgePoints(edges.h[(r - 1) * cols + c], corner(c, r), corner(c + 1, r))
  const vEdge = (r: number, c: number) => edgePoints(edges.v[r * (cols - 1) + (c - 1)], corner(c, r), corner(c, r + 1))

  return [
    row === 0 ? [corner(col, row), corner(col + 1, row)] : hEdge(row, col),
    col === cols - 1 ? [corner(col + 1, row), corner(col + 1, row + 1)] : vEdge(row, col + 1),
    row === rows - 1 ? [corner(col + 1, row + 1), corner(col, row + 1)] : hEdge(row + 1, col).reverse(),
    col === 0 ? [corner(col, row + 1), corner(col, row)] : vEdge(row, col).reverse(),
  ].map(rel)
}
