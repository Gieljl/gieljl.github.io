package server

import (
	"time"

	"jannie/games/klaverjas/game"
)

// greets reports whether the bot at seat i may say hello as the match starts:
// in the lesson on the basic game Juf Jannie introduces herself at once.
func (r *room) greets(i game.Seat) bool {
	return !r.inLesson(planBasis) || i != r.learner().Partner()
}

// chatTrump: the bot that made trump comments on it; if it says nothing (or
// a human chose), a bot of the other side may comment instead.
func (r *room) chatTrump(maker game.Seat) {
	if r.botSay(maker, ChatEvent{Kind: "trump", Mine: true}, 700*time.Millisecond) {
		return
	}
	d := r.deal
	r.botsReact(1, 1200*time.Millisecond, func(i game.Seat) (ChatEvent, bool) {
		return ChatEvent{Kind: "trump"}, d.Side(i) != d.Side(maker)
	})
}

// chatTrick: comments on roem, a big trick, or a partner's good trick.
func (r *room) chatTrick(t game.Trick) {
	d := r.deal
	team := d.Side(t.Winner)
	if roem := t.RoemTotal(); roem > 0 {
		r.botsReact(1, 900*time.Millisecond, func(i game.Seat) (ChatEvent, bool) {
			return ChatEvent{Kind: "roem", Mine: d.Side(i) == team, Points: roem}, true
		})
		return
	}
	if t.Points < 25 || r.rng.Float64() > 0.5 {
		return
	}
	if r.seats[t.Winner].kind == seatBot {
		r.botSay(t.Winner, ChatEvent{Kind: "wonTrick", Mine: true, Points: t.Points}, 700*time.Millisecond)
		return
	}
	// A human took it: the partner praises it, or else an opponent sighs.
	if p := d.Partner(t.Winner); p != game.NoSeat &&
		r.botSay(p, ChatEvent{Kind: "partnerGood", Mine: true, Points: t.Points}, 700*time.Millisecond) {
		return
	}
	r.botsReact(1, 900*time.Millisecond, func(i game.Seat) (ChatEvent, bool) {
		return ChatEvent{Kind: "wonTrick", Points: t.Points}, d.Side(i) != team
	})
}

// chatHandEnd: one bot comments on pit, nat or the result.
func (r *room) chatHandEnd(res game.HandResult) {
	d := r.deal
	r.botsReact(1, 1500*time.Millisecond, func(i game.Seat) (ChatEvent, bool) {
		team := d.Side(i)
		switch {
		case res.Pit:
			return ChatEvent{Kind: "pit", Mine: team == res.PitTeam, Points: game.PitBonus}, true
		case res.Nat && team == res.PlayingTeam:
			return ChatEvent{Kind: "nat", Mine: true}, true
		case res.Nat:
			return ChatEvent{Kind: "natOpp"}, true
		case res.Score[team] > res.Score[1-team]:
			return ChatEvent{Kind: "handWon", Mine: true, Points: res.Score[team]}, true
		default:
			return ChatEvent{Kind: "handLost", Mine: true, Points: res.Score[team]}, true
		}
	})
}

// chatGameOver: up to two bots say goodbye; nobody gloats over a draw.
func (r *room) chatGameOver() {
	if r.winner < 0 {
		return
	}
	r.botsReact(2, 1800*time.Millisecond, func(i game.Seat) (ChatEvent, bool) {
		if game.ScorerOf(i, r.players()) == r.winner {
			return ChatEvent{Kind: "gameWon", Mine: true}, true
		}
		return ChatEvent{Kind: "gameLost", Mine: true}, true
	})
}

// botReplyKlaverjas lets a bot answer the chat line text of seat from
// (botReply). The event says whether the bot is the speaker's partner and,
// while tricks are played, whether the bot's side made trump: "Nat!" means
// something else then. With fewer than four players partners exist only
// within a hand: the soloist's two opponents.
func (r *room) botReplyKlaverjas(from game.Seat, text string) {
	inHand := r.phase == phasePlay && r.deal != nil
	playing := -1
	if inHand {
		playing = r.deal.PlayingTeam()
	}
	r.botsReact(1, 1400*time.Millisecond, func(i game.Seat) (ChatEvent, bool) {
		partner := i.Team() == from.Team()
		side := i.Team()
		if r.players() != 4 {
			partner, side = false, -2
			if r.deal != nil {
				partner, side = r.deal.Partner(i) == from, r.deal.Side(i)
			}
		}
		return ChatEvent{Kind: "reply", Text: text, Mine: partner,
			InHand: inHand, Playing: side == playing}, i != from
	})
}
