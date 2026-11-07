package server

import (
	"fmt"
	"math/rand/v2"
	"slices"
	"strings"
	"testing"
	"time"

	"jannie/games/klaverjas/game"
)

func (c *tclient) poll() *msg {
	select {
	case m, ok := <-c.in:
		if !ok {
			c.t.Fatalf("connection of seat %d closed: %v", c.seat, <-c.errc)
		}
		c.track(m)
		return m
	default:
		return nil
	}
}

// checkUpdate verifies the invariants every state must keep.
func checkUpdate(t *testing.T, c *tclient, m *msg) {
	t.Helper()
	if m.T != "update" {
		return
	}
	s := m.state
	if s == nil {
		t.Fatalf("update without state")
	}
	if s.You != c.seat {
		t.Errorf("you = %d, joined as %d", s.You, c.seat)
	}
	n := len(s.Players)
	if n != s.Opts.Players || len(s.Bids) != n {
		t.Fatalf("%d players and %d bids at a table of %d", n, len(s.Bids), s.Opts.Players)
	}
	size := map[int]int{2: 16, 3: 10, 4: 8}[n]
	me := s.Players[s.You]
	if me == nil || me.Bot {
		t.Fatalf("own seat is not a human: %+v", me)
	}
	switch e := m.evType(); e {
	case "deal", "trump", "contract", "trick", "handEnd", "gameOver":
		// Pauses: nobody may act.
		if s.Turn != -1 {
			t.Errorf("turn %d after %s", s.Turn, e)
		}
	case "collect":
		last := s.TricksWon[0]+s.TricksWon[1] == size // the hand ends: nobody leads
		if s.Phase == phasePlay && !last && (s.Turn != int(s.Trick.Leader) || len(s.Trick.Cards) != 0) {
			t.Errorf("after collect: turn %d, trick %+v", s.Turn, s.Trick)
		}
	}
	switch s.Phase {
	case phaseAuction, phaseDiscard, phaseTrump, phaseBid, phasePlay:
		played := s.TricksWon[0] + s.TricksWon[1]
		if s.Trick != nil && len(s.Trick.Cards) < n {
			for _, p := range s.Trick.Cards {
				if int(p.Seat) == s.You {
					played++
				}
			}
		}
		left := size - played
		if s.Phase == phaseDiscard && s.Soloist == s.You {
			left += 2 // the talon
			if len(s.Talon) != 2 {
				t.Errorf("soloist sees talon %v", s.Talon)
			}
		}
		if me.Cards != left {
			t.Errorf("players[you].cards = %d after %d played (phase %s)", me.Cards, played, s.Phase)
		}
		switch {
		case n == 2 && (s.Piles == nil || len(s.Hand) > 8):
			// The face-up cards: none while the card under the one just
			// played waits for the trick to be complete.
			t.Errorf("two players: %d open cards, piles %v", len(s.Hand), s.Piles)
		case n != 2 && len(s.Hand) != left:
			t.Errorf("hand %d cards after %d played (phase %s)", len(s.Hand), played, s.Phase)
		}
	default:
		if len(s.Hand) != 0 {
			t.Errorf("hand outside a hand: %v", s.Hand)
		}
	}
	// In play only training's last trick, kept for its tip, has a nextAt.
	if s.Phase == phasePlay && s.NextAt != 0 && (!s.Training || me.Cards != 0 || s.Turn != -1) {
		t.Errorf("nextAt %d in play (training %v, %d cards, turn %d)", s.NextAt, s.Training, me.Cards, s.Turn)
	}
	switch {
	case n == 3 && s.Soloist >= 0 && (s.Soloist != s.Bidder || s.Bid < game.MinBid || s.Phase == phaseAuction):
		t.Errorf("three players: soloist %d, bid %d by %d in phase %s", s.Soloist, s.Bid, s.Bidder, s.Phase)
	case n != 3 && (s.Bid != 0 || s.Bidder != -1 || s.Soloist != -1):
		t.Errorf("%d players: bid %d by %d, soloist %d", n, s.Bid, s.Bidder, s.Soloist)
	}
	if s.Turn == s.You && s.Phase == phasePlay {
		if len(s.Legal) == 0 {
			t.Errorf("my turn without legal cards")
		}
		for _, l := range s.Legal {
			if !slices.Contains(s.Hand, l) {
				t.Errorf("legal card %v not in hand %v", l, s.Hand)
			}
		}
		if s.Rule == "" {
			t.Errorf("my turn without rule")
		}
	} else if s.Legal != nil || s.Rule != "" {
		t.Errorf("legal/rule while not my turn: %v %q", s.Legal, s.Rule)
	}
	// The consent rules (checkConsent) hold for every update any client
	// reads, so they are checked in track.
	sum := make([]int, game.Scorers(n))
	for k, row := range s.Scores {
		if row.Hand != k+1 || len(row.Gains) != len(sum) {
			t.Errorf("score row %d has hand %d, gains %v", k, row.Hand, row.Gains)
			continue
		}
		for j, g := range row.Gains {
			sum[j] += g
		}
	}
	if !slices.Equal(sum, s.Total) {
		t.Errorf("total %v, scores add up to %v", s.Total, sum)
	}
	if m.evType() == "handEnd" {
		r := s.PrevHand.Result
		if r.Points[0]+r.Points[1] != 162 {
			t.Errorf("hand points %v do not add up to 162", r.Points)
		}
		roem := r.Roem[0] + r.Roem[1]
		if r.Nat {
			p := r.PlayingTeam
			if r.Score[p] != 0 || r.Score[1-p] != 162+roem {
				t.Errorf("nat scored %v (roem %v)", r.Score, r.Roem)
			}
		} else if r.Score[0] != r.Points[0]+r.Roem[0] || r.Score[1] != r.Points[1]+r.Roem[1] {
			t.Errorf("score %v from points %v roem %v", r.Score, r.Points, r.Roem)
		}
		if len(s.PrevHand.Tricks) != size {
			t.Errorf("prevHand has %d tricks", len(s.PrevHand.Tricks))
		}
		if n == 3 && (r.Bid < game.MinBid || r.Nat != (r.Points[0]+r.Roem[0] < r.Bid)) {
			t.Errorf("three players: bid %d, result %+v", r.Bid, r)
		}
		if len(s.Scores) != s.HandNo {
			t.Errorf("%d score rows after hand %d", len(s.Scores), s.HandNo)
		}
	}
}

