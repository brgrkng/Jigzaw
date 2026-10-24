export const pieceIcon = (fill = 'var(--sun)') =>
  `<svg class="piece-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h5a2.5 2.5 0 1 1 4 0h5v5a2.5 2.5 0 1 1 0 4v5H4z" fill="${fill}" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/></svg>`

export const logo = `<span class="logo">${pieceIcon()}<span>Jigzaw</span></span>`
