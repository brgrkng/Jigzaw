// Creates both players in the Auth emulator. The password lives in .env.local (gitignored), not the repo.
const password = process.env.SEED_PASSWORD
if (!password) {
  console.error('Add SEED_PASSWORD=... to .env.local')
  process.exit(1)
}

for (const name of ['mesba', 'kazi']) {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}@jigzaw.game`, password }),
  })
  const body = await res.json()
  if (!res.ok && body.error?.message !== 'EMAIL_EXISTS') throw new Error(body.error?.message)
}
console.log('Seeded emulator users: Mesba, Kazi')
