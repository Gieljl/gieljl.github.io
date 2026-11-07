// Package yasatbot is the bots of Yasat, a port of the Yasat app's bot
// policy (games/yasat/README.md#bots): heuristics over the hand after a
// discard and draw, a risk estimate for calling Yasat from what the bot
// saw, five personalities, and three levels. Makkelijk forgets and slips,
// normaal less so, and sterk (the app's godlike) never slips and looks at
// every card: the others' hands and the top of the draw pile.
package yasatbot

import (
	"math"
	"math/rand/v2"
	"slices"

	"jannie/games/yasat/yasat"
)

// Level is a bot's strength.
type Level int

const (
	Easy Level = iota
	Normal
	Godlike
)

// ParseLevel reads "makkelijk", "normaal" or "sterk"; anything else is normaal.
func ParseLevel(s string) Level {
	switch s {
	case "makkelijk":
		return Easy
	case "sterk":
		return Godlike
	}
	return Normal
}

// Personality varies how a bot plays at the same level.
type Personality int

const (
	Cautious    Personality = iota // calls less, prefers the deck
	Balanced                       // neutral
	Aggressive                     // calls more, takes from the discards
	Opportunist                    // hunts kills and nullifies
	Gambler                        // very loose, slips more
)

// PersonalityOf is the personality of a persona; the neutral substitute
// ("") is balanced.
func PersonalityOf(personaID string) Personality {
	switch personaID {
	case "dirk", "kees":
		return Cautious
	case "sjaak", "bram":
		return Gambler
	case "vera":
		return Aggressive
	case "fatima":
		return Opportunist
	}
	return Balanced
}

// Seen is a move the bot saw this round: a discard, or a card taken from
// the discards (Took), or a draw from the deck.
type Seen struct {
	Seat     int
	Discard  []yasat.Card
	Took     *yasat.Card
	FromDeck bool
}

// View is what a bot decides from. Hands and DeckTop are filled for every
// bot, as the table knows them; only sterk looks at them.
type View struct {
	Seat     int
	Hand     []yasat.Card
	HandLens []int
	Top      []yasat.Card // the ply on top of the discards
	DeckLen  int
	DeckTop  *yasat.Card    // nil when the pile is empty (sterk only)
	Hands    [][]yasat.Card // everyone's (sterk only)
	Totals   []int          // the totals before this round
	History  [][][]yasat.Event
	Seen     []Seen // this round, in order
}

// Decision is a turn: a call, or a discard with a draw.
type Decision struct {
	Call bool
	Move yasat.Move
}

// Bot is one bot seat.
type Bot struct {
	Level       Level
	Personality Personality
	rng         *rand.Rand
}

// New returns a bot of personality p at level l.
func New(p Personality, l Level, seed uint64) *Bot {
	return &Bot{Level: l, Personality: p, rng: rand.New(rand.NewPCG(seed, 0x9a5a7))}
}

func (b *Bot) riskBias() float64 {
	return [...]float64{Cautious: -2, Balanced: 0, Aggressive: 2, Opportunist: 1, Gambler: 3}[b.Personality]
}

// noise is the chance of taking a worse option.
func (b *Bot) noise() float64 {
	if b.Level == Godlike {
		return 0
	}
	base := 0.05
	if b.Level == Easy {
		base = 0.2
	}
	bias := map[Personality]float64{Gambler: 0.15, Aggressive: 0.05, Cautious: -0.05}[b.Personality]
	return math.Max(0, math.Min(0.5, base+bias))
}

// memory is how many recent moves the bot remembers.
func (b *Bot) memory() int {
	if b.Level == Godlike {
		return math.MaxInt
	}
	base := 12
	if b.Level == Easy {
		base = 4
	}
	bias := map[Personality]int{Cautious: 2, Opportunist: 2, Gambler: -1}[b.Personality]
	return max(2, base+bias)
}

// blindSpot is the chance of missing a move altogether.
func (b *Bot) blindSpot() float64 {
	if b.Level == Godlike {
		return 0
	}
	base := 0.1
	if b.Level == Easy {
		base = 0.3
	}
	bias := map[Personality]float64{Cautious: -0.05, Opportunist: -0.05, Gambler: 0.1}[b.Personality]
	return math.Max(0, math.Min(0.6, base+bias))
}