// playGame drives the clients with random legal decisions until every one
// saw game over, checking all updates. It returns the final states.
func playGame(t *testing.T, rng *rand.Rand, hands int, clients ...*tclient) {
	t.Helper()
	acted := make([]int, len(clients))
	readied := make([]int, len(clients))
	over := make([]bool, len(clients))
	deadline := time.Now().Add(90 * time.Second)
	for slices.Contains(over, false) {
		if time.Now().After(deadline) {
			t.Fatalf("game did not finish; phases %v", phases(clients))
		}
		busy := false
		for k, c := range clients {
			for m := c.poll(); m != nil; m = c.poll() {
				busy = true
				checkUpdate(t, c, m)
				if m.T == "error" {
					t.Fatalf("seat %d got error %s: %s", c.seat, m.Code, m.errMsg())
				}
			}
			s := c.s
			if s == nil {
				continue
			}
			switch {
			case s.Phase == phaseGameOver:
				over[k] = true
			case c.myTurn() && acted[k] < c.seq:
				acted[k] = c.seq
				c.actRandom(rng)
			case s.Phase == phaseHandEnd && readied[k] < s.HandNo:
				readied[k] = s.HandNo
				c.send(map[string]any{"t": "ready"})
			}
		}
		if !busy {
			time.Sleep(time.Millisecond)
		}
	}
	for _, c := range clients {
		s := c.s
		if s.HandNo != hands || len(s.Scores) != hands {
			t.Errorf("game over after hand %d with %d rows, want %d", s.HandNo, len(s.Scores), hands)
		}
		if want := topScorer(s.Total); s.Winner != want {
			t.Errorf("winner %d for total %v", s.Winner, s.Total)
		}
	}
}

// drive lets the clients make random decisions until done holds.
func drive(t *testing.T, done func() bool, clients ...*tclient) {
	t.Helper()
	rng := rand.New(rand.NewPCG(5, 5))
	acted := make([]int, len(clients))
	deadline := time.Now().Add(20 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatalf("drive: condition not reached; phases %v", phases(clients))
		}
		busy := false
		for k, c := range clients {
			for m := c.poll(); m != nil; m = c.poll() {
				busy = true
				checkUpdate(t, c, m)
				if done() {
					return
				}
			}
			if c.myTurn() && acted[k] < c.seq && !done() {
				acted[k] = c.seq
				c.actRandom(rng)
			}
		}
		if !busy {
			time.Sleep(time.Millisecond)
		}
	}
}

func phases(cs []*tclient) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.phase()
	}
	return out
}

func TestQuickPlayToGameOver(t *testing.T) {
	for _, players := range []int{4, 3, 2} {
		_, ts, _ := newTestServer(t)
		rng := rand.New(rand.NewPCG(1, uint64(players)))
		c := dial(t, ts)
		c.create("Piet", map[string]any{"players": players, "hands": 4}, false, true)
		if c.s.Phase != phaseLobby {
			t.Fatalf("first state is %q, want lobby", c.s.Phase)
		}
		c.waitEvent("deal")
		if len(c.s.Players) != players {
			t.Fatalf("%d seats for %d players", len(c.s.Players), players)
		}
		for i, p := range c.s.Players {
			if i == 0 {
				if p.Bot || p.Name != "Piet" {
					t.Errorf("seat 0: %+v", p)
				}
				continue
			}
			if p == nil || !p.Bot || p.Name != fakeName(p.BotID)+" (AI)" {
				t.Errorf("seat %d: %+v", i, p)
			}
		}
		playGame(t, rng, 4, c)
		want := []string{"deal", "play", "trick", "collect", "handEnd", "gameOver"}
		if players == 3 {
			want = append(want, "auction", "contract", "trump")
		}
		for _, ev := range want {
			if !slices.Contains(c.events, ev) {
				t.Errorf("%d players: never saw event %q", players, ev)
			}
		}
	}
}

// call runs f on the room goroutine and waits for it.
func call(r *room, f func()) {
	done := make(chan struct{})
	if r.post(func() { defer close(done); f() }) {
		<-done
	}
}

func fakeName(id string) string {
	for _, p := range fakePersonas {
		if p.ID == id {
			return p.Name
		}
	}
	return "?"
}

func TestBotsToGameOver(t *testing.T) {
	s, _, _ := newTestServer(t)
	for _, tc := range []struct {
		players int
		mode    game.TrumpMode
	}{{4, game.Utrechts}, {4, game.Gedraaid}, {3, game.Utrechts}, {2, game.Utrechts}, {2, game.Gedraaid}} {
		mode := fmt.Sprintf("%d players %s", tc.players, tc.mode)
		r := newRoom(s, "TEST")
		r.alwaysOn = true
		r.opts.Players = tc.players
		r.opts.Hands = 8
		r.opts.TrumpMode = tc.mode
		r.opts.Rules = game.Rotterdams
		s.mu.Lock()
		s.rooms[r.code] = r
		s.mu.Unlock()
		go r.loop()
		done := make(chan []int, 1)
		r.post(func() {
			r.fillSeats()
			r.startMatch()
		})
		go func() {
			for {
				time.Sleep(5 * time.Millisecond)
				ok := r.post(func() {
					if r.phase == phaseGameOver {
						select {
						case done <- slices.Clone(r.total):
						default:
						}
					}
				})
				if !ok {
					return
				}
			}
		}()
		select {
		case total := <-done:
			sum := make([]int, game.Scorers(tc.players))
			var rows int
			call(r, func() {
				rows = len(r.scores)
				for _, row := range r.scores {
					for k, g := range row.Gains {
						sum[k] += g
					}
				}
			})
			if rows != 8 {
				t.Errorf("%s: %d hands scored, want 8", mode, rows)
			}
			if !slices.Equal(sum, total) {
				t.Errorf("%s: total %v, rows add up to %v", mode, total, sum)
			}
		case <-time.After(60 * time.Second):
			t.Fatalf("%s: the bots did not finish", mode)
		}
		call(r, func() { r.close("test") })
	}
}

func TestHumansOverWebsocket(t *testing.T) {
	for _, tc := range []struct {
		name   string
		humans int
		opts   map[string]any
	}{
		{"two-of-four-utrechts-amsterdams", 2, map[string]any{"hands": 4}},
		{"four-gedraaid-rotterdams", 4, map[string]any{"hands": 4, "trumpMode": "gedraaid", "rules": "rotterdams"}},
		{"three-of-four-gedraaid", 3, map[string]any{"hands": 4, "trumpMode": "gedraaid", "tempo": "snel"}},
		{"three-players-rotterdams", 3, map[string]any{"players": 3, "hands": 4, "rules": "rotterdams"}},
		{"two-of-three-players", 2, map[string]any{"players": 3, "hands": 4}},
		{"two-players-gedraaid", 2, map[string]any{"players": 2, "hands": 4, "trumpMode": "gedraaid"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, ts, _ := newTestServer(t)
			rng := rand.New(rand.NewPCG(3, uint64(tc.humans)))
			host := dial(t, ts)
			host.create("Host", tc.opts, false, false)
			clients := []*tclient{host}
			for k := 1; k < tc.humans; k++ {
				c := dial(t, ts)
				c.join(host.code, "Speler", "")
				clients = append(clients, c)
			}
			host.waitState("everyone seated", func(s *state) bool {
				n := 0
				for _, p := range s.Players {
					if p != nil && !p.Bot {
						n++
					}
				}
				return n == tc.humans
			})
			host.send(map[string]any{"t": "start"})
			playGame(t, rng, 4, clients...)
			// Rematch: same seats, a fresh match.
			host.send(map[string]any{"t": "rematch"})
			for _, c := range clients {
				c.waitState("rematch deal", func(s *state) bool { return s.Phase != phaseGameOver && s.HandNo == 1 })
				if len(c.s.Scores) != 0 || slices.ContainsFunc(c.s.Total, func(n int) bool { return n != 0 }) {
					t.Errorf("rematch kept scores %v %v", c.s.Scores, c.s.Total)
				}
			}
		})
	}
}

