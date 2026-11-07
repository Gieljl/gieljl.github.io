package server

import (
	"fmt"
	"math/rand/v2"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"jannie/games/klaverjas/game"
)

// startTable starts a match of four hands for the named humans, the first
// one the host, with bots on the other seats. With two humans the guest
// sits at 2 (the host puts a bot at 1 first); with three the guests sit at
// 1 and 2.
func startTable(t *testing.T, ts *httptest.Server, names ...string) []*tclient {
	t.Helper()
	h := dial(t, ts)
	h.create(names[0], map[string]any{"hands": 4}, false, len(names) == 1)
	if len(names) == 2 {
		placeBots(h, 1)
	}
	cs := []*tclient{h}
	for _, name := range names[1:] {
		c := dial(t, ts)
		c.join(h.code, name, "")
		cs = append(cs, c)
	}
	if len(names) > 1 {
		h.waitState("everyone seated", func(s *state) bool {
			return !slices.ContainsFunc(cs, func(c *tclient) bool { p := s.Players[c.seat]; return p == nil || p.Bot })
		})
		h.send(map[string]any{"t": "start"})
	}
	for _, c := range cs {
		c.waitEvent("deal")
	}
	return cs
}

// settle waits until the room handled everything c sent before, and c has
// what the room sent until then: the room answers an unknown message.
func (c *tclient) settle() {
	c.t.Helper()
	c.send(map[string]any{"t": "peil"})
	c.waitError(errInvalid)
}

// waitSeen waits for event ev unless c saw it already.
func (c *tclient) waitSeen(ev string) {
	c.t.Helper()
	if !slices.Contains(c.events, ev) {
		c.waitEvent(ev)
	}
}

// waitSeat waits for event ev about seat i.
func (c *tclient) waitSeat(ev string, i int) *msg {
	c.t.Helper()
	return c.until(5*time.Second, fmt.Sprintf("%s of seat %d", ev, i), func(m *msg) bool {
		return m.T == "update" && m.evType() == ev && int(m.ev["seat"].(float64)) == i
	})
}

// waitMove waits until seat i makes a decision: a trump suit, a bid or a
// card, or with three players a bid in the auction or the discards.
func (c *tclient) waitMove(i int) {
	c.t.Helper()
	c.until(5*time.Second, fmt.Sprintf("a move of seat %d", i), func(m *msg) bool {
		switch m.evType() {
		case "trump", "bid", "play", "auction", "discard":
			return int(m.ev["seat"].(float64)) == i
		}
		return false
	})
}

// vote answers the question about seat i as c last saw it (left as in
// takeover, as the client sends it): may an AI play that seat?
func (c *tclient) vote(i int, ai bool) {
	c.t.Helper()
	q := (*takeoverState)(nil)
	if c.s != nil {
		q = c.s.Takeover
	}
	c.voteOn(i, q != nil && int(q.Seat) == i && q.Left, ai)
}

func (c *tclient) voteOn(i int, left, ai bool) {
	c.t.Helper()
	c.send(map[string]any{"t": "vote", "seat": i, "left": left, "ai": ai})
}

// checkConsent verifies, on every update a test client reads (see track),
// that no AI plays a human's seat without everyone's consent
// (docs/server.md#takeover-consent): nobody moves for an absent human but
// the substitute, and never for a seat its player left; the substitute
// starts only with a takeover event; away comes once per lost connection;
// and only an open question gets answers. prev is the state before, nil
// after a join.
func checkConsent(t *testing.T, prev *state, m *msg) {
	t.Helper()
	s, ev := m.state, m.evType()
	if s == nil {
		return
	}
	seat := -1
	if v, ok := m.ev["seat"].(float64); ok {
		seat = int(v)
	}
	switch ev {
	case "trump", "bid", "play", "auction", "discard":
		if p := s.Players[seat]; p != nil && !p.Bot && (p.Left || !p.Connected && !p.Away) {
			t.Errorf("%s for an absent player without consent: %+v", ev, p)
		}
	}
	inHand := s.Phase == phaseAuction || s.Phase == phaseDiscard || s.Phase == phaseTrump || s.Phase == phaseBid || s.Phase == phasePlay
	if q := s.Takeover; q != nil {
		if p := s.Players[q.Seat]; !inHand || s.Turn != int(q.Seat) || int(q.Seat) == s.You || p == nil || p.Bot || p.Connected || p.Away || p.Left != q.Left {
			t.Errorf("takeover %+v in phase %s, turn %d: %+v", q, s.Phase, s.Turn, p)
		}
	}
	for i, p := range s.Players {
		if p == nil {
			continue
		}
		// Who dropped out may still hold a no for a while, never a yes.
		if p.Vote != nil && (s.Takeover == nil || p.Bot || !p.Connected && *p.Vote) {
			t.Errorf("seat %d answers %v without a question to answer (%+v)", i, *p.Vote, s.Takeover)
		}
		if p.Left && s.Turn == i && s.Takeover == nil {
			t.Errorf("the turn of seat %d, which its player left, but nobody is asked", i)
		}
		if prev == nil || prev.Code != s.Code || ev == "" {
			continue
		}
		was := prev.Players[i]
		if p.Away && (was == nil || !was.Away) && (ev != "takeover" || seat != i) {
			t.Errorf("the substitute plays for seat %d without a takeover (event %s)", i, ev)
		}
		if ev == "away" && seat == i && was != nil && !was.Bot && !was.Connected {
			t.Errorf("a second away for seat %d, which had lost its connection already", i)
		}
	}
}

