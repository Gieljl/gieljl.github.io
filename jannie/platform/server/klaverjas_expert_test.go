package server

import (
	"encoding/json"
	"math/rand/v2"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"jannie/games/klaverjas/game"
)

// TestParseAct: every kind of decision reads back from its token.
func TestParseAct(t *testing.T) {
	card := func(s string) game.Card { return game.MustParseCards(s)[0] }
	for _, tc := range []struct {
		seat game.Seat
		a    action
	}{
		{2, action{kind: actPlay, card: card("AS")}},
		{3, action{kind: actPlay, card: card("TH")}}, // a 10, not a trump choice
		{1, action{kind: actBid, play: true}},
		{3, action{kind: actBid}},
		{0, action{kind: actTrump, suit: game.Hearts}},
		{1, action{kind: actAuction, bid: 90}},
		{2, action{kind: actAuction}},
		{0, action{kind: actDiscard, cards: [2]game.Card{card("JS"), card("7H")}}},
	} {
		tok := actToken(tc.seat, tc.a)
		seat, a, err := parseAct(tok)
		if err != nil || seat != tc.seat || a != tc.a {
			t.Errorf("%q: seat %v, %+v, %v; want seat %v, %+v", tok, seat, a, err, tc.seat, tc.a)
		}
	}
	for _, bad := range []string{"", "0", "4AS", "0tX", "0b2", "0dAS", "0ZZ", "0a9x"} {
		if _, _, err := parseAct(bad); err == nil {
			t.Errorf("%q reads as a decision", bad)
		}
	}
}

// TestExpertFrom: option from deals that one hand of the seed, with its
// dealer, cards and turned suit, as the whole match deals it, numbered as
// in the whole match; the match is that hand alone. Outside the expert
// mode the option does not hold.
func TestExpertFrom(t *testing.T) {
	s, _, _ := newTestServer(t)
	whole := newRoom(s, "TEST")
	defer whole.stop()
	whole.seats[0] = newHuman("A")
	whole.opts.Seed = 77
	whole.opts.TrumpMode = game.Gedraaid
	whole.startMatch()
	whole.startHand()
	whole.startHand()

	one := newRoom(s, "TEST")
	defer one.stop()
	one.seats[0] = newHuman("A")
	one.expert = true
	one.opts.Seed, one.opts.From, one.opts.Hands = 77, 3, 4
	one.opts.TrumpMode = game.Gedraaid
	one.startMatch()
	if !slices.ContainsFunc(one.chat, func(m chatMsg) bool {
		return m.Sys && m.Text == "Het spel begint: potje 3, Gedraaid/Amsterdams. Veel plezier!"
	}) {
		t.Errorf("no start line in %+v", one.chat)
	}
	if one.handNo != 3 || one.lastHand() != 3 || whole.handNo != 3 || whole.lastHand() != 16 {
		t.Errorf("hand %d of %d, whole match: hand %d of %d", one.handNo, one.lastHand(), whole.handNo, whole.lastHand())
	}
	a, b := whole.dealt, one.dealt
	if a.dealer != b.dealer || a.turned != b.turned {
		t.Errorf("dealer %v, turned %v; with from: %v, %v", a.dealer, a.turned, b.dealer, b.turned)
	}
	for i := range a.hands {
		if !slices.Equal(a.hands[i], b.hands[i]) {
			t.Errorf("seat %d: %v, with from %v", i, a.hands[i], b.hands[i])
		}
	}

	one.opts.From, one.opts.Hands = 22, 16
	one.expertOpts()
	if one.opts.Hands != 24 {
		t.Errorf("hand 22 in a match of %d", one.opts.Hands)
	}
	whole.opts.From = 3
	whole.expertOpts()
	if whole.opts.From != 0 {
		t.Errorf("option from %d outside the expert mode", whole.opts.From)
	}
}

