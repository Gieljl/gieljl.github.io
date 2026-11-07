package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"jannie/games/klaverjas/game"
)

// fakeAI plays the first legal card and says little.
type fakeAI struct {
	advised   atomic.Int64
	explained atomic.Int64
	greets    atomic.Int64
	graded    atomic.Int64
	lucked    atomic.Int64
	reasoned  atomic.Int64
	signalled atomic.Int64
	signalsIn sync.Map // hand number → whether a hint's view had signals agreed
}

var fakePersonas = []Persona{
	{ID: "dirk", Name: "Opa Dirk", Emoji: "👴", Color: "#8a5a2b", Bio: "Dirk.", Chattiness: 0.5, Speed: 1},
	{ID: "truus", Name: "Tante Truus", Emoji: "👵", Color: "#c2477a", Bio: "Truus.", Chattiness: 1, Speed: 1},
	{ID: "sjaak", Name: "Sjaak", Emoji: "🎲", Color: "#e07b24", Bio: "Sjaak.", Chattiness: 0.5, Speed: 0.8},
	{ID: "fatima", Name: "Fatima", Emoji: "🧠", Color: "#5b6ee1", Bio: "Fatima.", Chattiness: 0.2, Speed: 0.9},
	{ID: "kees", Name: "Kees de Visser", Emoji: "🎣", Color: "#2a8c9c", Bio: "Kees.", Chattiness: 0.5, Speed: 1},
	{ID: "jannie", Name: "Juf Jannie", Emoji: "👩‍🏫", Color: "#3f9b5a", Bio: "Jannie.", Chattiness: 0.5, Speed: 1.2},
	{ID: "bram", Name: "Bram", Emoji: "🛹", Color: "#9b59b6", Bio: "Bram.", Chattiness: 0.7, Speed: 0.6},
	{ID: "vera", Name: "Bakker Vera", Emoji: "🥐", Color: "#c9a227", Bio: "Vera.", Chattiness: 0.4, Speed: 0.85},
}

func (*fakeAI) Personas() []Persona { return slices.Clone(fakePersonas) }

func (*fakeAI) NewBrain(id, level string, seed uint64) Brain { return fakeBrain{} }

func (a *fakeAI) Advise(v game.View) Advice {
	a.advised.Add(1)
	if v.Signals != nil {
		a.signalsIn.Store(v.HandNo, *v.Signals != game.Signals{})
	}
	switch v.Phase {
	case game.PhaseTrump:
		s := firstSuit(v)
		return Advice{Suit: &s, Text: "Kies " + s.Symbol() + " als troef: de eerste kleur die mag."}
	case game.PhaseBid:
		p := false
		return Advice{Play: &p, Text: "Passen: dat doet de test altijd."}
	}
	c := v.Legal[0]
	return Advice{Card: &c, Text: "Speel " + game.CardShortNL(c) + ": de eerste kaart die mag."}
}

// Grade agrees with Advise: another option loses 10 of 20 points, and the
// advised card on a lead is a strong move of 12 over the last legal card.
// The outcomes add up to those points: fakeLost and fakeGain.
func (a *fakeAI) Grade(v game.View, c Choice) Grade {
	a.graded.Add(1)
	adv := a.Advise(v)
	a.advised.Add(-1)
	g := Grade{Stake: 20, Text: adv.Text}
	switch {
	case c.Card != nil && *c.Card != *adv.Card,
		c.Suit != nil && *c.Suit != *adv.Suit,
		c.Play != nil && *c.Play != *adv.Play:
		g.Lost, g.Better = 10, Choice{Card: adv.Card, Suit: adv.Suit, Play: adv.Play}
		g.Played, g.Other = fakeLost[0], fakeLost[1]
	case c.Card != nil && len(v.Current.Cards) == 0:
		g.Gain = 12
		g.Obvious.Card = &v.Legal[len(v.Legal)-1]
		g.Played, g.Other = fakeGain[0], fakeGain[1]
	}
	if c.Play != nil && *c.Play {
		g.Nat = 0.5
	}
	return g
}