func hasLine(c *tclient, text string) bool {
	return slices.ContainsFunc(c.chats, func(m chatMsg) bool { return m.Sys && m.Seat == -1 && m.Text == text })
}

// TestDropOutAsks: a player who drops out on their turn keeps the seat, and
// nobody plays for them; after askAfter the other is asked, and only their
// yes lets the substitute play, until the player returns. A later drop-out
// asks again.
func TestDropOutAsks(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 }) // askAfter: 100 ms
	cs := startTable(t, ts, "Anna", "Bert")
	a, b := cs[0], cs[1]
	drive(t, func() bool { return a.myTurn() }, a, b)
	cards := a.s.Players[0].Cards
	start := time.Now()
	a.conn.CloseNow()

	s := b.waitSeat("away", 0).state
	if p := s.Players[0]; p.Connected || p.Away || p.Left || s.Takeover != nil {
		t.Errorf("right after the drop-out: %+v, takeover %+v", p, s.Takeover)
	}
	s = b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	if d := time.Since(start); d < 100*time.Millisecond {
		t.Errorf("asked after %v, want askAfter (100 ms scaled)", d)
	}
	if q := *s.Takeover; q.Seat != 0 || q.Left || s.Turn != 0 || s.Players[2].Vote != nil {
		t.Errorf("question %+v, turn %d, vote %v", q, s.Turn, s.Players[2].Vote)
	}
	// Thirty seconds, scaled: no AI plays without consent.
	time.Sleep(300 * time.Millisecond)
	b.settle()
	if s := b.s; s.Turn != 0 || s.Players[0].Cards != cards || s.Takeover == nil || slices.Contains(b.events, "takeover") {
		t.Fatalf("the game went on without Anna: turn %d, %d cards, takeover %+v, events %v", s.Turn, s.Players[0].Cards, s.Takeover, b.events)
	}

	b.vote(0, true)
	m := b.waitEvent("takeover")
	wantKeys(t, "event takeover", m.Ev, []string{"type", "seat"})
	if p := m.state.Players[0]; int(m.ev["seat"].(float64)) != 0 || !p.Away || p.Connected || p.Bot || m.state.Takeover != nil || m.state.Players[2].Vote != nil {
		t.Errorf("takeover %s: %+v, question %+v", m.Ev, p, m.state.Takeover)
	}
	if !hasLine(b, "Iedereen is akkoord: een AI-speler speelt zolang voor Anna.") {
		t.Errorf("no consent line in %+v", b.chats)
	}
	b.waitMove(0)
	if n := strings.Count(strings.Join(b.events, " "), "away"); n != 1 {
		t.Errorf("%d away events for one lost connection: %v", n, b.events)
	}

	// Back: Anna plays again herself.
	a2 := dial(t, ts)
	a2.join(a.code, "Anna", a.token)
	if p := a2.s.Players[0]; p.Away || !p.Connected {
		t.Errorf("after the return: %+v", p)
	}
	b.waitSeat("back", 0)
	if !hasLine(b, "Anna is terug.") {
		t.Errorf("no return line in %+v", b.chats)
	}
	// The consent was for that absence: gone again, she is asked about
	// again, after askAfter again.
	drive(t, func() bool { return a2.myTurn() }, a2, b)
	start = time.Now()
	a2.conn.CloseNow()
	b.waitSeat("away", 0)
	s = b.waitState("the question again", func(s *state) bool { return s.Takeover != nil })
	if d := time.Since(start); d < 100*time.Millisecond {
		t.Errorf("asked again after %v, want askAfter (100 ms scaled)", d)
	}
	if p := s.Players[0]; p.Away || s.Players[2].Vote != nil {
		t.Errorf("asked again: %+v, vote %v", p, s.Players[2].Vote)
	}
}

// TestDropOutAsksThreePlayers: at a table of three the game also waits for
// a player who dropped out in the auction, and the substitute bids for
// them once the other agreed.
func TestDropOutAsksThreePlayers(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	a := dial(t, ts)
	a.create("Anna", map[string]any{"players": 3, "hands": 4}, false, false)
	b := dial(t, ts)
	b.join(a.code, "Bert", "")
	a.send(map[string]any{"t": "start"})
	drive(t, func() bool { return a.myTurn() && a.s.Phase == phaseAuction }, a, b)
	a.conn.CloseNow()
	b.waitSeat("away", 0)
	s := b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	if q := *s.Takeover; q.Seat != 0 || q.Left || s.Phase != phaseAuction {
		t.Errorf("question %+v in phase %s", q, s.Phase)
	}
	b.vote(0, true)
	b.waitEvent("takeover")
	b.waitMove(0)
}

