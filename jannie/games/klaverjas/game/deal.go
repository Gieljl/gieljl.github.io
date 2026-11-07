package game

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/bits"
	"math/rand/v2"
)

// Phase of a deal.
type Phase string

const (
	PhaseAuction Phase = "auction" // three players: bidding points for the right to play alone
	PhaseDiscard Phase = "discard" // three players: the soloist took the talon and lays two cards away
	PhaseTrump   Phase = "trump"   // a player chooses trump (utrechts, forced in gedraaid, or the soloist)
	PhaseBid     Phase = "bid"     // gedraaid: players say spelen or passen on the turned suit
	PhasePlay    Phase = "play"    // tricks are being played
	PhaseDone    Phase = "done"    // all tricks played; Result is valid
)

// Errors returned by the Deal actions. Their texts are Dutch and may be
// shown to players as they are.
var (
	ErrWrongPhase  = errors.New("Dat kan nu niet.")
	ErrNotYourTurn = errors.New("Je bent niet aan de beurt.")
	ErrBadSuit     = errors.New("Ongeldige kleur.")
	ErrTurnedSuit  = errors.New("De gedraaide kleur is door iedereen gepast: kies een andere kleur.")
	ErrNotInHand   = errors.New("Die kaart heb je niet.")
	ErrIllegal     = errors.New("Die kaart mag je nu niet spelen.")
	ErrBadBid      = errors.New("Dat bod kan niet.")
	ErrBadDiscard  = errors.New("Leg twee verschillende kaarten uit je hand weg.")
)

// IllegalError is returned by Play for a card the rules forbid. Reason is
// the Dutch explanation from ExplainIllegal; errors.Is(err, ErrIllegal) holds.
type IllegalError struct {
	Card   Card
	Reason string
}

func (e *IllegalError) Error() string { return e.Reason }
func (e *IllegalError) Unwrap() error { return ErrIllegal }

// Bidding with three players
// (games/klaverjas/README.md#three-players-wikipedia-klaverjassen-met-drie-personen):
// a bid is the points (roem included) the soloist promises to make, from
// MinBid up in steps of BidStep, at most MaxBid.
const (
	MinBid  = 80
	BidStep = 10
	MaxBid  = 300
)

// HandResult is the outcome of one hand. Points, Roem and Score are per
// side (see Deal.Side): the teams with four players, the soloist (0) and
// the other two (1) with three, each player with two.
type HandResult struct {
	Players     int    `json:"players"`
	PlayingTeam int    `json:"playingTeam"`
	TrumpBy     Seat   `json:"trumpBy"`
	Trump       Suit   `json:"trump"`
	Dealer      Seat   `json:"dealer"`
	Points      [2]int `json:"points"` // card points incl. last trick (and the soloist's discards), before nat
	Roem        [2]int `json:"roem"`   // roem incl. the 100 for pit, before nat
	Score       [2]int `json:"score"`  // what each side scores
	Nat         bool   `json:"nat"`
	Pit         bool   `json:"pit"`
	PitTeam     int    `json:"pitTeam"` // -1 if none
	// Three players: the soloist's bid, and the two cards laid away.
	Bid      int     `json:"bid"`
	Discards [2]Card `json:"discards"`
	// Gains is what goes on the score sheet per scorer (Scorers): the
	// teams with four players, else every player; with three the other
	// two share their side's score, half each (rounded up).
	Gains [4]int `json:"gains"`
}

// MarshalJSON writes discards as [] unless there are any, and gains with
// one entry per scorer.
func (r HandResult) MarshalJSON() ([]byte, error) {
	type plain HandResult
	return json.Marshal(struct {
		plain
		Discards []Card `json:"discards"`
		Gains    []int  `json:"gains"`
	}{plain(r), r.discardList(), r.Gains[:Scorers(r.Players)]})
}

func (r HandResult) discardList() []Card {
	if r.Players != 3 || r.Bid == 0 {
		return []Card{}
	}
	return r.Discards[:]
}