// HandLuck rates every hand 3 points above average.
func (a *fakeAI) HandLuck(v game.View) float64 {
	a.lucked.Add(1)
	return 3
}

// Explain names the advised option as everyone's choice and values every
// legal card, suit or bid at 0 but the advised one at 10; a card below it
// says why.
func (a *fakeAI) Explain(v game.View) Explanation {
	a.reasoned.Add(1)
	adv := a.Advise(v)
	a.advised.Add(-1)
	c := Choice{Card: adv.Card, Suit: adv.Suit, Play: adv.Play}
	e := Explanation{Normaal: c, Sterk: c, Hint: c, HintText: adv.Text, Worlds: 1}
	if v.Phase == game.PhasePlay {
		e.SterkWhy, e.HintWhy = "waarom sterk", "waarom de tip"
	}
	opt := func(o Choice, best bool) Option {
		if best {
			return Option{Choice: o, Value: 10, Outcome: Outcome{Us: 10}}
		}
		if o.Card != nil {
			return Option{Choice: o, SE: 1, Why: "waarom de beste"}
		}
		return Option{Choice: o, SE: 1}
	}
	switch v.Phase {
	case game.PhasePlay:
		e.Rule = adv.Text
		for k := range v.Legal {
			e.Options = append(e.Options, opt(Choice{Card: &v.Legal[k]}, v.Legal[k] == *adv.Card))
		}
	case game.PhaseTrump:
		for s := game.Suit(0); s < game.NumSuits; s++ {
			if !(v.Forced && s == v.Turned) {
				e.Options = append(e.Options, opt(Choice{Suit: &s}, s == *adv.Suit))
			}
		}
	case game.PhaseBid:
		yes, no := true, false
		e.Options = []Option{opt(Choice{Play: &yes}, false), opt(Choice{Play: &no}, true)}
	}
	return e
}

func (a *fakeAI) ExplainTrick(t game.Trick, trump game.Suit, names [4]string) string {
	a.explained.Add(1)
	return names[t.Winner] + " wint de slag."
}

// TrickSignals reads the lead of every trick as kleintje boer, at a table
// that agreed on signals.
func (a *fakeAI) TrickSignals(v game.View) []Signal {
	a.signalled.Add(1)
	if *v.Signals == (game.Signals{}) {
		return nil
	}
	lead := v.Tricks[len(v.Tricks)-1].Cards[0]
	return []Signal{{Seat: lead.Seat, Card: lead.Card, Kind: "kleintjeBoer", Means: game.Card{Rank: game.Jack, Suit: v.Trump}}}
}

// SignalChance offers prefer as met de aas seinen on every turn that follows
// a lead, at a table that agreed on signals.
func (a *fakeAI) SignalChance(v game.View, prefer game.Card) (Signal, bool) {
	if *v.Signals == (game.Signals{}) || len(v.Current.Cards) == 0 {
		return Signal{}, false
	}
	return Signal{Seat: v.Seat, Card: prefer, Kind: "aas", Means: game.Card{Rank: game.Ten, Suit: prefer.Suit}}, true
}

// fakeGreetings are said in turn; fakeRoem is a pool of four, as for the
// real bots.
var (
	fakeGreetings = []string{"Hallo allemaal!", "Hallo, daar gaan we!", "Hallo en veel plezier!"}
	fakeRoem      = []string{"%d roem. Niet slecht.", "Roem! Wat zei ik nou?", "Oei, die roem had ik zelf wel gewild.", "Mooi zo."}
)

func (a *fakeAI) Chat(id string, ev ChatEvent, rng *rand.Rand) string {
	switch ev.Kind {
	case "greet":
		return fakeGreetings[(a.greets.Add(1)-1)%int64(len(fakeGreetings))]
	case "roem":
		line := fakeRoem[rng.IntN(len(fakeRoem))]
		if strings.Contains(line, "%d") {
			line = fmt.Sprintf(line, ev.Points)
		}
		return line
	case "reply":
		if strings.HasPrefix(strings.ToLower(ev.Text), "hoi") {
			return "Hoi!"
		}
	}
	return ""
}