// TestLeftSeatAsks: a player who leaves keeps the name on a seat nobody
// plays; on its turn the other is asked at once. A no waits, a yes (a
// changed vote) gives the seat to a persona, and a joiner may take it.
func TestLeftSeatAsks(t *testing.T) {
	_, ts, _ := newTestServer(t)
	cs := startTable(t, ts, "Anna", "Bert")
	a, b := cs[0], cs[1]
	drive(t, func() bool { return a.myTurn() }, a, b)
	cards := a.s.Players[0].Cards
	a.send(map[string]any{"t": "leave"})

	m := b.waitSeat("leave", 0)
	s := m.state
	if p := s.Players[0]; p.Name != "Anna" || !p.Left || p.Connected || p.Bot || p.Away || p.Vote != nil {
		t.Errorf("the seat Anna left: %+v", p)
	}
	wantKeys(t, "takeover", field(t, m.S, "takeover"), []string{"seat", "left"})
	if q := s.Takeover; q == nil || q.Seat != 0 || !q.Left || s.Host != 2 {
		t.Errorf("question %+v, host %d", q, s.Host)
	}
	if !hasLine(b, "Anna is vertrokken.") {
		t.Errorf("no leave line in %+v", b.chats)
	}

	b.vote(0, false)
	b.waitState("Bert waits", func(s *state) bool { v := s.Players[2].Vote; return v != nil && !*v })
	seq := b.seq
	b.vote(0, false) // the same answer again changes nothing: no update
	time.Sleep(200 * time.Millisecond)
	b.settle()
	if b.seq != seq {
		t.Errorf("the same answer again sent updates: seq %d, then %d", seq, b.seq)
	}
	if s := b.s; s.Turn != 0 || s.Players[0].Cards != cards || s.Takeover == nil || slices.Contains(b.events, "takeover") {
		t.Fatalf("the game went on after a no: turn %d, %d cards, takeover %+v", s.Turn, s.Players[0].Cards, s.Takeover)
	}
	b.vote(0, true)
	s = b.waitEvent("takeover").state
	p := s.Players[0]
	if !p.Bot || p.Left || !strings.HasSuffix(p.Name, " (AI)") || s.Takeover != nil || s.Players[2].Vote != nil {
		t.Fatalf("after the yes: %+v, question %+v", p, s.Takeover)
	}
	if !hasLine(b, "Iedereen is akkoord: "+p.Name+" neemt de plaats van Anna in.") {
		t.Errorf("no consent line in %+v", b.chats)
	}
	b.waitMove(0)

	// The persona keeps the seat warm for a joiner.
	k := dial(t, ts)
	k.join(a.code, "Kees", "")
	if k.seat != 0 || k.s.Players[0].Bot {
		t.Fatalf("joiner at seat %d: %+v", k.seat, k.s.Players[0])
	}
	b.waitSeat("join", 0)
	if !hasLine(b, "Kees neemt de plaats van "+p.Name+" over.") {
		t.Errorf("no join line in %+v", b.chats)
	}
}

// TestJoinerTakesLeftSeat: a joiner takes the seat the game waits for,
// which ends the question; the player who left can come back the same way.
func TestJoinerTakesLeftSeat(t *testing.T) {
	_, ts, _ := newTestServer(t)
	cs := startTable(t, ts, "Anna", "Bert", "Cor")
	a, b, c := cs[0], cs[1], cs[2]
	drive(t, func() bool { return a.myTurn() }, a, b, c)
	a.send(map[string]any{"t": "leave"})
	b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	b.vote(0, true) // Cor has not answered: nothing happens yet
	b.waitState("Bert's yes", func(s *state) bool { v := s.Players[1].Vote; return v != nil && *v })

	k := dial(t, ts)
	k.join(a.code, "Kees", "")
	if k.seat != 0 || !k.myTurn() || k.s.Takeover != nil {
		t.Fatalf("joiner at seat %d, turn %d, question %+v", k.seat, k.s.Turn, k.s.Takeover)
	}
	s := b.waitSeat("join", 0).state
	if s.Takeover != nil || s.Players[1].Vote != nil || s.Players[0].Name != "Kees" {
		t.Errorf("after the join: question %+v, Bert's vote %v, seat 0 %+v", s.Takeover, s.Players[1].Vote, s.Players[0])
	}
	if !hasLine(b, "Kees neemt de plaats van Anna over.") {
		t.Errorf("no join line in %+v", b.chats)
	}
	k.actRandom(rand.New(rand.NewPCG(1, 1)))
	b.waitMove(0)

	// Cor leaves and comes back under the same name.
	c.send(map[string]any{"t": "leave"})
	b.waitSeat("leave", 2)
	c2 := dial(t, ts)
	c2.join(a.code, "Cor", "")
	if c2.seat != 2 {
		t.Fatalf("Cor back at seat %d", c2.seat)
	}
	b.waitSeat("join", 2)
	// Anyone with the code may type a name: the line claims no more.
	if !hasLine(b, "Cor neemt de plaats weer in.") {
		t.Errorf("no line for the same name again in %+v", b.chats)
	}

	// With two seats left, a joiner takes the one the game waits for, but
	// who left gets their own seat back: their team, their cards.
	drive(t, func() bool { return c2.myTurn() }, b, c2, k)
	k.send(map[string]any{"t": "leave"})
	b.waitSeat("leave", 0)
	c2.send(map[string]any{"t": "leave"})
	b.waitSeat("leave", 2)
	k2 := dial(t, ts)
	k2.join(a.code, "Kees", "")
	if k2.seat != 0 {
		t.Errorf("Kees back at seat %d, want his own seat 0", k2.seat)
	}
	j := dial(t, ts)
	j.join(a.code, "Joop", "")
	if j.seat != 2 || !j.myTurn() {
		t.Errorf("joiner at seat %d (turn %d), want the waiting seat 2", j.seat, j.s.Turn)
	}
}

// quiz is a match of Anna (seat 0, the host), Bert and Cor (1 and 2) and a
// bot, where Anna dropped out on her turn and the others are asked whether
// an AI may play for her.
type quiz struct {
	t      *testing.T
	ts     *httptest.Server
	r      *room
	code   string
	tokens map[string]string
	seats  map[string]int
	in     map[string]*tclient // connected, by name
}

func newQuiz(t *testing.T, scale float64) *quiz {
	t.Helper()
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = scale })
	cs := startTable(t, ts, "Anna", "Bert", "Cor")
	q := &quiz{t: t, ts: ts, r: roomOf(t, s, cs[0].code), code: cs[0].code,
		tokens: map[string]string{}, seats: map[string]int{}, in: map[string]*tclient{}}
	for k, name := range []string{"Anna", "Bert", "Cor"} {
		q.tokens[name], q.seats[name], q.in[name] = cs[k].token, cs[k].seat, cs[k]
	}
	drive(t, func() bool { return cs[0].myTurn() }, cs...)
	q.drop("Anna")
	for _, c := range q.in {
		c.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	}
	return q
}

