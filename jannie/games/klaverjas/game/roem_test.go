package game

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestTrickRoem(t *testing.T) {
	tests := []struct {
		name  string
		cards string
		trump Suit
		want  []RoemItem
	}{
		{"nothing", "7H 9S AD KC", Hearts, nil},
		{"driekaart", "7H 8H 9H KS", Spades, []RoemItem{{RoemDrie, 20}}},
		{"driekaart in any order", "9C 7C 8C AD", Hearts, []RoemItem{{RoemDrie, 20}}},
		{"ten sits between 9 and boer", "9H TH JH QC", Spades, []RoemItem{{RoemDrie, 20}}},
		{"natural order, not trump order", "8D 9D TD 7S", Diamonds, []RoemItem{{RoemDrie, 20}}},
		{"vierkaart", "8H 9H TH JH", Spades, []RoemItem{{RoemVier, 50}}},
		{"vierkaart at the top", "JC QC KC AC", Hearts, []RoemItem{{RoemVier, 50}}},
		{"stuk alone", "QH KH 7S 8D", Hearts, []RoemItem{{RoemStuk, 20}}},
		{"heer and vrouw of a side suit are no stuk", "QH KH 7S 8D", Clubs, nil},
		{"stuk with driekaart = 40", "QH KH AH 7S", Hearts, []RoemItem{{RoemDrie, 20}, {RoemStuk, 20}}},
		{"stuk with driekaart below", "JS QS KS 7D", Spades, []RoemItem{{RoemDrie, 20}, {RoemStuk, 20}}},
		{"stuk with vierkaart = 70", "TH JH QH KH", Hearts, []RoemItem{{RoemVier, 50}, {RoemStuk, 20}}},
		{"vierkaart with stuk at the top", "QD KD AD JD", Diamonds, []RoemItem{{RoemVier, 50}, {RoemStuk, 20}}},
		{"vierkaart without trump: no stuk", "TH JH QH KH", Clubs, []RoemItem{{RoemVier, 50}}},
		{"four jacks = 200", "JC JD JH JS", Hearts, []RoemItem{{RoemVierBoeren, 200}}},
		{"four aces = 100", "AC AD AH AS", Spades, []RoemItem{{RoemVierGelijk, 100}}},
		{"four tens", "TC TD TH TS", Clubs, []RoemItem{{RoemVierGelijk, 100}}},
		{"four kings", "KC KD KH KS", Diamonds, []RoemItem{{RoemVierGelijk, 100}}},
		{"four queens", "QC QD QH QS", Hearts, []RoemItem{{RoemVierGelijk, 100}}},
		{"four nines are nothing", "9C 9D 9H 9S", Hearts, nil},
		{"four eights are nothing", "8C 8D 8H 8S", Hearts, nil},
		{"four sevens are nothing", "7C 7D 7H 7S", Hearts, nil},
		{"gap at the 10", "8H 9H JH QH", Spades, nil},
		{"no wrap from aas to 7", "KH AH 7H 8H", Spades, nil},
		{"two pairs", "7H 8H 7S 8S", Clubs, nil},
		{"no roem across suits", "7H 8D 9H TC", Clubs, nil},
		{"no roem across suits 2", "TC JD QC KD", Diamonds, nil},
		{"driekaart plus a stray stuk card", "9S TS JS KS", Spades, []RoemItem{{RoemDrie, 20}}},
		{"three cards", "QH KH AH", Hearts, []RoemItem{{RoemDrie, 20}, {RoemStuk, 20}}},
	}
	for _, tt := range tests {
		cs := cards(tt.cards)
		got := TrickRoem(cs, tt.trump)
		if !slices.Equal(got, tt.want) {
			t.Errorf("%s: TrickRoem(%s, %v) = %v, want %v", tt.name, tt.cards, tt.trump, got, tt.want)
		}
		sum := 0
		for _, r := range tt.want {
			sum += r.Points
		}
		if p := RoemPoints(cs, tt.trump); p != sum {
			t.Errorf("%s: RoemPoints = %d, want %d", tt.name, p, sum)
		}
	}
}

// refRoem is an independent, straightforward roem count used to check
// every possible four-card trick.
func refRoem(cs []Card, trump Suit) int {
	if cs[0].Rank == cs[1].Rank && cs[1].Rank == cs[2].Rank && cs[2].Rank == cs[3].Rank {
		switch cs[0].Rank {
		case Jack:
			return 200
		case Queen, King, Ten, Ace:
			return 100
		default:
			return 0
		}
	}
	total := 0
	for s := Suit(0); s < NumSuits; s++ {
		var has [NumRanks]bool
		for _, c := range cs {
			if c.Suit == s {
				has[c.Rank] = true
			}
		}
		best, run := 0, 0
		for r := range has {
			if has[r] {
				run++
				best = max(best, run)
			} else {
				run = 0
			}
		}
		if best == 3 {
			total += 20
		}
		if best == 4 {
			total += 50
		}
		if s == trump && has[King] && has[Queen] {
			total += 20
		}
	}
	return total
}

