package game

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
	"slices"
	"testing"
)

// Deals for three players (auction, talon, soloist) and two players
// (eight piles each), games/klaverjas/README.md#rules-as-implemented.

func TestShuffleFor(t *testing.T) {
	for _, players := range []int{2, 3, 4} {
		hands, talon := ShuffleFor(players, rand.New(rand.NewPCG(3, 4)))
		seen := map[Card]bool{}
		for s, h := range hands {
			want := 0
			if s < players {
				want = handSize[players]
			}
			if len(h) != want {
				t.Fatalf("%d players: seat %d has %d cards, want %d", players, s, len(h), want)
			}
			for _, c := range h {
				if seen[c] || !c.Valid() {
					t.Fatalf("%d players: duplicate or invalid %v", players, c)
				}
				seen[c] = true
			}
		}
		if players == 3 != (len(talon) == 2) {
			t.Fatalf("%d players: talon %v", players, talon)
		}
		for _, c := range talon {
			if seen[c] {
				t.Fatalf("talon card %v also dealt", c)
			}
			seen[c] = true
		}
		if len(seen) != 32 {
			t.Fatalf("%d players: %d cards dealt", players, len(seen))
		}
	}
	// Four players deal exactly as Shuffle always did.
	a := Shuffle(rand.New(rand.NewPCG(1, 2)))
	b, _ := ShuffleFor(4, rand.New(rand.NewPCG(1, 2)))
	for s := range a {
		if !slices.Equal(a[s], b[s]) {
			t.Errorf("ShuffleFor(4) deals seat %d %v, Shuffle %v", s, b[s], a[s])
		}
	}
}

func TestNewDealForPanics(t *testing.T) {
	hands, talon := ShuffleFor(3, rand.New(rand.NewPCG(1, 1)))
	bad := []func(){
		func() { NewDealFor(5, 0, hands, talon, Utrechts, Amsterdams, 0) },
		func() { NewDealFor(3, 3, hands, talon, Utrechts, Amsterdams, 0) },
		func() { NewDealFor(3, 0, hands, nil, Utrechts, Amsterdams, 0) },
		func() { NewDealFor(4, 0, hands, talon, Utrechts, Amsterdams, 0) },
		func() {
			h := hands
			h[1] = h[1][:9]
			NewDealFor(3, 0, h, talon, Utrechts, Amsterdams, 0)
		},
		func() {
			h, _ := ShuffleFor(2, nil)
			h[0] = h[0][:8]
			NewDealFor(2, 0, h, nil, Utrechts, Amsterdams, 0)
		},
	}
	for i, f := range bad {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("case %d: no panic", i)
				}
			}()
			f()
		}()
	}
}

// threeHands deals seat 0 the clubs and hearts 7..9, seat 1 the hearts
// 10..A and the diamonds, seat 2 the spades and two clubs; the talon is
// ♣10 ♣B.
func threeHands() ([4][]Card, []Card) {
	return [4][]Card{
		cards("7C 8C 9C QC KC AC 7H 8H 9H 7D"),
		cards("TH JH QH KH AH 8D 9D TD JD QD"),
		cards("7S 8S 9S TS JS QS KS AS KD AD"),
	}, cards("TC JC")
}

