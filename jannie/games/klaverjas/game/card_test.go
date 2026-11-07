package game

import (
	"encoding/json"
	"strings"
	"testing"
)

// cards parses space-separated card codes.
func cards(s string) []Card { return MustParseCards(s) }

func card(s string) Card {
	c, err := ParseCard(s)
	if err != nil {
		panic(err)
	}
	return c
}

// codes formats cards as space-separated codes.
func codes(cs []Card) string {
	parts := make([]string, len(cs))
	for i, c := range cs {
		parts[i] = c.String()
	}
	return strings.Join(parts, " ")
}

func TestPointsAndOrder(t *testing.T) {
	trumpPts := map[Rank]int{Jack: 20, Nine: 14, Ace: 11, Ten: 10, King: 4, Queen: 3, Eight: 0, Seven: 0}
	plainPts := map[Rank]int{Ace: 11, Ten: 10, King: 4, Queen: 3, Jack: 2, Nine: 0, Eight: 0, Seven: 0}
	for trump := Suit(0); trump < NumSuits; trump++ {
		total := 0
		for _, c := range NewDeck() {
			want := plainPts[c.Rank]
			if c.Suit == trump {
				want = trumpPts[c.Rank]
			}
			if got := Points(c, trump); got != want {
				t.Errorf("Points(%v, trump %v) = %d, want %d", c, trump, got, want)
			}
			total += Points(c, trump)
		}
		if total != 152 {
			t.Errorf("card points with trump %v total %d, want 152", trump, total)
		}
	}
	// High to low.
	trumpSeq := []Rank{Jack, Nine, Ace, Ten, King, Queen, Eight, Seven}
	plainSeq := []Rank{Ace, Ten, King, Queen, Jack, Nine, Eight, Seven}
	for i := range trumpSeq {
		if TrumpOrder(trumpSeq[i]) != 7-i || Order(Card{Rank: trumpSeq[i], Suit: Hearts}, Hearts) != 7-i {
			t.Errorf("trump order of %v = %d, want %d", trumpSeq[i], TrumpOrder(trumpSeq[i]), 7-i)
		}
		if PlainOrder(plainSeq[i]) != 7-i || Order(Card{Rank: plainSeq[i], Suit: Clubs}, Hearts) != 7-i {
			t.Errorf("plain order of %v = %d, want %d", plainSeq[i], PlainOrder(plainSeq[i]), 7-i)
		}
	}
	if got := CardPoints(cards("JH 9H AS TD 7C"), Hearts); got != 20+14+11+10 {
		t.Errorf("CardPoints = %d", got)
	}
}

func TestBeats(t *testing.T) {
	tests := []struct {
		a, b       string
		led, trump Suit
		want       bool
	}{
		{"7H", "AS", Spades, Hearts, true},  // any trump beats a non-trump
		{"AS", "7H", Spades, Hearts, false}, // and is not beaten by one
		{"JH", "9H", Spades, Hearts, true},  // boer is the highest trump
		{"9H", "AH", Hearts, Hearts, true},  // nel beats aas
		{"AH", "9H", Hearts, Hearts, false},
		{"TH", "KH", Hearts, Hearts, true},
		{"8H", "QH", Hearts, Hearts, false}, // 8 is below vrouw in trump
		{"8H", "7H", Hearts, Hearts, true},
		{"AS", "TS", Spades, Hearts, true}, // plain: aas > 10
		{"TS", "KS", Spades, Hearts, true}, // 10 > heer
		{"JS", "9S", Spades, Hearts, true}, // plain: boer > 9
		{"QS", "JS", Spades, Hearts, true},
		{"9S", "JS", Spades, Hearts, false},
		{"AD", "7S", Spades, Hearts, false}, // off-suit never wins
		{"7S", "AD", Spades, Hearts, true},  // led suit beats off-suit
		{"AC", "AD", Spades, Hearts, false}, // neither led nor trump
		{"JC", "AC", Clubs, Clubs, true},    // trump led
		{"7C", "AC", Clubs, Clubs, false},
	}
	for _, tt := range tests {
		if got := Beats(card(tt.a), card(tt.b), tt.led, tt.trump); got != tt.want {
			t.Errorf("Beats(%s, %s, led %v, trump %v) = %v, want %v", tt.a, tt.b, tt.led, tt.trump, got, tt.want)
		}
	}
}

