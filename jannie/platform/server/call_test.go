package server

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// rtcIn is an rtc message as a test client receives it.
type rtcIn struct {
	From string   `json:"from"`
	Seat int      `json:"seat"`
	Desc *rtcDesc `json:"desc"`
}

func waitRTC(t *testing.T, c *tclient) rtcIn {
	t.Helper()
	var r rtcIn
	if err := json.Unmarshal(c.waitType("rtc").raw, &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func callOf(c *tclient, seat int) *callState {
	if p := c.s.Players[seat]; p != nil {
		return p.Call
	}
	return nil
}

func sameCall(a, b *callState) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }

// waitCall waits until c sees seat in the call as want (nil: not in it).
func waitCall(c *tclient, seat int, want *callState) {
	c.t.Helper()
	c.waitState("call of seat", func(s *state) bool { return s.Players[seat] != nil && sameCall(s.Players[seat].Call, want) })
}

func TestCall(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	if callOf(g, 0) != nil || callOf(g, 1) != nil {
		t.Fatal("in the call before joining it")
	}

	// Joining the call shows on every page, with microphone and camera.
	h.send(map[string]any{"t": "call", "id": "hostCall01", "mic": true, "cam": false})
	hc := &callState{ID: "hostCall01", Mic: true}
	waitCall(g, 0, hc)
	waitCall(h, 0, hc)
	g.send(map[string]any{"t": "call", "id": "gastCall01", "mic": true, "cam": true})
	gc := &callState{ID: "gastCall01", Mic: true, Cam: true}
	waitCall(h, 1, gc)

	// Descriptions go to the session named, with who sent them.
	sdp := "v=0\r\n" + strings.Repeat("a=x\r\n", 1500) // more than the old 4 KiB per message
	h.send(map[string]any{"t": "rtc", "to": "gastCall01", "desc": map[string]any{"type": "offer", "sdp": sdp}})
	if r := waitRTC(t, g); r.From != "hostCall01" || r.Seat != 0 || r.Desc == nil || r.Desc.Type != "offer" || r.Desc.SDP != sdp {
		t.Fatalf("offer arrived as %+v", r)
	}
	g.send(map[string]any{"t": "rtc", "to": "hostCall01", "desc": map[string]any{"type": "answer", "sdp": "v=0\r\n"}})
	if r := waitRTC(t, h); r.From != "gastCall01" || r.Seat != 1 || r.Desc.Type != "answer" {
		t.Fatalf("answer arrived as %+v", r)
	}

	// A description for a session that is gone is dropped; a bad one is refused.
	h.send(map[string]any{"t": "rtc", "to": "gastCall00", "desc": map[string]any{"type": "offer", "sdp": "v=0\r\n"}})
	h.send(map[string]any{"t": "chat", "text": "na de oude"})
	g.until(5*time.Second, "chat after the stale offer", func(m *msg) bool {
		if m.T == "rtc" {
			t.Fatalf("a description for another session arrived: %s", m.raw)
		}
		return m.T == "chat" && strings.Contains(string(m.Msg), "na de oude")
	})
	h.send(map[string]any{"t": "rtc", "to": "gastCall01", "desc": map[string]any{"type": "pranswer", "sdp": "v=0\r\n"}})
	h.waitError(errInvalid)
	h.send(map[string]any{"t": "rtc", "to": "gastCall01", "desc": map[string]any{"type": "offer", "sdp": strings.Repeat("a", maxSDP+1)}})
	h.waitError(errInvalid)

	// Another's session name, or one that is no name, is refused.
	h.send(map[string]any{"t": "call", "id": "gastCall01", "mic": true})
	h.waitError(errInvalid)
	h.send(map[string]any{"t": "call", "id": "kort", "mic": true})
	h.waitError(errInvalid)
	h.send(map[string]any{"t": "call", "id": "host-call-1", "mic": true})
	h.waitError(errInvalid)

	// The microphone off, then hanging up.
	h.send(map[string]any{"t": "call", "id": "hostCall01", "mic": false, "cam": false})
	waitCall(g, 0, &callState{ID: "hostCall01"})
	h.send(map[string]any{"t": "call", "id": ""})
	waitCall(g, 0, nil)

	// Out of the call, nothing goes out.
	h.send(map[string]any{"t": "rtc", "to": "gastCall01", "desc": map[string]any{"type": "offer", "sdp": "v=0\r\n"}})
	h.send(map[string]any{"t": "chat", "text": "buiten het gesprek"})
	g.until(5*time.Second, "chat after the offer from outside the call", func(m *msg) bool {
		if m.T == "rtc" {
			t.Fatalf("a description from outside the call arrived: %s", m.raw)
		}
		return m.T == "chat" && strings.Contains(string(m.Msg), "buiten het gesprek")
	})

	// The call ends with the connection: a return is out of it.
	g.conn.CloseNow()
	h.waitState("guest away and out of the call", func(s *state) bool {
		return !s.Players[1].Connected && s.Players[1].Call == nil
	})
	g2 := dial(t, ts)
	g2.join(h.code, "Gast", g.token)
	if callOf(g2, 1) != nil {
		t.Error("back at the table and still in the call")
	}

	// A seat moved in the lobby keeps its call.
	g2.send(map[string]any{"t": "call", "id": "gastCall02", "mic": true})
	waitCall(h, 1, &callState{ID: "gastCall02", Mic: true})
	g2.send(map[string]any{"t": "sit", "seat": 3})
	waitCall(h, 3, &callState{ID: "gastCall02", Mic: true})

	// Another window takes the seat over: the old window's call ends for all.
	g3 := dial(t, ts)
	g3.join(h.code, "Gast", g.token)
	waitCall(h, 3, nil)
	if callOf(g3, 3) != nil {
		t.Error("the new window is in the old window's call")
	}
}

func TestCallStartsGameWithCalls(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.send(map[string]any{"t": "call", "id": "hostCall01", "mic": true})
	waitCall(g, 0, &callState{ID: "hostCall01", Mic: true})
	// The call goes on into the match; the bots are never in it.
	h.send(map[string]any{"t": "start"})
	s := g.waitState("the match", func(s *state) bool { return s.Phase != phaseLobby })
	if !sameCall(s.Players[0].Call, &callState{ID: "hostCall01", Mic: true}) {
		t.Errorf("host's call in the match: %+v", s.Players[0].Call)
	}
	for k, p := range s.Players {
		if p.Bot && p.Call != nil {
			t.Errorf("bot at seat %d in the call", k)
		}
	}
}

func TestCallLimit(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	// Ten at once, then two a second.
	for k := range 12 {
		h.send(map[string]any{"t": "call", "id": "hostCall01", "mic": k%2 == 0})
	}
	h.waitError(errLimit)
}
