package server

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"jannie/games/klaverjas/game"
)

// gradeAI is the fake AI that remembers every grade it gives, per seat.
// With a gate, every grade waits until the gate is closed.
type gradeAI struct {
	fakeAI
	gate   chan struct{}
	mu     sync.Mutex
	grades map[game.Seat][]gradeRec
}

type gradeRec struct {
	v game.View
	c Choice
	g Grade
}

func newGradeAI(gated bool) *gradeAI {
	a := &gradeAI{grades: make(map[game.Seat][]gradeRec)}
	if gated {
		a.gate = make(chan struct{})
	}
	return a
}

func (a *gradeAI) Grade(v game.View, c Choice) Grade {
	if a.gate != nil {
		<-a.gate
	}
	g := a.fakeAI.Grade(v, c)
	a.mu.Lock()
	a.grades[v.Seat] = append(a.grades[v.Seat], gradeRec{v, c, g})
	a.mu.Unlock()
	return g
}

// wantReview is the review the grades of seat i add up to.
func (a *gradeAI) wantReview(i game.Seat) reviewState {
	a.mu.Lock()
	defer a.mu.Unlock()
	var w reviewState
	var stake, lost float64
	for _, r := range a.grades[i] {
		w.Choices++
		stake += r.g.Stake
		lost += r.g.Lost
		best := 0
		if r.g.Lost == 0 {
			best = 1
		}
		switch {
		case r.c.Card != nil && len(r.v.Current.Cards) == 0:
			w.Leads[0] += best
			w.Leads[1]++
		case r.c.Card == nil:
			w.Trumps[0] += best
			w.Trumps[1]++
		}
		if r.g.Lost > 0 {
			w.LostN++
		}
		if r.g.Gain > 0 {
			w.StrongN++
		}
		if r.c.Play != nil && *r.c.Play && r.g.Nat > riskyNat {
			w.Risky[0]++
		}
	}
	w.Pct = int(math.Round(100 * (1 - lost/stake)))
	w.Lost = int(math.Round(lost))
	return w
}

// TestReviewAtGameOver plays matches with two humans and checks that each
// gets the review of their own decisions, and nobody else's, only at game
// over.
func TestReviewAtGameOver(t *testing.T) {
	for _, mode := range []string{"utrechts", "gedraaid"} {
		t.Run(mode, func(t *testing.T) {
			ai := newGradeAI(false)
			_, ts := newTestServerWith(t, ai)
			host := dial(t, ts)
			host.create("Host", map[string]any{"hands": 4, "trumpMode": mode, "signals": map[string]any{"boerOverBoer": true}}, false, false)
			guest := dial(t, ts)
			guest.join(host.code, "Gast", "")
			host.waitState("both seated", func(s *state) bool { return s.Players[guest.seat] != nil && !s.Players[guest.seat].Bot })
			host.send(map[string]any{"t": "start"})
			playGame(t, rand.New(rand.NewPCG(11, 12)), 4, host, guest)
			// The analysis sees the table's agreements on signals.
			ai.mu.Lock()
			for _, rec := range ai.grades[game.Seat(host.seat)] {
				if want := (game.Signals{Aas: true, KleintjeBoer: true, HoogLaag: true, BoerOverBoer: true}); rec.v.Signals == nil || *rec.v.Signals != want {
					t.Errorf("graded with signals %+v, want %+v", rec.v.Signals, want)
					break
				}
			}
			ai.mu.Unlock()
			for _, c := range []*tclient{host, guest} {
				s := c.waitState("the review", func(s *state) bool { return s.Review != nil && !s.Review.Pending })
				got, want := *s.Review, ai.wantReview(game.Seat(c.seat))
				if want.Choices == 0 {
					t.Fatalf("seat %d made no graded decision", c.seat)
				}
				if got.Hands != 4 || got.Luck != 3 {
					t.Errorf("seat %d: %d hands, luck %d; want 4 hands, luck 3", c.seat, got.Hands, got.Luck)
				}
				if got.Choices != want.Choices || got.Pct != want.Pct || got.Lost != want.Lost || got.LostN != want.LostN ||
					got.StrongN != want.StrongN || got.Leads != want.Leads || got.Trumps != want.Trumps || got.Risky[0] != want.Risky[0] {
					t.Errorf("seat %d review\n got  %+v\n want %+v", c.seat, got, want)
				}
				if mode == "utrechts" && got.Risky != [2]int{} {
					t.Errorf("seat %d: risky bids %v in utrechts", c.seat, got.Risky)
				}
				checkMoments(t, c.seat, got.Missed, min(got.LostN, reviewListed), true)
				checkMoments(t, c.seat, got.Strong, min(got.StrongN, reviewListed), false)
				checkReplay(t, c.seat, got.Replay, 4)
				// Every decision is timed, also a lone legal card; the
				// other human is the comparison.
				if sp := got.Speed; sp == nil || sp.N < got.Choices || sp.Others == nil || sp.Others.N == 0 ||
					sp.Median > sp.Slowest.Ms || sp.Slowest.Ms > sp.Total || sp.Slowest.Hand < 1 || sp.Slowest.Hand > 4 {
					t.Errorf("seat %d speed %+v (others %+v) for %d choices", c.seat, sp, sp.Others, got.Choices)
				}
			}
			if a, b := host.s.Review.Speed, guest.s.Review.Speed; a.Others.N != b.N || b.Others.N != a.N || a.Others.Total != b.Total {
				t.Errorf("the speeds do not mirror: %+v %+v / %+v %+v", a, a.Others, b, b.Others)
			}
		})
	}
}