// UnmarshalJSON reads what MarshalJSON writes.
func (r *HandResult) UnmarshalJSON(b []byte) error {
	type plain HandResult
	var v struct {
		plain
		Discards []Card `json:"discards"`
		Gains    []int  `json:"gains"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	*r = HandResult(v.plain)
	copy(r.Discards[:], v.Discards)
	copy(r.Gains[:], v.Gains)
	return nil
}

// Scorers is the number of separate scores in a match: the two teams with
// four players, else every player.
func Scorers(players int) int {
	if players == 4 || players == 0 {
		return 2
	}
	return players
}

// ScorerOf returns whose score seat plays for in a match of players:
// its team with four players, else itself.
func ScorerOf(seat Seat, players int) int {
	if players == 4 {
		return seat.Team()
	}
	return int(seat)
}

// PitBonus is the roem for winning every trick of a hand.
const PitBonus = 100

// LastTrickBonus is added to the card points of the last trick.
const LastTrickBonus = 10

// ScoreHand applies the nat rule: the playing team must score strictly more
// than half of all points and roem (roem includes any pit bonus). If not,
// it is nat: it scores 0 and the defenders score everything.
func ScoreHand(playingTeam int, points, roem [2]int) (score [2]int, nat bool) {
	p := playingTeam & 1
	total := points[0] + points[1] + roem[0] + roem[1]
	if 2*(points[p]+roem[p]) > total {
		return [2]int{points[0] + roem[0], points[1] + roem[1]}, false
	}
	score[1-p] = total
	return score, true
}

// ScoreSolo applies the rule for three players: the soloist (side 0) must
// make at least its bid in points plus roem. If not, it is nat: the
// soloist scores 0 and the other two score everything.
func ScoreSolo(bid int, points, roem [2]int) (score [2]int, nat bool) {
	if points[0]+roem[0] >= bid {
		return [2]int{points[0] + roem[0], points[1] + roem[1]}, false
	}
	score[1] = points[0] + points[1] + roem[0] + roem[1]
	return score, true
}

// Pile is one of the eight places in front of a player in the two-player
// game: at most two cards, the one on top face up once turned. The card
// under it stays face down until the top card has been played and its
// trick is complete.
type Pile struct {
	N    int  // cards left: 0, 1 or 2
	Up   bool // the card on top is face up
	Card Card // that card, when Up
}

// pileJSON is the wire form of a Pile.
type pileJSON struct {
	N    int   `json:"n"`
	Card *Card `json:"card"`
}

// MarshalJSON writes {"n":2,"card":"JH"}, with "card":null when the top
// card is face down (or the pile is empty).
func (p Pile) MarshalJSON() ([]byte, error) {
	var c *Card
	if p.Up && p.N > 0 {
		c = &p.Card
	}
	return json.Marshal(pileJSON{p.N, c})
}

// UnmarshalJSON reads what MarshalJSON writes.
func (p *Pile) UnmarshalJSON(b []byte) error {
	var v pileJSON
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	*p = Pile{N: v.N, Up: v.Card != nil}
	if v.Card != nil {
		p.Card = *v.Card
	}
	return nil
}

// View is everything one seat may know about a deal. HandNo, HandsTotal and
// MatchScore are not known to the deal; the server fills them in.
type View struct {
	Players     int // 2, 3 or 4
	Seat        Seat
	Hand        []Card // the cards Seat can play: with two players only the face-up ones
	Dealer      Seat
	Voorhand    Seat
	Mode        TrumpMode
	Rules       Rules
	Phase       Phase
	Turn        Seat // whose action is awaited, NoSeat when done
	Trump       Suit
	TrumpKnown  bool
	TrumpBy     Seat // NoSeat before trump is known
	PlayingTeam int  // -1 before trump is known
	Partner     Seat // who plays with Seat in this hand (see Deal.Partner), NoSeat if nobody
	Turned      Suit
	Bids        [4]int
	Forced      bool
	// Three players: the highest bid so far (the contract once the
	// auction is over) and who made it; the soloist also sees the talon
	// it took and the cards it laid away.
	Bid      int
	Bidder   Seat
	Talon    []Card
	Discards []Card
	// Two players: the eight piles of each player, and the roem of the
	// cards that lay open on them when play began.
	Piles    [2][8]Pile
	OpenRoem [2][]RoemItem
	// Current is the trick the next card goes into: once a trick is complete
	// it is already the next (empty) trick, led by the winner; the completed
	// trick is the last of Tricks. When the deal is done, Current is the
	// last trick.
	Current            Trick
	Tricks             []Trick // completed tricks of this hand, in order
	Legal              []Card  // when it is Seat's turn in phase play
	HandNo, HandsTotal int
	MatchScore         []int    // per scorer (see Scorers)
	Signals            *Signals // the table's agreements on signals; nil: DefaultSignals
}

// trickRec is the compact, copyable form of a trick inside Deal. It is
// kept small (seats as int8, roem as indexes into roemItems): simulations
// copy a whole Deal for every playout.
type trickRec struct {
	cards  [4]Card
	n      uint8
	nRoem  uint8
	high   int8 // trump order of the highest trump so far, -1 if none (n > 0)
	best   Card // the card winning the trick so far (n > 0)
	win    int8 // the seat that played it
	lead   int8 // the seat that led
	won    int8 // the seat that won the trick, NoSeat until it is complete
	points int16
	roem   [2]uint8
}

// newTrick starts the trick that leader leads.
func newTrick(leader Seat) trickRec { return trickRec{lead: int8(leader), won: int8(NoSeat)} }

func (r *trickRec) leader() Seat { return Seat(r.lead) }
func (r *trickRec) winner() Seat { return Seat(r.won) }

// add puts card c, played by seat, into the trick and keeps track of the
// card winning it so far.
func (r *trickRec) add(seat Seat, c Card, trump Suit) {
	switch {
	case r.n == 0:
		r.best, r.win, r.high = c, int8(seat), -1
	case Beats(c, r.best, r.cards[0].Suit, trump):
		r.best, r.win = c, int8(seat)
	}
	if c.Suit == trump && trumpOrder[c.Rank] > r.high {
		r.high = trumpOrder[c.Rank]
	}
	r.cards[r.n] = c
	r.n++
}

// info summarises the trick for the rules (as infoFromTrick) at a table
// of n players: a complete trick counts as a new, empty one.
func (r *trickRec) info(n uint8) trickInfo {
	if r.n == 0 || r.n >= n {
		return trickInfo{high: -1, winner: NoSeat}
	}
	return trickInfo{n: int(r.n), led: r.cards[0].Suit, winner: Seat(r.win), best: r.best, high: r.high}
}

// score fills in the points (with bonus added) and the roem of the
// complete trick and returns its points and roem.
func (r *trickRec) score(trump Suit, bonus int) (points, roem int) {
	points = CardPoints(r.cards[:r.n], trump) + bonus
	r.points = int16(points)
	items, k := trickRoem(r.cards[:r.n], trump)
	r.nRoem = uint8(copy(r.roem[:], items[:k])) // at most two in a trick
	for _, it := range r.roem[:r.nRoem] {
		roem += roemItems[it].Points
	}
	return points, roem
}

// Deal is one hand ("potje") for 2, 3 or 4 players as a pure state
// machine: no timing and no randomness. It holds no slices or maps, so
// assigning *dst = *src (or Clone) is a complete, independent copy, which
// suits simulations.
type Deal struct {
	n          uint8 // players
	dealer     Seat
	mode       TrumpMode
	rules      Rules
	phase      Phase
	turn       Seat
	turned     Suit
	trump      Suit
	trumpKnown bool
	trumpBy    Seat
	forced     bool
	bids       [4]int
	// Three players: the highest bid (then the contract) and its bidder,
	// NoSeat before the first bid; the talon and what the soloist laid
	// away.
	bid      int
	bidder   Seat
	talon    [2]Card
	discards [2]Card
	// Every card keeps the place it was dealt at: hands[s][i] is card i of
	// seat s, gone marks the cards played (or laid away) and up the face-up
	// ones. With two players places 0..7 are the tops of the eight piles
	// (0..3 the front row) and 8+i the card under pile i; with three,
	// places 10 and 11 take the talon. held is the set (bit Card.Index)
	// of the cards a seat can play, those up and not gone, and at the
	// place of each of them: see sync.
	hands  [4][16]Card
	nCards [4]uint8
	gone   [4]uint16
	up     [4]uint16
	held   [4]uint32
	at     [32]uint8
	tricks [16]trickRec
	cur    int // index of the current trick in tricks
	points [2]int
	roem   [2]int
	won    [2]int
}

// Cards per seat as dealt, and the number of tricks, for each player count.
var handSize = [5]int{2: 16, 3: 10, 4: 8}

// NewDeal starts a hand for four players. hands are the cards of seats
// 0..3 (normally 8 each, all the same length); turned is the turned suit
// for gedraaid and ignored for utrechts. It panics on hands of unequal
// length or longer than 8.
func NewDeal(dealer Seat, hands [4][]Card, mode TrumpMode, rules Rules, turned Suit) *Deal {
	d := new(Deal) // inlined, as NewDealFor
	d.start(4, dealer, hands, nil, mode, rules, turned)
	return d
}

// NewDealFor starts a hand for 2, 3 or 4 players
// (games/klaverjas/README.md#rules-as-implemented), with the cards as
// ShuffleFor deals them: hands[s] for the seats 0..players-1 (all the same
// length, at most a full hand; with two players 16 cards, the tops of the
// eight piles and then the cards under them) and with three players the
// two cards of the talon. With three players the mode is ignored: the
// auction decides. It panics on a bad layout.
func NewDealFor(players int, dealer Seat, hands [4][]Card, talon []Card, mode TrumpMode, rules Rules, turned Suit) *Deal {
	// Small enough to be inlined, so that a deal which does not outlive
	// its caller (a simulation's) stays off the heap.
	d := new(Deal)
	d.start(players, dealer, hands, talon, mode, rules, turned)
	return d
}

// start sets d up as NewDealFor describes.
func (d *Deal) start(players int, dealer Seat, hands [4][]Card, talon []Card, mode TrumpMode, rules Rules, turned Suit) {
	if players < 2 || players > 4 {
		panic(fmt.Sprintf("game: NewDealFor: %d players", players))
	}
	*d = Deal{
		n:       uint8(players),
		dealer:  dealer,
		mode:    mode,
		rules:   rules,
		turned:  turned & 3,
		trumpBy: NoSeat,
		bidder:  NoSeat,
		bids:    [4]int{-1, -1, -1, -1},
	}
	if !dealer.ValidFor(players) {
		panic(fmt.Sprintf("game: NewDealFor: dealer %d of %d", dealer, players))
	}
	for s, h := range hands {
		bad := len(h) != len(hands[0]) || len(h) > handSize[players]
		if s >= players {
			bad = len(h) != 0
		} else if players == 2 {
			bad = len(h) != 16
		}
		if bad {
			panic(fmt.Sprintf("game: NewDealFor: bad hand sizes %d/%d/%d/%d for %d players",
				len(hands[0]), len(hands[1]), len(hands[2]), len(hands[3]), players))
		}
		d.nCards[s] = uint8(copy(d.hands[s][:], h))
		d.up[s] = 1<<d.nCards[s] - 1
	}
	want := 0
	if players == 3 {
		want = 2
	}
	if len(talon) != want {
		panic(fmt.Sprintf("game: NewDealFor: talon of %d cards for %d players", len(talon), players))
	}
	d.turn = d.next(d.dealer)
	d.tricks[0] = newTrick(d.turn)
	switch {
	case players == 3:
		copy(d.talon[:], talon)
		d.mode = Utrechts
		d.phase = PhaseAuction
	case mode == Gedraaid:
		d.phase = PhaseBid
	default:
		d.phase = PhaseTrump
	}
	if players == 2 {
		d.up = [4]uint16{0x000F, 0x000F} // the tops of the front rows
	}
	for s := range Seat(players) {
		d.sync(s)
	}
}

// Shuffle shuffles a deck and deals it 3-2-3 to seats 0..3. A nil rng uses
// the global source.
func Shuffle(rng *rand.Rand) [4][]Card {
	hands, _ := ShuffleFor(4, rng)
	return hands
}

// ShuffleFor shuffles a deck and deals it for 2, 3 or 4 players
// (games/klaverjas/README.md#rules-as-implemented): with four 3-2-3 to
// seats 0..3; with three 3, then two cards to the talon, then 4 and 3 to
// seats 0..2; with two the first 16 cards to seat 0 and the rest to seat 1
// (the tops of the piles first). A nil rng uses the global source.
func ShuffleFor(players int, rng *rand.Rand) (hands [4][]Card, talon []Card) {
	deck := NewDeck()
	swap := func(i, j int) { deck[i], deck[j] = deck[j], deck[i] }
	if rng != nil {
		rng.Shuffle(len(deck), swap)
	} else {
		rand.Shuffle(len(deck), swap)
	}
	switch players {
	case 2:
		return [4][]Card{deck[:16:16], deck[16:]}, nil
	case 3:
		for s := range 3 {
			hands[s] = make([]Card, 0, 10)
		}
		i := 0
		for round, k := range [3]int{3, 4, 3} {
			for s := range 3 {
				hands[s] = append(hands[s], deck[i:i+k]...)
				i += k
			}
			if round == 0 {
				talon = append([]Card(nil), deck[i:i+2]...)
				i += 2
			}
		}
		return hands, talon
	}
	for s := range hands {
		hands[s] = make([]Card, 0, 8)
	}
	i := 0
	for _, k := range [3]int{3, 2, 3} {
		for s := range hands {
			hands[s] = append(hands[s], deck[i:i+k]...)
			i += k
		}
	}
	return hands, nil
}

// Clone returns an independent copy of d.
func (d *Deal) Clone() *Deal {
	c := *d
	return &c
}

// Simple accessors; see games/klaverjas/README.md#package-game for
// their meaning.
func (d *Deal) Players() int        { return int(d.n) }
func (d *Deal) Phase() Phase        { return d.phase }
func (d *Deal) Dealer() Seat        { return d.dealer }
func (d *Deal) Voorhand() Seat      { return d.next(d.dealer) }
func (d *Deal) Mode() TrumpMode     { return d.mode }
func (d *Deal) Rules() Rules        { return d.rules }
func (d *Deal) Turned() Suit        { return d.turned }
func (d *Deal) Forced() bool        { return d.forced }
func (d *Deal) Bids() [4]int        { return d.bids }
func (d *Deal) TrumpBy() Seat       { return d.trumpBy }
func (d *Deal) Trump() (Suit, bool) { return d.trump, d.trumpKnown }

// Contract returns the highest bid so far and who made it, with three
// players; once the auction is over, the soloist and its contract. NoSeat
// and 0 before the first bid (and always with two or four players).
func (d *Deal) Contract() (Seat, int) { return d.bidder, d.bid }

// Turn returns whose action is awaited, NoSeat when the deal is done.
func (d *Deal) Turn() Seat { return d.turn }

// next returns the seat after s, clockwise.
func (d *Deal) next(s Seat) Seat {
	if s++; s >= Seat(d.n) {
		return 0
	}
	return s
}

// Side returns the side seat plays on in this hand: its team (s%2) with
// four players, itself with two, and with three 0 for the soloist and 1
// for the other two (all seats are 1 while the auction runs).
func (d *Deal) Side(seat Seat) int {
	switch d.n {
	case 2:
		return int(seat & 1)
	case 3:
		if seat == d.bidder && d.phase != PhaseAuction {
			return 0
		}
		return 1
	}
	return int(seat & 1)
}

// Partner returns who plays with seat in this hand: the seat opposite with
// four players; with three, for each of the soloist's opponents the other
// one. NoSeat for the soloist, with two players, and during the auction.
func (d *Deal) Partner(seat Seat) Seat {
	switch d.n {
	case 2:
		return NoSeat
	case 3:
		if d.phase == PhaseAuction || seat == d.bidder || d.bidder == NoSeat {
			return NoSeat
		}
		return 3 - seat - d.bidder
	}
	return seat.Partner()
}

// PlayingTeam returns the side that made trump (see Side), -1 before
// trump is known.
func (d *Deal) PlayingTeam() int {
	if !d.trumpKnown {
		return -1
	}
	return d.Side(d.trumpBy)
}

// left returns the places of seat's cards still in play.
func (d *Deal) left(s Seat) uint16 {
	return (uint16(1)<<d.nCards[s] - 1) &^ d.gone[s]
}

// Hand returns a copy of the cards seat can play, in dealt order (never
// nil, so it marshals as []): with two players the face-up cards on its
// piles.
func (d *Deal) Hand(seat Seat) []Card {
	return d.AppendHand(make([]Card, 0, 12), seat)
}

// AppendHand appends the cards seat can play to dst.
func (d *Deal) AppendHand(dst []Card, seat Seat) []Card {
	s := seat & 3
	for m := d.left(s) & d.up[s]; m != 0; m &= m - 1 {
		dst = append(dst, d.hands[s][bits.TrailingZeros16(m)])
	}
	return dst
}

// HandMask returns the cards seat can play (as AppendHand) as a bitmask:
// bit Card.Index for each.
func (d *Deal) HandMask(seat Seat) uint32 { return d.held[seat&3] }

// sync sets held[s] from the places, after cards of seat s arrived; a card
// played or laid away just leaves held, and reveal adds those turned up.
func (d *Deal) sync(s Seat) {
	d.held[s] = 0
	d.reveal(s, d.left(s)&d.up[s])
}

// reveal adds the cards at places (in play, of seat s) to held[s].
func (d *Deal) reveal(s Seat, places uint16) {
	for m := places; m != 0; m &= m - 1 {
		i := bits.TrailingZeros16(m)
		if k := uint(d.hands[s][i].Index()); k < 32 {
			d.held[s] |= 1 << k
			d.at[k] = uint8(i)
		}
	}
}

// HandLen returns how many cards seat still has, face-down ones included.
func (d *Deal) HandLen(seat Seat) int { return bits.OnesCount16(d.left(seat & 3)) }

// TricksWon returns the number of completed tricks per side.
func (d *Deal) TricksWon() [2]int { return d.won }

// HandPoints returns the card points per side so far (incl. last trick
// and, once the hand is done, the soloist's discards).
func (d *Deal) HandPoints() [2]int { return d.points }

// HandRoem returns the roem per side so far (without pit): from tricks,
// and with two players from the open cards when play began.
func (d *Deal) HandRoem() [2]int { return d.roem }

// Talon returns the two cards of the talon (three players), nil otherwise.
func (d *Deal) Talon() []Card {
	if d.n != 3 {
		return nil
	}
	return append([]Card(nil), d.talon[:]...)
}

// Discards returns the two cards the soloist laid away (three players),
// nil before that.
func (d *Deal) Discards() []Card {
	if d.n != 3 || d.phase == PhaseAuction || d.phase == PhaseDiscard {
		return nil
	}
	return append([]Card(nil), d.discards[:]...)
}

// Piles returns the eight piles of seat (two players).
func (d *Deal) Piles(seat Seat) [8]Pile {
	var ps [8]Pile
	if d.n != 2 {
		return ps
	}
	s := seat & 1
	left := d.left(s)
	for i := range ps {
		p := &ps[i]
		top, under := uint16(1)<<i, uint16(1)<<(i+8)
		switch {
		case left&top != 0:
			p.N = 1 + int(left&under>>(i+8))
			p.Up, p.Card = d.up[s]&top != 0, d.hands[s][i]
		case left&under != 0:
			p.N = 1
			p.Up, p.Card = d.up[s]&under != 0, d.hands[s][i+8]
		}
		if !p.Up {
			p.Card = Card{}
		}
	}
	return ps
}

// OpenRoem returns the roem of the eight cards that lay face up in front
// of seat when play began (two players; nil before that).
func (d *Deal) OpenRoem(seat Seat) []RoemItem {
	if d.n != 2 || !d.trumpKnown {
		return nil
	}
	return SetRoem(d.hands[seat&1][:8], d.trump)
}

// Current returns the trick in progress. A completed trick stays current
// until the next card is played; before play it is empty, led by voorhand.
func (d *Deal) Current() Trick {
	return d.tricks[d.cur].trick(d.n)
}

// Tricks returns the completed tricks in order, including a completed
// trick that is still Current.
func (d *Deal) Tricks() []Trick {
	n := d.completed()
	out := make([]Trick, n)
	for i := range out {
		out[i] = d.tricks[i].trick(d.n)
	}
	return out
}

// completed returns the number of completed tricks.
func (d *Deal) completed() int {
	if d.tricks[d.cur].n == d.n {
		return d.cur + 1
	}
	return d.cur
}

// TrickCount returns the number of completed tricks.
func (d *Deal) TrickCount() int { return d.completed() }

func (r *trickRec) trick(n uint8) Trick {
	t := Trick{Leader: r.leader(), Winner: r.winner(), Cards: make([]Played, r.n)}
	for i := range t.Cards {
		t.Cards[i] = Played{Seat: (r.leader() + Seat(i)) % Seat(n), Card: r.cards[i]}
	}
	if r.n == n {
		t.Points = int(r.points)
		t.Roem = make([]RoemItem, r.nRoem)
		for i, it := range r.roem[:r.nRoem] {
			t.Roem[i] = roemItems[it]
		}
	}
	return t
}

// MinNextBid returns the lowest bid the auction allows now.
func (d *Deal) MinNextBid() int { return nextBid(d.bidder, d.bid) }

// MinNextBid returns the lowest bid the auction allows now (three players).
func (v *View) MinNextBid() int { return nextBid(v.Bidder, v.Bid) }

func nextBid(bidder Seat, bid int) int {
	if bidder == NoSeat {
		return MinBid
	}
	return bid + BidStep
}

// Auction records a bid (bid > 0) or a pass (bid 0) with three players.
// Once two players have passed, the third plays alone: at its own bid, or
// at MinBid when nobody bid (Forced); it takes the talon, and the deal
// goes on to phase discard.
func (d *Deal) Auction(seat Seat, bid int) error {
	if d.phase != PhaseAuction {
		return ErrWrongPhase
	}
	if seat != d.turn {
		return ErrNotYourTurn
	}
	if bid != 0 {
		if lo := d.MinNextBid(); bid < lo || bid > MaxBid || bid%BidStep != 0 {
			return fmt.Errorf("%w Bied %d of meer, in stappen van %d.", ErrBadBid, lo, BidStep)
		}
		d.bids[seat], d.bid, d.bidder = bid, bid, seat
	} else {
		d.bids[seat] = 0
	}
	passed := 0
	for s := range Seat(3) {
		if d.bids[s] == 0 {
			passed++
		}
	}
	if passed < 2 {
		for d.turn = d.next(seat); d.bids[d.turn] == 0; d.turn = d.next(d.turn) {
		}
		return nil
	}
	for s := range Seat(3) {
		if d.bids[s] != 0 {
			d.bidder = s
		}
	}
	if d.bid == 0 {
		d.bid, d.bids[d.bidder], d.forced = MinBid, MinBid, true
	}
	s := d.bidder
	n := d.nCards[s]
	d.hands[s][n], d.hands[s][n+1] = d.talon[0], d.talon[1]
	d.nCards[s] = n + 2
	d.up[s] = 1<<d.nCards[s] - 1
	d.sync(s)
	d.phase, d.turn = PhaseDiscard, s
	return nil
}

// Discard lays two cards of the soloist's hand away (three players); their
// points count for the soloist at the end of the hand. The soloist then
// chooses trump.
func (d *Deal) Discard(seat Seat, cards []Card) error {
	if d.phase != PhaseDiscard {
		return ErrWrongPhase
	}
	if seat != d.turn {
		return ErrNotYourTurn
	}
	if len(cards) != 2 || cards[0] == cards[1] {
		return ErrBadDiscard
	}
	var places [2]int
	for k, c := range cards {
		if places[k] = d.place(seat, c); places[k] < 0 {
			return ErrNotInHand
		}
	}
	for k, i := range places {
		d.gone[seat] |= 1 << i
		d.held[seat] &^= 1 << cards[k].Index()
		d.discards[k] = cards[k]
	}
	d.phase = PhaseTrump
	return nil
}

// place returns where c lies among the cards seat can play, -1 if not.
func (d *Deal) place(seat Seat, c Card) int {
	s := seat & 3
	if k := uint(c.Index()); k < 32 && d.held[s]&(1<<k) != 0 {
		if i := int(d.at[k]); d.hands[s][i] == c {
			return i
		}
	}
	return -1
}

// ChooseTrump sets trump: voorhand in utrechts, in gedraaid after everyone
// passed (forced; the turned suit is not allowed then), or the soloist
// with three players after laying its discards away.
func (d *Deal) ChooseTrump(seat Seat, s Suit) error {
	if d.phase != PhaseTrump {
		return ErrWrongPhase
	}
	if seat != d.turn {
		return ErrNotYourTurn
	}
	if s >= NumSuits {
		return ErrBadSuit
	}
	if d.forced && d.n != 3 && s == d.turned {
		return ErrTurnedSuit
	}
	d.setTrump(seat, s)
	return nil
}

// Bid records spelen (play=true) or passen in gedraaid. The first player
// to play makes the turned suit trump; after everyone passed voorhand must
// choose another suit.
func (d *Deal) Bid(seat Seat, play bool) error {
	if d.phase != PhaseBid {
		return ErrWrongPhase
	}
	if seat != d.turn {
		return ErrNotYourTurn
	}
	if play {
		d.bids[seat] = 1
		d.setTrump(seat, d.turned)
		return nil
	}
	d.bids[seat] = 0
	d.turn = d.next(seat)
	if d.turn == d.Voorhand() {
		d.forced = true
		d.phase = PhaseTrump
	}
	return nil
}

func (d *Deal) setTrump(seat Seat, s Suit) {
	d.trump, d.trumpKnown, d.trumpBy = s, true, seat
	d.phase = PhasePlay
	d.turn = d.tricks[0].leader()
	if d.n == 2 {
		// The back rows turn over; each player's open cards may hold roem.
		for p := range Seat(2) {
			d.up[p] |= 0x00F0
			d.sync(p)
			d.roem[p] += SetRoemPoints(d.hands[p][:8], s)
		}
	}
	if d.left(0) == 0 {
		d.finish()
	}
}

// Play plays card c for seat. Illegal cards return an *IllegalError.
func (d *Deal) Play(seat Seat, c Card) error {
	if d.phase != PhasePlay {
		return ErrWrongPhase
	}
	if seat != d.turn {
		return ErrNotYourTurn
	}
	i := d.place(seat, c)
	if i < 0 {
		return ErrNotInHand
	}
	if d.tricks[d.cur].n == d.n {
		d.cur++
		d.tricks[d.cur] = newTrick(d.tricks[d.cur-1].winner())
	}
	t := &d.tricks[d.cur]
	// A lead, or a card of the side suit led, is always allowed; judge
	// the rest.
	if led := t.cards[0].Suit; t.n > 0 && (c.Suit != led || led == d.trump) {
		ti := t.info(d.n)
		if sit := judge(d.held[seat], &ti, d.Partner(seat), d.trump, d.rules); !sit.allows(c) {
			return &IllegalError{Card: c, Reason: sit.illegal(c)}
		}
	}
	d.gone[seat] |= 1 << i
	d.held[seat] &^= 1 << c.Index()
	t.add(seat, c, d.trump)
	if t.n < d.n {
		d.turn = d.next(seat)
		return nil
	}
	d.completeTrick(t)
	return nil
}

func (d *Deal) completeTrick(t *trickRec) {
	t.won = t.win
	last := true
	for s := range Seat(d.n) {
		last = last && d.left(s) == 0
	}
	bonus := 0
	if last {
		bonus = LastTrickBonus
	}
	points, roem := t.score(d.trump, bonus)
	side := d.Side(t.winner())
	d.won[side]++
	d.points[side] += points
	d.roem[side] += roem
	if d.n == 2 {
		d.turnOver()
	}
	d.turn = t.winner()
	if last {
		d.finish()
	}
}

// turnOver turns the cards over that lie open on the piles again: those
// whose top card has been played.
func (d *Deal) turnOver() {
	for s := range Seat(2) {
		turned := d.gone[s] << 8 &^ d.up[s] &^ d.gone[s]
		d.up[s] |= d.gone[s] << 8
		d.reveal(s, turned)
	}
}

func (d *Deal) finish() {
	d.phase = PhaseDone
	d.turn = NoSeat
	if d.n == 3 {
		d.points[0] += CardPoints(d.discards[:], d.trump)
	}
}

// AppendLegal appends the cards the seat on turn may play (nothing outside
// phase play). It does not allocate when dst has room for the hand.
func (d *Deal) AppendLegal(dst []Card) []Card {
	if d.phase != PhasePlay {
		return dst
	}
	s := d.turn
	var buf [16]Card
	hand := d.AppendHand(buf[:0], s)
	ti := d.tricks[d.cur].info(d.n)
	return appendLegal(dst, hand, &ti, d.Partner(s), d.trump, d.rules)
}

// LegalMask returns the cards the seat on turn may play (as AppendLegal)
// as a bitmask: bit Card.Index for each; 0 outside phase play.
func (d *Deal) LegalMask() uint32 {
	if d.phase != PhasePlay {
		return 0
	}
	hand, t := d.held[d.turn], &d.tricks[d.cur]
	if t.n == 0 || t.n == d.n {
		return hand // a lead: anything goes
	}
	if led := t.cards[0].Suit; led != d.trump && hand&suitSet(led) != 0 {
		return hand & suitSet(led) // a side suit led: follow it (judge's needSuit)
	}
	ti := t.info(d.n)
	s := judge(hand, &ti, d.Partner(d.turn), d.trump, d.rules)
	return hand & s.allowed()
}

// Legal returns the cards the seat on turn may play.
func (d *Deal) Legal() []Card {
	return d.AppendLegal(make([]Card, 0, 12))
}

// Constraint returns the short Dutch line on what the seat on turn must
// play (see ExplainConstraint), "" outside phase play.
func (d *Deal) Constraint() string {
	if d.phase != PhasePlay {
		return ""
	}
	ti := d.tricks[d.cur].info(d.n)
	s := judge(d.HandMask(d.turn), &ti, d.Partner(d.turn), d.trump, d.rules)
	return s.constraint()
}

// Result returns the outcome of the hand; valid when Phase() is PhaseDone.
func (d *Deal) Result() HandResult {
	r := HandResult{
		Players:     int(d.n),
		PlayingTeam: d.PlayingTeam(),
		TrumpBy:     d.trumpBy,
		Trump:       d.trump,
		Dealer:      d.dealer,
		Points:      d.points,
		Roem:        d.roem,
		PitTeam:     -1,
	}
	if total := d.completed(); total > 0 {
		for side, n := range d.won {
			if n == total {
				r.Pit, r.PitTeam = true, side
				r.Roem[side] += PitBonus
			}
		}
	}
	if r.PlayingTeam < 0 {
		return r
	}
	if d.n == 3 {
		r.Bid, r.Discards = d.bid, d.discards
		r.Score, r.Nat = ScoreSolo(d.bid, r.Points, r.Roem)
		for s := range Seat(3) {
			if s == d.bidder {
				r.Gains[s] = r.Score[0]
			} else {
				r.Gains[s] = (r.Score[1] + 1) / 2
			}
		}
		return r
	}
	r.Score, r.Nat = ScoreHand(r.PlayingTeam, r.Points, r.Roem)
	r.Gains[0], r.Gains[1] = r.Score[0], r.Score[1]
	return r
}

// View returns everything seat may know.
func (d *Deal) View(seat Seat) View {
	seat %= Seat(d.n)
	v := View{
		Players:     int(d.n),
		Seat:        seat,
		Hand:        d.Hand(seat),
		Dealer:      d.dealer,
		Voorhand:    d.Voorhand(),
		Mode:        d.mode,
		Rules:       d.rules,
		Phase:       d.phase,
		Turn:        d.turn,
		Trump:       d.trump,
		TrumpKnown:  d.trumpKnown,
		TrumpBy:     d.trumpBy,
		PlayingTeam: d.PlayingTeam(),
		Partner:     d.Partner(seat),
		Turned:      d.turned,
		Bids:        d.bids,
		Forced:      d.forced,
		Bid:         d.bid,
		Bidder:      d.bidder,
		Tricks:      d.Tricks(),
	}
	if d.n == 3 && seat == d.bidder && d.phase != PhaseAuction {
		v.Talon = d.Talon()
		v.Discards = d.Discards()
	}
	if d.n == 2 {
		for s := range Seat(2) {
			v.Piles[s] = d.Piles(s)
			v.OpenRoem[s] = d.OpenRoem(s)
		}
	}
	if t := &d.tricks[d.cur]; t.n == d.n && d.phase == PhasePlay {
		v.Current = Trick{Leader: t.winner(), Winner: NoSeat, Cards: []Played{}}
	} else {
		v.Current = t.trick(d.n)
	}
	if d.phase == PhasePlay && d.turn == seat {
		v.Legal = d.Legal()
	}
	return v
}

// Resume rebuilds a deal in phase play from v and the cards every seat
// still holds (hands[v.Seat] is normally v.Hand), for example hidden hands
// sampled by a bot. Points, roem and tricks won are recomputed from
// v.Tricks; v.Current continues as the trick in progress. With three
// players v.Discards must hold the soloist's discards (sampled ones for
// the other two). With two players hands[s] holds only the cards lying
// face down on seat s's piles, pile by pile (a pile's top card before the
// one under it); the face-up cards come from v.Piles.
func Resume(v View, hands [4][]Card) (*Deal, error) {
	d := new(Deal)
	if err := ResumeInto(d, &v, hands); err != nil {
		return nil, err
	}
	return d, nil
}

// ResumeInto is Resume into d, which it overwrites (on an error with
// something unusable): a simulation can resume many sampled deals into
// one Deal without allocating.
func ResumeInto(d *Deal, v *View, hands [4][]Card) error {
	n := v.Players
	if n == 0 {
		n = 4
	}
	if n < 2 || n > 4 {
		return fmt.Errorf("game: Resume: %d players", n)
	}
	if v.Phase != PhasePlay || !v.TrumpKnown {
		return errors.New("game: Resume needs a view in phase play")
	}
	size := handSize[n]
	if len(v.Tricks) > size || len(v.Current.Cards) > n {
		return errors.New("game: Resume: too many tricks or cards")
	}
	*d = Deal{
		n:          uint8(n),
		dealer:     v.Dealer % Seat(n),
		mode:       v.Mode,
		rules:      v.Rules,
		phase:      PhasePlay,
		turned:     v.Turned & 3,
		trump:      v.Trump & 3,
		trumpKnown: true,
		trumpBy:    v.TrumpBy,
		forced:     v.Forced,
		bids:       v.Bids,
		bid:        v.Bid,
		bidder:     v.Bidder,
	}
	if n == 3 {
		if len(v.Discards) != 2 {
			return errors.New("game: Resume: three players need the discards")
		}
		copy(d.discards[:], v.Discards)
	}
	if n == 2 {
		for s := range 2 {
			for _, it := range v.OpenRoem[s] {
				d.roem[s] += it.Points
			}
		}
	}
	var played [4]int
	for i, t := range v.Tricks {
		if len(t.Cards) != n {
			return fmt.Errorf("game: Resume: trick %d has %d cards", i+1, len(t.Cards))
		}
		r := &d.tricks[i]
		*r = newTrick(t.Leader % Seat(n))
		for j, p := range t.Cards {
			seat := (r.leader() + Seat(j)) % Seat(n)
			r.add(seat, p.Card, d.trump)
			played[seat]++
		}
		r.won = r.win
		bonus := 0
		if i == size-1 {
			bonus = LastTrickBonus
		}
		points, roem := r.score(d.trump, bonus)
		side := d.Side(r.winner())
		d.won[side]++
		d.points[side] += points
		d.roem[side] += roem
	}
	k := len(v.Tricks)
	switch {
	case len(v.Current.Cards) > 0 && len(v.Current.Cards) < n:
		if k == size {
			return errors.New("game: Resume: trick after the last")
		}
		r := &d.tricks[k]
		*r = newTrick(v.Current.Leader % Seat(n))
		for j, p := range v.Current.Cards {
			seat := (r.leader() + Seat(j)) % Seat(n)
			r.add(seat, p.Card, d.trump)
			played[seat]++
		}
		d.cur = k
		d.turn = (r.leader() + Seat(r.n)) % Seat(n)
	case k > 0:
		d.cur = k - 1
		d.turn = d.tricks[d.cur].winner()
	default:
		d.tricks[0] = newTrick(d.next(d.dealer))
		d.turn = d.tricks[0].leader()
	}
	for s := range Seat(n) {
		if n == 2 {
			if err := d.resumePiles(s, v.Piles[s], hands[s], played[s]); err != nil {
				return err
			}
		} else {
			if len(hands[s])+played[s] != size {
				return fmt.Errorf("game: Resume: seat %d has %d cards, want %d", s, len(hands[s]), size-played[s])
			}
			d.nCards[s] = uint8(copy(d.hands[s][:], hands[s]))
			d.up[s] = 1<<d.nCards[s] - 1
		}
		d.sync(s)
	}
	if k == size {
		d.finish()
	}
	return nil
}

// resumePiles lays seat s's piles out again (two players): the face-up
// cards from piles, the face-down ones from hidden in pile order. Places
// whose card was played are marked gone; which card lay there no longer
// matters.
func (d *Deal) resumePiles(s Seat, piles [8]Pile, hidden []Card, played int) error {
	d.nCards[s] = 16
	k, left := 0, 0
	take := func() (Card, bool) {
		if k == len(hidden) {
			return Card{}, false
		}
		k++
		return hidden[k-1], true
	}
	for i, p := range piles {
		top, under := i, i+8
		var ok bool
		switch p.N {
		case 2:
			if p.Up {
				d.hands[s][top], ok = p.Card, true
				d.up[s] |= 1 << top
			} else {
				d.hands[s][top], ok = take()
			}
			if ok {
				d.hands[s][under], ok = take()
			}
		case 1:
			d.gone[s] |= 1 << top
			if p.Up {
				d.hands[s][under], ok = p.Card, true
				d.up[s] |= 1 << under
			} else {
				d.hands[s][under], ok = take()
			}
		case 0:
			d.gone[s] |= 1<<top | 1<<under
			ok = true
		}
		if !ok {
			return fmt.Errorf("game: Resume: seat %d: too few face-down cards", s)
		}
		left += p.N
	}
	if k != len(hidden) || left+played != 16 {
		return fmt.Errorf("game: Resume: seat %d: %d face-down cards for %d places, %d cards left and %d played",
			s, len(hidden), k, left, played)
	}
	return nil
}
