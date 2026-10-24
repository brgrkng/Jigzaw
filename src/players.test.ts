import { expect, test } from 'vitest'
import { GRACE_MS, isReady, statusOf, usernameFor, type Player } from './players'

const p = (over: Partial<Player>): Player => ({ name: 'Mesba', ready: true, online: true, lastSeen: 0, ...over })

test('ready survives a short drop, not a long one', () => {
  expect(isReady(p({}), 0)).toBe(true)
  expect(isReady(p({ online: false }), GRACE_MS - 1)).toBe(true)
  expect(isReady(p({ online: false }), GRACE_MS)).toBe(false)
  expect(isReady(p({ ready: false }), 0)).toBe(false)
  expect(isReady(undefined, 0)).toBe(false)
})

test('status labels', () => {
  expect(statusOf(p({ online: false }), 12_000).label).toBe('Reconnecting… 18s')
  expect(statusOf(p({ online: false }), GRACE_MS).kind).toBe('offline')
  expect(statusOf(p({ ready: false }), 0).kind).toBe('idle')
})

test('usernames are case-insensitive', () => {
  expect(usernameFor(' kAZi ')).toBe('Kazi')
  expect(usernameFor('bob')).toBeUndefined()
})