// vote sends name's answer and waits until it shows, or the AI took over.
func (q *quiz) vote(name string, ai bool) {
	q.t.Helper()
	c := q.in[name]
	c.vote(0, ai)
	c.until(5*time.Second, name+"'s vote", func(m *msg) bool {
		if m.T != "update" {
			return false
		}
		v := m.state.Players[c.seat].Vote
		return m.evType() == "takeover" || v != nil && *v == ai
	})
}

// others runs f for every connected human but name.
func (q *quiz) others(name string, f func(c *tclient)) {
	for n, c := range q.in {
		if n != name {
			f(c)
		}
	}
}

func (q *quiz) drop(name string) {
	q.t.Helper()
	q.in[name].conn.CloseNow()
	delete(q.in, name)
	q.others(name, func(c *tclient) { c.waitSeat("away", q.seats[name]) })
	// The room has seen it, also when nobody is left to tell.
	waitFor(q.t, name+" gone", func() bool {
		var gone bool
		call(q.r, func() { gone = q.r.seats[q.seats[name]].client == nil })
		return gone
	})
}

func (q *quiz) leave(name string) {
	q.t.Helper()
	q.in[name].send(map[string]any{"t": "leave"})
	delete(q.in, name)
	q.others(name, func(c *tclient) { c.waitSeat("leave", q.seats[name]) })
	delete(q.seats, name)
}

// rejoin brings name back to their seat with the seat token.
func (q *quiz) rejoin(name string) {
	q.t.Helper()
	c := dial(q.t, q.ts)
	c.join(q.code, name, q.tokens[name])
	q.others(name, func(o *tclient) { o.waitSeat("back", q.seats[name]) })
	q.in[name] = c
}

// join seats a newcomer in the seat someone left.
func (q *quiz) join(name string) {
	q.t.Helper()
	c := dial(q.t, q.ts)
	c.join(q.code, name, "")
	q.others(name, func(o *tclient) { o.waitSeat("join", c.seat) })
	q.in[name], q.seats[name] = c, c.seat
}

// waiting checks that the game still waits for Anna, everyone connected
// being asked, with these answers and no others.
func (q *quiz) waiting(votes map[string]bool) {
	q.t.Helper()
	for name, c := range q.in {
		c.settle()
		s := c.s
		if slices.Contains(c.events, "takeover") || s.Takeover == nil || s.Takeover.Seat != 0 || s.Turn != 0 {
			q.t.Fatalf("%s: no longer waiting for Anna: question %+v, turn %d, events %v", name, s.Takeover, s.Turn, c.events)
		}
		for voter, i := range q.seats {
			want, ok := votes[voter]
			if got := s.Players[i].Vote; ok != (got != nil) || ok && *got != want {
				q.t.Errorf("%s sees %s's vote %v, want %v (%v)", name, voter, got, want, ok)
			}
		}
	}
}

// tookOver checks that everyone connected saw the AI take over for Anna,
// and that it plays.
func (q *quiz) tookOver() {
	q.t.Helper()
	for name, c := range q.in {
		c.waitSeen("takeover")
		if !hasLine(c, "Iedereen is akkoord: een AI-speler speelt zolang voor Anna.") {
			q.t.Errorf("%s has no consent line: %+v", name, c.chats)
		}
	}
	votes := 0
	var away bool
	call(q.r, func() {
		away = q.r.seats[0].away
		for i := range q.r.seats {
			if q.r.seats[i].vote != nil {
				votes++
			}
		}
	})
	if !away || votes > 0 {
		q.t.Errorf("after the takeover: away %v, %d votes left", away, votes)
	}
	q.in["Bert"].waitMove(0)
}

