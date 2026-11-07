package game

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
	"slices"
	"testing"
)

func TestScoreHand(t *testing.T) {
	tests := []struct {
		name    string
		playing int
		points  [2]int
		roem    [2]int
		score   [2]int
		nat     bool
	}{
		{"gehaald", 0, [2]int{100, 62}, [2]int{}, [2]int{100, 62}, false},
		{"just over half", 0, [2]int{82, 80}, [2]int{}, [2]int{82, 80}, false},
		{"tie is nat", 0, [2]int{81, 81}, [2]int{}, [2]int{0, 162}, true},
		{"nat", 0, [2]int{70, 92}, [2]int{}, [2]int{0, 162}, true},
		{"nat: defenders get all roem", 0, [2]int{90, 72}, [2]int{20, 50}, [2]int{0, 232}, true},
		{"tie with roem is nat", 0, [2]int{71, 91}, [2]int{20, 0}, [2]int{0, 182}, true},
		{"roem saves the playing team", 0, [2]int{70, 92}, [2]int{40, 0}, [2]int{110, 92}, false},
		{"defenders' roem makes it nat", 0, [2]int{100, 62}, [2]int{0, 100}, [2]int{0, 262}, true},
		{"team 1 plays and makes it", 1, [2]int{80, 82}, [2]int{}, [2]int{80, 82}, false},
		{"team 1 plays and goes nat", 1, [2]int{82, 80}, [2]int{20, 0}, [2]int{182, 0}, true},
		{"team 1 plays, roem decides", 1, [2]int{82, 80}, [2]int{0, 20}, [2]int{82, 100}, false},
		{"pit by the playing team", 0, [2]int{162, 0}, [2]int{120, 0}, [2]int{282, 0}, false},
		{"pit by the defenders", 0, [2]int{0, 162}, [2]int{0, 100}, [2]int{0, 262}, true},
		{"pit by the defenders with roem", 1, [2]int{162, 0}, [2]int{140, 0}, [2]int{302, 0}, true},
	}
	for _, tt := range tests {
		score, nat := ScoreHand(tt.playing, tt.points, tt.roem)
		if score != tt.score || nat != tt.nat {
			t.Errorf("%s: ScoreHand = %v, %v; want %v, %v", tt.name, score, nat, tt.score, tt.nat)
		}
	}
}

// fixedHands deals seat 0 all clubs, 1 all hearts, 2 all diamonds, 3 all
// spades, each ordered 7..A.
func fixedHands() [4][]Card {
	return [4][]Card{
		cards("7C 8C 9C TC JC QC KC AC"),
		cards("7H 8H 9H TH JH QH KH AH"),
		cards("7D 8D 9D TD JD QD KD AD"),
		cards("7S 8S 9S TS JS QS KS AS"),
	}
}