func TestPauseWithoutHumans(t *testing.T) {
	s, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4}, false, true)
	drive(t, func() bool { return c.s.Phase == phasePlay && c.s.Turn > 0 }, c)
	c.conn.CloseNow()
	s.mu.Lock()
	r := s.rooms[c.code]
	s.mu.Unlock()
	played := func() (n int) {
		call(r, func() { n = 32 - r.deal.HandLen(0) - r.deal.HandLen(1) - r.deal.HandLen(2) - r.deal.HandLen(3) })
		return
	}
	waitFor(t, "disconnect seen", func() bool {
		var n int
		call(r, func() { n = r.connectedHumans() })
		return n == 0
	})
	before := played()
	time.Sleep(300 * time.Millisecond) // dozens of bot moves at this pace
	paused := played()
	if paused > before+1 { // one move may have been on its way
		t.Fatalf("bots played on without a human: %d cards, then %d", before, paused)
	}
	c2 := dial(t, ts)
	c2.join(c.code, "Piet", c.token)
	waitFor(t, "play resumes", func() bool {
		for c2.poll() != nil {
		}
		return played() > paused || c2.myTurn()
	})
}

func TestReconnectMidGame(t *testing.T) {
	_, ts, _ := newTestServer(t)
	a := dial(t, ts)
	a.create("Anna", map[string]any{"hands": 4}, false, false)
	b := dial(t, ts)
	b.join(a.code, "Bert", "")
	a.send(map[string]any{"t": "start"})
	drive(t, func() bool { return a.s != nil && a.s.Phase == phasePlay && a.s.Turn >= 0 }, a, b)
	hand := slices.Clone(a.s.Hand)
	seat, token := a.seat, a.token
	a.conn.CloseNow()

	b.until(5*time.Second, "away event", func(m *msg) bool {
		return m.T == "update" && m.evType() == "away" && int(m.ev["seat"].(float64)) == seat
	})
	if b.s.Players[seat].Connected {
		t.Errorf("seat %d still connected after close", seat)
	}

	a2 := dial(t, ts)
	a2.send(map[string]any{"t": "join", "code": a.code, "name": "Anna", "token": token})
	j := a2.waitType("joined")
	if j.Seat != seat || j.Token != token {
		t.Fatalf("rejoined at seat %d token %q, want %d", j.Seat, j.Token, seat)
	}
	a2.waitType("chatlog")
	u := a2.waitType("update")
	if u.ev != nil {
		t.Errorf("resync has event %v", u.ev)
	}
	if !u.state.Players[seat].Connected || u.state.Players[seat].Name != "Anna" {
		t.Errorf("after reconnect: %+v", u.state.Players[seat])
	}
	// Nobody played for Anna meanwhile (docs/server.md#takeover-consent):
	// she has her cards.
	if !sameCards(u.state.Hand, hand) {
		t.Errorf("hand %v after reconnect, %v before", u.state.Hand, hand)
	}
	b.waitEvent("back")
}

func sameCards(a, b []game.Card) bool {
	return len(a) == len(b) && !slices.ContainsFunc(a, func(c game.Card) bool { return !slices.Contains(b, c) })
}

func TestIllegalPlayRejected(t *testing.T) {
	_, ts, _ := newTestServer(t)
	rng := rand.New(rand.NewPCG(7, 7))
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4}, false, true)
	acted := 0
	for tries := 0; ; tries++ {
		if tries > 2000 {
			t.Fatal("never had a turn with an illegal card")
		}
		c.until(10*time.Second, "my turn", func(m *msg) bool { return c.myTurn() && c.seq > acted })
		acted = c.seq
		s := c.s
		if s.Phase == phasePlay && len(s.Legal) < len(s.Hand) {
			var bad game.Card
			for _, h := range s.Hand {
				if !slices.Contains(s.Legal, h) {
					bad = h
					break
				}
			}
			c.send(map[string]any{"t": "play", "card": bad.String()})
			e := c.waitError(errInvalid)
			want := game.ExplainIllegal(bad, s.Hand, *s.Trick, game.Seat(s.You), *s.Trump, game.Amsterdams)
			if e.errMsg() != want || want == "" {
				t.Fatalf("illegal %v: msg %q, want %q", bad, e.errMsg(), want)
			}
			// Not in hand, and not your turn.
			for _, card := range game.NewDeck() {
				if !slices.Contains(s.Hand, card) {
					c.send(map[string]any{"t": "play", "card": card.String()})
					if e := c.waitError(errInvalid); e.errMsg() != game.ErrNotInHand.Error() {
						t.Errorf("card not in hand: %q", e.errMsg())
					}
					break
				}
			}
			c.send(map[string]any{"t": "play", "card": s.Legal[0].String()})
			c.waitEvent("play")
			c.send(map[string]any{"t": "play", "card": s.Legal[0].String()})
			c.waitError(errNotTurn)
			return
		}
		c.actRandom(rng)
	}
}

// TestTipsOption: tips are on by default in training and off in any other
// game, also when asked for there. A bad value is refused in the lobby.
func TestTipsOption(t *testing.T) {
	_, ts, _ := newTestServer(t)
	for _, tc := range []struct {
		opts     map[string]any
		training bool
		want     bool
	}{
		{map[string]any{}, true, true},
		{map[string]any{"tips": true}, true, true},
		{map[string]any{"tips": false}, true, false},
		{map[string]any{}, false, false},
		{map[string]any{"tips": true}, false, false},
		{map[string]any{"tips": "ja"}, true, true}, // create skips a stale value
		{map[string]any{"tips": nil}, true, true},  // and null
	} {
		c := dial(t, ts)
		c.create("Speler", tc.opts, tc.training, false)
		if c.s.Opts.Tips != tc.want {
			t.Errorf("%+v: tips %v", tc, c.s.Opts.Tips)
		}
	}
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"tips": true}})
	h.waitEvent("lobby")
	if h.s.Opts.Tips {
		t.Error("tips switched on outside training")
	}
	for _, bad := range []any{"ja", nil} {
		h.send(map[string]any{"t": "opts", "opts": map[string]any{"tips": bad}})
		if e := h.waitError(errInvalid); e.errMsg() != "Ongeldige waarde voor tips." {
			t.Errorf("the bad value %v: %q", bad, e.errMsg())
		}
	}
}

