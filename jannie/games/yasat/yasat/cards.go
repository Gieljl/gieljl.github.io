// Package yasat is the rules of Yasat (games/yasat/README.md): the
// 52-card deck, the discards, a round from the deal to the call, and the
// scoring of a round with its events. Pure: no I/O, all randomness from
// the caller's rand.
package yasat

import (
	"errors"
	"math/rand/v2"
	"strings"

	"jannie/platform/cards"
)

// Rank is a rank of the 52-card deck: Ace (1) to King (13).
type Rank uint8

const (
	Ace   Rank = 1
	Jack  Rank = 11
	Queen Rank = 12
	King  Rank = 13
)

const rankCodes = "?A23456789TJQK"

// Card is one of the 52 cards; on the wire its code, "AH", "TS", "7D".
type Card struct {
	Rank Rank
	Suit cards.Suit
}

func (c Card) String() string {
	if !c.Valid() {
		return "??"
	}
	return rankCodes[c.Rank:c.Rank+1] + c.Suit.String()
}

// Valid reports whether c is one of the 52.
func (c Card) Valid() bool { return c.Rank >= Ace && c.Rank <= King && c.Suit < cards.NumSuits }

// Red reports whether c is a diamond or a heart.
func (c Card) Red() bool { return c.Suit.Red() }

// Value is c's points in a hand: an ace 1, a court 10, the others their pips.
func (c Card) Value() int {
	if c.Rank >= Jack {
		return 10
	}
	return int(c.Rank)
}

// ParseCard reads a code: "AH", "10H" or "TH", case-insensitive.
func ParseCard(s string) (Card, error) {
	t := strings.ToUpper(strings.TrimSpace(s))
	if strings.HasPrefix(t, "10") {
		t = "T" + t[2:]
	}
	if len(t) != 2 {
		return Card{}, errors.New("Die kaart bestaat niet.")
	}
	r := strings.IndexByte(rankCodes[1:], t[0])
	suit, err := cards.ParseSuit(t[1:])
	if r < 0 || err != nil {
		return Card{}, errors.New("Die kaart bestaat niet.")
	}
	return Card{Rank: Rank(r + 1), Suit: suit}, nil
}

// MustParseCards reads space-separated codes; it panics on a bad one (tests).
func MustParseCards(s string) []Card {
	var out []Card
	for _, f := range strings.Fields(s) {
		c, err := ParseCard(f)
		if err != nil {
			panic(f)
		}
		out = append(out, c)
	}
	return out
}

func (c Card) MarshalText() ([]byte, error) {
	if !c.Valid() {
		return nil, errors.New("yasat: invalid card")
	}
	return []byte(c.String()), nil
}

func (c *Card) UnmarshalText(b []byte) error {
	x, err := ParseCard(string(b))
	if err != nil {
		return err
	}
	*c = x
	return nil
}

// Points is the sum of the hand's values, every ace 1.
func Points(hand []Card) int {
	n := 0
	for _, c := range hand {
		n += c.Value()
	}
	return n
}

// PointsWith is the hand's points with the aces in eleven counted as 11.
func PointsWith(hand []Card, eleven []Card) int {
	n := Points(hand)
	for _, c := range hand {
		if c.Rank == Ace && contains(eleven, c) {
			n += 10
		}
	}
	return n
}

// NewDeck is the 52 cards by suit, then rank.
func NewDeck() []Card {
	deck := make([]Card, 0, 52)
	for s := cards.Suit(0); s < cards.NumSuits; s++ {
		for r := Ace; r <= King; r++ {
			deck = append(deck, Card{Rank: r, Suit: s})
		}
	}
	return deck
}

// Shuffle shuffles cs in place with rng.
func Shuffle(cs []Card, rng *rand.Rand) {
	rng.Shuffle(len(cs), func(i, j int) { cs[i], cs[j] = cs[j], cs[i] })
}

func contains(cs []Card, c Card) bool {
	for _, x := range cs {
		if x == c {
			return true
		}
	}
	return false
}

// Without is hand without the cards of out (a new slice).
func Without(hand, out []Card) []Card {
	rest := make([]Card, 0, len(hand))
	for _, c := range hand {
		if !contains(out, c) {
			rest = append(rest, c)
		}
	}
	return rest
}