// checkMoments checks the listed moments of seat: n of them, in the order
// played, each with the trick or hand it was decided on.
func checkMoments(t *testing.T, seat int, ms []moment, n int, missed bool) {
	t.Helper()
	if len(ms) != n {
		t.Errorf("seat %d: %d moments listed, want %d", seat, len(ms), n)
	}
	for k, m := range ms {
		if k > 0 && (m.Hand < ms[k-1].Hand || m.Hand == ms[k-1].Hand && m.Trick <= ms[k-1].Trick) {
			t.Errorf("seat %d: moments out of order: %+v after %+v", seat, m, ms[k-1])
		}
		if missed != (m.Better != nil) || m.Points != map[bool]int{true: 10, false: 12}[missed] {
			t.Errorf("seat %d: moment %+v", seat, m)
		}
		// The outcomes of the fake grades (fakeLost, fakeGain), weaker
		// option first.
		want := moment{Us: 6, Them: -4, Nat: [2]int{42, 25}, NatThem: [2]int{0, 5}}
		if !missed {
			want = moment{Us: 6, Them: -6, NatThem: [2]int{10, 0}}
		}
		if m.Us != want.Us || m.Them != want.Them || m.Nat != want.Nat || m.NatThem != want.NatThem || m.Us-m.Them != m.Points {
			t.Errorf("seat %d: moment %+v, want us %d them %d nat %v %v", seat, m, want.Us, want.Them, want.Nat, want.NatThem)
		}
		if missed == (m.Alt != nil) || !missed && (m.Alt.Card == nil || *m.Alt.Card == *m.Played.Card) {
			t.Errorf("seat %d: moment %+v with alternative %+v", seat, m, m.Alt)
		}
		switch {
		case m.Played.Card != nil:
			if m.Table == nil || len(m.Table.Cards) != 4 || !slices.Contains(m.Table.Cards, game.Played{Seat: game.Seat(seat), Card: *m.Played.Card}) {
				t.Errorf("seat %d: card moment %+v without its trick", seat, m)
			}
			if m.Why != "de eerste kaart die mag." {
				t.Errorf("seat %d: reason %q, from %q", seat, m.Why, m.Text)
			}
		case len(m.Cards) != 8 || m.Trick != 0:
			t.Errorf("seat %d: trump or bid moment %+v without the hand", seat, m)
		}
	}
}