type fakeBrain struct{}

func firstSuit(v game.View) game.Suit {
	if v.Forced && v.Turned == game.Clubs {
		return game.Diamonds
	}
	return game.Clubs
}

func (fakeBrain) ChooseTrump(v game.View) game.Suit { return firstSuit(v) }

// Bid plays with the turned jack, so both bidding paths occur.
func (fakeBrain) Bid(v game.View) bool {
	return slices.Contains(v.Hand, game.Card{Rank: game.Jack, Suit: v.Turned})
}

func (fakeBrain) Play(v game.View) game.Card { return v.Legal[0] }

// Auction opens with the lowest bid when holding a boer, else passes, so
// both an auction and a forced soloist occur.
func (fakeBrain) Auction(v game.View) int {
	if v.Bidder == game.NoSeat && slices.ContainsFunc(v.Hand, func(c game.Card) bool { return c.Rank == game.Jack }) {
		return v.MinNextBid()
	}
	return 0
}

func (fakeBrain) Discard(v game.View) [2]game.Card { return [2]game.Card{v.Hand[0], v.Hand[1]} }

// newTestServer returns a server at a very fast pace behind httptest.
func newTestServer(t *testing.T, tweak ...func(*Server)) (*Server, *httptest.Server, *fakeAI) {
	t.Helper()
	ai := &fakeAI{}
	s, ts := newTestServerWith(t, ai, tweak...)
	return s, ts, ai
}

// newTestServerWith is newTestServer with another AI.
func newTestServerWith(t *testing.T, ai AI, tweak ...func(*Server)) (*Server, *httptest.Server) {
	t.Helper()
	s := New(Config{Game: Klaverjas(ai), Fast: true, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	s.scale = 0.005
	s.msgRate = 1000 // the test clients act at 200 times the normal pace
	s.joinRate, s.joinBurst = 1000, 1000
	for _, f := range tweak {
		f(s)
	}
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		s.Shutdown(ctx)
		ts.Close()
	})
	return s, ts
}

// countAI is the fake AI with brains that count their decisions per turn.
// With a gate, every decision waits until the gate is closed.
type countAI struct {
	fakeAI
	gate  chan struct{}
	mu    sync.Mutex
	turns map[string]int
}

func newCountAI(gated bool) *countAI {
	a := &countAI{turns: make(map[string]int)}
	if gated {
		a.gate = make(chan struct{})
	}
	return a
}

func (a *countAI) NewBrain(id, level string, seed uint64) Brain { return countBrain{a} }

// decisions is the number of decisions made, and the turns decided more
// than once.
func (a *countAI) decisions() (n int, twice []string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for k, c := range a.turns {
		n += c
		if c > 1 {
			twice = append(twice, fmt.Sprintf("%s ×%d", k, c))
		}
	}
	return n, twice
}

// seatDecisions is the number of decisions made for seat i.
func (a *countAI) seatDecisions(i int) (n int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for k, c := range a.turns {
		if strings.Contains(k, fmt.Sprintf(" seat %d ", i)) {
			n += c
		}
	}
	return n
}

type countBrain struct{ a *countAI }

// note counts a decision for the turn of v: the hand, phase, seat, cards
// left and bids tell turns apart.
func (b countBrain) note(v game.View) {
	b.a.mu.Lock()
	b.a.turns[fmt.Sprintf("hand %d %s seat %d cards %d bids %v", v.HandNo, v.Phase, v.Seat, len(v.Hand), v.Bids)]++
	b.a.mu.Unlock()
	if b.a.gate != nil {
		<-b.a.gate
	}
}