func TestRoemAllTricks(t *testing.T) {
	deck := NewDeck()
	counts := map[int]int{}
	buf := make([]RoemItem, 0, 2)
	for a := 0; a < 32; a++ {
		for b := a + 1; b < 32; b++ {
			for c := b + 1; c < 32; c++ {
				for d := c + 1; d < 32; d++ {
					cs := []Card{deck[a], deck[b], deck[c], deck[d]}
					for trump := Suit(0); trump < NumSuits; trump++ {
						want := refRoem(cs, trump)
						buf = AppendTrickRoem(buf[:0], cs, trump)
						got := 0
						for _, r := range buf {
							got += r.Points
						}
						if got != want || RoemPoints(cs, trump) != want || len(buf) > 2 {
							t.Fatalf("roem of %v (trump %v) = %v, want %d", cs, trump, buf, want)
						}
						if trump == Hearts {
							counts[want]++
						}
					}
				}
			}
		}
	}
	// Sanity: every value occurs, with plausible frequencies.
	for _, v := range []int{0, 20, 40, 50, 70, 100, 200} {
		if counts[v] == 0 {
			t.Errorf("no trick with %d roem", v)
		}
	}
	if counts[200] != 1 || counts[100] != 4 || counts[70] != 2 {
		t.Errorf("unexpected counts: %v", counts)
	}
}

// TestRoemAdded checks RoemAdded against RoemPoints for every set of up to
// three cards and every card added, with each trump and without one.
func TestRoemAdded(t *testing.T) {
	deck := NewDeck()
	var check func(cs []Card, from int)
	check = func(cs []Card, from int) {
		for _, c := range deck {
			if slices.Contains(cs, c) {
				continue
			}
			for trump := Suit(0); trump <= NumSuits; trump++ {
				want := RoemPoints(append(slices.Clone(cs), c), trump) - RoemPoints(cs, trump)
				if got := RoemAdded(cs, c, trump); got != want {
					t.Fatalf("RoemAdded(%v, %v, %v) = %d, want %d", cs, c, trump, got, want)
				}
			}
		}
		if len(cs) < 3 {
			for i := from; i < len(deck); i++ {
				check(append(cs, deck[i]), i+1)
			}
		}
	}
	check(nil, 0)
}

func TestRoemDoesNotAllocate(t *testing.T) {
	cs := cards("TH JH QH KH")
	buf := make([]RoemItem, 0, 2)
	allocs := testing.AllocsPerRun(1000, func() {
		buf = AppendTrickRoem(buf[:0], cs, Hearts)
		_ = RoemPoints(cs, Hearts)
	})
	if allocs != 0 {
		t.Errorf("roem allocates %.1f times per call", allocs)
	}
}

func TestRoemNames(t *testing.T) {
	want := map[string]string{
		RoemDrie: "driekaart", RoemVier: "vierkaart", RoemStuk: "stuk",
		RoemVierGelijk: "vier gelijke", RoemVierBoeren: "vier boeren",
	}
	for kind, name := range want {
		if got := (RoemItem{Kind: kind}).NameNL(); got != name {
			t.Errorf("NameNL(%s) = %q, want %q", kind, got, name)
		}
	}
	b, _ := json.Marshal(RoemItem{RoemStuk, 20})
	if string(b) != `{"kind":"stuk","points":20}` {
		t.Errorf("RoemItem JSON = %s", b)
	}
}

func TestTrickHelpers(t *testing.T) {
	tr := buildTrick(2, cards("7S AS 8H"))
	if s, ok := tr.Led(); !ok || s != Spades {
		t.Errorf("Led = %v, %v", s, ok)
	}
	if w, ok := tr.CurrentWinner(Hearts); !ok || w != 0 {
		t.Errorf("CurrentWinner trump ♥ = %v, %v; want 0", w, ok)
	}
	if w, ok := tr.CurrentWinner(Clubs); !ok || w != 3 {
		t.Errorf("CurrentWinner trump ♣ = %v, %v; want 3", w, ok)
	}
	if c, ok := tr.WinningCard(Clubs); !ok || c != card("AS") {
		t.Errorf("WinningCard = %v, %v", c, ok)
	}
	if tr.Next() != 1 || tr.Complete() {
		t.Errorf("Next = %v, Complete = %v", tr.Next(), tr.Complete())
	}
	empty := Trick{Leader: 3, Winner: NoSeat}
	if _, ok := empty.Led(); ok {
		t.Error("empty trick has a led suit")
	}
	if _, ok := empty.CurrentWinner(Hearts); ok {
		t.Error("empty trick has a winner")
	}
	if empty.Next() != 3 {
		t.Errorf("empty Next = %v", empty.Next())
	}
	b, _ := json.Marshal(empty)
	if string(b) != `{"leader":3,"cards":[],"winner":-1,"points":0,"roem":[]}` {
		t.Errorf("empty trick JSON = %s", b)
	}
	full := buildTrick(1, cards("QH KH 7S 8D"))
	full.Winner, full.Points, full.Roem = 2, 7, []RoemItem{{RoemStuk, 20}}
	if full.RoemTotal() != 20 || !full.Complete() || full.Next() != NoSeat {
		t.Error("complete trick helpers")
	}
	b, _ = json.Marshal(full)
	want := `{"leader":1,"cards":[{"seat":1,"card":"QH"},{"seat":2,"card":"KH"},{"seat":3,"card":"7S"},{"seat":0,"card":"8D"}],"winner":2,"points":7,"roem":[{"kind":"stuk","points":20}]}`
	if string(b) != want {
		t.Errorf("trick JSON = %s\nwant %s", b, want)
	}
	var back Trick
	if err := json.Unmarshal(b, &back); err != nil || back.Winner != 2 || len(back.Cards) != 4 || back.Cards[3].Card != card("8D") {
		t.Errorf("trick round trip = %+v, %v", back, err)
	}
}