// TestBeatsOrder checks Beats is a strict total order on led and trump
// cards, and that other cards never beat anything.
func TestBeatsOrder(t *testing.T) {
	deck := NewDeck()
	for trump := Suit(0); trump < NumSuits; trump++ {
		for led := Suit(0); led < NumSuits; led++ {
			for _, a := range deck {
				for _, b := range deck {
					ab, ba := Beats(a, b, led, trump), Beats(b, a, led, trump)
					relevant := func(c Card) bool { return c.Suit == led || c.Suit == trump }
					switch {
					case a == b:
						if ab {
							t.Fatalf("%v beats itself", a)
						}
					case !relevant(a) && ab:
						t.Fatalf("off-suit %v beats %v (led %v trump %v)", a, b, led, trump)
					case relevant(a) && relevant(b) && ab == ba:
						t.Fatalf("%v vs %v not ordered (led %v trump %v)", a, b, led, trump)
					case relevant(a) && !relevant(b) && !ab:
						t.Fatalf("%v does not beat off-suit %v", a, b)
					}
				}
			}
		}
	}
}

func TestJSON(t *testing.T) {
	type wire struct {
		Card  Card      `json:"card"`
		Suit  Suit      `json:"suit"`
		Rules Rules     `json:"rules"`
		Mode  TrumpMode `json:"mode"`
		Hand  []Card    `json:"hand"`
	}
	in := wire{Card: card("JH"), Suit: Spades, Rules: Rotterdams, Mode: Gedraaid, Hand: cards("TS 7D")}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"card":"JH","suit":"S","rules":"rotterdams","mode":"gedraaid","hand":["TS","7D"]}`
	if string(b) != want {
		t.Errorf("marshal = %s, want %s", b, want)
	}
	var out wire
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	if out.Card != in.Card || out.Suit != in.Suit || out.Rules != in.Rules || out.Mode != in.Mode || codes(out.Hand) != "TS 7D" {
		t.Errorf("round trip = %+v", out)
	}
	if b, _ := json.Marshal(wire{}); string(b) != `{"card":"7C","suit":"C","rules":"amsterdams","mode":"utrechts","hand":null}` {
		t.Errorf("zero values marshal as %s", b)
	}
	for _, bad := range []string{`{"card":"XX"}`, `{"card":12}`, `{"suit":"Q"}`, `{"rules":"leids"}`, `{"mode":"vrij"}`} {
		if err := json.Unmarshal([]byte(bad), &out); err == nil {
			t.Errorf("unmarshal %s succeeded", bad)
		}
	}
	// null leaves the value alone.
	out = wire{Card: card("AS"), Suit: Hearts}
	if err := json.Unmarshal([]byte(`{"card":null,"suit":null}`), &out); err != nil || out.Card != card("AS") || out.Suit != Hearts {
		t.Errorf("null handling: %+v %v", out, err)
	}
	if _, err := json.Marshal(Card{Rank: 9}); err == nil {
		t.Error("marshalled an invalid card")
	}
	// Map keys use the text form.
	b, err = json.Marshal(map[Suit]int{Hearts: 2})
	if err != nil || string(b) != `{"H":2}` {
		t.Errorf("map key = %s, %v", b, err)
	}
}

func TestParseOptions(t *testing.T) {
	for _, r := range []Rules{Amsterdams, Rotterdams} {
		if got, err := ParseRules(r.String()); err != nil || got != r {
			t.Errorf("ParseRules(%q) = %v, %v", r, got, err)
		}
	}
	for _, m := range []TrumpMode{Utrechts, Gedraaid} {
		if got, err := ParseTrumpMode(m.String()); err != nil || got != m {
			t.Errorf("ParseTrumpMode(%q) = %v, %v", m, got, err)
		}
	}
	if Amsterdams.NameNL() != "Amsterdams" || Rotterdams.NameNL() != "Rotterdams" ||
		Utrechts.NameNL() != "Utrechts" || Gedraaid.NameNL() != "Gedraaid" {
		t.Error("display names")
	}
	if _, err := ParseRules("Amsterdams"); err == nil {
		t.Error("ParseRules is case-sensitive like the wire format")
	}
}
