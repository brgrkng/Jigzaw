import { describe, expect, test } from 'vitest'
import { DIFFICULTIES, generateEdges, gridFor, pieceOutline, rng } from './cut'
import { checkDone, mergeNeighbors, rotateGroup, scatter, stickToFrame, toWorld, type Puzzle } from './state'

describe('gridFor', () => {
  test('4:3 photos get exact, square-piece grids', () => {
    expect(gridFor(1600, 1200, 30)).toEqual({ cols: 6, rows: 5 })
    expect(gridFor(1600, 1200, 200)).toEqual({ cols: 16, rows: 12 })
  })

  test.each([[16, 9], [9, 16], [1, 1], [3, 1], [3, 2]])('%i:%i stays near target with near-square pieces', (w, h) => {
    for (const target of Object.values(DIFFICULTIES)) {
      const { cols, rows } = gridFor(w * 1000, h * 1000, target)
      expect(Math.abs(cols * rows - target) / target).toBeLessThan(0.12)
      const pieceAspect = (w / cols) / (h / rows)
      expect(pieceAspect).toBeGreaterThanOrEqual(0.8)
      expect(pieceAspect).toBeLessThanOrEqual(1.25)
    }
  })
})

describe('cutting', () => {
  test('same seed, same cut', () => {
    expect(generateEdges(8, 6, 42)).toEqual(generateEdges(8, 6, 42))
    expect(generateEdges(8, 6, 42)).not.toEqual(generateEdges(8, 6, 43))
  })

  test('outlines are closed and neighbours share the exact same connector', () => {
    const cols = 4, rows = 3, pw = 100, ph = 90
    const edges = generateEdges(cols, rows, 7)
    const outline = (i: number) => pieceOutline(i, cols, rows, pw, ph, edges)
    for (let i = 0; i < cols * rows; i++) {
      const sides = outline(i)
      for (let s = 0; s < 4; s++) expect(sides[s].at(-1)).toEqual(sides[(s + 1) % 4][0])
    }
    // Piece 0's right side, in image coordinates, is piece 1's left side traced backwards.
    const right = outline(0)[1]
    const left = outline(1)[3].map(([x, y]) => [x + pw, y])
    expect(left.reverse()).toEqual(right)
  })
})

const geometry = { cols: 4, rows: 3, pw: 100, ph: 100 }
const puzzle = (groups: Puzzle['groups']): Puzzle => ({ ...geometry, groups, done: false })

describe('snapping', () => {
  test('neighbours join only when lined up with the same rotation', () => {
    const pz = puzzle({ g0: { x: 300, y: 300, rot: 1, pieces: [0] }, g1: { x: 305, y: 296, rot: 1, pieces: [1] }, g5: { x: 300, y: 300, rot: 2, pieces: [5] } })
    expect(mergeNeighbors(pz, 'g0')).toEqual(['g1'])
    expect(pz.groups.g0).toEqual({ x: 305, y: 296, rot: 1, pieces: [0, 1] })
    expect(pz.groups.g5).toBeDefined()
  })

  test('far apart or not adjacent: no join', () => {
    const pz = puzzle({ g0: { x: 0, y: 0, rot: 0, pieces: [0] }, g1: { x: 60, y: 0, rot: 0, pieces: [1] }, g2: { x: 0, y: 0, rot: 0, pieces: [2] } })
    expect(mergeNeighbors(pz, 'g0')).toEqual([])
  })

  test('a join can chain into more joins', () => {
    const pz = puzzle({ g0: { x: 0, y: 0, rot: 0, pieces: [0] }, g1: { x: 10, y: 0, rot: 0, pieces: [1] }, g2: { x: 10, y: 0, rot: 0, pieces: [2] } })
    expect(mergeNeighbors(pz, 'g0').sort()).toEqual(['g1', 'g2'])
  })

  test('rotating four times comes back to the same place', () => {
    const grp = { x: 12, y: 34, rot: 0 as const, pieces: [0] }
    const copy = { ...grp }
    for (let i = 0; i < 4; i++) rotateGroup(copy, 1, [100, 50])
    expect(copy).toEqual(grp)
    // A quarter turn about the origin: the corner moves to (−34, 12) and "right" now points down.
    rotateGroup(copy, 1, [0, 0])
    expect(toWorld(copy, [10, 0])).toEqual([-34, 22])
  })
})

describe('frame', () => {
  test('edge pieces stick to the border but can slide along it', () => {
    const pz = puzzle({ g0: { x: 50, y: 15, rot: 0, pieces: [0] } })
    stickToFrame(pz, pz.groups.g0)
    expect(pz.groups.g0).toMatchObject({ x: 50, y: 0 })
  })

  test('wrong rotation or middle pieces do not stick', () => {
    const pz = puzzle({ g0: { x: 5, y: 5, rot: 2, pieces: [0] }, g5: { x: 5, y: 5, rot: 0, pieces: [5] } })
    stickToFrame(pz, pz.groups.g0)
    stickToFrame(pz, pz.groups.g5)
    expect(pz.groups.g0).toMatchObject({ x: 5, y: 5 })
    expect(pz.groups.g5).toMatchObject({ x: 5, y: 5 })
  })

  test('only the whole puzzle in the frame counts as done', () => {
    const all = Array.from({ length: 12 }, (_, i) => i)
    const partial = puzzle({ g0: { x: 3, y: 3, rot: 0, pieces: all.slice(1) } })
    expect(checkDone(partial, partial.groups.g0)).toBe(false)
    const whole = puzzle({ g0: { x: 3, y: -4, rot: 0, pieces: all } })
    expect(checkDone(whole, whole.groups.g0)).toBe(true)
    expect(whole.groups.g0).toMatchObject({ x: 0, y: 0 })
  })
})

test('scatter puts every piece around the frame, never on it', () => {
  for (const [w, h] of [[1600, 1200], [2560, 1440], [1200, 1600], [3000, 1000]]) {
    for (const target of Object.values(DIFFICULTIES)) {
      const { cols, rows } = gridFor(w, h, target)
      const g = { cols, rows, pw: w / cols, ph: h / rows }
      const pz = scatter(g, rng(1))
      const groups = Object.values(pz.groups)
      expect(groups.length).toBe(cols * rows)
      for (const grp of groups) {
        const i = grp.pieces[0]
        const [x, y] = toWorld(grp, [((i % cols) + 0.5) * g.pw, (Math.floor(i / cols) + 0.5) * g.ph])
        const onFrame = x > 0 && x < w && y > 0 && y < h
        expect(onFrame, `${w}x${h} ${target}`).toBe(false)
      }
    }
  }
})