func TestDealUtrechtsFlow(t *testing.T) {
	d := NewDeal(0, fixedHands(), Utrechts, Amsterdams, Spades)
	if d.Phase() != PhaseTrump || d.Turn() != 1 || d.Voorhand() != 1 || d.Dealer() != 0 {
		t.Fatalf("start: phase %v turn %v", d.Phase(), d.Turn())
	}
	if _, known := d.Trump(); known || d.TrumpBy() != NoSeat || d.PlayingTeam() != -1 || d.Forced() {
		t.Fatal("trump known before choice")
	}
	if d.Bids() != [4]int{-1, -1, -1, -1} {
		t.Errorf("bids = %v", d.Bids())
	}
	if c := d.Current(); c.Leader != 1 || len(c.Cards) != 0 || c.Winner != NoSeat {
		t.Errorf("current before play = %+v", c)
	}
	mustErr(t, d.ChooseTrump(2, Hearts), ErrNotYourTurn)
	mustErr(t, d.Bid(1, true), ErrWrongPhase)
	mustErr(t, d.Play(1, card("AH")), ErrWrongPhase)
	mustErr(t, d.ChooseTrump(1, Suit(4)), ErrBadSuit)
	if d.AppendLegal(nil) != nil {
		t.Error("legal cards outside phase play")
	}

	// Seat 1 holds all hearts: every trick is theirs, a pit.
	if err := d.ChooseTrump(1, Hearts); err != nil {
		t.Fatal(err)
	}
	if tr, known := d.Trump(); !known || tr != Hearts || d.TrumpBy() != 1 || d.PlayingTeam() != 1 {
		t.Fatalf("trump = %v %v by %v", tr, known, d.TrumpBy())
	}
	if d.Phase() != PhasePlay || d.Turn() != 1 {
		t.Fatalf("after trump: phase %v turn %v", d.Phase(), d.Turn())
	}
	mustErr(t, d.ChooseTrump(1, Hearts), ErrWrongPhase)

	// Seat 1 leads J, 9, A, 10, H, V, 8, 7; the others follow with the same rank.
	order := []Rank{Jack, Nine, Ace, Ten, King, Queen, Eight, Seven}
	for i, r := range order {
		for k := range 4 {
			seat := Seat(1+k) & 3
			if d.Turn() != seat {
				t.Fatalf("trick %d card %d: turn %v, want %v", i, k, d.Turn(), seat)
			}
			mustErr(t, d.Play(seat.Next(), Card{Rank: r, Suit: Hearts}), ErrNotYourTurn)
			suit := [4]Suit{Clubs, Hearts, Diamonds, Spades}[seat]
			if err := d.Play(seat, Card{Rank: r, Suit: suit}); err != nil {
				t.Fatalf("trick %d: %v", i, err)
			}
		}
		cur := d.Current()
		if !cur.Complete() || cur.Winner != 1 || len(d.Tricks()) != i+1 {
			t.Fatalf("trick %d: current %+v, %d tricks", i, cur, len(d.Tricks()))
		}
		if i < 7 && (d.Turn() != 1 || d.Phase() != PhasePlay) {
			t.Fatalf("after trick %d: turn %v phase %v", i, d.Turn(), d.Phase())
		}
	}
	if d.Phase() != PhaseDone || d.Turn() != NoSeat {
		t.Fatalf("end: phase %v turn %v", d.Phase(), d.Turn())
	}
	mustErr(t, d.Play(1, card("AH")), ErrWrongPhase)
	tricks := d.Tricks()
	wantRoem := []int{200, 0, 100, 100, 100, 100, 0, 0}
	for i, tr := range tricks {
		cs := make([]Card, 4)
		for j, p := range tr.Cards {
			cs[j] = p.Card
		}
		want := CardPoints(cs, Hearts)
		if i == 7 {
			want += LastTrickBonus
		}
		if tr.Points != want || tr.RoemTotal() != wantRoem[i] {
			t.Errorf("trick %d: points %d roem %d, want %d %d", i, tr.Points, tr.RoemTotal(), want, wantRoem[i])
		}
	}
	res := d.Result()
	want := HandResult{
		Players: 4, PlayingTeam: 1, TrumpBy: 1, Trump: Hearts, Dealer: 0,
		Points: [2]int{0, 162}, Roem: [2]int{0, 600 + PitBonus},
		Score: [2]int{0, 862}, Pit: true, PitTeam: 1, Gains: [4]int{0, 862},
	}
	if res != want {
		t.Errorf("result = %+v\nwant %+v", res, want)
	}
	if d.TricksWon() != [2]int{0, 8} || d.HandPoints() != [2]int{0, 162} || d.HandRoem() != [2]int{0, 600} {
		t.Errorf("tallies %v %v %v", d.TricksWon(), d.HandPoints(), d.HandRoem())
	}
	b, _ := json.Marshal(res)
	if string(b) != `{"players":4,"playingTeam":1,"trumpBy":1,"trump":"H","dealer":0,"points":[0,162],"roem":[0,700],"score":[0,862],"nat":false,"pit":true,"pitTeam":1,"bid":0,"discards":[],"gains":[0,862]}` {
		t.Errorf("result JSON = %s", b)
	}
}

