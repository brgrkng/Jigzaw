import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, initializeAuth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'

// From the Firebase console. The web config is public by design; the database rules do the guarding.
const prodConfig = {
  apiKey: 'AIzaSyBYtQrh8rgxvhu-eFK201icGIy9JmXb158',
  authDomain: 'jigzaw-d0e87.firebaseapp.com',
  databaseURL: 'https://jigzaw-d0e87-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'jigzaw-d0e87',
  appId: '1:760680183092:web:c2ae7c430b89f742baa161',
}
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
