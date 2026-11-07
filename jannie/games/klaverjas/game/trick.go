package game

import "encoding/json"

// Trick is a trick in progress or complete. Winner is NoSeat until four
// cards are in; Points (card points, +10 for the last trick) and Roem are
// filled when the trick is complete.
type Trick struct {
	Leader Seat       `json:"leader"`
	Cards  []Played   `json:"cards"`
	Winner Seat       `json:"winner"`
	Points int        `json:"points"`
	Roem   []RoemItem `json:"roem"`
}

// MarshalJSON writes empty lists as [] rather than null.
func (t Trick) MarshalJSON() ([]byte, error) {
	type plain Trick
	p := plain(t)
	if p.Cards == nil {
		p.Cards = []Played{}
	}
	if p.Roem == nil {
		p.Roem = []RoemItem{}
	}
	return json.Marshal(p)
}

// Complete reports whether all four cards are in.
func (t Trick) Complete() bool { return len(t.Cards) == 4 }

// Led returns the suit of the first card, if any.
func (t Trick) Led() (Suit, bool) {
	if len(t.Cards) == 0 {
		return 0, false
	}
	return t.Cards[0].Card.Suit, true
}

// Next returns the seat that plays the next card of this trick
// (NoSeat when the trick is complete).
func (t Trick) Next() Seat {
	if len(t.Cards) >= 4 {
		return NoSeat
	}
	return (t.Leader + Seat(len(t.Cards))) & 3
}

// CurrentWinner returns the seat winning the trick so far.
func (t Trick) CurrentWinner(trump Suit) (Seat, bool) {
	if len(t.Cards) == 0 {
		return NoSeat, false
	}
	best := t.Cards[0]
	led := best.Card.Suit
	for _, p := range t.Cards[1:] {
		if Beats(p.Card, best.Card, led, trump) {
			best = p
		}
	}
	return best.Seat, true
}

// WinningCard returns the card winning the trick so far.
func (t Trick) WinningCard(trump Suit) (Card, bool) {
	if len(t.Cards) == 0 {
		return Card{}, false
	}
	best := t.Cards[0].Card
	led := best.Suit
	for _, p := range t.Cards[1:] {
		if Beats(p.Card, best, led, trump) {
			best = p.Card
		}
	}
	return best, true
}

// RoemTotal returns the sum of the trick's roem.
func (t Trick) RoemTotal() int {
	n := 0
	for _, r := range t.Roem {
		n += r.Points
	}
	return n
}

// Roem kinds as used on the wire.
const (
	RoemDrie       = "drie"       // driekaart: 3 in sequence, 20
	RoemVier       = "vier"       // vierkaart: 4 in sequence, 50
	RoemStuk       = "stuk"       // heer + vrouw of trump, 20
	RoemVierGelijk = "vierGelijk" // four aces, tens, kings or queens, 100
	RoemVierBoeren = "vierBoeren" // four jacks, 200
)

// RoemItem is one scoring combination in a trick.
type RoemItem struct {
	Kind   string `json:"kind"`
	Points int    `json:"points"`
}

// NameNL returns the Dutch name of the combination ("stuk", "driekaart").
func (r RoemItem) NameNL() string {
	switch r.Kind {
	case RoemDrie:
		return "driekaart"
	case RoemVier:
		return "vierkaart"
	case RoemStuk:
		return "stuk"
	case RoemVierGelijk:
		return "vier gelijke"
	case RoemVierBoeren:
		return "vier boeren"
	}
	return r.Kind
}

// TrickRoem returns the roem in a set of cards (normally a complete trick),
// nil if there is none.
func TrickRoem(cards []Card, trump Suit) []RoemItem {
	return AppendTrickRoem(nil, cards, trump)
}

// AppendTrickRoem appends the roem in cards to dst. A trick holds at most
// two items (a sequence plus stuk), so a dst with capacity 2 never allocates.
func AppendTrickRoem(dst []RoemItem, cards []Card, trump Suit) []RoemItem {
	items, n := trickRoem(cards, trump)
	for _, it := range items[:n] {
		dst = append(dst, roemItems[it])
	}
	return dst
}

// roemItems are the kinds of roem, by the index trickRoem gives them.
var roemItems = [...]RoemItem{
	roemDrie:       {RoemDrie, 20},
	roemVier:       {RoemVier, 50},
	roemStuk:       {RoemStuk, 20},
	roemVierGelijk: {RoemVierGelijk, 100},
	roemVierBoeren: {RoemVierBoeren, 200},
}

const (
	roemDrie = iota
	roemVier
	roemStuk
	roemVierGelijk
	roemVierBoeren
)

// trickRoem returns the roem in cards (see AppendTrickRoem) as indexes
// into roemItems: four of a kind, or a sequence per suit and stuk.
func trickRoem(cards []Card, trump Suit) (items [NumSuits + 1]uint8, n int) {
	if r, ok := sameRank(cards); ok {
		switch r {
		case Jack:
			items[0], n = roemVierBoeren, 1
		case Ace, Ten, King, Queen:
			items[0], n = roemVierGelijk, 1
		}
		return items, n
	}
	masks := suitMasks(cards)
	for _, m := range masks {
		switch runRoem[m] {
		case 50:
			items[n], n = roemVier, n+1
		case 20:
			items[n], n = roemDrie, n+1
		}
	}
	if trump < NumSuits && masks[trump]&stukMask == stukMask {
		items[n], n = roemStuk, n+1
	}
	return items, n
}