// TestExpertMatch plays an expert match: it starts at once, alone against
// three bots, with open cards, and nobody can join; the state says expert.
// The expert asks the reasoning for their own card in trick 1 and for
// their decision now; a seat in the question is ignored, so a bot's
// decision cannot be asked about. They comment on their own card; the
// game log has the match and the comment, about the expert's own seat.
func TestExpertMatch(t *testing.T) {
	dir := t.TempDir()
	srv, ts, ai := newTestServer(t, func(s *Server) { s.games = newGameLog(dir, s.log) })
	c := dial(t, ts)
	c.send(map[string]any{"t": "create", "name": "Expert", "expert": true,
		"opts": map[string]any{"hands": 4, "seed": 4242, "open": true, "players": 2, "trumpMode": "gedraaid"}})
	c.waitType("joined")
	c.waitType("chatlog")
	s := c.waitState("the deal", func(s *state) bool { return s.Phase != phaseLobby })
	if !s.Expert || s.Training || len(s.Players) != 4 || !s.Opts.Open || s.Opts.Seed != 4242 {
		t.Fatalf("expert %v, training %v, %d players, opts %+v", s.Expert, s.Training, len(s.Players), s.Opts)
	}
	for k := 1; k < 4; k++ {
		if !s.Players[k].Bot {
			t.Errorf("seat %d: %+v", k, s.Players[k])
		}
	}
	other := dial(t, ts)
	other.send(map[string]any{"t": "join", "code": c.code, "name": "Gast"})
	other.waitError(errFull)

	// On: until the expert's turn to play, after their own card in trick 1.
	drive(t, func() bool { return c.s.Phase == phasePlay && c.myTurn() && len(c.s.Hand) < 8 }, c)
	s = c.s
	r := roomOf(t, srv, c.code)
	var first game.Card
	call(r, func() {
		for _, tok := range strings.Fields(r.acts) {
			if seat, a, _ := parseAct(tok); seat == 0 && a.kind == actPlay {
				first = a.card
				break
			}
		}
	})

	why := func(args map[string]any) whyMsg {
		t.Helper()
		args["t"], args["hand"] = "why", s.HandNo
		c.send(args)
		m := c.until(5*time.Second, "why", func(m *msg) bool { return m.T == "why" || m.T == "error" })
		if m.T == "error" {
			t.Fatalf("why %v: %s", args, m.errMsg())
		}
		var w whyMsg
		if err := json.Unmarshal(m.raw, &w); err != nil {
			t.Fatal(err)
		}
		return w
	}
	w := why(map[string]any{"trick": 1})
	if w.Played == nil || w.Played.Card == nil || *w.Played.Card != first || w.Seat != 0 || w.Trick != 1 || w.Hint.Card == nil || w.Worlds != 1 {
		t.Errorf("why %v, the expert's card in trick 1: %+v", first, w)
	}
	now := 9 - len(s.Hand)
	w = why(map[string]any{"trick": now, "seat": 1})
	if w.Played != nil || w.Seat != 0 || w.Trick != now || len(w.Options) != len(s.Legal) || w.Rule == "" ||
		w.SterkWhy != "waarom sterk" || w.HintWhy != "waarom de tip" {
		t.Errorf("why now (trick %d, legal %v), asked with seat 1: %+v", now, s.Legal, w)
	}
	for _, o := range w.Options {
		if (o.Value == 10) != (o.Why == "") {
			t.Errorf("why now: option %+v, the reason under the best", o)
		}
	}
	if n := ai.reasoned.Load(); n != 2 {
		t.Errorf("%d explanations, want 2", n)
	}
	c.send(map[string]any{"t": "why", "hand": s.HandNo, "trick": 8})
	c.waitError(errInvalid)
	c.send(map[string]any{"t": "feedback", "text": "Waarom niet hoger?", "hand": s.HandNo, "trick": 1, "seat": 1})
	c.waitType("saved")

	playGame(t, rand.New(rand.NewPCG(31, 32)), 4, c)
	if s = c.s; !s.Expert {
		t.Errorf("game over: expert %v", s.Expert)
	}

	srv.games.close()
	recs := readGameLog(t, filepath.Join(dir, "games-"+time.Now().UTC().Format("2006-01")+".jsonl"))
	kinds := map[string]int{}
	for _, r := range recs {
		kinds[r["t"].(string)]++
		switch r["t"] {
		case "match":
			var m logMatch
			remarshal(t, r, &m)
			if !m.Expert || m.Seed != 4242 {
				t.Errorf("match record %+v", m)
			}
		case "feedback":
			var f logFeedback
			remarshal(t, r, &f)
			if f.Seat != 0 || f.By == nil || *f.By != 0 || f.Hand != 1 || f.Trick != 1 {
				t.Errorf("feedback record %+v", f)
			}
		}
	}
	if kinds["match"] != 1 || kinds["feedback"] != 1 || kinds["mark"] != 0 {
		t.Errorf("records %v", kinds)
	}
}

