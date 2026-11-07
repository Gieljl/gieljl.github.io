package server

import (
	"math/rand/v2"

	"jannie/games/klaverjas/game"
)

// Klaverjas is the built-in game, played by the server's own code with
// ai's bots and analysis: New recognises it, and its NewOptions and New
// are not used.
func Klaverjas(ai AI) Game { return klaverjasGame{ai} }

type klaverjasGame struct{ ai AI }

func (klaverjasGame) Name() string            { return "klaverjas" }
func (klaverjasGame) Seats() (int, int, int)  { return 2, 4, 4 }
func (g klaverjasGame) Personas() []Persona   { return g.ai.Personas() }
func (klaverjasGame) NewOptions() GameOptions { return nil }
func (klaverjasGame) New(*Table) Play         { return nil }
func (g klaverjasGame) NewBrain(personaID, level string, seed uint64) any {
	return g.ai.NewBrain(personaID, level, seed)
}
func (g klaverjasGame) Chat(personaID string, ev ChatEvent, rng *rand.Rand) string {
	return g.ai.Chat(personaID, ev, rng)
}

// klaverjas is the built-in game, on the code it always had.
type klaverjas struct{ r *room }

func (k klaverjas) start() { k.r.startKlaverjas() }

// lobby: cmdLobby clears the match itself.
func (k klaverjas) lobby() {}

func (k klaverjas) turn() game.Seat {
	if k.r.deal == nil {
		return game.NoSeat
	}
	return k.r.deal.Turn()
}

func (k klaverjas) handLen(i game.Seat) int {
	if k.r.deal == nil {
		return 0
	}
	return k.r.deal.HandLen(i)
}

func (k klaverjas) state(i game.Seat) any { return k.r.stateFor(i) }

func (k klaverjas) move(c *client, i game.Seat, m *inMsg) bool { return k.r.klaverjasMove(c, i, m) }

func (k klaverjas) decision(i game.Seat, bb *brainBox) (func() any, any) {
	v := k.r.viewFor(i)
	return func() any { return bb.decide(v) }, fallback(v)
}

func (k klaverjas) apply(i game.Seat, a any) error {
	act, _ := a.(action)
	return k.r.act(i, act)
}

func (k klaverjas) single() bool {
	d := k.r.deal
	return d != nil && d.Phase() == game.PhasePlay && len(d.Legal()) == 1
}

func (k klaverjas) resume(s step) { k.r.resumeKlaverjas(s) }

func (k klaverjas) next() { k.r.nextHand() }

// klaverjasMove handles the messages of klaverjas: the decisions of a
// hand, and the training, review and expert requests.
func (r *room) klaverjasMove(c *client, i game.Seat, m *inMsg) bool {
	switch m.T {
	case "auction":
		if m.Bid == nil {
			c.sendError(errInvalid, "Bied een aantal punten of pas.")
			return true
		}
		r.humanAct(c, i, action{kind: actAuction, bid: *m.Bid})
	case "discard":
		var a action
		if len(m.Cards) != 2 {
			c.sendError(errInvalid, game.ErrBadDiscard.Error())
			return true
		}
		for k, code := range m.Cards {
			card, err := game.ParseCard(code)
			if err != nil {
				c.sendError(errInvalid, "Die kaart bestaat niet.")
				return true
			}
			a.cards[k] = card
		}
		a.kind = actDiscard
		r.humanAct(c, i, a)
	case "trump":
		s, err := game.ParseSuit(m.Suit)
		if err != nil {
			c.sendError(errInvalid, "Kies een kleur: klaveren, ruiten, harten of schoppen.")
			return true
		}
		r.humanAct(c, i, action{kind: actTrump, suit: s})
	case "bid":
		if m.Play == nil {
			c.sendError(errInvalid, "Kies spelen of passen.")
			return true
		}
		r.humanAct(c, i, action{kind: actBid, play: *m.Play})
	case "play":
		card, err := game.ParseCard(m.Card)
		if err != nil {
			c.sendError(errInvalid, "Die kaart bestaat niet.")
			return true
		}
		r.humanAct(c, i, action{kind: actPlay, card: card})
	case "tipRead":
		r.cmdTipRead(m.N)
	case "handReview":
		r.cmdHandReview(c, i, m)
	case "why":
		r.cmdWhy(c, i, m)
	case "feedback":
		r.cmdFeedback(c, i, m)
	default:
		return false
	}
	return true
}