// RoemPoints returns the total roem in cards without allocating.
func RoemPoints(cards []Card, trump Suit) int {
	if r, ok := sameRank(cards); ok {
		switch r {
		case Jack:
			return 200
		case Ace, Ten, King, Queen:
			return 100
		}
		return 0
	}
	masks := suitMasks(cards)
	n := int(runRoem[masks[0]]) + int(runRoem[masks[1]]) + int(runRoem[masks[2]]) + int(runRoem[masks[3]])
	if trump < NumSuits && masks[trump]&stukMask == stukMask {
		n += 20
	}
	return n
}

// RoemAdded returns the roem that card c adds to cards, at most three
// cards of a trick (none of them c): RoemPoints with c less RoemPoints
// without it. It does not allocate.
func RoemAdded(cards []Card, c Card, trump Suit) int {
	// Only c's suit changes, unless c completes four of a kind (whose
	// cards hold no sequence or stuk). Alone in its suit, c makes no
	// sequence or stuk.
	var before uint8
	same := len(cards) == 3
	for _, x := range cards {
		if x.Suit == c.Suit {
			before |= 1 << x.Rank
		}
		same = same && x.Rank == c.Rank
	}
	n := 0
	if before != 0 {
		after := before | 1<<c.Rank
		n = int(runRoem[after]) - int(runRoem[before])
		if c.Suit == trump && after&stukMask == stukMask && before&stukMask != stukMask {
			n += 20
		}
	}
	if same {
		switch c.Rank {
		case Jack:
			n += 200
		case Ace, Ten, King, Queen:
			n += 100
		}
	}
	return n
}

// SetRoem returns the roem in a set of cards that lie together, such as
// the open cards in front of a player in the two-player game
// (games/klaverjas/README.md#two-players-wikipedia-klaverjassen-met-twee-personen):
// every run of three (20) or of four or more (50) in one suit, all four
// cards of a rank (100, boeren 200) and stuk (20). nil if there is none.
func SetRoem(cards []Card, trump Suit) []RoemItem {
	var out []RoemItem
	setRoem(cards, trump, func(it RoemItem) { out = append(out, it) })
	return out
}

// SetRoemPoints returns the total of SetRoem without allocating.
func SetRoemPoints(cards []Card, trump Suit) int {
	n := 0
	setRoem(cards, trump, func(it RoemItem) { n += it.Points })
	return n
}

func setRoem(cards []Card, trump Suit, add func(RoemItem)) {
	masks := suitMasks(cards)
	for r := Rank(0); r < NumRanks; r++ {
		if masks[0]&masks[1]&masks[2]&masks[3]&(1<<r) == 0 {
			continue
		}
		switch r {
		case Jack:
			add(RoemItem{RoemVierBoeren, 200})
		case Ace, Ten, King, Queen:
			add(RoemItem{RoemVierGelijk, 100})
		}
	}
	for _, m := range masks {
		for run := 0; ; m >>= 1 {
			if m&1 != 0 {
				run++
				continue
			}
			switch {
			case run >= 4:
				add(RoemItem{RoemVier, 50})
			case run == 3:
				add(RoemItem{RoemDrie, 20})
			}
			if m == 0 {
				break
			}
			run = 0
		}
	}
	if trump < NumSuits && masks[trump]&stukMask == stukMask {
		add(RoemItem{RoemStuk, 20})
	}
}

// CardPoints returns the summed card points of cards.
func CardPoints(cards []Card, trump Suit) int {
	n := 0
	for _, c := range cards {
		n += Points(c, trump)
	}
	return n
}

const stukMask = 1<<King | 1<<Queen

// sameRank reports whether cards are four cards of one rank.
func sameRank(cards []Card) (Rank, bool) {
	if len(cards) != 4 {
		return 0, false
	}
	r := cards[0].Rank
	for _, c := range cards[1:] {
		if c.Rank != r {
			return 0, false
		}
	}
	return r, true
}

// suitMasks returns per suit a bitmask of the ranks present (bit = Rank).
func suitMasks(cards []Card) [NumSuits]uint8 {
	var m [NumSuits]uint8
	for _, c := range cards {
		m[c.Suit&3] |= 1 << c.Rank
	}
	return m
}

// runRoem[m] is the roem of the longest sequence in rank mask m of one
// suit, as a trick counts it: 50 for four or more in a row, 20 for three.
var runRoem = func() (t [256]uint8) {
	for m := range t {
		switch run := longestRun(uint8(m)); {
		case run >= 4:
			t[m] = 50
		case run == 3:
			t[m] = 20
		}
	}
	return t
}()

// longestRun returns the length of the longest run of consecutive set bits.
func longestRun(m uint8) int {
	n := 0
	for m != 0 {
		m &= m << 1
		n++
	}
	return n
}

// trickInfo summarises an incomplete trick for the rules.
type trickInfo struct {
	n      int  // cards played; 0 means the next card leads
	led    Suit // suit of the first card
	winner Seat // seat winning so far
	best   Card // card winning so far
	high   int8 // trump order of the highest trump in the trick, -1 if none
}

// infoFromTrick summarises t; a complete trick counts as a new, empty one.
func infoFromTrick(t Trick, trump Suit) trickInfo {
	ti := trickInfo{high: -1, winner: NoSeat}
	if len(t.Cards) == 0 || len(t.Cards) >= 4 {
		return ti
	}
	ti.n = len(t.Cards)
	ti.led = t.Cards[0].Card.Suit
	ti.best = t.Cards[0].Card
	ti.winner = t.Cards[0].Seat
	for i, p := range t.Cards {
		if i > 0 && Beats(p.Card, ti.best, ti.led, trump) {
			ti.best, ti.winner = p.Card, p.Seat
		}
		if p.Card.Suit == trump && trumpOrder[p.Card.Rank] > ti.high {
			ti.high = trumpOrder[p.Card.Rank]
		}
	}
	return ti
}
