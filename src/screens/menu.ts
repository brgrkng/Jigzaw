import { logo, pieceIcon } from '../icons'
import { statusOf, USERNAMES } from '../players'
import type { Lobby, View } from './lobby'

export function renderMenu(root: HTMLElement, lobby: Lobby): View {
  root.innerHTML = `
    <section class="screen">
      <header class="topbar">
        ${logo}
        <div class="topbar-right">
          ${USERNAMES.map((n, i) => `<span class="chip" data-name="${n}">${pieceIcon(`var(--${i ? 'lilac' : 'pink'})`)}${n}<small></small></span>`).join('')}
          <button class="btn btn-ghost btn-small" data-back>Back to waiting room</button>
        </div>
      </header>
      <div class="menu">
        <div class="menu-toolbar">
          <h1>Your puzzles</h1>
          <button class="btn" data-upload disabled title="Arrives in milestone 3">Upload image</button>
        </div>
        <div class="card empty">
          ${pieceIcon('var(--mint)')}
          <h2>No puzzles yet</h2>
          <p>Upload a photo and it'll be cut into Easy, Medium and Hard puzzles for you both.</p>
        </div>
      </div>
    </section>`

  root.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => lobby.setReady(false)
  return {
    update(players, now) {
      for (const n of USERNAMES) {
        const s = statusOf(players.find(p => p.name === n), now)
        const chip = root.querySelector(`.chip[data-name="${n}"]`)!
        chip.classList.toggle('chip-away', s.kind === 'away')
        chip.querySelector('small')!.textContent = s.kind === 'away' ? s.label : ''
      }
    },
    unmount() {},
  }
}