func TestAuction(t *testing.T) {
	hands, talon := threeHands()
	d := NewDealFor(3, 0, hands, talon, Gedraaid, Amsterdams, Hearts)
	if d.Players() != 3 || d.Phase() != PhaseAuction || d.Turn() != 1 || d.Voorhand() != 1 || d.Mode() != Utrechts {
		t.Fatalf("start: players %d phase %v turn %v mode %v", d.Players(), d.Phase(), d.Turn(), d.Mode())
	}
	if s, b := d.Contract(); s != NoSeat || b != 0 || d.MinNextBid() != MinBid {
		t.Fatalf("contract before bidding: %v %d", s, b)
	}
	mustErr(t, d.Auction(2, 80), ErrNotYourTurn)
	mustErr(t, d.Auction(1, 70), ErrBadBid)
	mustErr(t, d.Auction(1, 85), ErrBadBid)
	mustErr(t, d.Auction(1, MaxBid+BidStep), ErrBadBid)
	mustErr(t, d.ChooseTrump(1, Hearts), ErrWrongPhase)
	mustErr(t, d.Bid(1, true), ErrWrongPhase)
	mustErr(t, d.Discard(1, hands[1][:2]), ErrWrongPhase)
	if err := d.Auction(1, 80); err != nil {
		t.Fatal(err)
	}
	if err := d.Auction(1, 90); !errors.Is(err, ErrBadBid) && !errors.Is(err, ErrNotYourTurn) {
		t.Fatalf("second bid in a row: %v", err)
	}
	if d.Turn() != 2 || d.MinNextBid() != 90 {
		t.Fatalf("after 80: turn %v min %d", d.Turn(), d.MinNextBid())
	}
	err := d.Auction(2, 80)
	mustErr(t, err, ErrBadBid)
	if err.Error() != "Dat bod kan niet. Bied 90 of meer, in stappen van 10." {
		t.Errorf("bid error text %q", err)
	}
	for _, step := range []struct {
		seat Seat
		bid  int
	}{{2, 100}, {0, 0}, {1, 110}, {2, 0}} {
		if d.Phase() != PhaseAuction || d.Turn() != step.seat {
			t.Fatalf("before %v bids %d: phase %v turn %v", step.seat, step.bid, d.Phase(), d.Turn())
		}
		if err := d.Auction(step.seat, step.bid); err != nil {
			t.Fatal(err)
		}
		if step.seat == 0 && d.Turn() != 1 {
			t.Fatalf("after a pass the turn goes to %v", d.Turn())
		}
	}
	// Seat 0 passed, so the turn skips it: 1 bid 110, 2 passed. Seat 1 plays.
	if s, b := d.Contract(); s != 1 || b != 110 || d.Forced() || d.Bids() != [4]int{0, 110, 0, -1} {
		t.Fatalf("contract %v %d forced %v bids %v", s, b, d.Forced(), d.Bids())
	}
	if d.Phase() != PhaseDiscard || d.Turn() != 1 || d.HandLen(1) != 12 {
		t.Fatalf("after the auction: phase %v turn %v %d cards", d.Phase(), d.Turn(), d.HandLen(1))
	}
	if h := d.Hand(1); !slices.Contains(h, card("TC")) || !slices.Contains(h, card("JC")) {
		t.Fatalf("soloist's hand %v lacks the talon", h)
	}
	if v := d.View(1); !slices.Equal(v.Talon, talon) || v.Discards != nil || v.Bid != 110 || v.Bidder != 1 {
		t.Errorf("soloist's view: talon %v discards %v bid %d by %v", v.Talon, v.Discards, v.Bid, v.Bidder)
	}
	if v := d.View(0); v.Talon != nil || len(v.Hand) != 10 || v.Partner != 2 {
		t.Errorf("other view: talon %v, %d cards, partner %v", v.Talon, len(v.Hand), v.Partner)
	}
	if d.Side(1) != 0 || d.Side(0) != 1 || d.Side(2) != 1 || d.Partner(1) != NoSeat || d.Partner(0) != 2 || d.Partner(2) != 0 {
		t.Errorf("sides %d %d %d, partners %v %v %v", d.Side(0), d.Side(1), d.Side(2), d.Partner(0), d.Partner(1), d.Partner(2))
	}

	mustErr(t, d.Discard(0, cards("7C 8C")), ErrNotYourTurn)
	mustErr(t, d.Discard(1, cards("TC")), ErrBadDiscard)
	mustErr(t, d.Discard(1, cards("TC TC")), ErrBadDiscard)
	mustErr(t, d.Discard(1, cards("TC 7C")), ErrNotInHand)
	mustErr(t, d.Play(1, card("TC")), ErrWrongPhase)
	if err := d.Discard(1, cards("TC 8D")); err != nil {
		t.Fatal(err)
	}
	if d.Phase() != PhaseTrump || d.Turn() != 1 || d.HandLen(1) != 10 || slices.Contains(d.Hand(1), card("TC")) {
		t.Fatalf("after discarding: phase %v turn %v hand %v", d.Phase(), d.Turn(), d.Hand(1))
	}
	if !slices.Equal(d.Discards(), cards("TC 8D")) || !slices.Equal(d.View(1).Discards, cards("TC 8D")) || d.View(2).Discards != nil {
		t.Errorf("discards %v", d.Discards())
	}
	if err := d.ChooseTrump(1, Hearts); err != nil {
		t.Fatal(err)
	}
	// Voorhand leads, whoever plays.
	if d.Phase() != PhasePlay || d.Turn() != 1 || d.PlayingTeam() != 0 || d.TrumpBy() != 1 {
		t.Fatalf("after trump: phase %v turn %v playing %d", d.Phase(), d.Turn(), d.PlayingTeam())
	}
	playRandom(t, d, rand.New(rand.NewPCG(4, 4)))
	if len(d.Tricks()) != 10 {
		t.Fatalf("%d tricks", len(d.Tricks()))
	}
	res := d.Result()
	if res.Points[0]+res.Points[1] != 162 {
		t.Errorf("points %v do not add up to 162 with the discards", res.Points)
	}
	if res.Players != 3 || res.Bid != 110 || res.Discards != [2]Card{card("TC"), card("8D")} || res.PlayingTeam != 0 {
		t.Errorf("result %+v", res)
	}
	half := (res.Score[1] + 1) / 2
	if res.Gains != [4]int{half, res.Score[0], half, 0} {
		t.Errorf("gains %v for score %v", res.Gains, res.Score)
	}
	b, _ := json.Marshal(res)
	var back HandResult
	if err := json.Unmarshal(b, &back); err != nil || back != res {
		t.Errorf("JSON round trip: %s → %+v (%v)", b, back, err)
	}
}

