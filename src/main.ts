import './style.css'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { renderSignIn } from './screens/signin'
import { startLobby } from './screens/lobby'

const root = document.getElementById('app')!
let stop: (() => void) | undefined

onAuthStateChanged(auth, user => {
  stop?.()
  stop = user ? startLobby(root, user) : renderSignIn(root)
})