// checkReplay checks the replay of seat's review: every hand, each seat's
// eight cards as dealt, every card played once in its eight tricks.
func checkReplay(t *testing.T, seat int, hands []replayHand, n int) {
	t.Helper()
	if len(hands) != n {
		t.Fatalf("seat %d: %d hands in the replay, want %d", seat, len(hands), n)
	}
	for h, rh := range hands {
		var dealt, played []game.Card
		for s, cards := range rh.Cards {
			if len(cards) != 8 {
				t.Errorf("seat %d, hand %d: seat %d was dealt %v", seat, h+1, s, cards)
			}
			dealt = append(dealt, cards...)
		}
		for _, tr := range rh.Tricks {
			for _, p := range tr.Cards {
				if !slices.Contains(rh.Cards[p.Seat], p.Card) {
					t.Errorf("seat %d, hand %d: seat %d played %v, not dealt to it", seat, h+1, p.Seat, p.Card)
				}
				played = append(played, p.Card)
			}
		}
		if len(rh.Tricks) != 8 || len(played) != 32 || distinct(dealt) != 32 {
			t.Errorf("seat %d, hand %d: %d tricks, %d cards played, %d dealt", seat, h+1, len(rh.Tricks), len(played), len(dealt))
		}
	}
}

// distinct counts the different cards in cards.
func distinct(cards []game.Card) int {
	seen := map[game.Card]bool{}
	for _, c := range cards {
		seen[c] = true
	}
	return len(seen)
}

// TestReviewPending: grades still out at game over show as pending, and
// the review follows when the last one is in.
func TestReviewPending(t *testing.T) {
	ai := newGradeAI(true)
	_, ts := newTestServerWith(t, ai)
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4}, false, true)
	playGame(t, rand.New(rand.NewPCG(13, 14)), 4, c)
	if r := c.s.Review; r == nil || !r.Pending {
		t.Fatalf("review at game over with every grade held back: %+v", r)
	}
	close(ai.gate)
	s := c.waitState("the review", func(s *state) bool { return s.Review != nil && !s.Review.Pending })
	if want := ai.wantReview(0); s.Review.Choices != want.Choices || s.Review.Pct != want.Pct {
		t.Errorf("review %+v, want %+v", *s.Review, want)
	}
}

func TestRoemAdded(t *testing.T) {
	view := func(trump game.Suit, table, legal string) *game.View {
		v := &game.View{Trump: trump, Legal: game.MustParseCards(legal)}
		for k, c := range game.MustParseCards(table) {
			v.Current.Cards = append(v.Current.Cards, game.Played{Seat: game.Seat(k), Card: c})
		}
		return v
	}
	for _, tc := range []struct {
		trump        game.Suit
		table, legal string
		card         string
		want         int
	}{
		{game.Hearts, "7S 8S", "9S AS", "9S", 20}, // driekaart
		{game.Hearts, "7S 8S", "9S AS", "AS", 0},
		{game.Hearts, "7S 8S", "9S", "9S", 0},  // no choice
		{game.Hearts, "KH", "QH 7H", "QH", 20}, // stuk
		{game.Clubs, "KH", "QH 7H", "QH", 0},   // no trump: no stuk
		{game.Hearts, "", "QH 7H", "QH", 0},    // a lead adds nothing
	} {
		v := view(tc.trump, tc.table, tc.legal)
		if got := roemAdded(v, game.MustParseCards(tc.card)[0]); got != tc.want {
			t.Errorf("%v on %q (legal %q, trump %v): %d roem, want %d", tc.card, tc.table, tc.legal, tc.trump, got, tc.want)
		}
	}
}