// TestTrainingWithoutTips: vrij spelen with tips off has no hint on a turn,
// no tip after a trick and no line of Juf Jannie as coach in the chat, while
// the reasoning of the decision awaited is answered.
func TestTrainingWithoutTips(t *testing.T) {
	_, ts, ai := newTestServer(t)
	c := dial(t, ts)
	c.create("Speler", map[string]any{"hands": 4, "tips": false}, true, true)
	drive(t, func() bool {
		if c.s.Hint != nil {
			t.Fatalf("a hint with tips off: %+v", c.s.Hint)
		}
		return c.phase() == phasePlay && c.myTurn()
	}, c)
	trick := 9 - len(c.s.Hand)
	c.send(map[string]any{"t": "why", "hand": c.s.HandNo, "trick": trick})
	m := c.until(5*time.Second, "why", func(m *msg) bool { return m.T == "why" || m.T == "error" })
	if m.T != "why" || ai.reasoned.Load() != 1 {
		t.Fatalf("why with tips off: %s", m.raw)
	}
	c.actRandom(rand.New(rand.NewPCG(9, 9)))
	run := readLessons(t, c, func() bool { return c.phase() == phaseGameOver }, nil)
	if c.tips != 0 || len(run.hints) != 0 || ai.explained.Load() != 0 {
		t.Errorf("%d tips, hints %v, %d tricks explained", c.tips, run.hints, ai.explained.Load())
	}
	for _, line := range c.chats {
		if line.Coach {
			t.Errorf("a line of Juf Jannie as coach: %+v", line)
		}
	}
}

func TestTrainingHintsAndTips(t *testing.T) {
	_, ts, ai := newTestServer(t)
	rng := rand.New(rand.NewPCG(9, 9))
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"open": true, "hands": 4, "players": 3}, true, true)
	s := c.s
	if !s.Training || s.Opts.Players != 4 || s.Opts.Tempo != "rustig" || !s.Opts.Open {
		t.Fatalf("training opts: %+v training=%v", s.Opts, s.Training)
	}
	if p := s.Players[2]; p == nil || p.BotID != "jannie" {
		t.Fatalf("partner is %+v, want Juf Jannie", p)
	}
	ids := map[string]bool{}
	for _, p := range s.Players[1:] {
		ids[p.BotID] = true
	}
	if len(ids) != 3 {
		t.Errorf("bots not distinct: %v", ids)
	}
	hints := 0
	acted := 0
	for c.tips < 8 {
		c.until(10*time.Second, "my turn or a tip", func(m *msg) bool { return m.T == "tip" || (c.myTurn() && c.seq > acted) })
		if c.myTurn() && c.seq > acted {
			acted = c.seq
			s := c.s
			if s.Hint == nil || s.Hint.Text == "" {
				t.Fatalf("no hint on my turn in phase %s", s.Phase)
			}
			switch s.Phase {
			case phasePlay:
				if s.Hint.Card == nil || !slices.Contains(s.Legal, *s.Hint.Card) {
					t.Errorf("hint card %v not legal %v", s.Hint.Card, s.Legal)
				}
			case phaseTrump:
				if s.Hint.Suit == nil {
					t.Errorf("trump hint without suit")
				}
			}
			if s.Hands4 == nil {
				t.Fatal("open cards: no hands4")
			}
			n := 0
			for _, h := range s.Hands4 {
				n += len(h)
			}
			if len(s.Hands4[s.You]) != len(s.Hand) || n == 0 {
				t.Errorf("hands4 %v vs hand %v", s.Hands4, s.Hand)
			}
			hints++
			c.actRandom(rng)
		}
	}
	if hints == 0 || ai.advised.Load() == 0 || ai.explained.Load() < 8 {
		t.Errorf("hints %d, advised %d, explained %d", hints, ai.advised.Load(), ai.explained.Load())
	}
	// Nobody else can join a training game.
	d := dial(t, ts)
	d.send(map[string]any{"t": "join", "code": c.code, "name": "Indringer"})
	d.waitError(errFull)
}

// TestBotDecidesOncePerTurn: however often drive runs, a bot decides each
// turn once (a strong bot's search costs real CPU time).
func TestBotDecidesOncePerTurn(t *testing.T) {
	ai := newCountAI(true)
	s, _ := newTestServerWith(t, ai)
	r := newRoom(s, "ONCE")
	r.alwaysOn = true
	r.opts.Hands = 4
	s.mu.Lock()
	s.rooms[r.code] = r
	s.mu.Unlock()
	go r.loop()
	t.Cleanup(func() { call(r, func() { r.close("test") }) })
	call(r, func() {
		r.fillSeats()
		r.startMatch()
	})
	// The first decision is under way (the gate holds it); driving again
	// and again must start no second one. (Those would queue on the brain's
	// lock and show up as turns decided twice below.)
	waitFor(t, "first decision", func() bool { n, _ := ai.decisions(); return n == 1 })
	for range 50 {
		call(r, r.drive)
	}
	close(ai.gate)

	// The bots play the match while something drives the room all the time.
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			select {
			case <-stop:
				return
			case <-time.After(time.Millisecond):
				r.post(r.drive)
			}
		}
	}()
	deadline := time.Now().Add(60 * time.Second)
	for {
		var phase string
		call(r, func() { phase = r.phase })
		if phase == phaseGameOver {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("the match did not finish (phase %s)", phase)
		}
		time.Sleep(5 * time.Millisecond)
	}
	n, twice := ai.decisions()
	if len(twice) > 0 {
		t.Errorf("turns decided more than once: %v", twice)
	}
	if n < 4*32 {
		t.Errorf("%d decisions in 4 hands", n)
	}
}