// TestVoters: the AI takes over only when every connected human agreed;
// someone who goes takes their answer along, someone who comes in must
// answer too, and Anna's return ends the question.
func TestVoters(t *testing.T) {
	for _, tc := range []struct {
		name string
		run  func(q *quiz)
	}{
		{"a no keeps the game waiting", func(q *quiz) {
			q.vote("Bert", true)
			q.vote("Cor", false)
			q.waiting(map[string]bool{"Bert": true, "Cor": false})
		}},
		{"a changed vote", func(q *quiz) {
			q.vote("Bert", false)
			q.vote("Cor", true)
			q.waiting(map[string]bool{"Bert": false, "Cor": true})
			q.vote("Bert", true)
			q.tookOver()
		}},
		{"a voter drops out", func(q *quiz) {
			q.vote("Bert", true)
			q.drop("Cor") // no answer yet: nothing to hold
			q.tookOver()
		}},
		{"a no outlasts a short drop-out", func(q *quiz) {
			q.vote("Bert", true)
			q.vote("Cor", false)
			q.drop("Cor")
			q.waiting(map[string]bool{"Bert": true, "Cor": false})
			q.rejoin("Cor")
			q.waiting(map[string]bool{"Bert": true, "Cor": false})
		}},
		{"a no goes askAfter after its voter dropped out", func(q *quiz) {
			q.vote("Bert", true)
			q.vote("Cor", false)
			start := time.Now()
			q.drop("Cor")
			q.tookOver()
			if d := time.Since(start); d < 450*time.Millisecond {
				q.t.Errorf("the AI took over %v after Cor dropped out, want askAfter (500 ms scaled)", d)
			}
		}},
		{"a held no outlasts everyone dropping out", func(q *quiz) {
			// A blip on the table's Wi-Fi: Bert is back first, and his yes
			// is not everyone's while Cor's no holds.
			q.vote("Bert", true)
			q.vote("Cor", false)
			q.drop("Cor")
			q.drop("Bert")
			q.rejoin("Bert")
			q.waiting(map[string]bool{"Cor": false})
			q.vote("Bert", true)
			q.waiting(map[string]bool{"Bert": true, "Cor": false})
			q.rejoin("Cor")
			q.waiting(map[string]bool{"Bert": true, "Cor": false})
		}},
		{"a held no outlasts a reload of the last one asked", func(q *quiz) {
			q.vote("Cor", false)
			q.drop("Cor")
			q.drop("Bert")
			q.rejoin("Bert")
			q.vote("Bert", true)
			q.waiting(map[string]bool{"Bert": true, "Cor": false})
			q.tookOver() // once Cor has been gone askAfter
		}},
		{"a voter leaves", func(q *quiz) {
			q.vote("Bert", true)
			q.leave("Cor")
			q.tookOver()
		}},
		{"a voter who comes back answers again", func(q *quiz) {
			q.vote("Cor", true)
			q.drop("Cor")
			q.rejoin("Cor")
			q.vote("Bert", true)
			q.waiting(map[string]bool{"Bert": true})
			q.vote("Cor", true)
			q.tookOver()
		}},
		{"a newcomer answers too", func(q *quiz) {
			q.leave("Cor")
			q.join("Kees")
			q.vote("Bert", true)
			q.waiting(map[string]bool{"Bert": true})
			q.vote("Kees", true)
			q.tookOver()
		}},
		{"Anna comes back", func(q *quiz) {
			q.vote("Bert", true)
			q.vote("Cor", false)
			q.rejoin("Anna")
			for name, c := range q.in {
				c.settle()
				if s := c.s; s.Takeover != nil || slices.ContainsFunc(s.Players[:], func(p *playerState) bool { return p != nil && p.Vote != nil }) {
					q.t.Errorf("%s after Anna's return: question %+v, players %+v", name, s.Takeover, s.Players)
				}
			}
			a := q.in["Anna"]
			if !a.myTurn() {
				q.t.Fatalf("Anna back without her turn: %d", a.s.Turn)
			}
			a.actRandom(rand.New(rand.NewPCG(1, 1)))
			q.in["Bert"].waitMove(0)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tc.run(newQuiz(t, 0.05)) // askAfter: 500 ms
		})
	}
}

// TestOnlyAIPauses: with every human gone the game pauses and nobody is
// asked; whoever returns finds the question again if the game still waits
// for an absent player: at once if it was open, or once that player has
// been gone askAfter, which the pause does not reset
// (docs/server.md#pauses).
func TestOnlyAIPauses(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.05 }) // askAfter: 500 ms
	cs := startTable(t, ts, "Anna", "Bert")
	a, b := cs[0], cs[1]
	r := roomOf(t, s, a.code)
	nobody := func() {
		t.Helper()
		waitFor(t, "nobody connected", func() bool {
			var n int
			call(r, func() { n = r.connectedHumans() })
			return n == 0
		})
	}
	drive(t, func() bool { return a.myTurn() }, a, b)
	a.conn.CloseNow()
	b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	b.conn.CloseNow()
	nobody()
	played := func() (n int, asking game.Seat) {
		call(r, func() {
			n = 32 - r.deal.HandLen(0) - r.deal.HandLen(1) - r.deal.HandLen(2) - r.deal.HandLen(3)
			asking = r.asking
		})
		return n, asking
	}
	before, asking := played()
	time.Sleep(300 * time.Millisecond)
	if after, _ := played(); after != before || asking != game.NoSeat {
		t.Fatalf("with nobody there: %d cards played, then %d; asking %d", before, after, asking)
	}
	b2 := dial(t, ts)
	b2.join(a.code, "Bert", b.token)
	if q := b2.s.Takeover; q == nil || q.Seat != 0 {
		t.Fatalf("back in a game that waits for Anna: question %+v", q)
	}

	// Bert drops too before Anna is asked about. Back once she has been
	// gone askAfter, he is asked at once.
	a2 := dial(t, ts)
	a2.join(a.code, "Anna", a.token)
	b2.waitSeat("back", 0)
	drive(t, func() bool { return b2.s.Turn == 0 && a2.myTurn() }, a2, b2)
	a2.conn.CloseNow()
	b2.waitSeat("away", 0)
	b2.conn.CloseNow()
	nobody()
	time.Sleep(600 * time.Millisecond) // longer than askAfter: nobody to ask
	b3 := dial(t, ts)
	b3.join(a.code, "Bert", b.token)
	if q := b3.s.Takeover; q == nil || q.Seat != 0 || b3.s.Turn != 0 {
		t.Fatalf("back after Anna was gone askAfter: question %+v, turn %d", q, b3.s.Turn)
	}

	// Back sooner: the question comes askAfter after Anna dropped out, not
	// after the return.
	a3 := dial(t, ts)
	a3.join(a.code, "Anna", a.token)
	b3.waitSeat("back", 0)
	drive(t, func() bool { return b3.s.Turn == 0 && a3.myTurn() }, a3, b3)
	dropped := time.Now()
	a3.conn.CloseNow()
	b3.waitSeat("away", 0)
	b3.conn.CloseNow()
	nobody()
	time.Sleep(250 * time.Millisecond)
	b4 := dial(t, ts)
	back := time.Now()
	b4.join(a.code, "Bert", b.token)
	if b4.s.Takeover != nil {
		t.Fatalf("asked %v after Anna dropped out, before askAfter", time.Since(dropped))
	}
	b4.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	if d, e := time.Since(dropped), time.Since(back); d < 480*time.Millisecond || e > 400*time.Millisecond {
		t.Errorf("asked %v after Anna dropped out and %v after Bert's return, want askAfter (500 ms) after the drop-out", d, e)
	}
}