// TestExpertSeat: the expert sits at the seat they chose, host there, with
// bots at the others, and holds the cards that seat holds in a normal game
// with the same seed, the same seat dealing. A seat outside 0–3, or in
// another game, puts the creator at seat 0.
func TestExpertSeat(t *testing.T) {
	srv, ts, _ := newTestServer(t)
	whole := newRoom(srv, "TEST")
	defer whole.stop()
	whole.seats[0] = newHuman("A")
	whole.opts.Seed = 77
	whole.startMatch()

	c := dial(t, ts)
	c.send(map[string]any{"t": "create", "name": "Expert", "expert": true, "seat": 2, "opts": map[string]any{"hands": 4, "seed": 77}})
	if m := c.waitType("joined"); m.Seat != 2 {
		t.Errorf("joined at seat %d, want 2", m.Seat)
	}
	s := c.waitState("the deal", func(s *state) bool { return s.Phase != phaseLobby })
	if s.You != 2 || s.Host != 2 || s.Players[2].Bot || s.Players[2].Name != "Expert" {
		t.Errorf("you %d, host %d, seat 2 %+v", s.You, s.Host, s.Players[2])
	}
	for _, k := range []int{0, 1, 3} {
		if !s.Players[k].Bot {
			t.Errorf("seat %d: %+v", k, s.Players[k])
		}
	}
	r := roomOf(t, srv, c.code)
	call(r, func() {
		a, b := whole.dealt, r.dealt
		if r.handNo != 1 || a.dealer != b.dealer || a.turned != b.turned || !slices.Equal(a.hands[2], b.hands[2]) {
			t.Errorf("hand %d: dealer %v, turned %v, seat 2 %v; in a normal game %v, %v, %v", r.handNo, b.dealer, b.turned, b.hands[2], a.dealer, a.turned, a.hands[2])
		}
	})

	for _, tc := range []struct {
		expert, training bool
		seat             int
	}{{false, false, 2}, {false, true, 3}, {true, false, 4}, {true, false, -1}} {
		c := dial(t, ts)
		c.send(map[string]any{"t": "create", "name": "Piet", "expert": tc.expert, "training": tc.training, "seat": tc.seat, "opts": map[string]any{"hands": 4}})
		m := c.until(5*time.Second, "joined", func(m *msg) bool { return m.T == "joined" || m.T == "error" })
		if m.T != "joined" || m.Seat != 0 {
			t.Errorf("%+v: %s at seat %d (%s)", tc, m.T, m.Seat, m.errMsg())
			continue
		}
		if s := c.waitState("a state", func(*state) bool { return true }); s.You != 0 || s.Host != 0 {
			t.Errorf("%+v: you %d, host %d", tc, s.You, s.Host)
		}
	}
}