// TestReviewTrick: roem a human's card gave counts once the opponents take
// the trick, and not when their own team does.
func TestReviewTrick(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	r.seats[1] = newHuman("A")
	r.seats[3] = newHuman("B")
	r.reviewOf(1).roemAt = 20
	r.reviewOf(3).roemAt = 50
	r.reviewTrick(game.Trick{Winner: 0})
	if rv := r.seats[1].review; rv.roem != 20 || rv.roemTimes != 1 || rv.roemAt != 0 {
		t.Errorf("seat 1 after an opponent's trick: %+v", rv)
	}
	if rv := r.seats[3].review; rv.roem != 50 || rv.roemTimes != 1 {
		t.Errorf("seat 3 after an opponent's trick: %+v", rv)
	}
	r.reviewOf(1).roemAt = 20
	r.reviewTrick(game.Trick{Winner: 3})
	if rv := r.seats[1].review; rv.roem != 20 || rv.roemTimes != 1 || rv.roemAt != 0 {
		t.Errorf("seat 1 after its own team's trick: %+v", rv)
	}
}

// TestReviewJSON: a review without moments lists none, as [] on the wire.
func TestReviewJSON(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	r.seats[0] = newHuman("A")
	rv := r.reviewOf(0)
	rv.choices, rv.stake = 1, 20
	r.phase = phaseGameOver
	b := string(mustJSON(r.reviewFor(0)))
	for _, want := range []string{`"strong":[]`, `"missed":[]`, `"pct":100`, `"pending":false`, `"speed":null`, `"replay":[]`} {
		if !strings.Contains(b, want) {
			t.Errorf("review %s lacks %s", b, want)
		}
	}
	r.phase = phasePlay
	if r.reviewFor(0) != nil {
		t.Error("a review before game over")
	}
}

// TestReviewSpeed: the median and total of the player's think times, the
// slowest decision, the other people at the table; a turn that opened
// while the player was away, or in which their connection dropped, is not
// timed.
func TestReviewSpeed(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	r.seats[0] = newHuman("A")
	r.seats[2] = newHuman("B")
	r.phase = phaseGameOver
	sec := func(f float64) time.Duration { return time.Duration(f * float64(time.Second)) }
	r.reviewOf(0).thinks = []think{{sec(2), 1, 1}, {sec(9), 2, 0}, {sec(3), 2, 4}, {sec(1), 3, 8}}
	r.reviewOf(2).thinks = []think{{sec(5), 1, 2}, {sec(7), 1, 3}, {sec(6), 2, 1}}
	sp := r.speedOf(0)
	if sp == nil || sp.speedSum != (speedSum{N: 4, Median: 2500, Total: 15000}) || sp.Slowest.Hand != 2 || sp.Slowest.Trick != 0 ||
		sp.Slowest.Ms != 9000 || sp.Others == nil || *sp.Others != (speedSum{N: 3, Median: 6000, Total: 18000}) {
		t.Errorf("speed %+v, others %+v", sp, sp.Others)
	}
	if sp := r.speedOf(2); sp.Others == nil || sp.Others.Total != 15000 {
		t.Errorf("B's speed %+v, others %+v", sp, sp.Others)
	}
	r.reviewOf(2).thinks = nil
	if sp := r.speedOf(0); sp.Others != nil {
		t.Errorf("others %+v without another timed decision", sp.Others)
	}
	if r.speedOf(2) != nil {
		t.Error("a speed without a timed decision")
	}
	v := &game.View{HandNo: 5, Phase: game.PhasePlay, Tricks: make([]game.Trick, 2)}
	opened := time.Now().Add(-sec(4))
	r.timeChoice(2, opened, true, v)
	if th := r.reviewOf(2).thinks; len(th) != 1 || th[0].hand != 5 || th[0].trick != 3 || th[0].d < sec(4) {
		t.Errorf("thinks %+v", th)
	}
	r.timeChoice(2, opened, false, v)
	if th := r.reviewOf(2).thinks; len(th) != 1 {
		t.Errorf("a turn that opened while the player was away was timed: %+v", th)
	}
	r.seats[2].leftAt = opened.Add(sec(1))
	r.timeChoice(2, opened, true, v)
	if th := r.reviewOf(2).thinks; len(th) != 1 {
		t.Errorf("a turn in which the connection dropped was timed: %+v", th)
	}
}

