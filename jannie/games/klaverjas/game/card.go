// Package game is the klaverjas rules engine: cards, legal moves, tricks,
// roem, scoring and the state machine of one hand. It is pure: no timing,
// no I/O and no randomness except in Shuffle.
package game

import (
	"strings"

	kit "jannie/platform/cards" // kit: the tests have a func cards
)

// The seats and the 32 cards are platform/cards's, which every game
// shares; these names keep them in this package for klaverjas's code.
type (
	Seat   = kit.Seat
	Suit   = kit.Suit
	Rank   = kit.Rank
	Card   = kit.Card
	Played = kit.Played
)

// NoSeat marks an unknown or absent seat (no winner yet, nobody's turn).
const NoSeat = kit.NoSeat

const (
	Clubs    = kit.Clubs
	Diamonds = kit.Diamonds
	Hearts   = kit.Hearts
	Spades   = kit.Spades
)

// NumSuits is the number of suits; suits are 0..NumSuits-1.
const NumSuits = kit.NumSuits

const (
	Seven = kit.Seven
	Eight = kit.Eight
	Nine  = kit.Nine
	Ten   = kit.Ten
	Jack  = kit.Jack
	Queen = kit.Queen
	King  = kit.King
	Ace   = kit.Ace
)

// NumRanks is the number of ranks; ranks are 0..NumRanks-1.
const NumRanks = kit.NumRanks

// SuitNameNL returns the Dutch name of the suit ("harten").
func SuitNameNL(s Suit) string { return kit.SuitNameNL(s) }

// ParseSuit parses a wire code ("H", case-insensitive).
func ParseSuit(s string) (Suit, error) { return kit.ParseSuit(s) }

// CardFromIndex is the inverse of Card.Index.
func CardFromIndex(i int) Card { return kit.CardFromIndex(i) }

// ParseCard parses a wire code ("JH"); case-insensitive, "10H" is accepted too.
func ParseCard(s string) (Card, error) { return kit.ParseCard(s) }

// MustParseCards parses space-separated card codes and panics on error.
// Meant for tests and fixed tables.
func MustParseCards(s string) []Card { return kit.MustParseCards(s) }

// CardNameNL returns the Dutch name of the card ("harten boer").
func CardNameNL(c Card) string { return kit.CardNameNL(c) }

// CardShortNL returns the short Dutch notation with symbol ("♥B", "♠10").
func CardShortNL(c Card) string { return kit.CardShortNL(c) }

// NewDeck returns the 32 cards ordered by suit, then rank.
func NewDeck() []Card { return kit.NewDeck() }

// reexport inlines every method of Seat, Suit, Rank and Card that can be
// inlined, which puts their bodies in this package's export data. The
// compiler gives an importer only the bodies of the functions a package
// declares or inlines itself: without this, bot and the other packages
// that reach these types through game alone could not inline Seat.Next or
// Seat.Valid, and would get slower. It is never called.
func reexport(s Seat, u Suit, r Rank, c Card) {
	_, _, _, _, _ = s.Next(), s.Partner(), s.Team(), s.Valid(), s.ValidFor(0)
	_, _, _ = u.String(), u.Symbol(), u.Red()
	_, _ = u.MarshalJSON()
	_, _ = u.MarshalText()
	_ = u.UnmarshalText(nil)
	_, _, _ = r.String(), r.NameNL(), r.Letter()
	_, _, _ = c.String(), c.Valid(), c.Index()
	_, _ = c.MarshalJSON()
	_, _ = c.MarshalText()
	_ = c.UnmarshalText(nil)
}

var (
	// Strength within a suit, 0 (lowest) .. 7 (highest).
	trumpOrder = [NumRanks]int8{Seven: 0, Eight: 1, Queen: 2, King: 3, Ten: 4, Ace: 5, Nine: 6, Jack: 7}
	plainOrder = [NumRanks]int8{Seven: 0, Eight: 1, Nine: 2, Jack: 3, Queen: 4, King: 5, Ten: 6, Ace: 7}

	trumpPoints = [NumRanks]int{Nine: 14, Ten: 10, Jack: 20, Queen: 3, King: 4, Ace: 11}
	plainPoints = [NumRanks]int{Ten: 10, Jack: 2, Queen: 3, King: 4, Ace: 11}
)

// Points returns the card points of c given the trump suit.
func Points(c Card, trump Suit) int {
	if c.Suit == trump {
		return trumpPoints[c.Rank]
	}
	return plainPoints[c.Rank]
}

// Order returns the strength of c within its suit, 0 (lowest) .. 7 (highest),
// using trump order when c is trump.
func Order(c Card, trump Suit) int {
	if c.Suit == trump {
		return int(trumpOrder[c.Rank])
	}
	return int(plainOrder[c.Rank])
}

// TrumpOrder returns the strength of rank r in the trump suit (boer 7 .. 7 0).
func TrumpOrder(r Rank) int { return int(trumpOrder[r]) }

// PlainOrder returns the strength of rank r in a non-trump suit (aas 7 .. 7 0).
func PlainOrder(r Rank) int { return int(plainOrder[r]) }

// Beats reports whether a beats b in a trick with suit led and trump suit:
// a trump beats any non-trump, a higher trump a lower one, and otherwise only
// a higher card of the led suit wins.
func Beats(a, b Card, led, trump Suit) bool {
	if a.Suit == trump {
		if b.Suit != trump {
			return true
		}
		return trumpOrder[a.Rank] > trumpOrder[b.Rank]
	}
	if b.Suit == trump || a.Suit != led {
		return false
	}
	if b.Suit != led {
		return true
	}
	return plainOrder[a.Rank] > plainOrder[b.Rank]
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