func (b *Bot) remember(seen []Seen) []Seen {
	if b.Level == Godlike {
		return seen
	}
	if w := b.memory(); len(seen) > w {
		seen = seen[len(seen)-w:]
	}
	miss := b.blindSpot()
	var out []Seen
	for _, s := range seen {
		if b.rng.Float64() >= miss {
			out = append(out, s)
		}
	}
	return out
}

// Decide is the bot's turn.
func (b *Bot) Decide(v View) Decision {
	v.Seen = b.remember(v.Seen)
	if yasat.Points(v.Hand) <= yasat.MaxCall && b.shouldCall(v) {
		return Decision{Call: true}
	}
	if b.Level == Godlike {
		return Decision{Move: b.godlikeMove(v)}
	}
	discard := b.pickDiscard(v)
	return Decision{Move: b.chooseDraw(v, discard)}
}

func (b *Bot) shouldCall(v View) bool {
	pts := yasat.Points(v.Hand)
	if b.Level == Godlike && v.Hands != nil {
		return weightedDelta(v) >= 0
	}
	risk := lowHandRisk(v, pts) - b.riskBias() - tacticalBonus(v) + survivalBias(v)
	bigOpp := false
	for i, n := range v.HandLens {
		if i != v.Seat && n >= 3 {
			bigOpp = true
		}
	}
	switch b.Level {
	case Easy:
		switch {
		case pts <= 1:
			return true
		case pts == 2:
			return risk < 7
		case pts <= 4:
			return risk < 8
		}
		return true
	case Godlike:
		if pts <= 3 {
			return true
		}
		return pts <= 5 && bigOpp
	}
	switch {
	case pts <= 1:
		return true
	case pts == 2:
		return risk < 4
	case pts == 3:
		return risk < 5
	case pts <= 4:
		return risk < 6
	case risk >= 4:
		return false
	}
	return bigOpp
}

// weightedDelta is what calling now would add to the bot's weighted
// score, with every hand known (sterk).
func weightedDelta(v View) float64 {
	hands := make([]int, len(v.Hands))
	for i, h := range v.Hands {
		hands[i] = yasat.Points(h)
	}
	res, _ := yasat.Score(hands, v.Seat, v.Totals)
	delta := 0
	for _, e := range res[v.Seat].Events {
		delta += yasat.Weights[e]
	}
	n := len(v.Hands)
	_, before := yasat.Weighted(v.History, n)
	round := make([][]yasat.Event, n)
	for i := range n {
		round[i] = res[i].Events
	}
	_, after := yasat.Weighted(append(slices.Clone(v.History), round), n)
	if before == v.Seat {
		delta -= yasat.LongestStreak
	}
	if after == v.Seat {
		delta += yasat.LongestStreak
	}
	return float64(delta)
}

func tacticalBonus(v View) float64 {
	bonus := 0.0
	for i, n := range v.HandLens {
		if i == v.Seat {
			continue
		}
		switch t := v.Totals[i] + n; {
		case t > 100:
			bonus += 2
		case t >= 95:
			bonus++
		}
	}
	if t := v.Totals[v.Seat]; t == 50 || t == 100 {
		bonus += 2
	}
	_, owner := yasat.Weighted(v.History, len(v.HandLens))
	if owner == v.Seat {
		bonus--
	} else if streak(v.History, v.Seat) >= 1 {
		bonus++
	}
	if yasat.Points(v.Hand) >= 6 && len(v.Hand) >= 4 {
		bonus--
	}
	return bonus
}

func streak(history [][][]yasat.Event, seat int) int {
	n := 0
	for _, r := range history {
		if yasat.HasEvent(r[seat], yasat.EvYasat) {
			n++
		} else {
			n = 0
		}
	}
	return n
}

func survivalBias(v View) float64 {
	switch t := v.Totals[v.Seat]; {
	case t >= 95:
		return 3
	case t >= 85:
		return 1
	case t <= 10:
		return -1
	}
	return 0
}

