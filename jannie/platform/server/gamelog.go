package server

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// gameLog keeps a compact record of every match (docs/server.md#game-log):
// one JSON line per event in a file per month, games-2026-10.jsonl, in
// dir. It holds what was dealt and played, the reviews and feedback, and
// who played (name, address, device), so games can be looked at again,
// shown as statistics and the engine tuned on them. Lines go through a
// bounded queue to one writer goroutine: a slow disk never holds up a
// room, and a full queue drops lines (and says so in the server log)
// rather than block. The writer keeps gameLogMonths of files (prune).
type gameLog struct {
	dir  string
	log  *slog.Logger
	ch   chan []byte
	done chan struct{}
	now  func() time.Time // tests

	mu     sync.RWMutex // guards closed against writes racing close
	closed bool
}

const gameLogQueue = 4096

// gameLogMonths is how many month files the game log keeps: the current
// month and the eleven before it, so no record is kept longer than twelve
// months. The writer prunes at its start and every pruneEvery.
const (
	gameLogMonths = 12
	pruneEvery    = time.Hour
)

// newGameLog starts the writer for dir, or returns nil (no game log) when
// dir is empty. A nil *gameLog accepts and ignores every write.
func newGameLog(dir string, log *slog.Logger) *gameLog {
	return startGameLog(dir, log, time.Now)
}

// startGameLog is newGameLog on clock now (tests).
func startGameLog(dir string, log *slog.Logger, now func() time.Time) *gameLog {
	if dir == "" {
		return nil
	}
	g := &gameLog{dir: dir, log: log, ch: make(chan []byte, gameLogQueue), done: make(chan struct{}), now: now}
	go g.run()
	return g
}

// write queues record rec as one line; rec is a struct of the log* kinds
// below.
func (g *gameLog) write(rec any) {
	if g == nil {
		return
	}
	b, err := json.Marshal(rec)
	if err != nil {
		g.log.Error("game log: unencodable record", "err", err.Error())
		return
	}
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.closed {
		return
	}
	select {
	case g.ch <- append(b, '\n'):
	default:
		g.log.Error("game log: queue full, record dropped")
	}
}

// close writes what is queued and stops the writer; later writes are
// dropped.
func (g *gameLog) close() {
	if g == nil {
		return
	}
	g.mu.Lock()
	if !g.closed {
		g.closed = true
		close(g.ch)
	}
	g.mu.Unlock()
	<-g.done
}

func (g *gameLog) run() {
	defer close(g.done)
	g.prune()
	tick := time.NewTicker(pruneEvery)
	defer tick.Stop()
	var f *os.File
	defer func() {
		if f != nil {
			f.Close()
		}
	}()
	month := ""
	failing := false
	for {
		var line []byte
		select {
		case <-tick.C:
			g.prune()
			continue
		case l, ok := <-g.ch:
			if !ok {
				return
			}
			line = l
		}
		if m := g.now().UTC().Format("2006-01"); m != month || f == nil {
			if f != nil {
				f.Close()
				f = nil
			}
			month = m
			var err error
			if err = os.MkdirAll(g.dir, 0o755); err == nil {
				f, err = os.OpenFile(filepath.Join(g.dir, "games-"+m+".jsonl"), os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o644)
			}
			if err != nil {
				if !failing {
					g.log.Error("game log: cannot open", "dir", g.dir, "err", err.Error())
				}
				failing = true
				continue
			}
			failing = false
		}
		if _, err := f.Write(line); err != nil && !failing {
			g.log.Error("game log: write failed", "err", err.Error())
			failing = true
		}
	}
}

// prune removes the month files older than the last gameLogMonths months
// (the current one included); other files in dir stay.
func (g *gameLog) prune() {
	now := g.now().UTC()
	oldest := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1-gameLogMonths, 0).Format("2006-01")
	entries, err := os.ReadDir(g.dir)
	if err != nil {
		return // not there yet: nothing to prune
	}
	for _, e := range entries {
		m, ok := strings.CutPrefix(e.Name(), "games-")
		if m, ok = strings.CutSuffix(m, ".jsonl"); !ok || e.IsDir() {
			continue
		}
		if _, err := time.Parse("2006-01", m); err != nil || m >= oldest {
			continue
		}
		if err := os.Remove(filepath.Join(g.dir, e.Name())); err != nil {
			g.log.Error("game log: cannot remove an old month", "file", e.Name(), "err", err.Error())
			continue
		}
		g.log.Info("game log: removed an old month", "file", e.Name())
	}
}

// ---- records (docs/server.md#game-log) -------------------------------------

// logPlayer is who sits at a seat: a person with name, address and device,
// or a bot by persona and level.
type logPlayer struct {
	Seat   int    `json:"seat"`
	Name   string `json:"name"`
	IP     string `json:"ip,omitempty"`
	Device string `json:"device,omitempty"`
	Bot    string `json:"bot,omitempty"`
	Level  string `json:"level,omitempty"`
}

// logGameMatch is logMatch for a game on the exported API (api.go): its
// name and its options (GameOptions.Wire), without training and expert.
type logGameMatch struct {
	T       string      `json:"t"` // "match"
	Match   string      `json:"match"`
	Room    string      `json:"room"`
	At      time.Time   `json:"at"`
	Version string      `json:"version"`
	Game    string      `json:"game"`
	Seed    uint64      `json:"seed"`
	Opts    any         `json:"opts"`
	Players []logPlayer `json:"players"`
}

// logSeat: a seat changed hands during the match (a joiner, someone back
// on another device, an AI everyone agreed to).
type logSeat struct {
	T      string    `json:"t"` // "seat"
	Match  string    `json:"match"`
	At     time.Time `json:"at"`
	Hand   int       `json:"hand"`
	Player logPlayer `json:"player"`
}

type logEnd struct {
	T      string    `json:"t"` // "end"
	Match  string    `json:"match"`
	At     time.Time `json:"at"`
	Total  []int     `json:"total"`
	Winner int       `json:"winner"`
}

// logClose: the room went before its match was over.
type logClose struct {
	T      string    `json:"t"` // "close"
	Match  string    `json:"match"`
	At     time.Time `json:"at"`
	Hand   int       `json:"hand"`
	Reason string    `json:"reason"`
}

// maxDevice is how much of a browser's User-Agent the log keeps.
const maxDevice = 300

func deviceOf(ua string) string {
	ua = strings.TrimSpace(ua)
	if len(ua) > maxDevice {
		ua = ua[:maxDevice]
	}
	return ua
}