// TestSoloWaits: in training and in a game with one human there is nobody
// to ask; the game waits for the player, whatever how long.
func TestSoloWaits(t *testing.T) {
	for _, training := range []bool{false, true} {
		t.Run(map[bool]string{false: "solo", true: "training"}[training], func(t *testing.T) {
			s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
			c := dial(t, ts)
			c.create("Piet", map[string]any{"hands": 4}, training, true)
			drive(t, func() bool { return c.myTurn() }, c)
			r := roomOf(t, s, c.code)
			cards := c.s.Players[0].Cards
			c.conn.CloseNow()
			time.Sleep(400 * time.Millisecond) // forty seconds, scaled
			var turn game.Seat
			var asked, away bool
			call(r, func() { turn, asked, away = r.deal.Turn(), r.seats[0].asked, r.seats[0].away })
			if turn != 0 || asked || away {
				t.Fatalf("while Piet was gone: turn %d, asked %v, away %v", turn, asked, away)
			}
			c2 := dial(t, ts)
			c2.join(c.code, "Piet", c.token)
			if p := c2.s.Players[0]; !c2.myTurn() || c2.s.Takeover != nil || p.Away || p.Cards != cards {
				t.Fatalf("back: turn %d, question %+v, %+v", c2.s.Turn, c2.s.Takeover, p)
			}
			c2.actRandom(rand.New(rand.NewPCG(1, 1)))
			c2.waitMove(0)
		})
	}
}

// TestVoteErrors: an answer without a question for that seat is refused,
// also one before the question opens and one to another question.
func TestVoteErrors(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.05 }) // askAfter: 500 ms
	h := dial(t, ts)
	h.create("Anna", map[string]any{"hands": 4}, false, false)
	h.vote(2, true)
	if e := h.waitError(errInvalid); e.errMsg() != "Die vraag staat niet (meer) open." {
		t.Errorf("vote in the lobby: %q", e.errMsg())
	}
	g := dial(t, ts)
	g.join(h.code, "Bert", "")
	h.send(map[string]any{"t": "start"})
	drive(t, func() bool { return h.myTurn() }, h, g)
	g.vote(0, true)
	g.waitError(errInvalid) // Anna is there: nothing to ask
	h.conn.CloseNow()
	g.waitSeat("away", 0)
	g.vote(0, true) // gone, but not for askAfter yet
	if e := g.waitError(errInvalid); e.errMsg() != "Die vraag staat niet (meer) open." || g.s.Takeover != nil {
		t.Errorf("vote before the question: %q, question %+v", e.errMsg(), g.s.Takeover)
	}
	g.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	for _, tc := range []struct {
		m    map[string]any
		want string
	}{
		{map[string]any{"t": "vote", "seat": 9, "ai": true}, "Die plaats bestaat niet."},
		{map[string]any{"t": "vote", "ai": true}, "Die plaats bestaat niet."},
		{map[string]any{"t": "vote", "seat": 0}, "Kies of een AI-speler mag spelen of dat jullie wachten."},
		{map[string]any{"t": "vote", "seat": 1, "ai": true}, "Die vraag staat niet (meer) open."},               // a bot
		{map[string]any{"t": "vote", "seat": 2, "ai": true}, "Die vraag staat niet (meer) open."},               // himself
		{map[string]any{"t": "vote", "seat": 0, "left": true, "ai": true}, "Die vraag staat niet (meer) open."}, // Anna did not leave
	} {
		g.send(tc.m)
		if e := g.waitError(errInvalid); e.errMsg() != tc.want {
			t.Errorf("%v: %q, want %q", tc.m, e.errMsg(), tc.want)
		}
	}
	if g.s.Players[2].Vote != nil || slices.Contains(g.events, "takeover") {
		t.Errorf("a refused vote counted: %v", g.s.Players[2].Vote)
	}
}

// TestLeaveAtHandEndAsks: a seat left during the hand summary does not
// hold the summary up, and its first turn in the next hand asks at once.
func TestLeaveAtHandEndAsks(t *testing.T) {
	_, h, g := toHandEnd(t)
	h.send(map[string]any{"t": "leave"})
	if p := g.waitSeat("leave", h.seat).state.Players[h.seat]; !p.Left || p.Name != "Host" {
		t.Errorf("the seat the host left: %+v", p)
	}
	g.waitEvent("deal")
	drive(t, func() bool { return g.s.Takeover != nil }, g)
	if s := g.s; s.Takeover.Seat != game.Seat(h.seat) || !s.Takeover.Left || s.Turn != h.seat {
		t.Fatalf("question %+v on turn %d", s.Takeover, s.Turn)
	}
	g.vote(h.seat, true)
	if p := g.waitEvent("takeover").state.Players[h.seat]; !p.Bot {
		t.Errorf("after the yes: %+v", p)
	}
}

