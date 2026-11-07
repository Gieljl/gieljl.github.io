package yasat

import (
	"math/rand/v2"
	"slices"
	"testing"
)

func TestDeck(t *testing.T) {
	d := NewDeck()
	seen := map[Card]bool{}
	for _, c := range d {
		if !c.Valid() || seen[c] {
			t.Fatalf("bad or double card %v", c)
		}
		seen[c] = true
		back, err := ParseCard(c.String())
		if err != nil || back != c {
			t.Fatalf("round trip %v: %v %v", c, back, err)
		}
	}
	if len(d) != 52 {
		t.Fatalf("%d cards", len(d))
	}
	if c, _ := ParseCard("10h"); c.String() != "TH" {
		t.Fatalf("10h is %v", c)
	}
}

func TestPoints(t *testing.T) {
	h := MustParseCards("AS KH 7D 2C")
	if p := Points(h); p != 20 {
		t.Fatalf("points %d", p)
	}
	if p := PointsWith(h, MustParseCards("AS")); p != 30 {
		t.Fatalf("ace as 11: %d", p)
	}
}

func TestClassify(t *testing.T) {
	for _, tc := range []struct {
		cards string
		want  Shape
	}{
		{"7H", Single}, {"7H 7S", Pair}, {"7H 7S 7D", Three}, {"7H 7S 7D 7C", Four},
		{"7H 8S", ""}, {"5H 6D 7H", Straight}, {"5H 6S 7H", ""}, {"5H 7H", ""},
		{"AH 2H 3D", Straight}, {"QS KS AC", Straight}, {"KS AS 2S", ""}, {"5H 5H", ""},
		{"9C TC JC QC KC", Straight}, {"5H 7H 6H", Straight},
	} {
		if got := Classify(MustParseCards(tc.cards)); got != tc.want {
			t.Errorf("%s: %q, want %q", tc.cards, got, tc.want)
		}
	}
}

func TestRound(t *testing.T) {
	r := Deal(3, 0, rand.New(rand.NewPCG(1, 2)))
	if r.Turn != 1 || len(r.Deck) != 52-12-1 || len(r.Top()) != 1 {
		t.Fatalf("deal: turn %d deck %d top %v", r.Turn, len(r.Deck), r.Top())
	}
	for _, h := range r.Hands {
		if len(h) != 4 {
			t.Fatalf("hand %v", h)
		}
	}
	top := r.Top()[0]
	c := r.Hands[1][0]
	if _, err := r.Play(2, Move{Discard: []Card{r.Hands[2][0]}, FromDeck: true}); err == nil {
		t.Fatal("played out of turn")
	}
	d, err := r.Play(1, Move{Discard: []Card{c}, Take: top})
	if err != nil || d.Card != top {
		t.Fatalf("take: %v %v", d, err)
	}
	if !slices.Contains(r.Hands[1], top) || slices.Contains(r.Hands[1], c) || r.Turn != 2 || r.Top()[0] != c {
		t.Fatalf("after take: %v turn %d top %v", r.Hands[1], r.Turn, r.Top())
	}
	if _, err := r.Play(2, Move{Discard: []Card{r.Hands[2][0]}, Take: top}); err == nil {
		t.Fatal("took a card under the top ply")
	}
}

func TestReshuffle(t *testing.T) {
	r := Deal(2, 0, rand.New(rand.NewPCG(3, 4)))
	for k := 0; k < 200; k++ {
		i := r.Turn
		if _, err := r.Play(i, Move{Discard: r.Hands[i][:1], FromDeck: true}); err != nil {
			t.Fatalf("turn %d: %v", k, err)
		}
		n := len(r.Deck)
		for _, p := range r.Plies {
			n += len(p)
		}
		for _, h := range r.Hands {
			n += len(h)
		}
		if n != 52 {
			t.Fatalf("turn %d: %d cards", k, n)
		}
	}
}

func TestCall(t *testing.T) {
	r := Deal(2, 1, rand.New(rand.NewPCG(5, 6)))
	r.Hands[0] = MustParseCards("KS KH QD JC")
	if r.Call(0) == nil {
		t.Fatal("called with 40")
	}
	r.Hands[0] = MustParseCards("AS 2H 3D")
	if err := r.Call(0); err != nil || !r.Over() {
		t.Fatalf("call: %v", err)
	}
}

func has(r Result, e Event) bool { return slices.Contains(r.Events, e) }

func TestScore(t *testing.T) {
	res, won := Score([]int{3, 10, 20}, 0, []int{0, 0, 0})
	if !won || res[0].Total != 0 || !has(res[0], EvYasat) || res[1].Total != 10 || res[2].Total != 20 {
		t.Fatalf("yasat: %+v", res)
	}
	res, won = Score([]int{5, 2, 9}, 0, []int{10, 10, 10})
	if won || res[0].Total != 45 || !has(res[0], EvOwned) || res[1].Total != 10 || !has(res[1], EvOwn) || res[2].Total != 19 {
		t.Fatalf("owned: %+v", res)
	}
	res, _ = Score([]int{5, 1, 2}, 0, []int{0, 0, 0})
	if !has(res[0], EvMultiOwned) {
		t.Fatalf("multi-owned: %+v", res)
	}
	res, _ = Score([]int{2, 20, 30}, 0, []int{0, 90, 80})
	if !has(res[1], EvDeath) || res[1].Total != 0 || !has(res[2], EvDeath) || !has(res[0], EvDoubleKill) || has(res[0], EvKill) {
		t.Fatalf("double kill: %+v", res)
	}
	res, _ = Score([]int{2, 10}, 0, []int{0, 40})
	if res[1].Total != 0 || !has(res[1], EvNullify50) || !has(res[0], EvEnable50) {
		t.Fatalf("nullify 50: %+v", res)
	}
	res, _ = Score([]int{2, 31}, 0, []int{0, 69})
	if res[1].Total != 0 || !has(res[1], EvLullify) || !has(res[0], EvEnable69) {
		t.Fatalf("lullify: %+v", res)
	}
	res, _ = Score([]int{5, 1}, 0, []int{15, 0})
	if res[0].Total != 0 || !has(res[0], EvContra50) || has(res[0], EvNullify50) || !has(res[0], EvEnable50) {
		t.Fatalf("contra-own 50: %+v", res)
	}
	res, _ = Score([]int{5, 1}, 0, []int{65, 0})
	if !has(res[0], EvContra100) {
		t.Fatalf("contra-own 100: %+v", res)
	}
}

func TestWeighted(t *testing.T) {
	y := []Event{EvYasat}
	rounds := [][][]Event{{y, {}}, {y, {}}, {{EvOwned}, {EvOwn}}}
	s, owner := Weighted(rounds, 2)
	if owner != 0 || s[0] != 1+1-2+LongestStreak || s[1] != 3 {
		t.Fatalf("weighted %v owner %d", s, owner)
	}
}
