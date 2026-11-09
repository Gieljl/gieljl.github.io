# YASAT — Yet Another Score App Tool

A Progressive Web App (PWA) for the Yasat card game, built with React and TypeScript. Everything runs locally in the browser — there is no backend, login or database.

Two modes:

- **Score Tracker** — keep score for in-person games (classic points view or weighted-stats view, with undo/redo).
- **Play vs. AI** — play the card game live against 1–3 bots (easy / normal / godlike).

## Getting Started

### Prerequisites

- Node.js ≥ 22.12
- Yarn 1.x (CI installs with `yarn install --frozen-lockfile`)

### Running Locally

```bash
yarn install
yarn start
```

Opens at [http://localhost:3000](http://localhost:3000). Hot-reloads on file changes.

### Testing

```bash
yarn test        # Vitest in watch mode
yarn test --run  # single run, as in CI
```

### Building for Production

```bash
yarn build
```

Type-checks, then outputs an optimized bundle (and `service-worker.js`) to `build/`. Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.

### Analytics

PostHog is enabled only when `REACT_APP_POSTHOG_KEY` is set at build time. In CI it comes from the `REACT_APP_POSTHOG_KEY` repository secret; locally you can put it in `.env.local` (git-ignored). The key is never committed.

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Build / test | Vite, Vitest |
| UI | React 18, TypeScript, Material UI v5 |
| State | Redux Toolkit, redux-persist, redux-undo |
| Notifications | notistack |
| PWA | Workbox service worker (built by `vite.config.mts`) with update prompt |

### Project Structure

```
src/
├── App.tsx                  # Root component — theme, layout, view switching
├── app/
│   ├── store.ts             # Redux store with persist (+ migrations) and undo config
│   └── hooks.ts             # Typed useAppSelector / useAppDispatch
├── features/
│   ├── game/                # Home page, score-tracker setup, game slice, game length, rules
│   ├── players/             # Player list, add-player dialog, weighted ranking view
│   ├── rounds/              # Score entry dialog and round history
│   ├── stats/               # Weighted stat definitions and stats views
│   ├── play/                # Play vs. AI: engine, bot policy, table UI, play slice
│   ├── gameSelection/       # Game switcher (Yasat / Regicide / Flip 7)
│   ├── regicide/            # Bundled solo game
│   ├── flip7/               # Bundled press-your-luck game
│   └── menu/                # Navigation drawer (new game, settings, theme, rules)
└── service-worker.ts        # PWA service worker
```

### State Management

| Slice | Purpose | Persisted |
|---|---|---|
| `game` | Status (`home` / `new` / `started`), type (`unranked` = score tracker, `play` = vs. AI), view and length | yes |
| `scores` | Per-player scores, wrapped in `redux-undo` for undo/redo | yes |
| `players` | Player list with names and colors | yes |
| `stats` | Weighted stat definitions | yes |
| `play` | Live Play vs. AI game | no |

Bump `PERSIST_VERSION` in `store.ts` and add a migration whenever the persisted shape changes.

### App Flow

```
App.tsx
 ├─ game.status === "home"   →  HomePage (Score Tracker / Play vs. AI)
 ├─ game.status === "new"
 │   ├─ type "unranked"  →  GameCreator (add players, view, length)
 │   └─ type "play"      →  PlayCreator (opponents, difficulty, length)
 └─ game.status === "started"
     ├─ view "classic"   →  ScoresHistoryNew (round-by-round table)
     ├─ view "new"       →  PlayerRanking / PlayPlayerRanking (weighted stats)
     └─ view "play"      →  PlayTable (live card game)
```

### Bundled Games (Game Switcher)

The game switcher (home page or menu → Switch game) also opens two self-contained local games. Each lives under `src/features/<game>/` with its own context, full-screen UI and pure engine.

| Game | Description |
|---|---|
| Regicide | Co-op royal slayer (solo mode) |
| Flip 7 | Press-your-luck, first to 200 |