func TestAuctionForced(t *testing.T) {
	hands, talon := threeHands()
	d := NewDealFor(3, 2, hands, talon, Utrechts, Rotterdams, 0)
	for _, s := range []Seat{0, 1} {
		if err := d.Auction(s, 0); err != nil {
			t.Fatal(err)
		}
	}
	if s, b := d.Contract(); s != 2 || b != MinBid || !d.Forced() || d.Phase() != PhaseDiscard || d.Turn() != 2 {
		t.Fatalf("forced: contract %v %d forced %v phase %v", s, b, d.Forced(), d.Phase())
	}
	if d.Bids() != [4]int{0, 0, MinBid, -1} {
		t.Errorf("bids %v", d.Bids())
	}
	if err := d.Discard(2, cards("TC JC")); err != nil {
		t.Fatal(err)
	}
	// Forced or not, the soloist chooses any suit.
	if err := d.ChooseTrump(2, d.Turned()); err != nil {
		t.Fatal(err)
	}
	if d.Turn() != 0 {
		t.Fatalf("voorhand 0 should lead, turn %v", d.Turn())
	}
}

func TestAuctionOutbidAfterPass(t *testing.T) {
	hands, talon := threeHands()
	d := NewDealFor(3, 0, hands, talon, Utrechts, Amsterdams, 0)
	// 1 passes; 2 and 0 bid on until 2 passes.
	for _, step := range []struct {
		seat Seat
		bid  int
	}{{1, 0}, {2, 80}, {0, 90}, {2, 100}, {0, 0}} {
		if d.Turn() != step.seat {
			t.Fatalf("turn %v, want %v", d.Turn(), step.seat)
		}
		if err := d.Auction(step.seat, step.bid); err != nil {
			t.Fatal(err)
		}
	}
	if s, b := d.Contract(); s != 2 || b != 100 || d.Phase() != PhaseDiscard {
		t.Fatalf("contract %v %d phase %v", s, b, d.Phase())
	}
}

