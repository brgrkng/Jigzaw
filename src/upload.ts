import { push, ref, serverTimestamp, update } from 'firebase/database'
import { db } from './firebase'
import { DIFFICULTIES, gridFor, MIN_PIXELS, type Difficulty } from './puzzle/cut'
import type { Username } from './players'

export const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Matches the cooldown in database.rules.json. */
export const UPLOAD_COOLDOWN_MS = 60_000
const MAX_EDGE = 2560
const THUMB_EDGE = 480
/** Wider (or taller) than 3:1 gets cropped to 3:1 around the middle. */
const MAX_RATIO = 3

export type Cut = { cols: number; rows: number; seed: number }
export type PuzzleMeta = { by: Username; createdAt: number; width: number; height: number; thumb: string; cuts: Record<Difficulty, Cut> }

export class UploadError extends Error {}

export function cropFor(w: number, h: number) {
  if (w / h > MAX_RATIO) {
    const cw = Math.round(h * MAX_RATIO)
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h }
  }
  if (h / w > MAX_RATIO) {
    const ch = Math.round(w * MAX_RATIO)
    return { x: 0, y: Math.round((h - ch) / 2), w, h: ch }
  }
  return { x: 0, y: 0, w, h }
}

/** Checks the file, crops panoramas, shrinks it for storage, makes a thumbnail, and cuts all three difficulties. */
export async function preparePuzzle(file: File) {
  if (!file.type.startsWith('image/')) throw new UploadError("That file isn't an image.")
  if (file.size > MAX_FILE_BYTES) throw new UploadError('That image is over 25 MB. Try a smaller one.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new UploadError("Couldn't read that image. JPG, PNG or WebP work best.")
  }
  const crop = cropFor(bitmap.width, bitmap.height)
  if (crop.w * crop.h < MIN_PIXELS) {
    const size = `${bitmap.width}×${bitmap.height}`
    bitmap.close()
    throw new UploadError(`That image is too small (${size}). It needs to be at least 600×600, or about that many pixels.`)
  }
  const full = toJpeg(bitmap, crop, MAX_EDGE, 0.85)
  const thumb = toJpeg(bitmap, crop, THUMB_EDGE, 0.75)
  bitmap.close()

  const cuts = {} as Record<Difficulty, Cut>
  for (const [d, target] of Object.entries(DIFFICULTIES) as [Difficulty, number][]) {
    cuts[d] = { ...gridFor(full.w, full.h, target), seed: Math.floor(Math.random() * 2 ** 31) }
  }
  return { image: full.url, thumb: thumb.url, width: full.w, height: full.h, cuts }
}

function toJpeg(bitmap: ImageBitmap, crop: ReturnType<typeof cropFor>, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(crop.w, crop.h))
  const c = document.createElement('canvas')
  c.width = Math.round(crop.w * scale)
  c.height = Math.round(crop.h * scale)
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  // JPEG has no transparency; without this, see-through PNGs turn black.
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
  return { url: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height }
}

/** One atomic write: the puzzle, its image (kept apart so the menu doesn't download every photo), and the cooldown stamp. */
export async function savePuzzle(uid: string, by: Username, p: Awaited<ReturnType<typeof preparePuzzle>>) {
  const id = push(ref(db, 'puzzles')).key!
  await update(ref(db), {
    [`puzzles/${id}`]: { by, createdAt: serverTimestamp(), width: p.width, height: p.height, thumb: p.thumb, cuts: p.cuts },
    [`images/${id}`]: p.image,
    [`lastUpload/${uid}`]: serverTimestamp(),
  })
  return id
}
