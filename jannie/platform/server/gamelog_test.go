package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"jannie/games/klaverjas/game"
)

// TestGameLog plays a match of two people with the game log on, then gives
// feedback, and reads the log back: the match with its seed and who
// played, every hand with its cards and moves, the end, both reviews and
// the feedback (docs/server.md#game-log,
// games/klaverjas/README.md#game-log-records). Outside the expert mode a
// player asks no reasoning and gives no feedback about one decision; mark
// is an unknown message.
func TestGameLog(t *testing.T) {
	dir := t.TempDir()
	srv, ts := newTestServerWith(t, newGradeAI(false), func(s *Server) {
		s.games = startGameLog(dir, s.log, func() time.Time { return time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC) })
	})
	host := dial(t, ts)
	host.create("Host", map[string]any{"hands": 4, "seed": 4242}, false, false)
	guest := dial(t, ts)
	guest.join(host.code, "Gast", "")
	host.waitState("both seated", func(s *state) bool { return s.Players[guest.seat] != nil && !s.Players[guest.seat].Bot })
	host.send(map[string]any{"t": "start"})
	playGame(t, rand.New(rand.NewPCG(21, 22)), 4, host, guest)
	s := host.waitState("the review", func(s *state) bool { return s.Review != nil && !s.Review.Pending })
	// A seed chosen in the options is named at game over too, not at the start.
	start := "Het spel begint: 4 potjes, Utrechts/Amsterdams. Veel plezier!"
	if !slices.ContainsFunc(guest.chats, func(m chatMsg) bool { return m.Sys && m.Text == start }) {
		t.Errorf("no start line in %+v", guest.chats)
	}
	guest.waitChat("De seed van dit spel was 4242.")
	if s.Review.Seed != 4242 || s.Expert {
		t.Errorf("review seed %d, want 4242; expert %v", s.Review.Seed, s.Expert)
	}
	played := s.Review.Replay[0].Tricks[0].Cards[0]
	host.send(map[string]any{"t": "mark", "hand": 1, "trick": 1, "seat": int(played.Seat), "card": played.Card.String()})
	host.waitError(errInvalid)
	host.send(map[string]any{"t": "why", "hand": 1, "trick": 1})
	host.waitError(errInvalid)

	host.send(map[string]any{"t": "feedback", "text": "Mooi spel.\n\nMaar  ♠A\tdaar?", "hand": 1, "trick": 2})
	host.waitType("saved")
	guest.send(map[string]any{"t": "feedback", "text": "   "})
	guest.waitError(errInvalid)
	guest.send(map[string]any{"t": "feedback", "text": "Alles goed"})
	guest.waitType("saved")

	srv.games.close()
	recs := readGameLog(t, filepath.Join(dir, "games-2026-10.jsonl"))
	kinds := map[string]int{}
	for _, r := range recs {
		kinds[r["t"].(string)]++
	}
	if kinds["match"] != 1 || kinds["hand"] != 4 || kinds["end"] != 1 || kinds["review"] != 2 || kinds["mark"] != 0 || kinds["feedback"] != 2 {
		t.Errorf("records %v", kinds)
	}
	for _, r := range recs {
		switch r["t"] {
		case "match":
			var m logMatch
			remarshal(t, r, &m)
			if m.Seed != 4242 || m.Room != host.code || m.Opts.Seed != 4242 || len(m.Players) != 4 || m.Expert || m.Version != "dev" {
				t.Errorf("match record %+v", m)
			}
			for _, p := range m.Players {
				human := p.Seat == host.seat || p.Seat == guest.seat
				if human != (p.IP != "" && p.Device == "klaverjas-test/1.0" && p.Bot == "") || !human && (p.Bot == "" || p.Level != "normaal") {
					t.Errorf("player %+v", p)
				}
			}
		case "hand":
			var h logHand
			remarshal(t, r, &h)
			plays := 0
			for _, a := range strings.Fields(h.Acts) {
				if len(a) == 3 && a[1] != 't' && a[1] != 'b' {
					plays++
				}
			}
			all := ""
			for _, c := range h.Cards {
				all += c
			}
			if len(h.Cards) != 4 || len(all) != 64 || plays != 32 || h.Result.Players != 4 {
				t.Errorf("hand record %d: cards %v, %d plays in %q", h.Hand, h.Cards, plays, h.Acts)
			}
		case "review":
			var rv logReview
			remarshal(t, r, &rv)
			if rv.Review == nil || rv.Review.Pending || rv.Review.Replay != nil || rv.Review.Seed != 4242 {
				t.Errorf("review record %+v", rv)
			}
		case "feedback":
			var f logFeedback
			remarshal(t, r, &f)
			if f.Name == "Host" && (f.Text != "Mooi spel.\nMaar ♠A daar?" || f.Hand != 0 || f.Trick != 0 || f.By != nil || f.Device != "klaverjas-test/1.0") {
				t.Errorf("feedback record %+v", f)
			}
		}
	}
}

