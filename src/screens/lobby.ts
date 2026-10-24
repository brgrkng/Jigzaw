import { signOut, type User } from 'firebase/auth'
import { get, onDisconnect, onValue, ref, serverTimestamp, set, update } from 'firebase/database'
import { auth, db } from '../firebase'
import { logo } from '../icons'
import { isReady, statusOf, usernameFor, USERNAMES, type Player, type Username } from '../players'
import { renderMenu } from './menu'

export type Lobby = { uid: string; name: Username; setReady(ready: boolean): Promise<void>; leave(): Promise<void> }
export type View = { update(players: Player[], now: number): void; unmount(): void }

/** Keeps presence up to date and shows the waiting room until both players are ready, then the menu. */
export function startLobby(root: HTMLElement, user: User) {
  const name = usernameFor(user.email!.split('@')[0])!
  const me = ref(db, `players/${user.uid}`)
  let offset = 0
  const now = () => Date.now() + offset
  let players: Player[] = []
  let screen: 'waiting' | 'menu' | undefined
  let view: View | undefined

  const lobby: Lobby = {
    uid: user.uid,
    name,
    setReady: ready => update(me, { ready }),
    async leave() {
      await onDisconnect(me).cancel()
      await update(me, { ready: false, online: false, lastSeen: serverTimestamp() })
      await signOut(auth)
    },
  }

  function render() {
    const t = now()
    const want = USERNAMES.every(n => isReady(players.find(p => p.name === n), t)) ? 'menu' : 'waiting'
    if (want !== screen) {
      view?.unmount()
      screen = want
      view = want === 'menu' ? renderMenu(root, lobby) : renderWaiting(root, lobby)
    }
    view!.update(players, t)
  }

  const subs = [
    onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() ?? 0 }),
    // ponytail: the server only notices a dead connection (wifi drop, not a closed tab) after ~1 min,
    // so the 30s countdown starts late in that case. Add a client heartbeat if that ever matters.
    onValue(ref(db, '.info/connected'), async s => {
      if (!s.val()) return
      const prev = (await get(me)).val() as Player | null
      // The rules need a full record before the partial "gone" write can be queued.
      if (!prev) await set(me, { name, ready: false, online: false, lastSeen: serverTimestamp() })
      // Queue "gone" before claiming "online", so a tab closed in between can't leave a ghost that's online forever.
      await onDisconnect(me).update({ online: false, lastSeen: serverTimestamp() })
      await update(me, { name, online: true, lastSeen: serverTimestamp(), ready: isReady(prev ?? undefined, now()) })
    }),
    onValue(ref(db, 'players'), s => { players = Object.values(s.val() ?? {}); render() }),
  ]
  const timer = setInterval(render, 1000)

  return () => {
    subs.forEach(unsub => unsub())
    clearInterval(timer)
    view?.unmount()
  }
}

function renderWaiting(root: HTMLElement, lobby: Lobby): View {
  root.innerHTML = `
    <section class="screen">
      <header class="topbar">${logo}<button class="btn btn-ghost btn-small" data-leave>Sign out</button></header>
      <div class="waiting">
        <h1>Waiting room</h1>
        <p class="lead">You both need to be ready to start.</p>
        <div class="player-cards">
          ${USERNAMES.map((n, i) => `
            <article class="card player-card" data-name="${n}" style="--tilt: ${i ? 2 : -2}deg; --avatar: var(--${i ? 'lilac' : 'pink'})">
              <div class="avatar" aria-hidden="true">${n[0]}</div>
              <h2>${n}${n === lobby.name ? ' <small>(you)</small>' : ''}</h2>
              <p class="status"></p>
              ${n === lobby.name ? '<button class="btn" data-ready></button>' : ''}
            </article>`).join('')}
        </div>
      </div>
    </section>`

  const readyBtn = root.querySelector<HTMLButtonElement>('[data-ready]')!
  let mine = false
  readyBtn.onclick = () => lobby.setReady(!mine)
  root.querySelector<HTMLButtonElement>('[data-leave]')!.onclick = () => lobby.leave()

  return {
    update(players, now) {
      for (const n of USERNAMES) {
        const s = statusOf(players.find(p => p.name === n), now)
        const card = root.querySelector(`[data-name="${n}"]`)!
        const status = card.querySelector('.status')!
        status.textContent = s.label
        status.className = `status status-${s.kind}`
        card.classList.toggle('is-ready', s.kind === 'ready')
      }
      mine = !!players.find(p => p.name === lobby.name)?.ready
      readyBtn.textContent = mine ? 'Not ready' : "I'm ready!"
      readyBtn.classList.toggle('btn-ghost', mine)
    },
    unmount() {},
  }
}
