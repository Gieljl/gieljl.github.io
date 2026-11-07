package yasatserver

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"jannie/games/yasat/yasat"
	"jannie/platform/server/servertest"
)

func decode(t *testing.T, m *servertest.Msg) state {
	t.Helper()
	var s state
	if err := json.Unmarshal(m.S, &s); err != nil {
		t.Fatalf("bad state %s: %v", m.S, err)
	}
	return s
}

// TestMatch plays matches of a human (who calls as soon as it may, else
// throws its highest card) against bots of every level, to game over.
func TestMatch(t *testing.T) {
	for _, level := range []string{"makkelijk", "normaal", "sterk"} {
		t.Run(level, func(t *testing.T) {
			srv := servertest.Start(t, New())
			h := srv.Dial()
			h.Create("Giel", map[string]any{"players": 4, "ai": level, "tempo": "snel", "length": "bo10", "seed": 11}, true)
			acted, events := "", map[string]int{}
			for {
				m := h.Next(10 * time.Second)
				if m.T == "error" {
					t.Fatalf("error %s: %s", m.Code, m.ErrMsg())
				}
				if m.T != "update" {
					continue
				}
				events[m.EvType()]++
				s := decode(t, m)
				key := fmt.Sprint(s.Phase, s.Round, len(s.Moves), s.Turn)
				switch {
				case s.Phase == "gameOver":
					if len(s.History) != 10 || s.Round != 10 {
						t.Fatalf("game over after %d rounds", len(s.History))
					}
					w, _ := p0(s)
					if s.Winner >= 0 && w[s.Winner] < w[0] && w[s.Winner] < w[1] {
						t.Fatalf("winner %d of %v", s.Winner, w)
					}
					if events["call"] != 10 || events["handEnd"] != 10 || events["move"] == 0 {
						t.Fatalf("events %v", events)
					}
					return
				case s.Phase == "handEnd" && acted != key:
					acted = key
					h.Send(map[string]any{"t": "ready"})
				case s.Phase == "aces" && s.Aces[s.You] && acted != key:
					acted = key
					h.Send(map[string]any{"t": "aces", "eleven": []string{}})
				case s.Phase == "play" && s.Turn == s.You && acted != key:
					acted = key
					if s.CanCall {
						h.Send(map[string]any{"t": "yasat"})
						break
					}
					worst := s.Hand[0]
					for _, c := range s.Hand {
						if c.Value() > worst.Value() {
							worst = c
						}
					}
					h.Send(map[string]any{"t": "move", "discard": []string{worst.String()}, "deck": true})
				}
			}
		})
	}
}

func p0(s state) ([]int, int) { return s.Weighted, s.Streak }

// TestRefused checks the answers to moves that break the rules.
func TestRefused(t *testing.T) {
	srv := servertest.Start(t, New())
	h := srv.Dial()
	h.Create("Giel", map[string]any{"players": 2, "tempo": "snel", "seed": 5}, true)
	m := h.Until(5*time.Second, "my turn", func(m *servertest.Msg) bool {
		if m.T != "update" {
			return false
		}
		s := decode(t, m)
		return s.Phase == "play" && s.Turn == s.You
	})
	s := decode(t, m)
	var other yasat.Card
	for _, c := range yasat.NewDeck() {
		mine := false
		for _, x := range s.Hand {
			mine = mine || x == c
		}
		if !mine && c != s.Top[0] {
			other = c
			break
		}
	}
	h.Send(map[string]any{"t": "move", "discard": []string{other.String()}, "deck": true})
	if e := h.WaitType("error"); e.Code != "ongeldig" {
		t.Fatalf("a card not in hand: %s %s", e.Code, e.ErrMsg())
	}
	h.Send(map[string]any{"t": "move", "discard": []string{s.Hand[0].String()}, "take": other.String()})
	if e := h.WaitType("error"); e.Code != "ongeldig" {
		t.Fatalf("a card not on top: %s %s", e.Code, e.ErrMsg())
	}
	if !s.CanCall {
		h.Send(map[string]any{"t": "yasat"})
		if e := h.WaitType("error"); e.Code != "ongeldig" {
			t.Fatalf("a call over 7: %s %s", e.Code, e.ErrMsg())
		}
	}
}