// TestLeftSeatAfterGameOver: at game over a joiner may take a seat its
// player left; the lobby frees it, and a rematch fills it with a bot.
func TestLeftSeatAfterGameOver(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	cs := startTable(t, ts, "Host", "Gast")
	h, g := cs[0], cs[1]
	r := roomOf(t, s, h.code)
	over := func() {
		call(r, func() {
			r.pending = stepNone
			r.handNo = r.opts.Hands
			r.nextHand()
		})
		h.waitEvent("gameOver")
	}
	over()
	g.send(map[string]any{"t": "leave"})
	if p := h.waitSeat("leave", 2).state.Players[2]; !p.Left || p.Name != "Gast" {
		t.Errorf("after game over, the seat Gast left: %+v", p)
	}
	v := dial(t, ts)
	v.join(h.code, "Vriend", "")
	h.waitSeat("join", 2)
	if v.seat != 2 || !hasLine(h, "Vriend neemt de plaats van Gast over.") {
		t.Fatalf("joiner at seat %d, chat %+v", v.seat, h.chats)
	}
	v.send(map[string]any{"t": "leave"})
	h.waitSeat("leave", 2)

	h.send(map[string]any{"t": "lobby"})
	st := h.waitState("lobby", func(s *state) bool { return s.Phase == phaseLobby })
	if st.Players[2] != nil {
		t.Errorf("lobby: seat 2 %+v, want it free", st.Players[2])
	}
	if !hasLine(h, "Host zet de tafel opnieuw klaar. Wie wil, kan nu aanschuiven.") {
		t.Errorf("no invitation in %+v", h.chats)
	}
	v2 := dial(t, ts)
	v2.join(h.code, "Vriend", "")
	h.send(map[string]any{"t": "start"})
	h.waitEvent("deal")
	over()
	v2.send(map[string]any{"t": "leave"})
	h.waitSeat("leave", 2)
	h.send(map[string]any{"t": "rematch"})
	st = h.waitEvent("deal").state
	if p := st.Players[2]; p == nil || !p.Bot || p.Left {
		t.Fatalf("rematch: seat 2 %+v", p)
	}
}

// TestReclaimEndsQuestion: a seat taken back by name on another device
// ends the question about it.
func TestReclaimEndsQuestion(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.002 }) // askAfter 20 ms, reclaim 360 ms
	cs := startTable(t, ts, "Anna", "Bob")
	a, b := cs[0], cs[1]
	drive(t, func() bool { return b.myTurn() }, a, b)
	b.conn.CloseNow()
	a.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	a.vote(2, false)
	a.waitState("Anna waits", func(s *state) bool { v := s.Players[0].Vote; return v != nil && !*v })
	time.Sleep(400 * time.Millisecond)
	n := dial(t, ts)
	n.join(a.code, "Bob", "")
	if n.seat != 2 || !n.myTurn() || n.s.Takeover != nil {
		t.Fatalf("reclaimed seat %d, turn %d, question %+v", n.seat, n.s.Turn, n.s.Takeover)
	}
	s := a.waitSeat("back", 2).state
	if s.Takeover != nil || s.Players[0].Vote != nil {
		t.Errorf("after the reclaim: question %+v, Anna's vote %v", s.Takeover, s.Players[0].Vote)
	}
}

// TestRematchAsksAgain: the others let an AI play for a player who is
// gone; in the rematch that player is waited for and asked about again,
// so nobody plays for them in the new match on the old consent.
func TestRematchAsksAgain(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 }) // askAfter: 100 ms
	cs := startTable(t, ts, "Bert", "Anna")
	b, a := cs[0], cs[1]
	r := roomOf(t, s, b.code)
	drive(t, func() bool { return a.myTurn() }, a, b)
	a.conn.CloseNow()
	b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	b.vote(a.seat, true)
	b.waitEvent("takeover")
	b.waitMove(a.seat)
	call(r, func() {
		r.pending = stepNone
		r.handNo = r.opts.Hands
		r.nextHand()
	})
	b.waitEvent("gameOver")
	b.send(map[string]any{"t": "rematch"})
	if p := b.waitEvent("deal").state.Players[a.seat]; p.Away || p.Connected {
		t.Errorf("the rematch keeps the substitute: %+v", p)
	}
	drive(t, func() bool { return b.s.Turn == a.seat }, b)
	start := time.Now()
	s2 := b.waitState("the question in the new match", func(s *state) bool { return s.Takeover != nil })
	if q := s2.Takeover; int(q.Seat) != a.seat || q.Left || s2.Players[a.seat].Cards != 8-s2.TricksWon[0]-s2.TricksWon[1] {
		t.Errorf("question %+v, %+v", q, s2.Players[a.seat])
	}
	if d := time.Since(start); d < 50*time.Millisecond {
		t.Errorf("asked %v after Anna's turn opened, want askAfter (100 ms)", d)
	}
}

// TestVoteAnswersOneQuestion: a vote may say which question it answers
// (left); a yes for a stand-in while Anna is gone does not give her seat
// away once she has left (the question changed under it). A vote without
// left answers the question about the seat as it stands.
func TestVoteAnswersOneQuestion(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	cs := startTable(t, ts, "Anna", "Bert")
	a, b := cs[0], cs[1]
	drive(t, func() bool { return a.myTurn() }, a, b)
	a.conn.CloseNow()
	b.waitState("the question", func(s *state) bool { return s.Takeover != nil && !s.Takeover.Left })
	b.send(map[string]any{"t": "vote", "seat": 0, "ai": false})
	b.waitState("Bert's no", func(s *state) bool { v := s.Players[b.seat].Vote; return v != nil && !*v })
	// Leaving while offline: join with the token, then leave
	// (docs/frontend.md#connection).
	a2 := dial(t, ts)
	a2.join(a.code, "Anna", a.token)
	a2.send(map[string]any{"t": "leave"})
	b.waitSeat("leave", 0)
	b.voteOn(0, false, true) // sent for "Anna is weg"
	if e := b.waitError(errInvalid); e.errMsg() != "Die vraag staat niet (meer) open." {
		t.Errorf("a yes for the other question: %q", e.errMsg())
	}
	b.settle()
	if p := b.s.Players[0]; !p.Left || p.Bot || b.s.Takeover == nil || !b.s.Takeover.Left {
		t.Fatalf("the yes for a stand-in gave the seat away: %+v, question %+v", p, b.s.Takeover)
	}
	b.send(map[string]any{"t": "vote", "seat": 0, "ai": true})
	if p := b.waitEvent("takeover").state.Players[0]; !p.Bot {
		t.Errorf("after the yes for the seat Anna left: %+v", p)
	}
}

