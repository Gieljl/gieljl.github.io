// Package cards is what the games share at the table: the seats and the
// 32-card deck (7 to ace) of the Dutch games, with their wire codes ("JH")
// and Dutch names. A 52-card game such as bridge brings its own Card and
// Rank, and shares Seat and Suit.
//
// Klaverjas's package game re-exports these types, and its reexport
// function names every method that can be inlined: a new one belongs there
// too, or the packages that reach it through game cannot inline it.
package cards

import (
	"errors"
	"strings"
)

// The errors for invalid values say "game:", the package this code came
// from, so that their texts stay as they were.

// Suit is one of the four suits. The wire code is "C", "D", "H" or "S".
type Suit uint8

const (
	Clubs Suit = iota
	Diamonds
	Hearts
	Spades
)

// NumSuits is the number of suits; suits are 0..NumSuits-1.
const NumSuits = 4

const suitCodes = "CDHS"

var (
	suitNames   = [NumSuits]string{"klaveren", "ruiten", "harten", "schoppen"}
	suitSymbols = [NumSuits]string{"♣", "♦", "♥", "♠"}
)

// String returns the wire code ("H").
func (s Suit) String() string {
	if s >= NumSuits {
		return "?"
	}
	return suitCodes[s : s+1]
}

// Symbol returns the suit symbol ("♥").
func (s Suit) Symbol() string {
	if s >= NumSuits {
		return "?"
	}
	return suitSymbols[s]
}

// Red reports whether the suit is red (ruiten, harten).
func (s Suit) Red() bool { return s == Diamonds || s == Hearts }

// SuitNameNL returns the Dutch name of the suit ("harten").
func SuitNameNL(s Suit) string {
	if s >= NumSuits {
		return "?"
	}
	return suitNames[s]
}

// ParseSuit parses a wire code ("H", case-insensitive).
func ParseSuit(s string) (Suit, error) {
	if len(s) == 1 {
		if i := strings.IndexByte(suitCodes, upper(s[0])); i >= 0 {
			return Suit(i), nil
		}
	}
	return 0, errors.New("ongeldige kleur: " + quote(s))
}

func (s Suit) MarshalJSON() ([]byte, error) {
	if s >= NumSuits {
		return nil, errors.New("game: invalid suit")
	}
	return []byte{'"', suitCodes[s], '"'}, nil
}

func (s *Suit) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return nil
	}
	str, err := unquote(b)
	if err != nil {
		return err
	}
	v, err := ParseSuit(str)
	if err != nil {
		return err
	}
	*s = v
	return nil
}

func (s Suit) MarshalText() ([]byte, error) {
	if s >= NumSuits {
		return nil, errors.New("game: invalid suit")
	}
	return []byte{suitCodes[s]}, nil
}

func (s *Suit) UnmarshalText(b []byte) error {
	v, err := ParseSuit(string(b))
	if err != nil {
		return err
	}
	*s = v
	return nil
}

// Rank is a card rank in natural (sequence) order: Seven < ... < Ace.
type Rank uint8

const (
	Seven Rank = iota
	Eight
	Nine
	Ten
	Jack
	Queen
	King
	Ace
)

// NumRanks is the number of ranks; ranks are 0..NumRanks-1.
const NumRanks = 8

const rankCodes = "789TJQKA"

var (
	rankNames  = [NumRanks]string{"7", "8", "9", "10", "boer", "vrouw", "heer", "aas"}
	rankLetter = [NumRanks]string{"7", "8", "9", "10", "B", "V", "H", "A"}
)

// String returns the wire code ("T").
func (r Rank) String() string {
	if r >= NumRanks {
		return "?"
	}
	return rankCodes[r : r+1]
}

// NameNL returns the Dutch rank name ("boer", "10").
func (r Rank) NameNL() string {
	if r >= NumRanks {
		return "?"
	}
	return rankNames[r]
}

// Letter returns the Dutch face letter ("B", "10").
func (r Rank) Letter() string {
	if r >= NumRanks {
		return "?"
	}
	return rankLetter[r]
}

// Card is a playing card. The zero value is the seven of clubs.
type Card struct {
	Rank Rank
	Suit Suit
}