// TestRejoinSpamDecidesOnce: a player who keeps rejoining from two windows,
// or keeps leaving and joining again, does not make the bots think again.
func TestRejoinSpamDecidesOnce(t *testing.T) {
	ai := newCountAI(false)
	_, ts := newTestServerWith(t, ai, func(s *Server) { s.scale = 0.1 }) // a bot turn: about 90 ms
	a := dial(t, ts)
	a.create("Anna", map[string]any{"hands": 4}, false, false)
	d := dial(t, ts) // stays at the table all along
	d.join(a.code, "Dirk", "")
	a.send(map[string]any{"t": "start"})
	rng := rand.New(rand.NewPCG(8, 8))
	acted := map[*tclient]int{}
	// play lets a window holding a seat make its own decisions, so the bots
	// get turns during the spam. Asked about the seat Anna left, Dirk lets
	// an AI take it, so a bot plays it between a leave and the next join.
	play := func(cs ...*tclient) {
		for _, c := range cs {
			for m := c.poll(); m != nil; m = c.poll() {
			}
			switch {
			case c.myTurn() && c.seq > acted[c]:
				acted[c] = c.seq
				c.actRandom(rng)
			case c.s != nil && c.s.Takeover != nil && c.seq > acted[c]:
				acted[c] = c.seq
				c.vote(int(c.s.Takeover.Seat), true)
			}
		}
	}
	join := func(c *tclient, token string) {
		acted[c] = -1 // a play sent just before another window took over is lost
		c.send(map[string]any{"t": "join", "code": a.code, "name": "Anna", "token": token})
	}
	// Two windows take Anna's seat from each other, 40 times a second. A
	// move gets a moment to come in before the next window takes over, so
	// the game goes on.
	b := dial(t, ts)
	for k := range 40 {
		c := []*tclient{b, a}[k%2]
		join(c, a.token)
		time.Sleep(25 * time.Millisecond)
		play(c, d)
		time.Sleep(5 * time.Millisecond)
	}
	n1, _ := ai.decisions()
	// A window leaves and joins again soon after: the seat is left, an AI
	// takes it with Dirk's consent (most of Anna's turns come while it is
	// left), and the window takes it over again, during the AI's turn too.
	c := dial(t, ts)
	join(c, a.token)
	for k := range 40 {
		switch k % 4 {
		case 0:
			c.send(map[string]any{"t": "leave"})
		case 3:
			join(c, "")
		}
		time.Sleep(25 * time.Millisecond)
		play(c, d)
		time.Sleep(5 * time.Millisecond)
	}
	n, twice := ai.decisions()
	if len(twice) > 0 {
		t.Errorf("turns decided more than once: %v", twice)
	}
	if n1 < 2 || n-n1 < 2 {
		t.Errorf("only %d and %d bot decisions during the spam", n1, n-n1)
	}
	if k := ai.seatDecisions(0); k == 0 {
		t.Errorf("no bot decision for Anna's seat during the spam (%d in all)", n)
	}
}

// toHandEnd starts a two-player game with the hand summary held open.
func toHandEnd(t *testing.T) (*Server, *tclient, *tclient) {
	t.Helper()
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 4}, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.send(map[string]any{"t": "start"})
	drive(t, func() bool { return h.phase() == phaseHandEnd }, h, g)
	holdSummary(t, s, h.code)
	g.waitState("hand end", func(s *state) bool { return s.Phase == phaseHandEnd })
	g.send(map[string]any{"t": "ready"})
	g.waitState("ready", func(s *state) bool { return s.Players[g.seat].Ready })
	return s, h, g
}

// TestHostDropsAtHandEnd: the host's connection goes while the others are
// ready: the next hand starts and the host role still moves on.
func TestHostDropsAtHandEnd(t *testing.T) {
	_, h, g := toHandEnd(t)
	h.conn.CloseNow()
	g.waitEvent("away")
	if s := g.waitEvent("deal").state; s.HandNo != 2 {
		t.Errorf("deal of hand %d", s.HandNo)
	}
	s := g.waitState("host handover", func(s *state) bool { return s.Host == g.seat })
	if s.Players[h.seat].Connected {
		t.Errorf("old host still connected: %+v", s.Players[h.seat])
	}
}

// TestLeaveAtHandEnd: a player leaving the hand summary counts like one
// dropping out: when everyone left is ready, the next hand starts.
func TestLeaveAtHandEnd(t *testing.T) {
	_, h, g := toHandEnd(t)
	h.send(map[string]any{"t": "leave"})
	g.waitEvent("leave")
	if s := g.waitEvent("deal").state; s.HandNo != 2 || s.Host != g.seat {
		t.Errorf("deal of hand %d, host %d", s.HandNo, s.Host)
	}
}

// TestRematchByNewHost: a non-host's rematch hands the role over first when
// the host has been gone longer than the grace period.
func TestRematchByNewHost(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 4}, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.send(map[string]any{"t": "start"})
	h.waitEvent("deal")
	r := roomOf(t, s, h.code)
	h.conn.CloseNow()
	g.waitEvent("away")
	call(r, func() {
		// The grace period is over, but nothing checked the host since.
		r.seats[h.seat].leftAt = time.Now().Add(-time.Hour)
		r.pending = stepNone
		r.handNo = r.opts.Hands
		r.nextHand()
	})
	g.waitEvent("gameOver")
	g.send(map[string]any{"t": "rematch"})
	s2 := g.waitState("rematch", func(s *state) bool { return s.Phase != phaseGameOver && s.HandNo == 1 })
	if s2.Host != g.seat {
		t.Errorf("host %d after the rematch by %d", s2.Host, g.seat)
	}
}

// TestBackToLobby: after game over the host takes the table back to the
// lobby under the same code and options. The bot that filled the free seat
// at the start leaves, the bots placed in the lobby stay, a late friend
// joins in the free seat, and the next match starts from the lobby.
func TestBackToLobby(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 4, "rules": "rotterdams"}, false, false)
	placeBots(h, 1, 3)
	h.send(map[string]any{"t": "lobby"})
	h.waitError(errInvalid)
	h.send(map[string]any{"t": "start"})
	h.waitEvent("deal")
	r := roomOf(t, s, h.code)
	call(r, func() {
		r.pending = stepNone
		r.handNo = r.opts.Hands
		r.nextHand()
	})
	h.waitEvent("gameOver")

	f := dial(t, ts)
	f.send(map[string]any{"t": "join", "code": h.code, "name": "Vriend"})
	if m := f.waitError(errStarted); !strings.Contains(m.errMsg(), "net afgelopen") {
		t.Errorf("join after game over: %q", m.errMsg())
	}
	// The host hears of it, and can make room with lobby.
	if m := h.waitType("refused"); m.Name != "Vriend" {
		t.Errorf("refused notice for %q", m.Name)
	}
	h.send(map[string]any{"t": "lobby"})
	st := h.waitState("lobby", func(s *state) bool { return s.Phase == phaseLobby })
	if !slices.ContainsFunc(h.chats, func(c chatMsg) bool {
		return c.Sys && c.Text == "Host zet de tafel opnieuw klaar. Wie wil, kan nu aanschuiven."
	}) {
		t.Errorf("no invitation in the lobby line: %+v", h.chats)
	}
	if st.HandNo != 0 || len(st.Scores) != 0 || !slices.Equal(st.Total, []int{0, 0}) || st.PrevHand != nil {
		t.Errorf("lobby keeps the old match: hand %d, %d scores, total %v", st.HandNo, len(st.Scores), st.Total)
	}
	if st.Opts.Rules != game.Rotterdams || st.Opts.Hands != 4 || st.Opts.Players != 4 || st.Code != h.code {
		t.Errorf("lobby changed the options: %+v", st.Opts)
	}
	// The bots placed at 1 and 3 stay; seat 2 was filled at the start.
	if p := st.Players; p[0] == nil || p[0].Bot || p[1] == nil || !p[1].Bot || p[2] != nil || p[3] == nil || !p[3].Bot {
		t.Errorf("lobby seats %+v %+v %+v %+v", p[0], p[1], p[2], p[3])
	}
	f.join(h.code, "Vriend", "")
	if f.seat != 2 {
		t.Errorf("friend at seat %d, want 2", f.seat)
	}
	f.send(map[string]any{"t": "lobby"})
	f.waitError(errInvalid) // not over any more
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"rules": "amsterdams"}})
	h.waitState("amsterdams", func(s *state) bool { return s.Opts.Rules == game.Amsterdams })
	h.send(map[string]any{"t": "start"})
	f.waitEvent("deal")
}