func TestScoreSolo(t *testing.T) {
	tests := []struct {
		name   string
		bid    int
		points [2]int
		roem   [2]int
		score  [2]int
		nat    bool
	}{
		{"made", 100, [2]int{110, 52}, [2]int{20, 0}, [2]int{130, 52}, false},
		{"exactly the bid", 100, [2]int{100, 62}, [2]int{}, [2]int{100, 62}, false},
		{"roem makes it", 100, [2]int{85, 77}, [2]int{20, 0}, [2]int{105, 77}, false},
		{"nat", 100, [2]int{90, 72}, [2]int{0, 20}, [2]int{0, 182}, true},
		{"the others' roem stays theirs", 80, [2]int{90, 72}, [2]int{0, 50}, [2]int{90, 122}, false},
	}
	for _, tt := range tests {
		score, nat := ScoreSolo(tt.bid, tt.points, tt.roem)
		if score != tt.score || nat != tt.nat {
			t.Errorf("%s: ScoreSolo = %v, %v; want %v, %v", tt.name, score, nat, tt.score, tt.nat)
		}
	}
}

// twoHands lays out seat 0's piles with ♥B ♥V ♥H in the front row and
// seat 1's with all spades on top.
func twoHands() [4][]Card {
	return [4][]Card{
		cards("JH QH KH 7C 9C JC AC 7D " + "AH TH 9H 8H 7H 8C TC QC"),
		cards("7S 8S 9S TS JS QS KS AS " + "KC 8D 9D TD JD QD KD AD"),
	}
}

func TestTwoPlayers(t *testing.T) {
	d := NewDealFor(2, 1, twoHands(), nil, Utrechts, Rotterdams, 0)
	if d.Players() != 2 || d.Phase() != PhaseTrump || d.Turn() != 0 || d.Voorhand() != 0 {
		t.Fatalf("start: phase %v turn %v", d.Phase(), d.Turn())
	}
	if h := d.Hand(0); !slices.Equal(h, cards("JH QH KH 7C")) || d.HandLen(0) != 16 {
		t.Fatalf("open cards before trump %v, %d left", h, d.HandLen(0))
	}
	ps := d.Piles(1)
	if ps[0] != (Pile{N: 2, Up: true, Card: card("7S")}) || ps[4] != (Pile{N: 2}) {
		t.Fatalf("piles before trump %+v", ps)
	}
	v := d.View(1)
	if v.Piles[0][2].Card != card("KH") || v.Piles[1][4].Up || v.Partner != NoSeat || v.OpenRoem[0] != nil {
		t.Fatalf("view before trump %+v", v)
	}
	if err := d.ChooseTrump(0, Hearts); err != nil {
		t.Fatal(err)
	}
	// The back rows turn over: seat 0 shows ♥B ♥V ♥H (driekaart and
	// stuk), seat 1 eight spades in a row (vierkaart).
	if h := d.Hand(0); len(h) != 8 || d.Piles(0)[5].Card != card("JC") {
		t.Fatalf("open cards after trump %v", h)
	}
	if r := d.OpenRoem(0); len(r) != 2 || d.HandRoem() != [2]int{40, 50} || len(d.OpenRoem(1)) != 1 {
		t.Fatalf("open roem %v / %v, hand roem %v", r, d.OpenRoem(1), d.HandRoem())
	}
	if d.PlayingTeam() != 0 || d.Side(1) != 1 || d.Turn() != 0 {
		t.Fatalf("playing %d turn %v", d.PlayingTeam(), d.Turn())
	}
	mustErr(t, d.Play(0, card("AH")), ErrNotInHand) // face down under ♥B
	if err := d.Play(0, card("JH")); err != nil {
		t.Fatal(err)
	}
	// ♥A stays face down until the trick is complete.
	if p := d.Piles(0)[0]; p != (Pile{N: 1}) {
		t.Fatalf("pile after its top was played: %+v", p)
	}
	if l := d.Legal(); !slices.Equal(l, d.Hand(1)) {
		t.Fatalf("no hearts open: seat 1 may play anything, got %v", l)
	}
	if err := d.Play(1, card("AS")); err != nil {
		t.Fatal(err)
	}
	if p := d.Piles(0)[0]; p != (Pile{N: 1, Up: true, Card: card("AH")}) || d.Piles(1)[7] != (Pile{N: 1, Up: true, Card: card("AD")}) {
		t.Fatalf("piles after the trick: %+v %+v", p, d.Piles(1)[7])
	}
	if tr := d.Current(); tr.Winner != 0 || tr.Points != 31 || d.Turn() != 0 {
		t.Fatalf("trick %+v turn %v", tr, d.Turn())
	}
	// ♦A has turned over: seat 1 must follow a diamond lead with it.
	if err := d.Play(0, card("7D")); err != nil {
		t.Fatal(err)
	}
	if l := d.Legal(); !slices.Equal(l, cards("AD")) {
		t.Fatalf("seat 1 must follow diamonds with ♦A: %v", l)
	}
	if c := d.Constraint(); c != "Bekennen: speel ♦" {
		t.Errorf("constraint %q", c)
	}
	playRandom(t, d, rand.New(rand.NewPCG(9, 9)))
	res := d.Result()
	if len(d.Tricks()) != 16 || res.Points[0]+res.Points[1] != 162 || res.Roem[0] < 40 || res.Players != 2 {
		t.Fatalf("result %+v after %d tricks", res, len(d.Tricks()))
	}
	if res.Gains != [4]int{res.Score[0], res.Score[1]} {
		t.Errorf("gains %v, score %v", res.Gains, res.Score)
	}
	b, _ := json.Marshal(d.Piles(0))
	if string(b) != `[{"n":0,"card":null},{"n":0,"card":null},{"n":0,"card":null},{"n":0,"card":null},{"n":0,"card":null},{"n":0,"card":null},{"n":0,"card":null},{"n":0,"card":null}]` {
		t.Errorf("piles JSON %s", b)
	}
}