// TestWhyAwaited: before the first card, trick 0 is the seat's last
// decision, but on its turn the one awaited now: in gedraaid, voorhand who
// passed and must now choose trump once everyone passed.
func TestWhyAwaited(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	defer r.stop()
	r.expert = true
	r.seats[0] = newHuman("A")
	r.opts.TrumpMode = game.Gedraaid
	r.firstHand, r.handNo = 1, 1
	r.dealt = dealtCards{dealer: 3, hands: game.Shuffle(rand.New(rand.NewPCG(3, 4))), turned: game.Hearts}
	r.deal = r.dealOf(r.dealt)
	r.phase = string(r.deal.Phase())
	act := func(tok string) {
		t.Helper()
		seat, a, err := parseAct(tok)
		if err == nil {
			err = applyAct(r.deal, seat, a)
		}
		if err != nil {
			t.Fatalf("%s: %v", tok, err)
		}
		r.acts = strings.TrimSpace(r.acts + " " + tok)
		r.phase = string(r.deal.Phase())
	}
	ask := func(want choiceJSON, awaited bool) {
		t.Helper()
		_, done, ok := r.decision(1, 0, 0)
		switch {
		case !ok:
			t.Errorf("after %q: no decision", r.acts)
		case awaited != (done == nil):
			t.Errorf("after %q: done %+v, want awaited %v", r.acts, done, awaited)
		case done != nil && string(mustJSON(choiceOf(*done))) != string(mustJSON(want)):
			t.Errorf("after %q: %s, want %s", r.acts, mustJSON(choiceOf(*done)), mustJSON(want))
		}
	}
	no, clubs := false, game.Clubs
	ask(choiceJSON{}, true) // voorhand's bid
	act("0b0")
	ask(choiceJSON{Play: &no}, false) // the pass, while the others bid
	act("1b0")
	act("2b0")
	act("3b0")
	ask(choiceJSON{}, true) // everyone passed: trump, awaited
	act("0tC")
	ask(choiceJSON{Suit: &clubs}, false)
}

// gateAI is the fake AI whose explanations wait for the gate; it counts
// the most that ran at once.
type gateAI struct {
	fakeAI
	gate          chan struct{}
	mu            sync.Mutex
	running, most int
}

func (a *gateAI) Explain(v game.View) Explanation {
	a.mu.Lock()
	a.running++
	a.most = max(a.most, a.running)
	a.mu.Unlock()
	<-a.gate
	a.mu.Lock()
	a.running--
	a.mu.Unlock()
	return a.fakeAI.Explain(v)
}

// TestWhyOneAtATime: the expert's why runs one search at a time over all
// rooms, as each takes every core, and a room that asks again meanwhile
// gets limiet.
func TestWhyOneAtATime(t *testing.T) {
	ai := &gateAI{gate: make(chan struct{})}
	s, _ := newTestServerWith(t, ai)
	c := newClient(s, nil, "1.2.3.4", "test")
	hand, trick := 1, 0
	ask := func(r *room) { r.cmdWhy(c, 0, &inMsg{Hand: &hand, Trick: &trick}) }
	var rooms []*room
	for _, code := range []string{"WHYA", "WHYB"} {
		r := newRoom(s, code)
		defer r.stop()
		r.expert, r.phase = true, phaseGameOver
		r.seats[0] = newHuman("A")
		r.opts.TrumpMode = game.Gedraaid
		r.firstHand = 1
		r.handDealt = []dealtCards{{dealer: 0, hands: game.Shuffle(rand.New(rand.NewPCG(3, 4))), turned: game.Hearts}}
		r.handActs = []string{"1b0 2b0 3b0 0b1"}
		ask(r) // why the expert played
		rooms = append(rooms, r)
	}
	running := func() int {
		ai.mu.Lock()
		defer ai.mu.Unlock()
		return ai.running
	}
	waitFor(t, "a search", func() bool { return running() > 0 })
	time.Sleep(20 * time.Millisecond) // time for a second one to start, were it let in
	ask(rooms[0])
	var m struct{ T, Code string }
	if err := json.Unmarshal(<-c.out, &m); err != nil || m.Code != errLimit {
		t.Errorf("a second why in the room: %+v %v", m, err)
	}
	close(ai.gate)
	waitFor(t, "both explanations", func() bool { return ai.reasoned.Load() == 2 })
	ai.mu.Lock()
	defer ai.mu.Unlock()
	if ai.most != 1 {
		t.Errorf("%d searches at once", ai.most)
	}
}