// TestReviewReset: a new match starts every human's review afresh; a grade
// of the old match that comes in late goes to the old review.
func TestReviewReset(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	r.seats[0] = newHuman("A")
	old := r.reviewOf(0)
	old.choices = 5
	r.fillSeats()
	r.startReviews()
	rv := r.seats[0].review
	if rv == old || rv.choices != 0 {
		t.Errorf("review not started afresh: %+v", rv)
	}
	for i := 1; i < 4; i++ {
		if r.seats[i].review != nil {
			t.Errorf("bot seat %d has a review", i)
		}
	}
	hearts := game.Hearts
	old.add(&game.View{HandNo: 1}, Choice{Suit: &hearts}, Grade{Stake: 20, Lost: 10})
	if rv.choices != 0 || rv.lost != 0 {
		t.Errorf("a late grade of the old match counts: %+v", rv)
	}
	// The old match's analyses still waiting for a slot are skipped.
	ran := false
	s.analyse(old.staleIn(r), func() { ran = true })
	if ran {
		t.Error("an analysis of the old match ran")
	}
	s.analyse(rv.staleIn(r), func() { ran = true })
	if !ran {
		t.Error("an analysis of the new match was skipped")
	}
	r.stop()
	ran = false
	s.analyse(rv.staleIn(r), func() { ran = true })
	if ran {
		t.Error("an analysis ran after the room stopped")
	}
}

// TestReviewOnlyLuckPending: a player without graded choices gets no
// review, even while the luck of their last hand is still being measured.
func TestReviewOnlyLuckPending(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	r.seats[0] = newHuman("A")
	r.phase = phaseGameOver
	rv := r.reviewOf(0)
	rv.pending = 1
	if got := r.reviewFor(0); got != nil {
		t.Errorf("review %+v with only a hand measurement out", got)
	}
	rv.pending, rv.grading = 2, 1
	if got := r.reviewFor(0); got == nil || !got.Pending {
		t.Errorf("review %+v with a grade out", got)
	}
}

// TestNoReviewAtSmallTables: the review grades with the search of the
// hints, which plays four players; a table of three or two has none.
func TestNoReviewAtSmallTables(t *testing.T) {
	for _, players := range []int{3, 2} {
		ai := newGradeAI(false)
		_, ts := newTestServerWith(t, ai)
		c := dial(t, ts)
		c.create("Piet", map[string]any{"players": players, "hands": 4}, false, true)
		playGame(t, rand.New(rand.NewPCG(5, uint64(players))), 4, c)
		c.settle()
		if c.s.Phase != phaseGameOver || c.s.Review != nil {
			t.Errorf("%d players: phase %s, review %+v", players, c.s.Phase, c.s.Review)
		}
	}
}

// failAI grades as gradeAI, but its search fails (Grade{}) for a card in
// trick 2 and panics for a card in trick 3.
type failAI struct {
	*gradeAI
	failed, panicked atomic.Int64
}

func (a *failAI) Grade(v game.View, c Choice) Grade {
	switch {
	case c.Card != nil && len(v.Tricks) == 1:
		a.failed.Add(1)
		return Grade{}
	case c.Card != nil && len(v.Tricks) == 2:
		a.panicked.Add(1)
		panic("search")
	}
	return a.gradeAI.Grade(v, c)
}