func TestTwoPlayersGedraaid(t *testing.T) {
	d := NewDealFor(2, 0, twoHands(), nil, Gedraaid, Amsterdams, Diamonds)
	if d.Phase() != PhaseBid || d.Turn() != 1 {
		t.Fatalf("start: phase %v turn %v", d.Phase(), d.Turn())
	}
	for _, s := range []Seat{1, 0} {
		if err := d.Bid(s, false); err != nil {
			t.Fatal(err)
		}
	}
	if d.Phase() != PhaseTrump || !d.Forced() || d.Turn() != 1 {
		t.Fatalf("after two passes: phase %v forced %v turn %v", d.Phase(), d.Forced(), d.Turn())
	}
	mustErr(t, d.ChooseTrump(1, Diamonds), ErrTurnedSuit)
	if err := d.ChooseTrump(1, Spades); err != nil {
		t.Fatal(err)
	}
	// Seat 1 shows ♠7..♠A: one vierkaart, and stuk; seat 0 a driekaart.
	if d.HandRoem() != [2]int{20, 70} || d.PlayingTeam() != 1 {
		t.Fatalf("roem %v playing %d", d.HandRoem(), d.PlayingTeam())
	}
}

func TestSetRoem(t *testing.T) {
	tests := []struct {
		cards string
		trump Suit
		want  int
	}{
		{"7C 9C JC KC AH 8D TS QS", Hearts, 0},
		{"7C 8C 9C JC QC KC AH 8D", Hearts, 40},  // two runs of three in one suit
		{"7C 8C 9C TC JC QC KC AC", Hearts, 50},  // eight in a row is one vierkaart
		{"QH KH 7C 9C JS AS TD 8D", Hearts, 20},  // stuk
		{"JH QH KH AH 7C 9C JS 8D", Hearts, 70},  // vierkaart with stuk
		{"AH AC AD AS KH KC KD KS", Spades, 200}, // four aces and four kings; no ♠V for stuk
		{"JH JC JD JS 9H 8H 7H TS", Clubs, 220},  // four boeren and a driekaart
		{"9H 9C 9D 9S 7C 8C 7D 8D", Hearts, 40},  // four nines count nothing, the two runs do
	}
	for _, tt := range tests {
		cs := cards(tt.cards)
		got := 0
		for _, it := range SetRoem(cs, tt.trump) {
			got += it.Points
		}
		if got != tt.want || SetRoemPoints(cs, tt.trump) != tt.want {
			t.Errorf("SetRoem(%s, %v) = %v (%d), want %d", tt.cards, tt.trump, SetRoem(cs, tt.trump), got, tt.want)
		}
	}
}