// held is the cards each other seat took from the discards and still holds.
func held(v View) map[int][]yasat.Card {
	out := map[int][]yasat.Card{}
	for _, s := range v.Seen {
		if s.Seat == v.Seat {
			continue
		}
		if s.Took != nil {
			out[s.Seat] = append(out[s.Seat], *s.Took)
		}
		if len(s.Discard) > 0 && len(out[s.Seat]) > 0 {
			out[s.Seat] = yasat.Without(out[s.Seat], s.Discard)
		}
	}
	return out
}

func lowHandRisk(v View, pts int) float64 {
	known := held(v)
	risk := 0.0
	for i, n := range v.HandLens {
		if i == v.Seat || n > 2 {
			continue
		}
		k := known[i]
		kc := min(len(k), n)
		minPossible := yasat.Points(k) + max(0, n-kc)
		if minPossible >= pts {
			continue
		}
		observed := kc > 0
		r := 0.0
		switch {
		case n == 1 && observed:
			r = 4
		case n == 1:
			r = 2
		case observed:
			r = 2
		default:
			r = 1
		}
		if kc == n && kc > 0 {
			r += 2
		}
		if pts <= 3 && slices.ContainsFunc(k, func(c yasat.Card) bool { return c.Rank == yasat.Ace }) {
			r++
		}
		risk += r
	}
	return risk
}

type candidate struct {
	cards []yasat.Card
	shape yasat.Shape
	value int
}

func candidates(hand []yasat.Card) []candidate {
	var out []candidate
	for _, c := range hand {
		out = append(out, candidate{[]yasat.Card{c}, yasat.Single, c.Value()})
	}
	for _, d := range yasat.Discards(hand) {
		out = append(out, candidate{d, yasat.Classify(d), yasat.Points(d)})
	}
	return out
}

var comboWeight = map[yasat.Shape]float64{yasat.Four: 4, yasat.Three: 3, yasat.Straight: 2, yasat.Pair: 1}

// handScore is how good a hand is to hold: few points, low cards and the
// combinations still in it.
func handScore(hand []yasat.Card) float64 {
	const yasatW, ownedW, deathW, ownW = 1, -2, -5, 3
	pts := yasat.Points(hand)
	low, high := 0, 0
	for _, c := range hand {
		if c.Value() <= 3 {
			low++
		}
		if c.Value() >= 10 {
			high++
		}
	}
	pressure := 1 + yasatW*0.7 + -ownedW*0.5 + -deathW*0.15 + ownW*0.2
	s := -float64(pts)*pressure + float64(low)*2.5 - float64(high)*1.5
	if pts <= 7 {
		s += 8 + yasatW*3
	}
	if pts <= 4 {
		s += 6 + yasatW*2
	}
	combo := 0.0
	for _, d := range yasat.Discards(hand) {
		combo += comboWeight[yasat.Classify(d)]
	}
	return s + combo*0.25
}

func synergy(rest []yasat.Card, c yasat.Card) float64 {
	bonus := 0.0
	if slices.ContainsFunc(rest, func(x yasat.Card) bool { return x.Rank == c.Rank }) {
		bonus += 3
	}
	if c.Value() <= 3 {
		bonus += 1.5
	}
	for _, d := range yasat.Discards(append(slices.Clone(rest), c)) {
		if yasat.Classify(d) == yasat.Straight && slices.Contains(d, c) {
			bonus += 4
			break
		}
	}
	return bonus
}

// deckGuess is the expected score of a blind draw, from four sample cards.
func deckGuess(rest []yasat.Card) float64 {
	samples := yasat.MustParseCards("AS 4H 8D KC")
	t := 0.0
	for _, s := range samples {
		t += handScore(append(slices.Clone(rest), s))
	}
	return t / float64(len(samples))
}

func (b *Bot) pickDiscard(v View) []yasat.Card {
	shapeW := map[yasat.Shape]float64{yasat.Four: 4, yasat.Three: 3, yasat.Straight: 2, yasat.Pair: 1}
	type scored struct {
		c candidate
		s float64
	}
	var all []scored
	for _, c := range candidates(v.Hand) {
		if b.Level == Easy && c.shape != yasat.Single && c.shape != yasat.Pair {
			continue
		}
		rest := yasat.Without(v.Hand, c.cards)
		all = append(all, scored{c, handScore(rest) + float64(c.value)*0.35 + shapeW[c.shape]})
	}
	slices.SortStableFunc(all, func(a, b scored) int {
		switch {
		case a.s > b.s:
			return -1
		case a.s < b.s:
			return 1
		}
		return 0
	})
	if n := b.noise(); n > 0 && len(all) >= 2 && b.rng.Float64() < n {
		k := 1
		if len(all) >= 3 && b.rng.Float64() < 0.3 {
			k = 2
		}
		return all[k].c.cards
	}
	return all[0].c.cards
}