func (b countBrain) ChooseTrump(v game.View) game.Suit { b.note(v); return fakeBrain{}.ChooseTrump(v) }
func (b countBrain) Bid(v game.View) bool              { b.note(v); return fakeBrain{}.Bid(v) }
func (b countBrain) Play(v game.View) game.Card        { b.note(v); return fakeBrain{}.Play(v) }
func (b countBrain) Auction(v game.View) int           { b.note(v); return fakeBrain{}.Auction(v) }
func (b countBrain) Discard(v game.View) [2]game.Card  { b.note(v); return fakeBrain{}.Discard(v) }

// roomOf returns the registered room with code.
func roomOf(t *testing.T, s *Server, code string) *room {
	t.Helper()
	s.mu.Lock()
	r := s.rooms[code]
	s.mu.Unlock()
	if r == nil {
		t.Fatalf("no room %s", code)
	}
	return r
}

// holdSummary keeps the hand summary of room code up for an hour, so only
// ready (or a player going) ends it.
func holdSummary(t *testing.T, s *Server, code string) {
	t.Helper()
	r := roomOf(t, s, code)
	call(r, func() {
		if r.pending != stepNextHand {
			t.Errorf("holdSummary in phase %s", r.phase)
			return
		}
		r.pendingAt = time.Now().Add(time.Hour)
		r.nextAt = r.pendingAt
		r.drive()
	})
}

// msg is any server message as the tests see it.
type msg struct {
	T     string          `json:"t"`
	Code  string          `json:"code"`
	Seat  int             `json:"seat"`
	Token string          `json:"token"`
	Seq   int             `json:"seq"`
	Ev    json.RawMessage `json:"ev"`
	S     json.RawMessage `json:"s"`
	Msg   json.RawMessage `json:"msg"`
	Msgs  []chatMsg       `json:"msgs"`
	Text  string          `json:"text"`
	Name  string          `json:"name"`

	ev    map[string]any
	state *state
	raw   []byte // the whole message
}

func (m *msg) evType() string {
	if m.ev == nil {
		return ""
	}
	s, _ := m.ev["type"].(string)
	return s
}

func (m *msg) errMsg() string {
	var s string
	json.Unmarshal(m.Msg, &s)
	return s
}

// tclient is a test websocket client that remembers the latest state.
type tclient struct {
	t    *testing.T
	conn *websocket.Conn
	in   chan *msg
	errc chan error

	s      *state // latest state
	resync bool   // joined: the next update may show what this connection missed
	seq    int
	code   string
	seat   int
	token  string
	tips   int
	chats  []chatMsg
	events []string
	keep   bool   // keep every message read in kept
	kept   []*msg // in the order read
}

var ipCounter atomic.Int64

// dial connects with a fresh client address.
func dial(t *testing.T, ts *httptest.Server) *tclient {
	t.Helper()
	n := ipCounter.Add(1)
	return dialIP(t, ts, fmt.Sprintf("10.0.%d.%d", n/250, n%250+1))
}

func dialIP(t *testing.T, ts *httptest.Server, ip string) *tclient {
	t.Helper()
	c, err := dialErr(ts, ip)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	c.t = t
	t.Cleanup(func() { c.conn.CloseNow() })
	return c
}

func dialErr(ts *httptest.Server, ip string) (*tclient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws", &websocket.DialOptions{
		HTTPHeader: http.Header{"X-Real-Ip": {ip}, "User-Agent": {"klaverjas-test/1.0"}},
	})
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(1 << 20)
	c := &tclient{conn: conn, in: make(chan *msg, 1024), errc: make(chan error, 1), seat: -1}
	go func() {
		for {
			_, data, err := conn.Read(context.Background())
			if err != nil {
				c.errc <- err
				close(c.in)
				return
			}
			m := &msg{raw: data}
			if err := json.Unmarshal(data, m); err != nil {
				c.errc <- fmt.Errorf("bad message %s: %w", data, err)
				close(c.in)
				return
			}
			if len(m.Ev) > 0 && string(m.Ev) != "null" {
				json.Unmarshal(m.Ev, &m.ev)
			}
			if len(m.S) > 0 {
				m.state = &state{}
				if err := json.Unmarshal(m.S, m.state); err != nil {
					c.errc <- fmt.Errorf("bad state %s: %w", m.S, err)
					close(c.in)
					return
				}
			}
			c.in <- m
		}
	}()
	return c, nil
}

