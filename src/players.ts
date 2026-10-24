export const USERNAMES = ['Mesba', 'Kazi'] as const
export type Username = (typeof USERNAMES)[number]

/** Board selection colors: blue for whoever started the match, orange for the other player. Matches --blue / --orange. */
export const PLAYER_COLORS = { blue: '#2f7bf5', orange: '#ff8a2a' } as const

/** Offline longer than this (closed tab, lost wifi) and you're no longer ready. */
export const GRACE_MS = 30_000

export type Player = { name: Username; ready: boolean; online: boolean; lastSeen: number }

export const emailFor = (username: string) => `${username.trim().toLowerCase()}@jigzaw.game`

export const usernameFor = (input: string): Username | undefined =>
  USERNAMES.find(u => u.toLowerCase() === input.trim().toLowerCase())

export const isReady = (p: Player | undefined, now: number) =>
  !!p?.ready && (p.online || now - p.lastSeen < GRACE_MS)

export type Status = { label: string; kind: 'ready' | 'idle' | 'away' | 'offline' }

export function statusOf(p: Player | undefined, now: number): Status {
  if (!p) return { label: "Hasn't joined yet", kind: 'offline' }
  if (p.online) return p.ready ? { label: 'Ready!', kind: 'ready' } : { label: 'Not ready', kind: 'idle' }
  if (isReady(p, now)) return { label: `Reconnecting… ${Math.ceil((GRACE_MS - (now - p.lastSeen)) / 1000)}s`, kind: 'away' }
  return { label: 'Offline', kind: 'offline' }
}