func TestDealPitByDefenders(t *testing.T) {
	// Voorhand 1 (all hearts) must choose and picks ♦, which seat 2 holds
	// entirely: the defenders take every trick.
	d := NewDeal(0, fixedHands(), Utrechts, Rotterdams, 0)
	if err := d.ChooseTrump(1, Diamonds); err != nil {
		t.Fatal(err)
	}
	playRandom(t, d, rand.New(rand.NewPCG(7, 7)))
	res := d.Result()
	if !res.Nat || !res.Pit || res.PitTeam != 0 || res.PlayingTeam != 1 {
		t.Fatalf("result = %+v", res)
	}
	if res.Points != [2]int{162, 0} || res.Roem[0] < PitBonus || res.Roem[1] != 0 {
		t.Errorf("points %v roem %v", res.Points, res.Roem)
	}
	if res.Score != [2]int{162 + res.Roem[0], 0} {
		t.Errorf("score %v", res.Score)
	}
}

func TestDealGedraaidPlay(t *testing.T) {
	d := NewDeal(3, fixedHands(), Gedraaid, Amsterdams, Spades)
	if d.Phase() != PhaseBid || d.Turn() != 0 || d.Turned() != Spades {
		t.Fatalf("start: phase %v turn %v turned %v", d.Phase(), d.Turn(), d.Turned())
	}
	mustErr(t, d.ChooseTrump(0, Hearts), ErrWrongPhase)
	mustErr(t, d.Bid(1, true), ErrNotYourTurn)
	if v := d.View(0); v.Phase != PhaseBid || v.Turn != 0 || v.Turned != Spades || v.Legal != nil {
		t.Errorf("bid view = %+v", v)
	}
	if err := d.Bid(0, false); err != nil {
		t.Fatal(err)
	}
	if d.Turn() != 1 || d.Phase() != PhaseBid {
		t.Fatalf("after pass: turn %v phase %v", d.Turn(), d.Phase())
	}
	if err := d.Bid(1, true); err != nil {
		t.Fatal(err)
	}
	if tr, ok := d.Trump(); !ok || tr != Spades || d.TrumpBy() != 1 || d.PlayingTeam() != 1 || d.Forced() {
		t.Fatalf("trump %v by %v", tr, d.TrumpBy())
	}
	if d.Bids() != [4]int{0, 1, -1, -1} {
		t.Errorf("bids = %v", d.Bids())
	}
	// Voorhand leads the first trick, whoever chose trump.
	if d.Phase() != PhasePlay || d.Turn() != 0 {
		t.Fatalf("phase %v turn %v", d.Phase(), d.Turn())
	}
	mustErr(t, d.Bid(2, true), ErrWrongPhase)
	playRandom(t, d, rand.New(rand.NewPCG(1, 1)))
}

func TestDealGedraaidForced(t *testing.T) {
	d := NewDeal(1, fixedHands(), Gedraaid, Rotterdams, Hearts)
	for _, s := range []Seat{2, 3, 0, 1} {
		if d.Phase() != PhaseBid || d.Turn() != s {
			t.Fatalf("expected bid from %v, phase %v turn %v", s, d.Phase(), d.Turn())
		}
		if err := d.Bid(s, false); err != nil {
			t.Fatal(err)
		}
	}
	if d.Phase() != PhaseTrump || !d.Forced() || d.Turn() != 2 || d.Bids() != [4]int{0, 0, 0, 0} {
		t.Fatalf("after 4 passes: phase %v forced %v turn %v bids %v", d.Phase(), d.Forced(), d.Turn(), d.Bids())
	}
	v := d.View(2)
	if !v.Forced || v.Phase != PhaseTrump || v.Turned != Hearts {
		t.Errorf("forced view = %+v", v)
	}
	mustErr(t, d.ChooseTrump(2, Hearts), ErrTurnedSuit)
	mustErr(t, d.ChooseTrump(3, Clubs), ErrNotYourTurn)
	mustErr(t, d.Bid(2, true), ErrWrongPhase)
	if err := d.ChooseTrump(2, Clubs); err != nil {
		t.Fatal(err)
	}
	if tr, _ := d.Trump(); tr != Clubs || d.TrumpBy() != 2 || d.PlayingTeam() != 0 || d.Turn() != 2 || !d.Forced() {
		t.Fatalf("trump %v by %v turn %v", tr, d.TrumpBy(), d.Turn())
	}
	playRandom(t, d, rand.New(rand.NewPCG(2, 2)))
}