// TestReviewPerHand: every decision that was analysed lands in the
// replay of its hand, in order, also one without a loss or a gain (only
// its trick and choice); one whose search failed or panicked does not,
// though the review counts it as before.
func TestReviewPerHand(t *testing.T) {
	ai := &failAI{gradeAI: newGradeAI(false)}
	_, ts := newTestServerWith(t, ai)
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 8, "seed": 99, "trumpMode": "gedraaid"}, false, true)
	playGame(t, rand.New(rand.NewPCG(41, 42)), 8, c)
	s := c.waitState("the review", func(s *state) bool { return s.Review != nil && !s.Review.Pending })
	ai.mu.Lock()
	recs := ai.grades[0]
	ai.mu.Unlock()
	if n := len(recs) + int(ai.failed.Load()+ai.panicked.Load()); s.Review.Choices != n {
		t.Errorf("%d choices in the review, %d graded", s.Review.Choices, n)
	}
	kinds := map[string]int{}
	for _, rh := range s.Review.Replay {
		var want []gradeRec
		for _, rec := range recs {
			if rec.v.HandNo == rh.Hand {
				want = append(want, rec)
			}
		}
		if rh.Choices == nil || len(rh.Choices) != len(want) {
			t.Errorf("hand %d: %d choices, %d analysed", rh.Hand, len(rh.Choices), len(want))
			continue
		}
		for k, d := range rh.Choices {
			if k > 0 {
				prev := rh.Choices[k-1]
				if d.Trick < prev.Trick || d.Trick == 0 && prev.Trick == 0 && prev.Played.Play == nil {
					t.Errorf("hand %d: %s after %s", rh.Hand, mustJSON(d), mustJSON(prev))
				}
			}
			i := slices.IndexFunc(want, func(rec gradeRec) bool {
				trick := 0
				if rec.c.Card != nil {
					trick = len(rec.v.Tricks) + 1
				}
				return trick == d.Trick && string(mustJSON(choiceJSON(rec.c))) == string(mustJSON(d.Played))
			})
			if i < 0 {
				t.Errorf("hand %d: %s was not graded", rh.Hand, mustJSON(d))
				continue
			}
			g := want[i].g
			want = slices.Delete(want, i, i+1)
			switch {
			case g.Lost > 0:
				kinds["missed"]++
				if d.Better == nil || d.Alt != nil || d.Points != 10 || d.Nat == nil || d.NatThem == nil || d.Text == "" {
					t.Errorf("hand %d: missed %s", rh.Hand, mustJSON(d))
				}
			case g.Gain > 0:
				kinds["strong"]++
				if d.Better != nil || d.Alt == nil || d.Points != 12 || d.Us != 6 || d.Them != -6 || d.NatThem == nil || *d.NatThem != [2]int{10, 0} || d.Why == "" {
					t.Errorf("hand %d: strong %s", rh.Hand, mustJSON(d))
				}
			default:
				kinds["fine"]++
				if b := string(mustJSON(d)); b != `{"trick":`+fmt.Sprint(d.Trick)+`,"played":`+string(mustJSON(d.Played))+`}` {
					t.Errorf("hand %d: fine %s", rh.Hand, b)
				}
			}
		}
	}
	if kinds["missed"] == 0 || kinds["strong"] == 0 || kinds["fine"] == 0 || ai.failed.Load() == 0 || ai.panicked.Load() == 0 {
		t.Errorf("kinds %v, %d failed, %d panicked: the match did not cover them all", kinds, ai.failed.Load(), ai.panicked.Load())
	}
}