func (b *Bot) chooseDraw(v View, discard []yasat.Card) yasat.Move {
	rest := yasat.Without(v.Hand, discard)
	deck := deckGuess(rest)
	var pick *yasat.Card
	best := math.Inf(-1)
	for _, c := range v.Top {
		s := handScore(append(slices.Clone(rest), c)) + synergy(rest, c)
		if s > best {
			best, pick = s, &c
		}
	}
	pref := map[Personality]float64{Aggressive: 1, Opportunist: 1, Cautious: -1}[b.Personality]
	n := b.noise()
	fromDeck := yasat.Move{Discard: discard, FromDeck: true}
	if pick != nil && b.rng.Float64() < n {
		return fromDeck
	}
	if pick != nil && best+pref >= deck {
		return yasat.Move{Discard: discard, Take: *pick}
	}
	return fromDeck
}

func (b *Bot) godlikeMove(v View) yasat.Move {
	shapeW := map[yasat.Shape]float64{yasat.Four: 2, yasat.Three: 1.5, yasat.Straight: 1, yasat.Pair: 0.5}
	var best yasat.Move
	bestScore := math.Inf(-1)
	for _, c := range candidates(v.Hand) {
		rest := yasat.Without(v.Hand, c.cards)
		m, s := bestDraw(v, rest)
		m.Discard = c.cards
		if s += float64(c.value)*0.2 + shapeW[c.shape]; s > bestScore {
			best, bestScore = m, s
		}
	}
	return best
}

func bestDraw(v View, rest []yasat.Card) (yasat.Move, float64) {
	m, best := yasat.Move{FromDeck: true}, math.Inf(-1)
	for _, c := range v.Top {
		if s := handScore(append(slices.Clone(rest), c)) + synergy(rest, c); s > best {
			m, best = yasat.Move{Take: c}, s
		}
	}
	deck := deckGuess(rest)
	if v.DeckTop != nil {
		deck = handScore(append(slices.Clone(rest), *v.DeckTop)) + synergy(rest, *v.DeckTop)
	}
	if deck >= best {
		return yasat.Move{FromDeck: true}, deck
	}
	return m, best
}

// Aces is which of the bot's aces count 11 at the end of a round, for a
// bot that adds its hand (neither the caller nor an owner): a total that
// lands on 50 or 100 (or 69 to 100) is best, then the lowest total
// without dying. Makkelijk and normaal miss it now and then.
func (b *Bot) Aces(hand []yasat.Card, total int) []yasat.Card {
	if b.Level == Easy && (b.Personality == Cautious || b.Personality == Gambler || b.Personality == Aggressive) {
		return nil
	}
	miss := map[Level]float64{Easy: 0.4, Normal: 0.1}[b.Level]
	if b.rng.Float64() < miss {
		return nil
	}
	return BestAces(hand, total)
}

// BestAces is the best choice of aces as 11 for a hand added to total.
func BestAces(hand []yasat.Card, total int) []yasat.Card {
	var aces []yasat.Card
	for _, c := range hand {
		if c.Rank == yasat.Ace {
			aces = append(aces, c)
		}
	}
	var best []yasat.Card
	bestScore, bestNull := math.MaxInt, false
	for mask := 0; mask < 1<<len(aces); mask++ {
		var eleven []yasat.Card
		for i, a := range aces {
			if mask&(1<<i) != 0 {
				eleven = append(eleven, a)
			}
		}
		sum := total + yasat.PointsWith(hand, eleven)
		null := sum == 50 || sum == 100
		score := sum
		switch {
		case null:
			score = -1
		case sum > 100:
			score = 1000
		}
		if score < bestScore || score == bestScore && !bestNull && null {
			best, bestScore, bestNull = eleven, score, null
		}
	}
	return best
}
