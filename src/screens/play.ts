import { get, ref } from 'firebase/database'
import { db } from '../firebase'
import { logo } from '../icons'
import { mountBoard } from '../puzzle/board'
import type { Difficulty } from '../puzzle/cut'
import type { PuzzleMeta } from '../upload'

type PlayOptions = { id: string; meta: PuzzleMeta; difficulty: Difficulty; color: string; onExit(): void }

export function renderPlay(root: HTMLElement, { id, meta, difficulty, color, onExit }: PlayOptions) {
  const cut = meta.cuts[difficulty]
  root.innerHTML = `
    <section class="screen board-screen">
      <header class="topbar">
        ${logo}
        <div class="topbar-right">
          <span class="chip">${difficulty[0].toUpperCase() + difficulty.slice(1)} · ${cut.cols * cut.rows} pieces</span>
          <button class="btn btn-ghost btn-small" data-exit>Back to menu</button>
        </div>
      </header>
      <div class="board-host"><p class="board-loading">Loading puzzle…</p></div>
    </section>`
  root.querySelector<HTMLButtonElement>('[data-exit]')!.onclick = onExit

  const host = root.querySelector<HTMLElement>('.board-host')!
  let board: ReturnType<typeof mountBoard> | undefined
  let gone = false
  get(ref(db, `images/${id}`))
    .then(async snap => {
      const image = new Image()
      image.src = snap.val()
      await image.decode()
      if (!gone) board = mountBoard(host, { image, ...cut, color })
    })
    .catch(err => {
      console.error(err)
      if (!gone) host.querySelector('.board-loading')!.textContent = "Couldn't load this puzzle. Go back and try again."
    })

  return {
    unmount() {
      gone = true
      board?.destroy()
    },
  }
}
