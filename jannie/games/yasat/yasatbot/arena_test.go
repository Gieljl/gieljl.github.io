package yasatbot

import (
	"math/rand/v2"
	"slices"
	"testing"

	"jannie/games/yasat/yasat"
)

// match plays ten rounds of bots and returns their weighted scores.
func match(bots []*Bot, seed uint64) []int {
	n := len(bots)
	rng := rand.New(rand.NewPCG(seed, 1))
	totals := make([]int, n)
	var history [][][]yasat.Event
	dealer := n - 1
	for range 10 {
		r := yasat.Deal(n, dealer, rng)
		var seen []Seen
		for turn := 0; !r.Over(); turn++ {
			i := r.Turn
			if turn > 400 {
				r.Caller = i // a round that never ends: whoever is on turn calls
				break
			}
			v := View{Seat: i, Hand: slices.Clone(r.Hands[i]), Top: slices.Clone(r.Top()), DeckLen: len(r.Deck),
				Totals: slices.Clone(totals), Seen: slices.Clone(seen), History: history}
			for _, h := range r.Hands {
				v.HandLens = append(v.HandLens, len(h))
				v.Hands = append(v.Hands, slices.Clone(h))
			}
			if len(r.Deck) > 0 {
				c := r.Deck[0]
				v.DeckTop = &c
			}
			d := bots[i].Decide(v)
			if d.Call {
				if err := r.Call(i); err != nil {
					panic(err)
				}
				break
			}
			drew, err := r.Play(i, d.Move)
			if err != nil {
				panic(err)
			}
			s := Seen{Seat: i, Discard: d.Move.Discard, FromDeck: drew.FromDeck}
			if !drew.FromDeck {
				s.Took = &drew.Card
			}
			seen = append(seen, s)
		}
		pts := make([]int, n)
		callerPts := yasat.Points(r.Hands[r.Caller])
		for i := range n {
			var eleven []yasat.Card
			if i != r.Caller && yasat.Points(r.Hands[i]) >= callerPts {
				eleven = bots[i].Aces(r.Hands[i], totals[i])
			}
			pts[i] = yasat.PointsWith(r.Hands[i], eleven)
		}
		res, won := yasat.Score(pts, r.Caller, totals)
		round := make([][]yasat.Event, n)
		for i := range n {
			totals[i], round[i] = res[i].Total, res[i].Events
		}
		history = append(history, round)
		if won {
			dealer = r.Caller
		}
	}
	w, _ := yasat.Weighted(history, n)
	return w
}

// TestArena: sterk beats normaal beats makkelijk on the weighted score,
// over matches with one bot of each level and a second normaal, seats
// rotated.
func TestArena(t *testing.T) {
	levels := []Level{Easy, Normal, Godlike, Normal}
	sum := map[Level]float64{}
	const matches = 400
	for k := range matches {
		bots := make([]*Bot, 4)
		lv := make([]Level, 4)
		for i := range 4 {
			lv[i] = levels[(i+k)%4]
			bots[i] = New(Personality(k%5), lv[i], uint64(k*4+i))
		}
		for i, w := range match(bots, uint64(k)) {
			x := float64(w)
			if lv[i] == Normal {
				x /= 2
			}
			sum[lv[i]] += x
		}
	}
	easy, normal, god := sum[Easy]/matches, sum[Normal]/matches, sum[Godlike]/matches
	t.Logf("weighted per match: makkelijk %.2f, normaal %.2f, sterk %.2f", easy, normal, god)
	if !(god > normal && normal > easy) {
		t.Fatalf("levels out of order: makkelijk %.2f, normaal %.2f, sterk %.2f", easy, normal, god)
	}
}

// TestDecideLegal: every decision of every level is legal, over many deals.
func TestDecideLegal(t *testing.T) {
	for k := range 50 {
		bots := []*Bot{New(Gambler, Easy, 1), New(Cautious, Normal, 2), New(Opportunist, Godlike, 3)}
		match(bots, uint64(k)) // panics on an illegal move
	}
}

func TestBestAces(t *testing.T) {
	if got := BestAces(yasat.MustParseCards("AS 9H"), 30); len(got) != 1 { // 30+11+9 = 50
		t.Fatalf("nullify 50 missed: %v", got)
	}
	if got := BestAces(yasat.MustParseCards("AS 9H"), 85); len(got) != 0 { // 11 would die
		t.Fatalf("died: %v", got)
	}
}
