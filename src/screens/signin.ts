import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { logo } from '../icons'
import { emailFor, usernameFor } from '../players'

// Same message for unknown user and wrong password, so it doesn't reveal who can log in.
const LOGIN_FAILED = 'Login failed. Check your username and password.'

export function renderSignIn(root: HTMLElement) {
  root.innerHTML = `
    <section class="screen center">
      <form class="card signin" novalidate>
        <h1>${logo}</h1>
        <p class="lead">Your photos, in pieces. Solved together.</p>
        <label class="field">Username
          <input name="username" autocomplete="username" required />
        </label>
        <label class="field">Password
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <p class="error" role="alert" hidden></p>
        <button class="btn btn-wide" type="submit">Let's play</button>
      </form>
    </section>`

  const form = root.querySelector('form')!
  const error = form.querySelector<HTMLElement>('.error')!
  const button = form.querySelector('button')!
  const fail = (msg: string) => { error.textContent = msg; error.hidden = false }

  form.onsubmit = async e => {
    e.preventDefault()
    const data = new FormData(form)
    const username = usernameFor(String(data.get('username')))
    if (!username) return fail(LOGIN_FAILED)
    error.hidden = true
    button.disabled = true
    button.textContent = 'Signing in…'
    try {
      await signInWithEmailAndPassword(auth, emailFor(username), String(data.get('password')))
    } catch (err) {
      const code = (err as { code?: string }).code
      fail(code === 'auth/too-many-requests' ? 'Too many tries, take a breather and try again in a minute.'
        : code === 'auth/network-request-failed' ? "Can't reach the server. Check your connection."
        : LOGIN_FAILED)
      button.disabled = false
      button.textContent = "Let's play"
    }
  }
  form.querySelector('input')!.focus()
  return () => {}
}
