# YASAT — Yet Another Score App Tool

A Progressive Web App (PWA) for the Yasat card game, built with React and TypeScript. Everything runs locally in the browser — there is no backend, login or database.

Two modes:

- **Score Tracker** — keep score for in-person games (classic points view or weighted-stats view, with undo/redo).
- **Play vs. AI** — play the card game live against 1–3 bots (easy / normal / godlike).

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Yarn 1.x (CI installs with `yarn install --frozen-lockfile`)

### Running Locally

```bash
yarn install
yarn start
```

Opens at [http://localhost:3000](http://localhost:3000). Hot-reloads on file changes.

### Building for Production

```bash
yarn build
```

Outputs an optimized bundle to `build/`. Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript, Material UI v5 |
| State | Redux Toolkit, redux-persist, redux-undo |
| Notifications | notistack |
| PWA | CRA service worker with update prompt |

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

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app), using the [Redux](https://redux.js.org/) and [Redux Toolkit](https://redux-toolkit.js.org/) TS template.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