func readGameLog(t *testing.T, path string) []map[string]any {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var out []map[string]any
	sc := bufio.NewScanner(f)
	sc.Buffer(nil, 1<<20)
	for sc.Scan() {
		var r map[string]any
		if err := json.Unmarshal(sc.Bytes(), &r); err != nil {
			t.Fatalf("line %q: %v", sc.Text(), err)
		}
		out = append(out, r)
	}
	return out
}

func remarshal(t *testing.T, from map[string]any, to any) {
	t.Helper()
	b, _ := json.Marshal(from)
	if err := json.Unmarshal(b, to); err != nil {
		t.Fatal(err)
	}
}

// TestSeedDeals: the same seed deals the same cards, first dealer and
// turned suit included; without a fixed seed every match draws its own.
func TestSeedDeals(t *testing.T) {
	s, _, _ := newTestServer(t)
	deal := func(seed int) (uint64, dealtCards, game.Seat, game.Suit) {
		r := newRoom(s, "TEST")
		defer r.stop()
		r.seats[0] = newHuman("A")
		r.opts.Seed = seed
		r.startMatch()
		return r.seed, r.dealt, r.deal.Dealer(), r.deal.Turned()
	}
	s1, d1, dealer1, turned1 := deal(77)
	s2, d2, dealer2, turned2 := deal(77)
	if s1 != 77 || s2 != 77 || dealer1 != dealer2 || turned1 != turned2 {
		t.Errorf("seeds %d %d, dealers %v %v, turned %v %v", s1, s2, dealer1, dealer2, turned1, turned2)
	}
	for i := range d1.hands {
		if !slices.Equal(d1.hands[i], d2.hands[i]) {
			t.Errorf("seat %d: %v, then %v", i, d1.hands[i], d2.hands[i])
		}
	}
	_, d3, _, _ := deal(78)
	if slices.Equal(d1.hands[0], d3.hands[0]) {
		t.Error("another seed deals the same cards")
	}
	r1, _, _, _ := deal(0)
	r2, _, _, _ := deal(0)
	if r1 == r2 || r1 < 1 || r1 > maxSeed || r2 < 1 || r2 > maxSeed {
		t.Errorf("drawn seeds %d and %d", r1, r2)
	}
}

// TestSeedAtEnd: a seed the server draws reaches nobody before game over,
// in no message at all, and the chat names it then; a rematch draws a new
// one and keeps it as well (docs/server.md#the-seed).
func TestSeedAtEnd(t *testing.T) {
	srv, ts, _ := newTestServer(t)
	host := dial(t, ts)
	host.keep = true
	host.create("Host", map[string]any{"hands": 4}, false, false)
	guest := dial(t, ts)
	guest.keep = true
	guest.join(host.code, "Gast", "")
	host.waitState("both seated", func(s *state) bool { return s.Players[guest.seat] != nil && !s.Players[guest.seat].Bot })
	host.send(map[string]any{"t": "start"})
	r := roomOf(t, srv, host.code)
	rng := rand.New(rand.NewPCG(31, 32))
	var seeds []uint64
	for match := 1; match <= 2; match++ {
		if match > 1 {
			host.send(map[string]any{"t": "rematch"})
			host.waitEvent("deal")
			guest.waitEvent("deal")
		}
		playGame(t, rng, 4, host, guest)
		var seed uint64
		call(r, func() { seed = r.seed })
		seeds = append(seeds, seed)
		for _, c := range []*tclient{host, guest} {
			c.waitChat(fmt.Sprintf("De seed van dit spel was %d.", seed))
			checkSeedAtEnd(t, c, match, seed)
		}
	}
	if seeds[0] == seeds[1] {
		t.Errorf("the rematch dealt from seed %d again", seeds[0])
	}
}

