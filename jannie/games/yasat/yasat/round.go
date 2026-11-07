package yasat

import (
	"errors"
	"fmt"
	"math/rand/v2"
)

// MaxCall is the most points a hand may have to call Yasat.
const MaxCall = 7

// HandSize is the cards dealt to everyone.
const HandSize = 4

// Round is one round of Yasat, from the deal to the call. Seats are
// indexes 0..n-1, clockwise.
type Round struct {
	Hands  [][]Card
	Turn   int      // whose turn
	Dealer int      // dealt this round; the seat after it starts
	Deck   []Card   // the draw pile, the top first
	Plies  [][]Card // the discard pile, one ply per discard, the newest last
	Caller int      // -1 until someone called Yasat
	rng    *rand.Rand
}

// Deal starts a round of n players dealt by dealer, shuffled with rng
// (which the round keeps for reshuffling the discards into the pile).
func Deal(n, dealer int, rng *rand.Rand) *Round {
	deck := NewDeck()
	Shuffle(deck, rng)
	r := &Round{Hands: make([][]Card, n), Dealer: dealer, Turn: (dealer + 1) % n, Caller: -1, rng: rng}
	k := 0
	for range HandSize {
		for p := range n {
			r.Hands[p] = append(r.Hands[p], deck[k])
			k++
		}
	}
	r.Plies = [][]Card{{deck[k]}}
	r.Deck = deck[k+1:]
	return r
}

// Over reports whether someone called Yasat.
func (r *Round) Over() bool { return r.Caller >= 0 }

// Top is the newest ply of the discard pile: the cards the player on turn
// may take one of.
func (r *Round) Top() []Card {
	if len(r.Plies) == 0 {
		return nil
	}
	return r.Plies[len(r.Plies)-1]
}

// CanCall reports whether seat i may call Yasat now.
func (r *Round) CanCall(i int) bool {
	return !r.Over() && i == r.Turn && Points(r.Hands[i]) <= MaxCall
}

// Call ends the round with seat i's call.
func (r *Round) Call(i int) error {
	switch {
	case r.Over():
		return errors.New("De ronde is al voorbij.")
	case i != r.Turn:
		return errors.New("Je bent niet aan de beurt.")
	case Points(r.Hands[i]) > MaxCall:
		return fmt.Errorf("Yasat mag pas met %d punten of minder; je hebt er %d.", MaxCall, Points(r.Hands[i]))
	}
	r.Caller = i
	return nil
}

// Move is a turn that is not a call: a discard, then a card from the deck
// (FromDeck) or one of the top ply (Take).
type Move struct {
	Discard  []Card
	FromDeck bool
	Take     Card
}

// Drew is what a move drew: the card, and whether the discards were
// shuffled into a new pile first.
type Drew struct {
	Card       Card
	FromDeck   bool
	Reshuffled bool
}

// Check reports why seat i may not play m, nil when it may.
func (r *Round) Check(i int, m Move) error {
	switch {
	case r.Over():
		return errors.New("De ronde is al voorbij.")
	case i != r.Turn:
		return errors.New("Je bent niet aan de beurt.")
	case Classify(m.Discard) == "":
		return errors.New("Gooi één kaart weg, of een paar, drie of vier gelijke, of een straat van drie of meer in één kleur.")
	}
	for _, c := range m.Discard {
		if !contains(r.Hands[i], c) {
			return errors.New("Die kaart heb je niet.")
		}
	}
	if m.FromDeck {
		if len(r.Deck) == 0 && len(r.Plies) <= 1 {
			return errors.New("De stapel is op.")
		}
		return nil
	}
	if !contains(r.Top(), m.Take) {
		return errors.New("Die kaart ligt niet bovenop de aflegstapel.")
	}
	return nil
}

// Play plays m for seat i: the draw comes from the pile as it was before
// the discard, then the discard becomes the new top ply and the turn
// passes on.
func (r *Round) Play(i int, m Move) (Drew, error) {
	if err := r.Check(i, m); err != nil {
		return Drew{}, err
	}
	d := Drew{FromDeck: m.FromDeck}
	if m.FromDeck {
		if len(r.Deck) == 0 {
			// Every ply but the top one goes back, shuffled.
			var pile []Card
			for _, p := range r.Plies[:len(r.Plies)-1] {
				pile = append(pile, p...)
			}
			Shuffle(pile, r.rng)
			r.Deck, r.Plies = pile, r.Plies[len(r.Plies)-1:]
			d.Reshuffled = true
		}
		d.Card, r.Deck = r.Deck[0], r.Deck[1:]
	} else {
		top := r.Top()
		r.Plies[len(r.Plies)-1] = Without(top, []Card{m.Take})
		d.Card = m.Take
	}
	hand := Without(r.Hands[i], m.Discard)
	r.Hands[i] = append(hand, d.Card)
	r.Plies = append(r.Plies, append([]Card(nil), m.Discard...))
	r.Turn = (r.Turn + 1) % len(r.Hands)
	return d, nil
}