// TestRandomSmallDeals plays random deals for two and three players and
// checks every move against the reference rules and the totals.
func TestRandomSmallDeals(t *testing.T) {
	n := 4000
	if testing.Short() {
		n = 600
	}
	rng := rand.New(rand.NewPCG(2026, 5))
	var natCount [5]int
	for i := range n {
		players := 2 + i%2
		mode, rules := TrumpMode(i/2%2), Rules(i/4%2)
		hands, talon := ShuffleFor(players, rng)
		d := NewDealFor(players, Seat(rng.IntN(players)), hands, talon, mode, rules, Suit(rng.IntN(4)))
		chooseRandom(t, d, rng)
		trump, _ := d.Trump()
		soloist, _ := d.Contract()
		var played []Card
		for d.Phase() == PhasePlay {
			s := d.Turn()
			v := d.View(s)
			trickCards := v.Current.Cards
			partner := NoSeat
			if players == 3 && s != soloist {
				partner = 3 - s - soloist
			}
			if v.Partner != partner {
				t.Fatalf("partner of %v is %v, want %v", s, v.Partner, partner)
			}
			want := refLegalWith(v.Hand, trickCards, partner, trump, rules)
			if !slices.Equal(v.Legal, want) {
				t.Fatalf("deal %d: legal %v, reference %v (hand %v trick %v)", i, v.Legal, want, v.Hand, trickCards)
			}
			checkMasks(t, d, want)
			if d.Constraint() == "" {
				t.Fatal("empty constraint text")
			}
			c := want[rng.IntN(len(want))]
			if err := d.Play(s, c); err != nil {
				t.Fatalf("legal %v rejected: %v", c, err)
			}
			played = append(played, c)
		}
		checkMasks(t, d, nil)
		tricks := d.Tricks()
		if len(tricks) != handSize[players] || len(played) != players*handSize[players] {
			t.Fatalf("deal %d: %d tricks, %d cards", i, len(tricks), len(played))
		}
		var points, won [2]int
		for k, tr := range tricks {
			if w := refWinner(tr.Cards, trump); tr.Winner != w {
				t.Fatalf("trick %d winner %v, reference %v", k, tr.Winner, w)
			}
			points[d.Side(tr.Winner)] += tr.Points
			won[d.Side(tr.Winner)]++
		}
		res := d.Result()
		if players == 3 {
			points[0] += CardPoints(d.Discards(), trump)
		}
		if points[0]+points[1] != 162 || res.Points != points || res.Pit != (won[0] == 0 || won[1] == 0) {
			t.Fatalf("deal %d: points %v, result %+v", i, points, res)
		}
		if res.Nat {
			natCount[players]++
		}
		for s := range Seat(players) {
			if d.HandLen(s) != 0 {
				t.Fatalf("seat %v still has cards", s)
			}
		}
	}
	if natCount[2] == 0 || natCount[3] == 0 {
		t.Errorf("random play never went nat: %v", natCount)
	}
}