// placeBots lets host h put random bots on seats in the lobby.
func placeBots(h *tclient, seats ...int) {
	h.t.Helper()
	for _, seat := range seats {
		h.send(map[string]any{"t": "bot", "seat": seat, "id": ""})
		h.waitState("bot placed", func(s *state) bool { return s.Players[seat] != nil })
	}
}

// TestBotReplyContext: a bot answering a chat line learns whether it is the
// speaker's partner and, while tricks are played, whether its team plays.
func TestBotReplyContext(t *testing.T) {
	ai := &replyAI{}
	s, ts := newTestServerWith(t, ai)
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 4}, false, false)
	placeBots(h, 1, 3)
	g := dial(t, ts)
	g.join(h.code, "Gast", "") // at 2, the host's partner
	r := roomOf(t, s, h.code)
	ask := func() []ChatEvent {
		var got []ChatEvent
		for range 40 {
			call(r, func() {
				for i := range r.seats {
					r.seats[i].chatAt, r.seats[i].lastChat = -1, time.Time{} // no chat limits
				}
				ai.got = nil
				r.botReply(2, "Nat!")
				got = ai.got
			})
			if len(got) > 0 {
				return got
			}
		}
		t.Fatal("no bot was asked to reply")
		return nil
	}
	for _, ev := range ask() {
		if ev.Mine || ev.InHand || ev.Playing {
			t.Errorf("lobby reply %+v", ev)
		}
	}
	h.send(map[string]any{"t": "start"})
	playing := -1
	rng := rand.New(rand.NewPCG(1, 2))
	acted := map[*tclient]*state{}
	for deadline := time.Now().Add(10 * time.Second); playing < 0; time.Sleep(5 * time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatal("the hand never reached phase play")
		}
		call(r, func() {
			if r.phase == phasePlay {
				playing = r.deal.PlayingTeam()
			}
		})
		for _, c := range []*tclient{h, g} {
			for c.poll() != nil {
			}
			if c.myTurn() && acted[c] != c.s {
				acted[c] = c.s
				c.actRandom(rng)
			}
		}
	}
	for _, ev := range ask() {
		// Seats 1 and 3 (team 1) are the bots; the speaker sits at 2 (team 0).
		if ev.Mine || !ev.InHand || ev.Playing != (playing == 1) {
			t.Errorf("reply %+v while team %d plays", ev, playing)
		}
	}
}

// replyAI is the fake AI that records the reply events it is offered.
type replyAI struct {
	fakeAI
	got []ChatEvent
}

func (a *replyAI) Chat(id string, ev ChatEvent, rng *rand.Rand) string {
	if ev.Kind == "reply" {
		a.got = append(a.got, ev)
		return ""
	}
	return a.fakeAI.Chat(id, ev, rng)
}

// TestTrainingSummaryWaits: in training the hand summary has no countdown;
// the learner goes on with ready, also after coming back.
func TestTrainingSummaryWaits(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"hands": 4}, true, true)
	drive(t, func() bool { return c.phase() == phaseHandEnd }, c)
	if c.s.NextAt != 0 {
		t.Errorf("training summary with nextAt %d", c.s.NextAt)
	}
	// Ten times the summary time of rustig at this scale: still there.
	time.Sleep(750 * time.Millisecond)
	for m := c.poll(); m != nil; m = c.poll() {
	}
	if c.phase() != phaseHandEnd || slices.Contains(c.events, "deal") && c.s.HandNo != 1 {
		t.Fatalf("summary went on by itself: phase %s hand %d", c.phase(), c.s.HandNo)
	}
	// Back after a drop: the summary still waits.
	c.conn.CloseNow()
	c2 := dial(t, ts)
	c2.join(c.code, "Leerling", c.token)
	if c2.s.Phase != phaseHandEnd || c2.s.NextAt != 0 {
		t.Errorf("after return: phase %s nextAt %d", c2.s.Phase, c2.s.NextAt)
	}
	time.Sleep(200 * time.Millisecond)
	for m := c2.poll(); m != nil; m = c2.poll() {
	}
	if c2.phase() != phaseHandEnd {
		t.Fatalf("summary went on after the return: %s", c2.phase())
	}
	c2.send(map[string]any{"t": "ready"})
	if s := c2.waitEvent("deal").state; s.HandNo != 2 {
		t.Errorf("deal of hand %d", s.HandNo)
	}
}

// TestSoloSummaryWaits: one person with bots outside training: the summary
// has no countdown either and waits for ready.
func TestSoloSummaryWaits(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4}, false, true)
	drive(t, func() bool { return c.phase() == phaseHandEnd }, c)
	if c.s.NextAt != 0 {
		t.Errorf("summary alone with nextAt %d", c.s.NextAt)
	}
	// Ten times the summary time of normaal at this scale: still there.
	time.Sleep(600 * time.Millisecond)
	for m := c.poll(); m != nil; m = c.poll() {
	}
	if c.phase() != phaseHandEnd || c.s.HandNo != 1 {
		t.Fatalf("summary went on by itself: phase %s hand %d", c.phase(), c.s.HandNo)
	}
	c.send(map[string]any{"t": "ready"})
	if s := c.waitEvent("deal").state; s.HandNo != 2 {
		t.Errorf("deal of hand %d", s.HandNo)
	}
}