// checkSeedAtEnd checks the messages c kept: none before its n-th update
// with event gameOver names seed as a number, and a system line after it
// does. A seed of four digits or fewer (one in 100000) may be a score or a
// count: it is not looked for then.
func checkSeedAtEnd(t *testing.T, c *tclient, n int, seed uint64) {
	t.Helper()
	msgs := c.kept
	num := regexp.MustCompile(`(^|[^0-9])` + strconv.FormatUint(seed, 10) + `([^0-9]|$)`)
	line := fmt.Sprintf("De seed van dit spel was %d.", seed)
	over := 0
	for k, m := range msgs {
		if m.T == "update" && m.evType() == "gameOver" {
			if over++; over == n {
				for _, after := range msgs[k+1:] {
					var cm chatMsg
					if after.T == "chat" && json.Unmarshal(after.Msg, &cm) == nil && cm.Sys && cm.Text == line {
						return
					}
				}
				t.Errorf("seat %d: no line %q after game over %d", c.seat, line, n)
				return
			}
		}
		if seed >= 10000 && num.Match(m.raw) {
			t.Errorf("seat %d: seed %d before game over %d: %s", c.seat, seed, n, m.raw)
			return
		}
	}
	t.Errorf("seat %d: no game over %d in %d messages", c.seat, n, len(msgs))
}

// TestSeedOption: a seed is a number from 1 to 999999999; null or 0 means a
// new seed per match.
func TestSeedOption(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want int
		ok   bool
	}{
		{`{"seed":4242}`, 4242, true},
		{`{"seed":null}`, 0, true},
		{`{"seed":0}`, 0, true},
		{`{"seed":999999999}`, 999999999, true},
		{`{"seed":1000000000}`, 0, false},
		{`{"seed":-1}`, 0, false},
		{`{"seed":"12"}`, 0, false},
		{`{"seed":1.5}`, 0, false},
	} {
		p, err := parseOpts(json.RawMessage(tc.raw), false)
		if (err == nil) != tc.ok || tc.ok && (p.Seed == nil || *p.Seed != tc.want) {
			t.Errorf("%s: patch %v, err %v", tc.raw, p.Seed, err)
		}
	}
}

// TestGameLogClosed: writes after close are dropped, and a nil log takes
// any write.
func TestGameLogClosed(t *testing.T) {
	g := newGameLog(t.TempDir(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	g.write(logEnd{T: "end"})
	g.close()
	g.write(logEnd{T: "end"}) // must not panic
	g.close()
	var none *gameLog
	none.write(logEnd{T: "end"})
	none.close()
}

// TestGameLogRetention: the writer keeps the current month and the eleven
// before it, at its start and as time goes on; other files stay.
func TestGameLogRetention(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"games-2025-09.jsonl", "games-2025-10.jsonl", "games-2025-11.jsonl", "games-2026-10.jsonl", "games-x.jsonl", "notes.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("{}\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	files := func() []string {
		es, _ := os.ReadDir(dir)
		var out []string
		for _, e := range es {
			out = append(out, e.Name())
		}
		return out
	}
	var mu sync.Mutex
	at := time.Date(2026, 10, 31, 23, 0, 0, 0, time.UTC)
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return at }
	g := startGameLog(dir, slog.New(slog.NewTextHandler(io.Discard, nil)), clock)
	g.write(map[string]string{"t": "test"}) // after the prune at the start
	g.close()
	if got, want := files(), []string{"games-2025-11.jsonl", "games-2026-10.jsonl", "games-x.jsonl", "notes.txt"}; !slices.Equal(got, want) {
		t.Errorf("on 31 Oct 2026: %v, want %v", got, want)
	}
	// A month later the oldest month goes; the prune is the same one the
	// writer runs every pruneEvery.
	mu.Lock()
	at = time.Date(2026, 11, 1, 0, 30, 0, 0, time.UTC)
	mu.Unlock()
	g.prune()
	if got, want := files(), []string{"games-2026-10.jsonl", "games-x.jsonl", "notes.txt"}; !slices.Equal(got, want) {
		t.Errorf("on 1 Nov 2026: %v, want %v", got, want)
	}
}