// chooseSmall completes the auction, discards and trump with random
// decisions (chooseRandom handles both kinds of deal).
func chooseSmall(d *Deal, rng *rand.Rand) error {
	switch d.Phase() {
	case PhaseAuction:
		bid := 0
		if rng.IntN(3) == 0 {
			bid = min(d.MinNextBid()+BidStep*rng.IntN(3), MaxBid)
		}
		return d.Auction(d.Turn(), bid)
	case PhaseDiscard:
		h := d.Hand(d.Turn())
		rng.Shuffle(len(h), func(i, j int) { h[i], h[j] = h[j], h[i] })
		return d.Discard(d.Turn(), h[:2])
	}
	return errors.New("not a three-player phase")
}

func TestResumeSmall(t *testing.T) {
	rng := rand.New(rand.NewPCG(13, 14))
	for i := range 400 {
		players := 2 + i%2
		hands, talon := ShuffleFor(players, rng)
		d := NewDealFor(players, Seat(rng.IntN(players)), hands, talon, TrumpMode(i/2%2), Rules(i/4%2), Suit(rng.IntN(4)))
		chooseRandom(t, d, rng)
		for range rng.IntN(2 * players * handSize[players]) {
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
		seat := Seat(rng.IntN(players))
		v := d.View(seat)
		var hidden [4][]Card
		for s := range Seat(players) {
			if players == 2 {
				hidden[s] = faceDown(d, s)
			} else {
				hidden[s] = d.Hand(s)
			}
		}
		if players == 3 {
			v.Discards = d.Discards()
		}
		r, err := Resume(v, hidden)
		if err != nil {
			t.Fatalf("deal %d (%d players): Resume: %v", i, players, err)
		}
		checkMasks(t, r, r.Legal())
		into := *d // ResumeInto overwrites whatever is there
		if err := ResumeInto(&into, &v, hidden); err != nil || into != *r {
			t.Fatalf("deal %d (%d players): ResumeInto differs from Resume (%v)", i, players, err)
		}
		for s := range Seat(players) {
			if !slices.Equal(r.Hand(s), d.Hand(s)) || r.HandLen(s) != d.HandLen(s) || r.Piles(s) != d.Piles(s) {
				t.Fatalf("deal %d: seat %v resumed with %v (%d), want %v (%d)", i, s, r.Hand(s), r.HandLen(s), d.Hand(s), d.HandLen(s))
			}
		}
		if r.HandPoints() != d.HandPoints() || r.HandRoem() != d.HandRoem() || r.TricksWon() != d.TricksWon() || r.Turn() != d.Turn() {
			t.Fatalf("deal %d: resumed tallies %v %v %v turn %v, want %v %v %v %v", i,
				r.HandPoints(), r.HandRoem(), r.TricksWon(), r.Turn(), d.HandPoints(), d.HandRoem(), d.TricksWon(), d.Turn())
		}
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
		if a, b := finish(r), finish(d); a != b {
			t.Fatalf("deal %d: resumed result %+v, original %+v", i, a, b)
		}
	}
}

// faceDown lists the face-down cards on seat s's piles, pile by pile, as
// Resume wants them.
func faceDown(d *Deal, s Seat) []Card {
	var out []Card
	for i := range 8 {
		top, under := uint16(1)<<i, uint16(1)<<(i+8)
		left := d.left(s)
		if left&top != 0 && d.up[s]&top == 0 {
			out = append(out, d.hands[s][i])
		}
		if left&under != 0 && d.up[s]&under == 0 {
			out = append(out, d.hands[s][i+8])
		}
	}
	return out
}

func TestSmallSimulationDoesNotAllocate(t *testing.T) {
	for _, players := range []int{2, 3} {
		rng := rand.New(rand.NewPCG(5, 5))
		hands, talon := ShuffleFor(players, rng)
		d := NewDealFor(players, 0, hands, talon, Utrechts, Amsterdams, 0)
		chooseRandom(t, d, rng)
		var sim Deal
		buf := make([]Card, 0, 16)
		allocs := testing.AllocsPerRun(100, func() {
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
			t.Errorf("%d players: a full playout allocates %.1f times", players, allocs)
		}
	}
}
