import './style.css'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { renderSignIn } from './screens/signin'
import { startLobby } from './screens/lobby'

const root = document.getElementById('app')!
let stop: (() => void) | undefined

if (import.meta.env.DEV && location.hash === '#board') {
  import('./dev-board').then(m => m.runDevBoard(root))
} else {
  onAuthStateChanged(auth, user => {
    stop?.()
    stop = user ? startLobby(root, user) : renderSignIn(root)
  })
}
