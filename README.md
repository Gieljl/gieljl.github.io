# YASAT — Yet Another Score App Tool

A Progressive Web App (PWA) for tracking card game scores with support for classic and ranked game modes, online game rooms, and player leaderboards. Built with React, TypeScript, and Firebase.

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- A Firebase project with Firestore enabled

### Environment Setup

Create a `.env` file in the project root with your Firebase config:

```
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

### Running Locally

```bash
npm install
npm start
```

Opens at [http://localhost:3000](http://localhost:3000). Hot-reloads on file changes.

### Building for Production

```bash
npm run build
```

Outputs an optimized bundle to `build/`.

### Deploying to GitHub Pages

```bash
npm run deploy
```

Runs `npm run build` then publishes `build/` via `gh-pages`.

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript, Material UI v5 |
| State | Redux Toolkit, redux-persist, redux-undo |
| Backend | Firebase Firestore (serverless) |
| Notifications | notistack |
| PWA | CRA service worker with update prompt |

### Project Structure

```
src/
├── App.tsx                  # Root component — theme, layout, game view switching
├── app/
│   ├── store.ts             # Redux store with persist + undo config
│   └── hooks.ts             # Typed useAppSelector / useAppDispatch
├── features/
│   ├── game/
│   │   ├── GameCreator.tsx   # Pre-game screen: player setup, room creation, game type
│   │   ├── gameSlice.ts      # Game status (new/started) and type (classic/ranked)
│   │   ├── scoreSlice.ts     # Player scores with undo/redo history
│   │   ├── Settings.tsx      # In-game settings dialog
│   │   └── RulesText.tsx     # Game rules content
│   ├── players/
│   │   ├── playersSlice.ts   # Player list (add/remove/reset)
│   │   ├── Players.tsx       # Player list UI
│   │   ├── AddPlayerDialog.tsx
│   │   ├── PlayerAvatarScore.tsx
│   │   ├── PlayerScoreCard.tsx
│   │   └── Ranking.tsx       # Ranked mode leaderboard view
│   ├── rounds/
│   │   ├── scoreEntryDialog.tsx   # Per-round score input
│   │   ├── ScoresHistoryNew.tsx   # Classic mode score table
│   │   └── RoundHistoryDialog.tsx
│   ├── stats/
│   │   ├── statsSlice.ts     # Weighted stat definitions for ranked scoring
│   │   ├── Stats.tsx
│   │   ├── StatsDialog.tsx
│   │   ├── WeightedValues.tsx
│   │   └── WeightTable.tsx
│   ├── identity/
│   │   ├── playerService.ts  # Firestore CRUD for player profiles
│   │   ├── identitySlice.ts  # Login state (register / verify via security question)
│   │   └── IdentityDialog.tsx
│   ├── room/
│   │   ├── roomService.ts    # Firestore CRUD for game rooms (create/join/subscribe)
│   │   ├── roomSlice.ts      # Room state + async thunks
│   │   ├── RoomLobby.tsx     # Lobby UI with realtime player list
│   │   └── JoinRoomDialog.tsx
│   └── menu/
│       └── menu.tsx          # Navigation drawer (new game, settings, theme, identity, rooms)
├── firebase.ts               # Firebase SDK initialization
└── service-worker.ts         # PWA service worker
```

### State Management

The Redux store has six slices, all persisted to localStorage except `room`:

| Slice | Purpose |
|---|---|
| `game` | Game lifecycle — status (`new` / `started`) and type (`classic` / `ranked`) |
| `scores` | Per-player scores, wrapped in `redux-undo` for undo/redo support |
| `players` | Player list with names and colors |
| `stats` | Weighted stat definitions used in ranked mode scoring |
| `identity` | Current logged-in player profile (from Firestore) |
| `room` | Active game room state (transient — not persisted) |

### App Flow

```
App.tsx
 ├─ game.status === "new"  →  GameCreator
 │   ├─ Local play: add players → select game type → Start Game
 │   └─ Online: Create Room / Join Room → RoomLobby → host starts → auto-transition
 └─ game.status === "started"
     ├─ type "classic"  →  ScoresHistoryNew (round-by-round table)
     └─ type "ranked"   →  Ranking (weighted leaderboard)
```

### Online Features

**Identity** — Players register with a username, display name, and a security question (no passwords, no Firebase Auth). Answers are SHA-256 hashed in the browser before storage.

**Game Rooms** — A host creates a room and gets a `YASA-XXXX` code. Other players join with that code. The lobby uses a Firestore realtime listener so all participants see updates instantly. When the host starts, all clients transition to the game view automatically.
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