// TestWhyInTraining: in training the player asks the reasoning of their
// own decision and comments on it while the match runs, as the expert does.
func TestWhyInTraining(t *testing.T) {
	_, ts, ai := newTestServer(t)
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"hands": 4}, true, true)
	drive(t, func() bool { return c.s.Phase == phasePlay && c.myTurn() && len(c.s.Legal) > 1 }, c)
	trick := 9 - len(c.s.Hand)
	c.send(map[string]any{"t": "why", "hand": c.s.HandNo, "trick": trick})
	m := c.until(5*time.Second, "why", func(m *msg) bool { return m.T == "why" || m.T == "error" })
	var w whyMsg
	if err := json.Unmarshal(m.raw, &w); err != nil || m.T != "why" || w.Trick != trick || w.Played != nil || len(w.Options) != len(c.s.Legal) {
		t.Fatalf("why in training: %s", m.raw)
	}
	if n := ai.reasoned.Load(); n != 1 {
		t.Errorf("%d explanations, want 1", n)
	}
	c.send(map[string]any{"t": "feedback", "text": "Waarom deze?", "hand": c.s.HandNo, "trick": trick})
	c.waitType("saved")
}

// TestMatchViewSignals: the reasoning reads the signals the table plays
// with by now: in the lesson on signals none before Juf Jannie introduced
// them, in the other lessons none at all.
func TestMatchViewSignals(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	defer r.stop()
	r.training, r.opts.Lesson = true, planSeinen
	d := game.NewDeal(0, game.Shuffle(rand.New(rand.NewPCG(1, 2))), game.Utrechts, game.Amsterdams, 0)
	if v := r.matchView(d, 0, 1); *v.Signals != (game.Signals{}) {
		t.Errorf("before the lesson on signals: %+v", *v.Signals)
	}
	r.taught = map[string]int{lessonSignals: 1}
	if v := r.matchView(d, 0, 1); *v.Signals != r.opts.Signals || *v.Signals == (game.Signals{}) {
		t.Errorf("after it: %+v, want %+v", *v.Signals, r.opts.Signals)
	}
	r.opts.Lesson, r.taught = planRoem, nil
	if v := r.matchView(d, 0, 1); *v.Signals != (game.Signals{}) {
		t.Errorf("in the lesson on roem: %+v", *v.Signals)
	}
}

// TestWhyAwaitedInLesson: in a lesson the reasoning of the decision awaited
// is answered, also in its last hand and with tips off, as the reasoning
// sheet asks it then.
func TestWhyAwaitedInLesson(t *testing.T) {
	for _, tips := range []bool{true, false} {
		s, _, ai := newTestServer(t)
		r := lessonRoomOn(s)
		defer r.stop()
		r.opts.Tips, r.opts.Hands, r.handNo, r.firstHand = tips, lessonLength, lessonLength, 1
		r.phase = phasePlay
		r.dealt = dealtCards{dealer: 3, hands: game.Shuffle(rand.New(rand.NewPCG(3, 4))), turned: game.Hearts}
		r.deal = r.dealOf(r.dealt)
		r.deal.ChooseTrump(0, game.Hearts)
		r.acts = actToken(0, action{kind: actTrump, suit: game.Hearts})
		c := newClient(s, nil, "1.2.3.4", "test")
		hand, trick := lessonLength, 1
		r.cmdWhy(c, 0, &inMsg{Hand: &hand, Trick: &trick})
		waitFor(t, "the reasoning", func() bool { return ai.reasoned.Load() == 1 })
		if len(c.out) != 0 {
			t.Errorf("tips %v: why awaited: %s", tips, <-c.out)
		}
	}
}
