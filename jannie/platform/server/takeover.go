package server

import (
	"time"

	"jannie/platform/cards"
)

// waitingFor is the absent player the game waits for: it is their turn,
// no pause is pending, and they dropped out (and nobody let an AI play for
// them yet) or left. NoSeat otherwise.
func (r *room) waitingFor() cards.Seat {
	if !r.inHand() || r.pending != stepNone {
		return cards.NoSeat
	}
	i := r.gp.turn()
	if i == cards.NoSeat {
		return cards.NoSeat
	}
	if st := &r.seats[i]; st.kind == seatLeft || st.kind == seatHuman && st.client == nil && !st.away {
		return i
	}
	return cards.NoSeat
}

// question is the seat the others are asked about, NoSeat when nothing is
// asked. No AI plays a human's seat unless every other human at the table
// agrees (docs/server.md#takeover-consent): when the game waits for an
// absent player, the others are asked whether an AI may play for them, at
// once for a seat its player left and after askAfter for one who dropped
// out, as long as anyone is connected to answer. Each answers with vote;
// once all said yes, an AI takes the seat (takeOver).
func (r *room) question() cards.Seat {
	if r.connectedHumans() == 0 {
		return cards.NoSeat
	}
	return r.questionAbout()
}

// questionAbout is the seat the question is about whether or not anyone is
// connected to answer it: while nobody is, it rests (nobody sees or
// answers it, the game pauses) and keeps its votes.
func (r *room) questionAbout() cards.Seat {
	i := r.waitingFor()
	if i == cards.NoSeat || r.seats[i].kind == seatHuman && !r.seats[i].asked {
		return cards.NoSeat
	}
	return i
}

// settleQuestion brings r.asking up to date before an update shows it.
// When the question closes or turns to another seat, every vote goes, so
// no answer carries over to a later question; not when it only rests, so
// a no still held for someone who dropped out (see disconnected) counts
// for whoever is back first.
func (r *room) settleQuestion() {
	r.asking = r.question()
	if q := r.questionAbout(); q != r.votesOn {
		r.votesOn = q
		for i := range r.seats {
			r.seats[i].vote = nil
		}
	}
}

// ask puts the question to the others: the player at seat i has been gone
// askAfter on their turn.
func (r *room) ask(i cards.Seat) {
	st := &r.seats[i]
	if st.kind != seatHuman || st.client != nil || st.away || st.asked {
		return
	}
	st.asked = true
	r.emit(nil)
	r.drive()
}

// cmdVote records whether the player at seat i lets an AI play the seat
// the question is about; the answer may change while the question is open.
func (r *room) cmdVote(c *client, i cards.Seat, m *inMsg) {
	to, ok := r.seatArg(m)
	switch {
	case !ok:
		c.sendError(errInvalid, "Die plaats bestaat niet.")
		return
	case m.AI == nil:
		c.sendError(errInvalid, "Kies of een AI-speler mag spelen of dat jullie wachten.")
		return
	case to != r.question() || m.Left != nil && *m.Left != (r.seats[to].kind == seatLeft):
		// Also an answer that comes too late: the player is back, the seat
		// was taken meanwhile, or, when the vote names it, the question
		// about it is another one now (a yes for a stand-in is none for a
		// seat given away).
		c.sendError(errInvalid, "Die vraag staat niet (meer) open.")
		return
	}
	st := &r.seats[i]
	if st.vote != nil && *st.vote == *m.AI {
		return
	}
	ai := *m.AI
	st.vote = &ai
	if !r.tally() {
		r.emitState()
	}
}

// agreed reports whether every connected human lets an AI play: the player
// asked about is not connected, so everyone who is answers. A no still
// held by someone who just dropped out (see disconnected) counts too.
func (r *room) agreed() bool {
	n := 0
	for i := range r.seats {
		switch st := &r.seats[i]; {
		case st.kind != seatHuman:
		case st.vote != nil && !*st.vote:
			return false
		case st.client != nil:
			if st.vote == nil {
				return false
			}
			n++
		}
	}
	return n > 0
}

// dropVote ends the no of a voter who dropped out at `at` and has not been
// back since: gone askAfter, they no longer answer, and the others' yes
// may now be everyone's.
func (r *room) dropVote(i cards.Seat, at time.Time) {
	st := &r.seats[i]
	if st.kind != seatHuman || st.client != nil || !st.leftAt.Equal(at) || st.vote == nil {
		return
	}
	st.vote = nil
	if !r.tally() {
		r.emitState()
	}
}

// tally lets an AI take the seat the question is about once everyone
// agreed, and reports whether it did. It runs after every vote and when
// someone stops answering: who leaves takes their vote along, and so does
// who drops out (a no only after askAfter). Who comes in has not answered
// yet, so they cannot complete it.
func (r *room) tally() bool {
	q := r.question()
	if q == cards.NoSeat || !r.agreed() {
		return false
	}
	r.takeOver(q)
	return true
}

// takeOver lets an AI play seat i now that everyone agreed: the substitute
// plays for a player who dropped out until they return; a seat its player
// left goes to a random persona at the room's level, which a joiner may
// still take over.
func (r *room) takeOver(i cards.Seat) {
	st := &r.seats[i]
	name := st.name
	left := st.kind == seatLeft
	if left {
		p := r.randomPersona()
		r.seats[i] = r.newBot(p)
		r.seats[i].vacated = true
		r.sysChat("Iedereen is akkoord: %s neemt de plaats van %s in.", botName(p), name)
	} else {
		st.away, st.asked = true, false
		r.sysChat("Iedereen is akkoord: een AI-speler speelt zolang voor %s.", name)
	}
	r.log.Info("AI took over a seat", "seat", int(i), "left", left)
	r.logSeat(i)
	// The AI thinks from now on, at its own pace.
	r.turnAt, r.think = time.Now(), r.thinkTime(i)
	r.emit(evSeat{Type: "takeover", Seat: i})
	r.drive()
}