// TestAskAfterFromLater: askAfter counts from the later of the turn
// opening and the drop-out.
func TestAskAfterFromLater(t *testing.T) {
	t.Run("gone before the turn", func(t *testing.T) {
		_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.02 }) // askAfter: 200 ms
		cs := startTable(t, ts, "Anna", "Bert")
		a, b := cs[0], cs[1]
		drive(t, func() bool { return b.myTurn() }, a, b)
		a.conn.CloseNow()
		b.waitSeat("away", 0)
		time.Sleep(300 * time.Millisecond)
		var opened time.Time
		drive(t, func() bool {
			if opened.IsZero() && b.s.Turn == 0 {
				opened = time.Now()
			}
			return b.s.Takeover != nil
		}, b)
		if d := time.Since(opened); d < 180*time.Millisecond {
			t.Errorf("asked %v after Anna's turn opened, want askAfter (200 ms)", d)
		}
	})
	t.Run("gone late in the turn", func(t *testing.T) {
		_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.02 })
		cs := startTable(t, ts, "Anna", "Bert")
		a, b := cs[0], cs[1]
		drive(t, func() bool { return a.myTurn() }, a, b)
		time.Sleep(150 * time.Millisecond)
		dropped := time.Now()
		a.conn.CloseNow()
		b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
		if d := time.Since(dropped); d < 190*time.Millisecond {
			t.Errorf("asked %v after Anna dropped out, want askAfter (200 ms)", d)
		}
	})
}

// TestNoQuestionInPause: the deal is a pause (turn -1): a seat left as the
// next hand's voorhand is asked about only once its turn opens.
func TestNoQuestionInPause(t *testing.T) {
	s, h, g := toHandEnd(t)
	// The next voorhand is two seats after this hand's dealer; play on
	// until that is one of the two people.
	leaver, stayer := h, g
	for {
		v := (h.s.Dealer + 2) & 3
		if v == g.seat {
			leaver, stayer = g, h
		}
		if v == h.seat || v == g.seat {
			break
		}
		h.send(map[string]any{"t": "ready"})
		h.waitEvent("deal")
		drive(t, func() bool { return h.phase() == phaseHandEnd && g.phase() == phaseHandEnd }, h, g)
		holdSummary(t, s, h.code)
		g.send(map[string]any{"t": "ready"})
		g.waitState("ready", func(s *state) bool { return s.Players[g.seat].Ready })
	}
	leaver.send(map[string]any{"t": "leave"})
	stayer.waitSeat("leave", leaver.seat)
	stayer.send(map[string]any{"t": "ready"})
	m := stayer.waitEvent("deal")
	if s := m.state; s.Voorhand != leaver.seat || s.Takeover != nil || s.Turn != -1 {
		t.Fatalf("deal: voorhand %d, turn %d, question %+v; want no question in the pause", s.Voorhand, s.Turn, s.Takeover)
	}
	st := stayer.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	if q := st.Takeover; int(q.Seat) != leaver.seat || !q.Left || st.Turn != leaver.seat {
		t.Errorf("question %+v on turn %d", q, st.Turn)
	}
}

// TestHostNotLeftSeat: the host role goes to a human who is gone rather
// than to a seat its player left.
func TestHostNotLeftSeat(t *testing.T) {
	s, ts, _ := newTestServer(t)
	cs := startTable(t, ts, "Anna", "Bert", "Cor")
	a, b, c := cs[0], cs[1], cs[2]
	r := roomOf(t, s, a.code)
	b.send(map[string]any{"t": "leave"})
	a.waitSeat("leave", 1)
	c.conn.CloseNow()
	a.waitSeat("away", 2)
	a.send(map[string]any{"t": "leave"})
	var host game.Seat
	waitFor(t, "Anna gone", func() bool {
		var kind seatKind
		call(r, func() { kind, host = r.seats[0].kind, r.host })
		return kind == seatLeft
	})
	if host != 2 {
		t.Errorf("host %d after Anna left, want Cor's seat 2 (seat 1 was left)", host)
	}
}

// TestAIThinksFromTakeover: the AI that takes a seat thinks from the
// takeover on, as at the start of a turn, not at once because the turn
// opened long ago.
func TestAIThinksFromTakeover(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.1 }) // think time: 90 ms (at least about 23 ms)
	cs := startTable(t, ts, "Anna", "Bert")
	a, b := cs[0], cs[1]
	drive(t, func() bool { return a.myTurn() }, a, b)
	a.send(map[string]any{"t": "leave"})
	b.waitState("the question", func(s *state) bool { return s.Takeover != nil })
	time.Sleep(300 * time.Millisecond) // longer than any think time
	b.vote(0, true)
	b.waitEvent("takeover")
	at := time.Now()
	b.waitMove(0)
	if d := time.Since(at); d < 15*time.Millisecond {
		t.Errorf("the AI moved %v after the takeover, want its think time", d)
	}
}