func (c *tclient) send(v any) {
	c.t.Helper()
	b, _ := json.Marshal(v)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := c.conn.Write(ctx, websocket.MessageText, b); err != nil {
		c.t.Fatalf("send %s: %v", b, err)
	}
}

// next returns the next message, keeping track of state; it fails the test
// after timeout.
func (c *tclient) next(timeout time.Duration) *msg {
	c.t.Helper()
	select {
	case m, ok := <-c.in:
		if !ok {
			c.t.Fatalf("connection closed: %v", <-c.errc)
		}
		c.track(m)
		return m
	case <-time.After(timeout):
		c.t.Fatalf("no message within %v (seat %d, phase %s)", timeout, c.seat, c.phase())
	}
	return nil
}

func (c *tclient) track(m *msg) {
	if c.keep {
		c.kept = append(c.kept, m)
	}
	switch m.T {
	case "joined":
		c.code, c.seat, c.token = m.Code, m.Seat, m.Token
		c.resync = true
	case "update":
		prev := c.s
		if c.resync {
			prev, c.resync = nil, false
		}
		checkConsent(c.t, prev, m)
		if m.ev != nil && m.Seq <= c.seq {
			c.t.Errorf("seq went from %d to %d", c.seq, m.Seq)
		}
		if m.Seq < c.seq {
			c.t.Errorf("resync seq went back from %d to %d", c.seq, m.Seq)
		}
		c.seq = m.Seq
		c.s = m.state
		if e := m.evType(); e != "" {
			c.events = append(c.events, e)
		}
	case "tip":
		c.tips++
	case "chat":
		var cm chatMsg
		json.Unmarshal(m.Msg, &cm)
		c.chats = append(c.chats, cm)
	}
}

func (c *tclient) phase() string {
	if c.s == nil {
		return ""
	}
	return c.s.Phase
}

// until reads messages until pred holds and returns that message.
func (c *tclient) until(timeout time.Duration, what string, pred func(*msg) bool) *msg {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		left := time.Until(deadline)
		if left <= 0 {
			c.t.Fatalf("timeout waiting for %s (seat %d, phase %s)", what, c.seat, c.phase())
		}
		select {
		case m, ok := <-c.in:
			if !ok {
				c.t.Fatalf("connection closed while waiting for %s: %v", what, <-c.errc)
			}
			c.track(m)
			if pred(m) {
				return m
			}
		case <-time.After(left):
			c.t.Fatalf("timeout waiting for %s (seat %d, phase %s)", what, c.seat, c.phase())
		}
	}
}

func (c *tclient) waitType(t string) *msg {
	c.t.Helper()
	return c.until(5*time.Second, "message "+t, func(m *msg) bool { return m.T == t })
}

func (c *tclient) waitError(code string) *msg {
	c.t.Helper()
	m := c.until(5*time.Second, "error "+code, func(m *msg) bool { return m.T == "error" })
	if m.Code != code {
		c.t.Fatalf("error code %q (%s), want %q", m.Code, m.errMsg(), code)
	}
	return m
}

func (c *tclient) waitEvent(ev string) *msg {
	c.t.Helper()
	return c.until(5*time.Second, "event "+ev, func(m *msg) bool { return m.T == "update" && m.evType() == ev })
}

// waitChat waits for the system line text, unless it came already.
func (c *tclient) waitChat(text string) {
	c.t.Helper()
	line := func(m chatMsg) bool { return m.Sys && m.Text == text }
	if slices.ContainsFunc(c.chats, line) {
		return
	}
	c.until(5*time.Second, "chat line "+text, func(m *msg) bool { return m.T == "chat" && line(c.chats[len(c.chats)-1]) })
}