func TestDealGedraaidVoorhandPlays(t *testing.T) {
	d := NewDeal(2, fixedHands(), Gedraaid, Amsterdams, Diamonds)
	if err := d.Bid(3, true); err != nil {
		t.Fatal(err)
	}
	if tr, _ := d.Trump(); tr != Diamonds || d.TrumpBy() != 3 || d.Turn() != 3 || d.Bids() != [4]int{-1, -1, -1, 1} {
		t.Fatalf("trump %v by %v turn %v bids %v", tr, d.TrumpBy(), d.Turn(), d.Bids())
	}
}

func TestDealView(t *testing.T) {
	rng := rand.New(rand.NewPCG(9, 9))
	d := NewDeal(2, Shuffle(rng), Utrechts, Amsterdams, 0)
	if err := d.ChooseTrump(3, Spades); err != nil {
		t.Fatal(err)
	}
	for d.Phase() == PhasePlay {
		turn := d.Turn()
		for s := Seat(0); s < 4; s++ {
			v := d.View(s)
			if v.Seat != s || !slices.Equal(v.Hand, d.Hand(s)) || v.Dealer != 2 || v.Voorhand != 3 ||
				v.Trump != Spades || !v.TrumpKnown || v.TrumpBy != 3 || v.PlayingTeam != 1 || v.Turn != turn ||
				v.Mode != Utrechts || v.Rules != Amsterdams || v.HandNo != 0 {
				t.Fatalf("view of %v = %+v", s, v)
			}
			if len(v.Tricks) != d.TrickCount() {
				t.Fatalf("view has %d tricks, deal %d", len(v.Tricks), d.TrickCount())
			}
			if s != turn {
				if v.Legal != nil {
					t.Fatalf("seat %v not on turn has legal cards", s)
				}
				continue
			}
			if v.Current.Complete() || v.Current.Next() != s {
				t.Fatalf("view current trick %+v, seat %v on turn", v.Current, s)
			}
			want := LegalMoves(v.Hand, v.Current, s, v.Trump, v.Rules)
			if len(v.Legal) == 0 || !slices.Equal(v.Legal, want) || !slices.Equal(v.Legal, d.Legal()) {
				t.Fatalf("view legal %v, want %v", v.Legal, want)
			}
		}
		v := d.View(turn)
		// Mutating a view must not touch the deal.
		v.Hand[0] = Card{}
		if err := d.Play(turn, d.Legal()[0]); err != nil {
			t.Fatal(err)
		}
		if cur := d.Current(); cur.Complete() {
			// The deal still shows the trick; the view already moved on.
			if tv := d.View(cur.Winner); d.Phase() == PhasePlay &&
				(len(tv.Current.Cards) != 0 || tv.Current.Leader != cur.Winner || tv.Current.Winner != NoSeat) {
				t.Fatalf("view after a complete trick: %+v", tv.Current)
			}
		}
	}
	v := d.View(0)
	if v.Phase != PhaseDone || v.Turn != NoSeat || len(v.Tricks) != 8 || !v.Current.Complete() || v.Legal != nil {
		t.Errorf("final view = %+v", v)
	}
	if b, _ := json.Marshal(SortHand(d.Hand(0), Spades, true)); string(b) != "[]" {
		t.Errorf("empty hand marshals as %s", b)
	}
}

