import { expect, test } from 'vitest'
import { cropFor } from './upload'

test('normal photos are never cropped', () => {
  expect(cropFor(4032, 3024)).toEqual({ x: 0, y: 0, w: 4032, h: 3024 })
  expect(cropFor(1080, 1920)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 })
  expect(cropFor(3000, 1000)).toEqual({ x: 0, y: 0, w: 3000, h: 1000 })
})

test('panoramas are cropped to 3:1 around the middle', () => {
  expect(cropFor(8000, 1000)).toEqual({ x: 2500, y: 0, w: 3000, h: 1000 })
  expect(cropFor(1000, 5000)).toEqual({ x: 0, y: 1000, w: 1000, h: 3000 })
})