// TestGradedOrder: the decisions of a hand go by trick, and before the
// first card a bid before a trump choice; a choice without a loss or a
// gain has only its trick and the choice. Another hand, or a player
// without a review, has none: [] on the wire.
func TestGradedOrder(t *testing.T) {
	rv := &review{}
	clubs, hearts, no := game.Clubs, game.Hearts, false
	cards := game.MustParseCards("7S AS")
	before, first, second := &game.View{HandNo: 2}, &game.View{HandNo: 2, Tricks: []game.Trick{}}, &game.View{HandNo: 2, Tricks: make([]game.Trick, 1)}
	rv.keep(second, Choice{Card: &cards[0]}, Grade{Stake: 20})
	rv.keep(before, Choice{Suit: &hearts}, Grade{Stake: 20, Lost: 10, Better: Choice{Suit: &clubs},
		Played: fakeLost[0], Other: fakeLost[1], Text: "Kies ♣ als troef: de eerste kleur die mag."})
	rv.keep(first, Choice{Card: &cards[1]}, Grade{Stake: 20, Gain: 12, Obvious: Choice{Card: &cards[0]},
		Played: fakeGain[0], Other: fakeGain[1], Text: "Speel ♠A: de eerste kaart die mag."})
	rv.keep(before, Choice{Play: &no}, Grade{Stake: 20})
	want := `[{"trick":0,"played":{"play":false}},` +
		`{"trick":0,"played":{"suit":"H"},"better":{"suit":"C"},"points":10,"us":6,"them":-4,"nat":[42,25],"natThem":[0,5],"why":"de eerste kleur die mag.","text":"Kies ♣ als troef: de eerste kleur die mag."},` +
		`{"trick":1,"played":{"card":"AS"},"alt":{"card":"7S"},"points":12,"us":6,"them":-6,"nat":[0,0],"natThem":[10,0],"why":"de eerste kaart die mag.","text":"Speel ♠A: de eerste kaart die mag."},` +
		`{"trick":2,"played":{"card":"7S"}}]`
	if got := string(mustJSON(rv.choicesIn(2))); got != want {
		t.Errorf("hand 2:\n got  %s\n want %s", got, want)
	}
	var none *review
	if a, b := string(mustJSON(rv.choicesIn(3))), string(mustJSON(none.choicesIn(2))); a != "[]" || b != "[]" {
		t.Errorf("another hand %s, no review %s", a, b)
	}
}

// TestHandReview: at a table of four a player asks for a finished hand,
// also during the next one, and gets its replay with their graded
// decisions and how many are still out; each grade of it that comes in
// after sends it again. The hand in play, one not dealt yet or the lobby
// has none, and a table of three no review at all.
func TestHandReview(t *testing.T) {
	ai := newGradeAI(true)
	_, ts := newTestServerWith(t, ai)
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4, "seed": 4242}, false, false)
	review := func(hand any) (*msg, handReviewMsg) {
		t.Helper()
		c.send(map[string]any{"t": "handReview", "hand": hand})
		m := c.until(5*time.Second, "handReview", func(m *msg) bool { return m.T == "handReview" || m.T == "error" })
		var hr handReviewMsg
		if m.T == "handReview" {
			if err := json.Unmarshal(m.raw, &hr); err != nil {
				t.Fatal(err)
			}
		}
		return m, hr
	}
	if m, _ := review(1); m.T != "error" || m.Code != errInvalid || m.errMsg() != "Dat potje is er (nog) niet." {
		t.Errorf("in the lobby: %s", m.raw)
	}
	c.send(map[string]any{"t": "start"})
	drive(t, func() bool { return c.phase() == phaseHandEnd }, c)
	for _, hand := range []any{2, 0, nil} {
		if m, _ := review(hand); m.T != "error" || m.Code != errInvalid {
			t.Errorf("hand %v: %s", hand, m.raw)
		}
	}
	m, hr := review(1)
	if m.T != "handReview" || hr.Hand != 1 || hr.Pending == 0 || hr.Replay.Hand != 1 || hr.Replay.Choices == nil || len(hr.Replay.Choices) != 0 {
		t.Fatalf("hand 1, every grade held back: %s", m.raw)
	}
	checkReplay(t, c.seat, []replayHand{hr.Replay}, 1)
	out := hr.Pending
	close(ai.gate)
	for left := out; left > 0; {
		m := c.until(5*time.Second, "a pushed handReview", func(m *msg) bool { return m.T == "handReview" })
		var got handReviewMsg
		json.Unmarshal(m.raw, &got)
		if got.Hand != 1 || got.Pending != left-1 || len(got.Replay.Choices) != out-got.Pending {
			t.Fatalf("push after %d of %d grades: %s", out-left+1, out, m.raw)
		}
		left = got.Pending
	}
	c.send(map[string]any{"t": "ready"})
	c.waitEvent("deal")
	if m, _ := review(2); m.T != "error" || m.Code != errInvalid {
		t.Errorf("the hand in play: %s", m.raw)
	}
	if m, hr := review(1); m.T != "handReview" || hr.Pending != 0 || len(hr.Replay.Choices) != out {
		t.Errorf("hand 1 during hand 2: %s", m.raw)
	}

	three := dial(t, ts)
	three.create("Piet", map[string]any{"players": 3, "hands": 4}, false, true)
	drive(t, func() bool { return three.phase() == phaseHandEnd }, three)
	three.send(map[string]any{"t": "handReview", "hand": 1})
	if m := three.waitError(errInvalid); m.errMsg() != "Terugkijken kan alleen met z'n vieren." {
		t.Errorf("three players: %s", m.errMsg())
	}
}

