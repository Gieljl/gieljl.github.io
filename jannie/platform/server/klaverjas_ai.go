package server

import (
	"math/rand/v2"

	"jannie/games/klaverjas/game"
)

// Brain makes the decisions for one bot seat, at a table of v.Players. The
// server calls one brain from one goroutine at a time.
type Brain interface {
	ChooseTrump(v game.View) game.Suit // utrechts, forced (never v.Turned when v.Forced), or the soloist
	Bid(v game.View) bool              // gedraaid: play on v.Turned?
	Auction(v game.View) int           // three players: a bid of at least v.MinNextBid(), or 0 to pass
	Discard(v game.View) [2]game.Card  // three players: two cards of v.Hand for the soloist to lay away
	Play(v game.View) game.Card        // one of v.Legal
}

// Advice is a training hint: one of Card, Suit or Play is set, with a Dutch
// explanation.
type Advice struct {
	Card *game.Card
	Suit *game.Suit
	Play *bool
	Text string
}

// Choice is one decision of a player: exactly one of Card, Suit or Play is
// set.
type Choice struct {
	Card *game.Card
	Suit *game.Suit
	Play *bool
}

// Grade is the analysis of one decision for the review at the end of the
// match (see bot.Grade): points are expected score differences.
type Grade struct {
	Stake   float64 // between the best and the worst option; 0 without a choice
	Lost    float64 // given up against Better; 0 within the noise
	Gain    float64 // a strong choice: gained over Obvious
	Better  Choice  // the advised option, when Lost > 0
	Obvious Choice  // the rule-based option, when Gain > 0
	Text    string  // the hint for Better (Lost > 0) or for the choice (Gain > 0)
	Nat     float64 // a bid to play: the chance of going nat
	// What the choice and Better or Obvious led to on average, when Lost or
	// Gain is set: Lost is Other's Us−Them minus Played's, Gain the reverse.
	Played, Other Outcome
}

// Outcome is what an option leads to on average (see bot.Outcome): the
// final scores of the player's team and of the opponents, and the chance
// that the one or the other plays and goes nat.
type Outcome struct {
	Us, Them       float64
	NatUs, NatThem float64
}

// Explanation is the engine's reasoning for one decision, for the expert
// mode (see bot.Explanation): the rule-based choice of normaal and its
// reason, the choices of sterk and of the hint (with why they leave a
// better-valued card), and the value of every option.
type Explanation struct {
	Normaal  Choice
	Rule     string // a card: the hint text of the rule that chose it
	Sterk    Choice
	SterkWhy string // a card: why sterk's card is not one the search values most
	Hint     Choice
	HintText string
	HintWhy  string // a card: why the hint keeps the rule's card while sterk plays another
	Worlds   int    // deals sampled per option; 0 without a search
	Options  []Option
}

// Option is what the search found one option worth (see bot.Option):
// Value is the expected score difference, SE the standard error of its
// difference with the best option, Parts a card's value per part (points
// in its trick and later, roem in its trick and later, nat and pit), and
// Why, for a card below the best, why the best brings more.
type Option struct {
	Choice
	Value, SE float64
	Outcome
	Parts []float64
	Why   string
}

// Signal is a card that told the partner something at this table
// (games/klaverjas/README.md#seinen-signals), as everyone there reads it
// (see bot.TrickSignal): Kind is the agreement ("aas", "kleintjeBoer",
// "boerOverBoer", "hoogLaag"), Means the card it says Seat holds (the 10,
// the trump boer, or the highest card of the suit for a low discard).
type Signal struct {
	Seat  game.Seat
	Card  game.Card
	Kind  string
	Means game.Card
}

// AI is what the server needs from the bot package; cmd/klaverjas adapts
// package bot to it, and tests use a fake.
type AI interface {
	Personas() []Persona
	// NewBrain returns a player for a persona at level "makkelijk", "normaal"
	// or "sterk". An empty personaID asks for a neutral player (substitutes).
	NewBrain(personaID, level string, seed uint64) Brain
	Advise(v game.View) Advice
	// Grade analyses decision c of the player of v, on their turn, and
	// HandLuck what the cards dealt to the player of v are worth against an
	// average hand (v is the view at the deal); both for the review at the
	// end of the match.
	Grade(v game.View, c Choice) Grade
	HandLuck(v game.View) float64
	// Explain gives the reasoning for the decision of the player of v, on
	// their turn, for the expert mode.
	Explain(v game.View) Explanation
	ExplainTrick(t game.Trick, trump game.Suit, names [4]string) string
	// TrickSignals finds the signals in the last completed trick of v, and
	// SignalChance one the player of v can give truthfully on their turn
	// (prefer first), at a table of four, for the lessons in training.
	TrickSignals(v game.View) []Signal
	SignalChance(v game.View, prefer game.Card) (Signal, bool)
	Chat(personaID string, ev ChatEvent, rng *rand.Rand) string
}