// TestSummaryCountdownWithOthers: with another person at the table the
// summary counts down; once that person leaves it waits for ready, and a
// joiner in their place brings the countdown back.
func TestSummaryCountdownWithOthers(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 4}, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.send(map[string]any{"t": "start"})
	drive(t, func() bool { return h.phase() == phaseHandEnd }, h, g)
	if h.s.NextAt == 0 {
		t.Fatalf("summary of two people without a countdown")
	}
	holdSummary(t, s, h.code)
	g.send(map[string]any{"t": "leave"})
	if st := h.waitEvent("leave").state; st.Phase != phaseHandEnd || st.NextAt != 0 {
		t.Fatalf("alone after the leave: phase %s nextAt %d", st.Phase, st.NextAt)
	}
	time.Sleep(300 * time.Millisecond)
	for m := h.poll(); m != nil; m = h.poll() {
	}
	if h.phase() != phaseHandEnd {
		t.Fatalf("summary went on by itself after the leave: %s", h.phase())
	}
	j := dial(t, ts)
	j.join(h.code, "Joost", "")
	if j.s.Phase != phaseHandEnd || j.s.NextAt == 0 {
		t.Errorf("joiner sees phase %s nextAt %d", j.s.Phase, j.s.NextAt)
	}
	if st := h.waitEvent("deal").state; st.HandNo != 2 {
		t.Errorf("deal of hand %d", st.HandNo)
	}
}

// longTipAI explains every trick at length, so the last trick waits the
// longest for its tip to be read.
type longTipAI struct{ fakeAI }

func (a *longTipAI) ExplainTrick(t game.Trick, trump game.Suit, names [4]string) string {
	return a.fakeAI.ExplainTrick(t, trump, names) + strings.Repeat(" Lees dit rustig.", 40)
}

// TestTrainingLastTip: in training the last trick of a hand stays on the
// table until its tip is read: nextAt says until when, tipRead ends it at
// once, and a late tipRead leaves the summary alone.
func TestTrainingLastTip(t *testing.T) {
	s, ts := newTestServerWith(t, &longTipAI{})
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"hands": 4}, true, true)
	lastTrick := func() bool {
		return c.phase() == phasePlay && c.s.NextAt != 0 && c.events[len(c.events)-1] == "trick"
	}
	drive(t, lastTrick, c)
	if n := c.s.Players[c.seat].Cards; n != 0 {
		t.Fatalf("nextAt with %d cards in hand", n)
	}
	if left := time.Until(time.UnixMilli(c.s.NextAt)); left < 50*time.Millisecond {
		t.Errorf("the last trick waits %v for a long tip", left)
	}
	r := roomOf(t, s, c.code)
	held := false
	call(r, func() {
		if held = r.pending == stepCollect; held {
			r.pendingAt = time.Now().Add(time.Hour)
			r.nextAt = r.pendingAt
			r.drive()
		}
	})
	if !held {
		t.Fatalf("the last trick went before the test could hold it")
	}
	tips := c.tips
	c.waitType("tip")
	if c.tips != tips+1 {
		t.Errorf("%d tips with the last trick", c.tips-tips)
	}
	c.send(map[string]any{"t": "tipRead"})
	c.waitEvent("collect")
	if st := c.waitEvent("handEnd").state; st.NextAt != 0 || st.HandNo != 1 {
		t.Errorf("summary of hand %d with nextAt %d", st.HandNo, st.NextAt)
	}
	// A late tap: the summary still waits for ready.
	c.send(map[string]any{"t": "tipRead"})
	time.Sleep(100 * time.Millisecond)
	for m := c.poll(); m != nil; m = c.poll() {
	}
	if c.phase() != phaseHandEnd {
		t.Fatalf("tipRead moved the summary on: %s", c.phase())
	}
	// Without tipRead the last trick goes once nextAt has come.
	c.send(map[string]any{"t": "ready"})
	c.waitEvent("deal")
	drive(t, lastTrick, c)
	at := c.s.NextAt
	c.waitEvent("handEnd")
	if now := time.Now().UnixMilli(); now < at {
		t.Errorf("summary %d ms before nextAt", at-now)
	}
}

// TestReadTime: the last trick waits longer for a longer tip, within limits.
func TestReadTime(t *testing.T) {
	if d := readTime([4]string{}); d != 0 {
		t.Errorf("no tips: %v", d)
	}
	if d := readTime([4]string{"", "Jij wint de slag."}); d != 3*time.Second {
		t.Errorf("four words: %v", d)
	}
	if d := readTime([4]string{"a b", strings.Repeat("woord ", 200)}); d != tipReadMax {
		t.Errorf("200 words: %v", d)
	}
}

// TestTrainingMissedHint: a learner who plays another card than the hint
// hears with the trick which card was advised, and why.
func TestTrainingMissedHint(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"hands": 4}, true, true)
	acted, followed, missed := 0, false, false
	for !followed || !missed {
		c.until(10*time.Second, "my turn", func(m *msg) bool { return c.myTurn() && c.seq > acted })
		acted = c.seq
		s := c.s
		if s.Phase != phasePlay {
			c.actHint() // a trump or bid against the hint would be told too
			continue
		}
		hinted := *s.Hint.Card
		play := hinted
		if !missed {
			// fakeAI advises the first legal card in the dealt order, which
			// can be any of s.Legal (in the shown order): play another one,
			// if there is one.
			for _, l := range s.Legal {
				if l != hinted {
					play = l
					break
				}
			}
		}
		c.send(map[string]any{"t": "play", "card": play.String()})
		tip := c.waitType("tip") // the trick completes before my next turn
		advice := "Juf Jannie had " + game.CardShortNL(hinted) + " aangeraden: de eerste kaart die mag."
		if play == hinted {
			followed = true
			if strings.Contains(tip.Text, "aangeraden") {
				t.Errorf("followed the hint, tip %q", tip.Text)
			}
		} else {
			missed = true
			if !strings.HasSuffix(tip.Text, " wint de slag. "+advice) {
				t.Errorf("tip %q, want the trick and %q", tip.Text, advice)
			}
		}
	}
}