// TestHandReviewAfterReconnect: grades of the watched hand that came in
// while the player was away reach them when they are back.
func TestHandReviewAfterReconnect(t *testing.T) {
	ai := newGradeAI(true)
	s, ts := newTestServerWith(t, ai)
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4, "seed": 4242}, false, true)
	drive(t, func() bool { return c.phase() == phaseHandEnd }, c)
	c.send(map[string]any{"t": "handReview", "hand": 1})
	m := c.until(5*time.Second, "handReview", func(m *msg) bool { return m.T == "handReview" })
	var before handReviewMsg
	json.Unmarshal(m.raw, &before)
	if before.Pending == 0 {
		t.Fatalf("every grade held back, yet: %s", m.raw)
	}
	s.mu.Lock()
	r := s.rooms[c.code]
	s.mu.Unlock()
	c.conn.CloseNow()
	waitFor(t, "disconnect seen", func() bool {
		var n int
		call(r, func() { n = r.connectedHumans() })
		return n == 0
	})
	close(ai.gate)
	waitFor(t, "grades in", func() bool {
		var n int
		call(r, func() { n = r.seats[0].review.gradingIn[1] })
		return n == 0
	})
	c2 := dial(t, ts)
	c2.join(c.code, "Piet", c.token)
	m = c2.until(5*time.Second, "handReview", func(m *msg) bool { return m.T == "handReview" })
	var after handReviewMsg
	json.Unmarshal(m.raw, &after)
	if after.Hand != 1 || after.Pending != 0 || len(after.Replay.Choices) != before.Pending {
		t.Errorf("back after %d grades: %s", before.Pending, m.raw)
	}
}

// TestHandReviewWithoutReview: a player without a review (no decision of
// theirs graded yet) gets the replay with no choices.
func TestHandReviewWithoutReview(t *testing.T) {
	s, _, _ := newTestServer(t)
	r := newRoom(s, "TEST")
	defer r.stop()
	r.seats[0] = newHuman("A")
	r.phase = phaseHandEnd
	r.firstHand, r.handNo = 1, 1
	r.handDealt = []dealtCards{{dealer: 0, hands: game.Shuffle(rand.New(rand.NewPCG(3, 4))), turned: game.Hearts}}
	r.handActs = []string{""}
	c := newClient(s, nil, "1.2.3.4", "test")
	hand := 1
	r.cmdHandReview(c, 0, &inMsg{Hand: &hand})
	b := string(<-c.out)
	if !strings.HasPrefix(b, `{"t":"handReview","hand":1,"pending":0,"replay":{"hand":1,`) || !strings.HasSuffix(b, `,"choices":[]}}`) {
		t.Errorf("answer %s", b)
	}
}
