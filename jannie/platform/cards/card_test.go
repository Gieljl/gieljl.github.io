package cards

import (
	"encoding/json"
	"strings"
	"testing"
)

func card(s string) Card {
	c, err := ParseCard(s)
	if err != nil {
		panic(err)
	}
	return c
}

func TestCardCodes(t *testing.T) {
	deck := NewDeck()
	if len(deck) != 32 {
		t.Fatalf("deck has %d cards", len(deck))
	}
	seen := map[Card]bool{}
	for i, c := range deck {
		if seen[c] || !c.Valid() {
			t.Fatalf("bad or duplicate card %v", c)
		}
		seen[c] = true
		if c.Index() != i || CardFromIndex(i) != c {
			t.Errorf("index of %v = %d, want %d", c, c.Index(), i)
		}
		got, err := ParseCard(c.String())
		if err != nil || got != c {
			t.Errorf("ParseCard(%q) = %v, %v", c.String(), got, err)
		}
		lower, err := ParseCard(strings.ToLower(c.String()))
		if err != nil || lower != c {
			t.Errorf("ParseCard lower-case %q = %v, %v", c.String(), lower, err)
		}
	}
	if c, err := ParseCard("10H"); err != nil || c != (Card{Ten, Hearts}) {
		t.Errorf(`ParseCard("10H") = %v, %v`, c, err)
	}
	for _, bad := range []string{"", "J", "JHH", "1H", "XH", "JX", "♥B", "10", "JH "} {
		if _, err := ParseCard(bad); err == nil {
			t.Errorf("ParseCard(%q) succeeded", bad)
		}
	}
	if (Card{Rank: 9, Suit: 0}).Valid() || (Card{Suit: 4}).Valid() {
		t.Error("invalid card reported valid")
	}
}

func TestNames(t *testing.T) {
	tests := []struct {
		card, name, short string
	}{
		{"JH", "harten boer", "♥B"},
		{"9C", "klaveren 9", "♣9"},
		{"TS", "schoppen 10", "♠10"},
		{"QD", "ruiten vrouw", "♦V"},
		{"KH", "harten heer", "♥H"},
		{"AS", "schoppen aas", "♠A"},
	}
	for _, tt := range tests {
		c := card(tt.card)
		if got := CardNameNL(c); got != tt.name {
			t.Errorf("CardNameNL(%s) = %q, want %q", tt.card, got, tt.name)
		}
		if got := CardShortNL(c); got != tt.short {
			t.Errorf("CardShortNL(%s) = %q, want %q", tt.card, got, tt.short)
		}
	}
	wantSuits := []struct {
		code, name, sym string
		red             bool
	}{{"C", "klaveren", "♣", false}, {"D", "ruiten", "♦", true}, {"H", "harten", "♥", true}, {"S", "schoppen", "♠", false}}
	for i, w := range wantSuits {
		s := Suit(i)
		if s.String() != w.code || SuitNameNL(s) != w.name || s.Symbol() != w.sym || s.Red() != w.red {
			t.Errorf("suit %d: %q %q %q %v", i, s.String(), SuitNameNL(s), s.Symbol(), s.Red())
		}
		if p, err := ParseSuit(strings.ToLower(w.code)); err != nil || p != s {
			t.Errorf("ParseSuit(%q) = %v, %v", w.code, p, err)
		}
	}
	for _, bad := range []string{"", "X", "HH", "♥"} {
		if _, err := ParseSuit(bad); err == nil {
			t.Errorf("ParseSuit(%q) succeeded", bad)
		}
	}
	if Suit(7).String() != "?" || SuitNameNL(Suit(7)) != "?" || (Card{Rank: 8}).String() != "??" {
		t.Error("out-of-range values should print as ?")
	}
}

func TestSeat(t *testing.T) {
	for s := Seat(0); s < 4; s++ {
		if s.Next() != (s+1)%4 || s.Partner() != (s+2)%4 || s.Team() != int(s)%2 || !s.Valid() {
			t.Errorf("seat %d: next %d partner %d team %d", s, s.Next(), s.Partner(), s.Team())
		}
	}
	if NoSeat.Valid() || Seat(4).Valid() {
		t.Error("invalid seats reported valid")
	}
}

func TestJSON(t *testing.T) {
	type wire struct {
		Card   Card   `json:"card"`
		Suit   Suit   `json:"suit"`
		Hand   []Card `json:"hand"`
		Played Played `json:"played"`
	}
	in := wire{Card: card("JH"), Suit: Spades, Hand: MustParseCards("TS 7D"), Played: Played{Seat: 2, Card: card("8C")}}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"card":"JH","suit":"S","hand":["TS","7D"],"played":{"seat":2,"card":"8C"}}`
	if string(b) != want {
		t.Errorf("marshal = %s, want %s", b, want)
	}
	var out wire
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	if out.Card != in.Card || out.Suit != in.Suit || len(out.Hand) != 2 || out.Hand[1] != card("7D") || out.Played != in.Played {
		t.Errorf("round trip = %+v", out)
	}
	if b, _ := json.Marshal(wire{}); string(b) != `{"card":"7C","suit":"C","hand":null,"played":{"seat":0,"card":"7C"}}` {
		t.Errorf("zero values marshal as %s", b)
	}
	for _, bad := range []string{`{"card":"XX"}`, `{"card":12}`, `{"suit":"Q"}`} {
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

func TestValidFor(t *testing.T) {
	for _, tt := range []struct {
		s       Seat
		players int
		want    bool
	}{{0, 2, true}, {1, 2, true}, {2, 2, false}, {7, 8, true}, {8, 8, false}, {NoSeat, 4, false}} {
		if got := tt.s.ValidFor(tt.players); got != tt.want {
			t.Errorf("Seat(%d).ValidFor(%d) = %v", tt.s, tt.players, got)
		}
	}
}
