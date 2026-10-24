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
