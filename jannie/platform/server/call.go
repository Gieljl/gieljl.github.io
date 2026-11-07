package server

import (
	"time"

	"jannie/platform/cards"
)

// Calls: the people at a table may call each other with sound and video.
// The media go directly between their browsers (WebRTC); the server only
// keeps who is in the call, with microphone and camera on or off, and
// passes the session descriptions between them (docs/server.md#calls,
// docs/protocol.md#client--server).

const (
	callIDMin = 8
	callIDMax = 32
	maxSDP    = 12000 // bytes of one session description
)

// callState is a seat's part in the call: a session the browser names, so
// a description from an earlier one (a reload, a seat that changed hands)
// cannot reach a later one.
type callState struct {
	ID  string `json:"id"`
	Mic bool   `json:"mic"`
	Cam bool   `json:"cam"`
}

// rtcDesc is a WebRTC session description: an offer or an answer, with the
// network addresses found for it.
type rtcDesc struct {
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

func validCallID(id string) bool {
	if len(id) < callIDMin || len(id) > callIDMax {
		return false
	}
	for _, ch := range id {
		if !('a' <= ch && ch <= 'z' || 'A' <= ch && ch <= 'Z' || '0' <= ch && ch <= '9') {
			return false
		}
	}
	return true
}

// signalled takes a token from the seat's call bucket: joining, switching
// the microphone or camera and the descriptions all count.
func (r *room) signalled(c *client, i cards.Seat) bool {
	if r.seats[i].signal.take(time.Now()) {
		return true
	}
	c.sendError(errLimit, "Even rustig aan: probeer het over een paar seconden opnieuw.")
	return false
}

// cmdCall joins the call, switches the microphone or camera, or (id "")
// hangs up. Everyone sees the change in players[i].call.
func (r *room) cmdCall(c *client, i cards.Seat, m *inMsg) {
	st := &r.seats[i]
	var next *callState
	if m.ID != "" {
		if !validCallID(m.ID) {
			c.sendError(errInvalid, "Dat bericht begrijp ik niet.")
			return
		}
		for k := range r.seats {
			if o := r.seats[k].call; cards.Seat(k) != i && o != nil && o.ID == m.ID {
				c.sendError(errInvalid, "Dat bericht begrijp ik niet.")
				return
			}
		}
		next = &callState{ID: m.ID, Mic: m.Mic != nil && *m.Mic, Cam: m.Cam != nil && *m.Cam}
	}
	if next == nil && st.call == nil || next != nil && st.call != nil && *next == *st.call {
		return
	}
	if !r.signalled(c, i) {
		return
	}
	st.call = next
	r.emitState()
}

// cmdRTC passes a session description to the call session m.To. One that
// no longer finds its session (it hung up, or the seat changed hands) is
// dropped: the browsers start again from the next state.
func (r *room) cmdRTC(c *client, i cards.Seat, m *inMsg) {
	from := r.seats[i].call
	d := m.Desc
	if d == nil || d.Type != "offer" && d.Type != "answer" || d.SDP == "" || len(d.SDP) > maxSDP {
		c.sendError(errInvalid, "Dat bericht begrijp ik niet.")
		return
	}
	if from == nil || m.To == "" || m.To == from.ID {
		return
	}
	for k := range r.seats {
		st := &r.seats[k]
		if st.kind != seatHuman || st.client == nil || st.call == nil || st.call.ID != m.To {
			continue
		}
		if r.signalled(c, i) {
			st.client.send(mustJSON(rtcOut{T: "rtc", From: from.ID, Seat: int(i), Desc: d}))
		}
		return
	}
}
