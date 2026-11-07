package server

import (
	"time"

	"jannie/platform/cards"
)

func (r *room) playerState(i cards.Seat) *playerState {
	st := &r.seats[i]
	cards := 0
	if r.inHand() {
		cards = r.gp.handLen(i)
	}
	switch st.kind {
	case seatHuman:
		return &playerState{
			Name:      st.name,
			Connected: st.client != nil,
			Away:      st.away,
			Vote:      st.vote,
			Call:      st.call,
			Cards:     cards,
			Ready:     st.ready && r.phase == phaseHandEnd,
		}
	case seatLeft:
		return &playerState{Name: st.name, Left: true, Cards: cards}
	case seatBot:
		p := st.persona
		return &playerState{
			Name:      botName(p),
			Bot:       true,
			BotID:     p.ID,
			Emoji:     p.Emoji,
			Color:     p.Color,
			Connected: true,
			Cards:     cards,
		}
	}
	return nil
}

func (r *room) roster() []rosterEntry {
	out := make([]rosterEntry, len(r.srv.personas))
	for k, p := range r.srv.personas {
		out[k] = rosterEntry{ID: p.ID, Name: p.Name, Emoji: p.Emoji, Color: p.Color, Bio: p.Bio}
	}
	return out
}

// emitState sends a state change without an animation.
func (r *room) emitState() {
	if r.phase == phaseLobby {
		r.emit(evLobby{Type: "lobby"})
		return
	}
	r.emit(nil)
}

// unixMilli is t in unix ms, 0 for the zero time.
func unixMilli(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}
