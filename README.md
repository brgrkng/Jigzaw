# Jigzaw

A private, real-time co-op jigsaw for two. See [docs/MILESTONES.md](docs/MILESTONES.md) for the plan and progress.

## Run it locally

Needs Node 22+ and Java 21+ (for the Firebase emulators).

```bash
npm install
echo SEED_PASSWORD=yourpassword > .env.local
npm run dev
```

This starts the Auth + Realtime Database emulators, creates the Mesba and Kazi accounts, and serves the app at http://localhost:5173. Open two tabs to play as both players; each tab keeps its own sign-in in dev. The emulator UI is at http://localhost:4000.

```bash
npm test
```

## Firebase checklist (project `jigzaw-d0e87`)

- [ ] **Authentication → Sign-in method:** Email/Password enabled.
- [ ] **Authentication → Settings → User actions:** "Enable create (sign-up)" unticked.
- [ ] **Authentication → Users:** `mesba@jigzaw.game` and `kazi@jigzaw.game` exist (the username on the login screen is the part before the @).
- [ ] **Authentication → Settings → Authorized domains:** `brgrkng.github.io` added.
- [ ] **Realtime Database → Rules:** the current [database.rules.json](database.rules.json) published. It grows with each milestone; republish whenever it changes.

## Deploy

Every push to `main` runs the tests, builds, and publishes to https://brgrkng.github.io/Jigzaw/ (see `.github/workflows/deploy.yml`).

Database rules live in [database.rules.json](database.rules.json). After changing them, paste the file into the Firebase console (Realtime Database → Rules → Publish), or:

```bash
npx firebase login
```
```bash
npx firebase deploy --only database -P prod
```