func TestShuffle(t *testing.T) {
	hands := Shuffle(rand.New(rand.NewPCG(3, 4)))
	seen := map[Card]bool{}
	for _, h := range hands {
		if len(h) != 8 {
			t.Fatalf("hand of %d cards", len(h))
		}
		for _, c := range h {
			if seen[c] || !c.Valid() {
				t.Fatalf("duplicate or invalid %v", c)
			}
			seen[c] = true
		}
	}
	// 3-2-3 from the shuffled deck.
	deck := NewDeck()
	rand.New(rand.NewPCG(3, 4)).Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
	for s := range 4 {
		want := slices.Concat(deck[3*s:3*s+3], deck[12+2*s:14+2*s], deck[20+3*s:23+3*s])
		if !slices.Equal(hands[s], want) {
			t.Errorf("seat %d got %v, want %v", s, hands[s], want)
		}
	}
	if h := Shuffle(nil); len(h[3]) != 8 {
		t.Error("Shuffle(nil) failed")
	}
	if a, b := Shuffle(rand.New(rand.NewPCG(1, 2))), Shuffle(rand.New(rand.NewPCG(1, 2))); !slices.Equal(a[0], b[0]) {
		t.Error("Shuffle is not reproducible with the same seed")
	}
}

func TestNewDealPanicsOnBadHands(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("no panic for unequal hands")
		}
	}()
	h := fixedHands()
	h[2] = h[2][:7]
	NewDeal(0, h, Utrechts, Amsterdams, 0)
}

func TestCloneAndResume(t *testing.T) {
	rng := rand.New(rand.NewPCG(11, 12))
	for i := range 300 {
		d := NewDeal(Seat(i%4), Shuffle(rng), TrumpMode(i%2), Rules(i/2%2), Suit(rng.IntN(4)))
		chooseRandom(t, d, rng)
		stop := rng.IntN(33)
		for range stop {
			if d.Phase() != PhasePlay {
				break
			}
			legal := d.Legal()
			if err := d.Play(d.Turn(), legal[rng.IntN(len(legal))]); err != nil {
				t.Fatal(err)
			}
		}
		if d.Phase() != PhasePlay {
			continue
		}
		var hands [4][]Card
		for s := range hands {
			hands[s] = d.Hand(Seat(s))
		}
		r, err := Resume(d.View(Seat(rng.IntN(4))), hands)
		if err != nil {
			t.Fatalf("Resume: %v", err)
		}
		c := d.Clone()
		var copied Deal
		copied = *d
		before := *d
		seed := rng.Uint64()
		finish := func(x *Deal) HandResult {
			r := rand.New(rand.NewPCG(seed, 0))
			for x.Phase() == PhasePlay {
				legal := x.Legal()
				if err := x.Play(x.Turn(), legal[r.IntN(len(legal))]); err != nil {
					t.Fatal(err)
				}
			}
			return x.Result()
		}
		res := finish(r)
		if got := finish(c); got != res {
			t.Fatalf("clone result %+v, resumed %+v", got, res)
		}
		if got := finish(&copied); got != res {
			t.Fatalf("copy result %+v, resumed %+v", got, res)
		}
		if *d != before {
			t.Fatal("playing a clone changed the original")
		}
		if got := finish(d); got != res {
			t.Fatalf("original result %+v, resumed %+v", got, res)
		}
	}
}

func TestResumeErrors(t *testing.T) {
	d := NewDeal(0, fixedHands(), Utrechts, Amsterdams, 0)
	if _, err := Resume(d.View(1), fixedHands()); err == nil {
		t.Error("Resume accepted a view in phase trump")
	}
	if err := d.ChooseTrump(1, Hearts); err != nil {
		t.Fatal(err)
	}
	if err := d.Play(1, card("JH")); err != nil {
		t.Fatal(err)
	}
	hands := fixedHands()
	if _, err := Resume(d.View(2), hands); err == nil {
		t.Error("Resume accepted the played card still in hand")
	}
	hands[1] = d.Hand(1)
	r, err := Resume(d.View(2), hands)
	if err != nil {
		t.Fatal(err)
	}
	if r.Turn() != 2 || r.Current().Leader != 1 || len(r.Current().Cards) != 1 {
		t.Errorf("resumed turn %v current %+v", r.Turn(), r.Current())
	}
}