// TestTrainingMissedChoice: a learner who chooses another trump, or bids
// otherwise, than the hint hears with the first trick what Juf Jannie
// advised, and why; the next trick says it no more.
func TestTrainingMissedChoice(t *testing.T) {
	cases := []struct {
		mode, phase, want string
	}{
		{"utrechts", phaseTrump, " als troef aangeraden: de eerste kleur die mag."},
		{"gedraaid", phaseBid, "Juf Jannie had aangeraden om te passen: dat doet de test altijd."},
	}
	for _, tc := range cases {
		t.Run(tc.mode, func(t *testing.T) {
			_, ts, _ := newTestServer(t)
			c := dial(t, ts)
			c.create("Leerling", map[string]any{"hands": 24, "trumpMode": tc.mode}, true, true)
			acted, readied, missed, tricks := 0, 0, false, 0
			for tricks < 2 {
				m := c.until(10*time.Second, "my turn, a summary or a tip", func(m *msg) bool {
					return m.T == "tip" || m.T == "update" && c.seq > acted &&
						(c.myTurn() || c.phase() == phaseHandEnd && c.s.HandNo > readied)
				})
				if m.T == "tip" {
					switch {
					case !missed:
						if strings.Contains(m.Text, "aangeraden") {
							t.Errorf("followed every hint, tip %q", m.Text)
						}
					case tricks == 0:
						if !strings.Contains(m.Text, " wint de slag. ") || !strings.Contains(m.Text, tc.want) {
							t.Errorf("first trick after the miss: tip %q, want %q", m.Text, tc.want)
						}
						tricks++
					default:
						if strings.Contains(m.Text, "aangeraden") {
							t.Errorf("second trick, tip %q", m.Text)
						}
						tricks++
					}
					continue
				}
				acted = c.seq
				s := c.s
				switch {
				case s.Phase == phaseHandEnd: // the training summary waits
					readied = s.HandNo
					c.send(map[string]any{"t": "ready"})
				case !missed && s.Phase == tc.phase && s.Hint.Suit != nil:
					for su := game.Suit(0); su < game.NumSuits; su++ {
						if su != *s.Hint.Suit && !(s.Forced && s.Turned != nil && su == *s.Turned) {
							c.send(map[string]any{"t": "trump", "suit": su.String()})
							break
						}
					}
					missed = true
				case !missed && s.Phase == tc.phase && s.Hint.Play != nil:
					c.send(map[string]any{"t": "bid", "play": !*s.Hint.Play})
					missed = true
				default:
					c.actHint()
				}
			}
		})
	}
}

func TestMissedText(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEXT")
	r.seats[2] = r.newBot(fakePersonas[5]) // Juf Jannie
	nine := game.Card{Rank: game.Nine, Suit: game.Clubs}
	cs := game.CardShortNL(nine)
	for text, want := range map[string]string{
		"Speel " + cs + ": je maat heeft de slag al.": "Juf Jannie had " + cs + " aangeraden: je maat heeft de slag al.",
		"Speel ♣8: een andere kaart.":                 "Juf Jannie had " + cs + " aangeraden. Speel ♣8: een andere kaart.",
		"Iets anders.":                                "Juf Jannie had " + cs + " aangeraden. Iets anders.",
		"":                                            "Juf Jannie had " + cs + " aangeraden.",
	} {
		if got := r.missedText(0, &missedHint{seat: 0, hint: hint{Card: &nine, Text: text}}); got != want {
			t.Errorf("missedText(%q) = %q, want %q", text, got, want)
		}
	}
	hearts := game.Hearts
	yes, no := true, false
	for _, c := range []struct {
		h    hint
		want string
	}{
		{hint{Suit: &hearts, Text: "Kies ♥ als troef: je hebt de boer en de nel, in totaal vier harten."},
			"Juf Jannie had ♥ als troef aangeraden: je hebt de boer en de nel, in totaal vier harten."},
		{hint{Suit: &hearts, Text: "Iedereen heeft gepast, dus jij moet kiezen (niet ♠). Kies ♥ als troef: met vier harten is dat je langste kleur."},
			"Juf Jannie had ♥ als troef aangeraden: met vier harten is dat je langste kleur."},
		{hint{Play: &yes, Text: "Spelen: met de boer van ♥ (je enige troef) is je hand sterk genoeg."},
			"Juf Jannie had aangeraden om te spelen: met de boer van ♥ (je enige troef) is je hand sterk genoeg."},
		{hint{Play: &no, Text: "Passen: je hebt geen harten. Als je speelt, haal je het naar schatting bijna nooit; de kans op nat is te groot."},
			"Juf Jannie had aangeraden om te passen: je hebt geen harten. Als je speelt, haal je het naar schatting bijna nooit; de kans op nat is te groot."},
		{hint{Play: &no, Text: "Iets anders."}, "Juf Jannie had aangeraden om te passen. Iets anders."},
	} {
		if got := r.missedText(0, &missedHint{hint: c.h}); got != c.want {
			t.Errorf("missedText(%+v) = %q, want %q", c.h, got, c.want)
		}
	}
	r.seats[2] = newHuman("Bob")
	if got := r.missedText(0, &missedHint{hint: hint{Card: &nine}}); got != "De tip had "+cs+" aangeraden." {
		t.Errorf("without a bot partner: %q", got)
	}
}

// TestReclaimSeatByName: a player who lost the seat token gets the seat
// back by joining under the same name, once it has been empty a while; the
// old token is then refused.
func TestReclaimSeatByName(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.002 }) // 3 min → 360 ms
	a := dial(t, ts)
	a.create("Anna", map[string]any{"hands": 4}, false, false)
	b := dial(t, ts)
	b.join(a.code, "Bob", "")
	a.send(map[string]any{"t": "start"})
	a.waitEvent("deal")
	b.conn.CloseNow()
	a.until(5*time.Second, "Bob away", func(m *msg) bool { return m.T == "update" && m.evType() == "away" })

	// Not right away: a phone that locks keeps its seat.
	n := dial(t, ts)
	n.send(map[string]any{"t": "join", "code": a.code, "name": "Bob"})
	n.waitError(errStarted)

	time.Sleep(400 * time.Millisecond)
	x := dial(t, ts)
	x.send(map[string]any{"t": "join", "code": a.code, "name": "Bobby"})
	x.waitError(errStarted) // only the same name
	n2 := dial(t, ts)
	n2.join(a.code, "Bob", "")
	if n2.seat != b.seat || n2.token == b.token || n2.token == "" {
		t.Fatalf("reclaimed seat %d token %q (old seat %d)", n2.seat, n2.token, b.seat)
	}
	if p := n2.s.Players[b.seat]; p.Name != "Bob" || !p.Connected || p.Away {
		t.Errorf("seat after reclaim: %+v", p)
	}
	a.waitEvent("back")
	if !slices.ContainsFunc(a.chats, func(m chatMsg) bool { return m.Sys && m.Text == "Bob speelt verder op een ander apparaat." }) {
		t.Errorf("no system line in %+v", a.chats)
	}
	// The old device comes back with its token: it is told why.
	o := dial(t, ts)
	o.send(map[string]any{"t": "join", "code": a.code, "name": "Bob", "token": b.token})
	if e := o.waitError(errUnknown); !strings.Contains(e.errMsg(), "ander apparaat") {
		t.Errorf("old token: %q", e.errMsg())
	}
	// The new token works.
	n2.conn.CloseNow()
	n3 := dial(t, ts)
	n3.join(a.code, "Bob", n2.token)
	if n3.seat != b.seat {
		t.Errorf("new token at seat %d", n3.seat)
	}
}
