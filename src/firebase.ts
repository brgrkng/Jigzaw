import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, initializeAuth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'

// Filled in at M6 from the Firebase console (the web config is public by design).
const prodConfig = { apiKey: '', authDomain: '', databaseURL: '', projectId: '', appId: '' }
const devConfig = { apiKey: 'demo', projectId: 'demo-jigzaw', databaseURL: 'https://demo-jigzaw-default-rtdb.firebaseio.com' }

const dev = import.meta.env.DEV
const app = initializeApp(dev ? devConfig : prodConfig)

// Per-tab sessions in dev so two tabs can be two players; remembered sign-in in prod.
export const auth = initializeAuth(app, { persistence: dev ? browserSessionPersistence : browserLocalPersistence })
export const db = getDatabase(app)

if (dev) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
}
