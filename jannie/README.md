# Yasat on Jannie (yasat.nl/new)

This directory is the Yasat site at <https://yasat.nl/new/>. It is built on
[Jannie](https://github.com/jaapkroe/jannie) by Jaap Kroes and the
contributors: the table every game is played at (`platform/server`), the
web shell (`platform/web`), the personas and the card faces. The rest of
this repository, the React app at <https://yasat.nl/>, is a separate
program and does not use this code.

## What is different from Jannie

Jannie runs every game as a server with a website in front of it. GitHub
Pages serves only static files, so here **the server runs in the browser**:

- `cmd/yasat-wasm` compiles the table, with Yasat on it, to WebAssembly.
- `platform/web/js/local.js` loads it and gives `main.js` a `LocalSocket`
  that behaves like the WebSocket it used to open to `/ws`. The protocol is
  unchanged.
- `platform/server` takes any connection through the `Conn` interface, and
  `Server.ServeConn` serves one that lives in memory.

The result: no multiplayer, no calls, no joining with a code. A table lives
as long as the page. *Snel spelen* and *Nieuw spel* play against bots;
*Scoreblad* keeps the score of a game with real cards, in this browser.

Other changes to the shared code: `cards.js` has the ranks 2 to 6 for the
52-card deck; `home.js` has no join field and no invite card; the site's
paths follow the page's own location (`BASE` in `util.js`), so it can live
under `/new/`.

Jannie's klaverjas rules (`games/klaverjas/game`) are here only because
`platform/server` still builds klaverjas in; the site does not use them.

## Layout

```
cmd/yasat-wasm/        the table as WebAssembly, for the browser
games/yasat/yasat/     the rules: deck, discards, a round, the scoring and its events
games/yasat/yasatbot/  the bots, a port of the Yasat app's bot policy
games/yasat/yasatserver/ Yasat on the table's Game API
games/yasat/web/       the site: index.html, game.js, table.js, score.js, rules.js, yasat.css
games/yasat/test/      node tests of rules.js
platform/              Jannie's table, shell, personas and cards (see above)
scripts/build-site     builds the site into a directory (CI: build/new)
```

See [games/yasat/README.md](games/yasat/README.md) for the game itself.

## Build and test

Go (the version in `go.mod`) and Node 22 or later:

```sh
go vet ./... && go test -short ./...   # rules, bots (an arena), the table, the server
node --test games/yasat/test/*.test.mjs
scripts/build-site /tmp/site/new       # then serve /tmp/site and open /new/
```

The GitHub Pages workflow (`.github/workflows/deploy.yml`) builds the React
app into `build/` and this site into `build/new/`.

## License

Jannie is free software under the GNU Affero General Public License,
version 3 only (AGPL-3.0-only); see [LICENSE](LICENSE). This directory is a
modified version of it, under the same license. Its source is this
directory, which the version number on the site's home page links to
(`SOURCE_URL` in `platform/web/js/home.js`).
