import {
  get, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, ref, remove, serverTimestamp, set, update,
} from 'firebase/database'
import { db } from '../firebase'
import { logo } from '../icons'
import { statusOf, type Player, type Username } from '../players'
import { mountBoard } from '../puzzle/board'
import type { Difficulty } from '../puzzle/cut'
import { progressOf, type Group } from '../puzzle/state'
import type { PuzzleMeta } from '../upload'

export type Seat = { uid: string; name: Username; color: string }
type PlayOptions = {
  puzzleId: string
  meta: PuzzleMeta
  difficulty: Difficulty
  me: Seat
  other: Seat
  /** The match starter wins ties when both grab the same group at once. */
  iStarted: boolean
  onExit(): void
}

export const gameKey = (puzzleId: string, difficulty: Difficulty) => `${puzzleId}_${difficulty}`
const MOVE_EVERY_MS = 60

const meep = new Audio(`${import.meta.env.BASE_URL}meep_merp.mp3`)
const meepMerp = () => {
  meep.currentTime = 0
  meep.play().catch(() => {})
}

/** The shared board. Every move goes straight to the database, which is also the save. */
export function renderPlay(root: HTMLElement, { puzzleId, meta, difficulty, me, other, iStarted, onExit }: PlayOptions) {
  const key = gameKey(puzzleId, difficulty)
  const cut = meta.cuts[difficulty]
  const chip = (s: Seat, you: boolean) =>
    `<span class="chip" data-uid="${s.uid}"><i class="dot" style="background:${s.color}"></i>${s.name}${you ? ' (you)' : ''}<small></small></span>`
  root.innerHTML = `
    <section class="screen board-screen">
      <header class="topbar">
        ${logo}
        <div class="topbar-right">
          ${chip(me, true)}${chip(other, false)}
          <span class="chip">${difficulty[0].toUpperCase() + difficulty.slice(1)} · ${cut.cols * cut.rows} pieces</span>
          <button class="btn btn-ghost btn-small" data-exit>Back to menu</button>
        </div>
      </header>
      <div class="board-host"><p class="board-loading">Loading puzzle…</p></div>
    </section>`
  root.querySelector<HTMLButtonElement>('[data-exit]')!.onclick = onExit

  const host = root.querySelector<HTMLElement>('.board-host')!
  const game = `games/${key}`
  const heldRef = ref(db, `${game}/held/${me.uid}`)
  let board: ReturnType<typeof mountBoard> | undefined
  let subs: (() => void)[] = []
  let gone = false
  let moveTimer = 0

  async function start() {
    const [img, snap] = await Promise.all([get(ref(db, `images/${puzzleId}`)), get(ref(db, game))])
    const image = new Image()
    image.src = img.val()
    await image.decode()
    if (gone) return
    await remove(heldRef)
    onDisconnect(heldRef).remove()

    board = mountBoard(host, {
      image, ...cut, color: me.color,
      groups: snap.child('groups').val() ?? {},
      done: !!snap.child('done').val(),
      onSelect: id => { id ? set(heldRef, id) : remove(heldRef) },
      onMove: id => {
        if (moveTimer) return
        moveTimer = window.setTimeout(() => {
          moveTimer = 0
          const g = board?.puzzle.groups[id]
          if (g) update(ref(db, `${game}/groups/${id}`), { x: g.x, y: g.y, rot: g.rot })
        }, MOVE_EVERY_MS)
      },
      onSettle: ({ id, absorbed, done }) => {
        // A late drag update must not resurrect a group that was just absorbed.
        clearTimeout(moveTimer)
        moveTimer = 0
        const pz = board!.puzzle
        const changes: Record<string, unknown> = {
          [`${game}/groups/${id}`]: pz.groups[id],
          [`progress/${key}`]: { pct: progressOf(pz), done, at: serverTimestamp() },
        }
        for (const gid of absorbed) changes[`${game}/groups/${gid}`] = null
        if (done) changes[`${game}/done`] = true
        update(ref(db), changes)
      },
      onDenied: meepMerp,
    })
    if (import.meta.env.DEV) Object.assign(window, { board }) // poke at it from the console

    const groups = ref(db, `${game}/groups`)
    const apply = (s: { key: string | null; val(): unknown }) => board?.applyGroup(s.key!, s.val() as Group)
    subs = [
      onChildAdded(groups, apply),
      onChildChanged(groups, apply),
      onChildRemoved(groups, s => board?.applyGroup(s.key!, null)),
      onValue(ref(db, `${game}/held`), s => {
        const held = (s.val() ?? {}) as Record<string, string>
        const theirs = held[other.uid]
        board?.setOthers(theirs ? { [theirs]: other.color } : {})
        // Both grabbed the same group in the same instant: the match starter keeps it.
        if (theirs && theirs === held[me.uid] && !iStarted) {
          board?.deselect()
          meepMerp()
        }
      }),
      onValue(ref(db, `${game}/done`), s => { if (s.val()) board?.markDone() }),
    ]
  }

  start().catch(err => {
    console.error(err)
    const msg = host.querySelector('.board-loading')
    if (msg) msg.textContent = "Couldn't load this puzzle. Go back and try again."
  })

  return {
    /** Ticks from the lobby: show the other player's reconnect countdown. */
    update(players: Player[], now: number) {
      const s = statusOf(players.find(p => p.name === other.name), now)
      const el = root.querySelector(`.chip[data-uid="${other.uid}"]`)
      if (!el) return
      el.classList.toggle('chip-away', s.kind === 'away')
      el.querySelector('small')!.textContent = s.kind === 'away' ? s.label : ''
    },
    unmount() {
      gone = true
      clearTimeout(moveTimer)
      subs.forEach(unsub => unsub())
      remove(heldRef)
      board?.destroy()
    },
  }
}