func (c *tclient) waitState(what string, pred func(*state) bool) *state {
	c.t.Helper()
	if c.s != nil && pred(c.s) {
		return c.s
	}
	c.until(10*time.Second, what, func(m *msg) bool { return m.T == "update" && pred(m.state) })
	return c.s
}

// create makes a room and waits for the first state.
func (c *tclient) create(name string, opts map[string]any, training, start bool) {
	c.t.Helper()
	c.send(map[string]any{"t": "create", "name": name, "opts": opts, "training": training, "start": start})
	c.waitType("joined")
	c.waitType("chatlog")
	c.waitType("update")
}

// join enters a room and waits for joined, the chat log and a state.
func (c *tclient) join(code, name, token string) {
	c.t.Helper()
	c.send(map[string]any{"t": "join", "code": code, "name": name, "token": token})
	m := c.until(5*time.Second, "joined", func(m *msg) bool { return m.T == "joined" || m.T == "error" })
	if m.T == "error" {
		c.t.Fatalf("join failed: %s %s", m.Code, m.errMsg())
	}
	c.waitType("chatlog")
	c.waitType("update")
}

// myTurn reports whether the latest state awaits this client's action.
func (c *tclient) myTurn() bool {
	s := c.s
	if s == nil || s.Turn != s.You {
		return false
	}
	switch s.Phase {
	case phaseAuction, phaseDiscard, phaseTrump, phaseBid, phasePlay:
		return true
	}
	return false
}

// actHint follows the training hint on the client's turn.
func (c *tclient) actHint() {
	c.t.Helper()
	h := c.s.Hint
	switch {
	case h == nil:
		c.t.Fatalf("no hint in phase %s", c.s.Phase)
	case h.Suit != nil:
		c.send(map[string]any{"t": "trump", "suit": h.Suit.String()})
	case h.Play != nil:
		c.send(map[string]any{"t": "bid", "play": *h.Play})
	case h.Card != nil:
		c.send(map[string]any{"t": "play", "card": h.Card.String()})
	}
}

// actRandom makes a random legal decision on the client's turn.
func (c *tclient) actRandom(rng *rand.Rand) {
	c.t.Helper()
	s := c.s
	switch s.Phase {
	case phaseTrump:
		for {
			su := game.Suit(rng.IntN(4))
			if s.Forced && s.Turned != nil && su == *s.Turned {
				continue
			}
			c.send(map[string]any{"t": "trump", "suit": su.String()})
			return
		}
	case phaseBid:
		c.send(map[string]any{"t": "bid", "play": rng.IntN(3) == 0})
	case phaseAuction:
		bid := 0
		if rng.IntN(3) == 0 {
			bid = game.MinBid
			if s.Bidder >= 0 {
				bid = s.Bid + game.BidStep
			}
		}
		c.send(map[string]any{"t": "auction", "bid": bid})
	case phaseDiscard:
		h := slices.Clone(s.Hand)
		rng.Shuffle(len(h), func(i, j int) { h[i], h[j] = h[j], h[i] })
		c.send(map[string]any{"t": "discard", "cards": []string{h[0].String(), h[1].String()}})
	case phasePlay:
		c.send(map[string]any{"t": "play", "card": s.Legal[rng.IntN(len(s.Legal))].String()})
	}
}

// The outcomes of the fake grades, the choice's and the other option's:
// (66−98) − (60.4−102.4) = 10 for a loss, (90−72) − (84−78) = 12 for a gain.
var (
	fakeLost = [2]Outcome{{Us: 60.4, Them: 102.4, NatUs: 0.42}, {Us: 66, Them: 98, NatUs: 0.25, NatThem: 0.05}}
	fakeGain = [2]Outcome{{Us: 90, Them: 72}, {Us: 84, Them: 78, NatThem: 0.1}}
)