func TestDealSimulationDoesNotAllocate(t *testing.T) {
	d := NewDeal(0, Shuffle(rand.New(rand.NewPCG(5, 5))), Utrechts, Amsterdams, 0)
	if err := d.ChooseTrump(1, Hearts); err != nil {
		t.Fatal(err)
	}
	var sim Deal
	buf := make([]Card, 0, 8)
	allocs := testing.AllocsPerRun(200, func() {
		sim = *d
		for sim.Phase() == PhasePlay {
			buf = sim.AppendLegal(buf[:0])
			if err := sim.Play(sim.Turn(), buf[len(buf)-1]); err != nil {
				panic(err)
			}
		}
		_ = sim.Result()
	})
	if allocs != 0 {
		t.Errorf("a full playout allocates %.1f times", allocs)
	}
}

func TestSortHand(t *testing.T) {
	tests := []struct {
		name       string
		hand       string
		trump      Suit
		trumpKnown bool
		want       string
	}{
		{"four suits, no trump", "7C AH TS JD 9C KH", 0, false, "TS KH AH 7C 9C JD"},
		{"plain order within a suit", "JS 9S AS TS 7S QS KS 8S", 0, false, "7S 8S 9S JS QS KS TS AS"},
		{"trump first, trump order", "7C JC AC 9C AH TS KD", Clubs, true, "7C AC 9C JC AH TS KD"},
		{"trump order for hearts", "QH KH TH AH 9H JH 8H 7H", Hearts, true, "7H 8H QH KH TH AH 9H JH"},
		{"trump unknown keeps plain order", "QH KH TH AH 9H JH 8H 7H", Hearts, false, "7H 8H 9H JH QH KH TH AH"},
		{"alternate colours with three suits", "7C 7S 7D", 0, false, "7S 7D 7C"},
		{"two black suits cannot alternate", "7C 7S", 0, false, "7S 7C"},
		{"trump not in hand", "7C 7H", Spades, true, "7H 7C"},
		{"red trump first then alternate", "AS AD AC AH", Diamonds, true, "AD AS AH AC"},
		{"empty hand", "", Hearts, true, ""},
	}
	for _, tt := range tests {
		hand := cards(tt.hand)
		orig := slices.Clone(hand)
		got := SortHand(hand, tt.trump, tt.trumpKnown)
		if codes(got) != tt.want {
			t.Errorf("%s: SortHand = %q, want %q", tt.name, codes(got), tt.want)
		}
		if !slices.Equal(hand, orig) {
			t.Errorf("%s: SortHand modified its input", tt.name)
		}
	}
}

func mustErr(t *testing.T, err, want error) {
	t.Helper()
	if !errors.Is(err, want) {
		t.Fatalf("got error %v, want %v", err, want)
	}
}

// chooseRandom completes the trump phase (and with three players the
// auction and the discards) with random decisions.
func chooseRandom(t *testing.T, d *Deal, rng *rand.Rand) {
	t.Helper()
	for d.Phase() != PhasePlay && d.Phase() != PhaseDone {
		var err error
		if d.Phase() == PhaseAuction || d.Phase() == PhaseDiscard {
			err = chooseSmall(d, rng)
		} else if d.Phase() == PhaseBid {
			err = d.Bid(d.Turn(), rng.IntN(4) == 0)
		} else {
			s := Suit(rng.IntN(4))
			for d.Forced() && s == d.Turned() {
				s = Suit(rng.IntN(4))
			}
			err = d.ChooseTrump(d.Turn(), s)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
}

// playRandom finishes a deal with random legal cards.
func playRandom(t *testing.T, d *Deal, rng *rand.Rand) {
	t.Helper()
	for d.Phase() == PhasePlay {
		legal := d.Legal()
		if err := d.Play(d.Turn(), legal[rng.IntN(len(legal))]); err != nil {
			t.Fatal(err)
		}
	}
}