// String returns the wire code: rank then suit ("JH").
func (c Card) String() string {
	if c.Rank >= NumRanks || c.Suit >= NumSuits {
		return "??"
	}
	return string([]byte{rankCodes[c.Rank], suitCodes[c.Suit]})
}

// Valid reports whether the card is one of the 32 cards.
func (c Card) Valid() bool { return c.Rank < NumRanks && c.Suit < NumSuits }

// Index returns a dense index 0..31 (suit-major), handy for bitsets.
func (c Card) Index() int { return int(c.Suit)*NumRanks + int(c.Rank) }

// CardFromIndex is the inverse of Card.Index.
func CardFromIndex(i int) Card { return Card{Rank: Rank(i % NumRanks), Suit: Suit(i / NumRanks)} }

// ParseCard parses a wire code ("JH"); case-insensitive, "10H" is accepted too.
func ParseCard(s string) (Card, error) {
	t := s
	if len(t) == 3 && t[0] == '1' && t[1] == '0' {
		t = "T" + t[2:]
	}
	if len(t) == 2 {
		r := strings.IndexByte(rankCodes, upper(t[0]))
		u := strings.IndexByte(suitCodes, upper(t[1]))
		if r >= 0 && u >= 0 {
			return Card{Rank: Rank(r), Suit: Suit(u)}, nil
		}
	}
	return Card{}, errors.New("ongeldige kaart: " + quote(s))
}

// MustParseCards parses space-separated card codes and panics on error.
// Meant for tests and fixed tables.
func MustParseCards(s string) []Card {
	fields := strings.Fields(s)
	out := make([]Card, 0, len(fields))
	for _, f := range fields {
		c, err := ParseCard(f)
		if err != nil {
			panic(err)
		}
		out = append(out, c)
	}
	return out
}

func (c Card) MarshalJSON() ([]byte, error) {
	if !c.Valid() {
		return nil, errors.New("game: invalid card")
	}
	return []byte{'"', rankCodes[c.Rank], suitCodes[c.Suit], '"'}, nil
}

func (c *Card) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return nil
	}
	str, err := unquote(b)
	if err != nil {
		return err
	}
	v, err := ParseCard(str)
	if err != nil {
		return err
	}
	*c = v
	return nil
}

func (c Card) MarshalText() ([]byte, error) {
	if !c.Valid() {
		return nil, errors.New("game: invalid card")
	}
	return []byte{rankCodes[c.Rank], suitCodes[c.Suit]}, nil
}

func (c *Card) UnmarshalText(b []byte) error {
	v, err := ParseCard(string(b))
	if err != nil {
		return err
	}
	*c = v
	return nil
}

// CardNameNL returns the Dutch name of the card ("harten boer").
func CardNameNL(c Card) string {
	return SuitNameNL(c.Suit) + " " + c.Rank.NameNL()
}

// CardShortNL returns the short Dutch notation with symbol ("♥B", "♠10").
func CardShortNL(c Card) string {
	return c.Suit.Symbol() + c.Rank.Letter()
}

// NewDeck returns the 32 cards ordered by suit, then rank.
func NewDeck() []Card {
	deck := make([]Card, 0, NumSuits*NumRanks)
	for s := Suit(0); s < NumSuits; s++ {
		for r := Rank(0); r < NumRanks; r++ {
			deck = append(deck, Card{Rank: r, Suit: s})
		}
	}
	return deck
}

// Played is one card in a trick and the seat that played it.
type Played struct {
	Seat Seat `json:"seat"`
	Card Card `json:"card"`
}

func upper(b byte) byte {
	if b >= 'a' && b <= 'z' {
		return b - 'a' + 'A'
	}
	return b
}

func unquote(b []byte) (string, error) {
	if len(b) < 2 || b[0] != '"' || b[len(b)-1] != '"' {
		return "", errors.New("game: expected a JSON string")
	}
	return string(b[1 : len(b)-1]), nil
}

// quote shortens and quotes untrusted input for error messages.
func quote(s string) string {
	n := 0
	for i := range s {
		if n == 12 {
			s = s[:i] + "…"
			break
		}
		n++
	}
	return "\"" + strings.ToValidUTF8(s, "?") + "\""
}
