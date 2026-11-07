package server

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"
)

// Keys of `s` (games/klaverjas/README.md#state-s) present in every phase.
var baseKeys = []string{
	"code", "phase", "opts", "training", "expert", "you", "host", "players", "handNo", "hands",
	"dealer", "voorhand", "turned", "bids", "forced", "bid", "bidder", "soloist", "talon",
	"discards", "piles", "openRoem", "trump", "trumpBy", "playingTeam",
	"turn", "takeover", "hand", "trick", "lastTrick", "tricksWon", "handPoints", "handRoem", "scores",
	"total", "prevHand", "nextAt", "hint", "lesson", "trumpsLeft", "hands4", "winner", "review",
}

func keysOf(t *testing.T, raw json.RawMessage) []string {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("not an object: %s", raw)
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func wantKeys(t *testing.T, what string, raw json.RawMessage, want []string) {
	t.Helper()
	w := slices.Clone(want)
	sort.Strings(w)
	if got := keysOf(t, raw); !slices.Equal(got, w) {
		t.Errorf("%s keys:\n got  %v\n want %v", what, got, w)
	}
}

func field(t *testing.T, raw json.RawMessage, key string) json.RawMessage {
	t.Helper()
	var m map[string]json.RawMessage
	json.Unmarshal(raw, &m)
	return m[key]
}

func TestStateKeys(t *testing.T) {
	for _, players := range []int{4, 3, 2} {
		t.Run(fmt.Sprint(players), func(t *testing.T) { testStateKeys(t, players) })
	}
}

func testStateKeys(t *testing.T, players int) {
	_, ts, _ := newTestServer(t)
	rng := rand.New(rand.NewPCG(11, uint64(players)))
	c := dial(t, ts)
	c.send(map[string]any{"t": "create", "name": "Piet", "opts": map[string]any{"hands": 4, "players": players}})
	c.waitType("joined")
	c.waitType("chatlog")
	lobby := c.waitType("update")
	if string(lobby.Ev) != "null" {
		t.Errorf("first update ev %s, want null", lobby.Ev)
	}
	wantKeys(t, "lobby", lobby.S, append(slices.Clone(baseKeys), "roster"))
	wantKeys(t, "opts", field(t, lobby.S, "opts"), []string{"players", "hands", "trumpMode", "rules", "ai", "tempo", "open", "lesson", "tips", "signals", "seed", "from"})
	var seats []json.RawMessage
	json.Unmarshal(field(t, lobby.S, "players"), &seats)
	if len(seats) != players {
		t.Fatalf("players has %d entries", len(seats))
	}
	playerKeys := []string{"name", "bot", "botId", "emoji", "color", "connected", "away", "left", "vote", "call", "cards", "ready"}
	wantKeys(t, "player", seats[0], playerKeys)
	for i, p := range seats[1:] {
		if string(p) != "null" {
			t.Errorf("seat %d is not free in the lobby: %s", i+1, p)
		}
	}
	var roster []json.RawMessage
	json.Unmarshal(field(t, lobby.S, "roster"), &roster)
	wantKeys(t, "roster entry", roster[0], []string{"id", "name", "emoji", "color", "bio"})
	if v := string(field(t, lobby.S, "expert")); v != "false" {
		t.Errorf("lobby expert = %s, want false", v)
	}
	for _, k := range []string{"trick", "lastTrick", "prevHand", "hint", "lesson", "hands4", "turned", "trump", "piles", "openRoem", "review", "takeover"} {
		if v := string(field(t, lobby.S, k)); v != "null" {
			t.Errorf("lobby %s = %s, want null", k, v)
		}
	}
	for _, k := range []string{"talon", "discards"} {
		if v := string(field(t, lobby.S, k)); v != "[]" {
			t.Errorf("lobby %s = %s, want []", k, v)
		}
	}
	if v := string(field(t, lobby.S, "scores")); v != "[]" {
		t.Errorf("lobby scores = %s", v)
	}
	if v := string(field(t, lobby.S, "hand")); v != "[]" {
		t.Errorf("lobby hand = %s", v)
	}

	c.send(map[string]any{"t": "start"})
	seen := map[string]bool{}
	acted := 0
	for !seen["gameOver"] {
		m := c.next(10 * time.Second)
		if m.T != "update" {
			continue
		}
		s := m.state
		mine := c.myTurn()
		key := s.Phase
		if mine {
			key += "/mine"
		}
		switch {
		case s.Phase == phasePlay && mine:
			wantKeys(t, key, m.S, append(slices.Clone(baseKeys), "legal", "rule"))
		default:
			wantKeys(t, key, m.S, baseKeys)
		}
		if !seen[key] {
			seen[key] = true
			checkPhaseValues(t, key, m)
		}
		switch {
		case mine && c.seq > acted:
			acted = c.seq
			c.actRandom(rng)
		case s.Phase == phaseHandEnd && !s.Players[s.You].Ready:
			c.send(map[string]any{"t": "ready"})
		}
	}
	want := []string{"trump", "play", "play/mine", "handEnd", "gameOver"}
	if players == 3 {
		want = append(want, "auction", "discard")
	}
	for _, k := range want {
		if !seen[k] {
			t.Errorf("never saw a state in %s", k)
		}
	}
}

func checkPhaseValues(t *testing.T, key string, m *msg) {
	t.Helper()
	s := m.state
	n := len(s.Players)
	if p := string(field(t, m.S, "piles")); (n == 2 && s.Phase != phaseHandEnd && s.Phase != phaseGameOver && s.Phase != phaseLobby) != (p != "null") {
		t.Errorf("%s: %d players with piles %s", key, n, p)
	}
	switch s.Phase {
	case phaseAuction, phaseDiscard, phaseTrump, phasePlay:
		if s.Trick == nil || s.Dealer < 0 || s.Voorhand != (s.Dealer+1)%n {
			t.Errorf("%s: trick %v dealer %d voorhand %d", key, s.Trick, s.Dealer, s.Voorhand)
		}
		wantKeys(t, key+" trick", field(t, m.S, "trick"), []string{"leader", "cards", "winner", "points", "roem"})
		if n == 2 {
			var piles [][]json.RawMessage
			json.Unmarshal(field(t, m.S, "piles"), &piles)
			if len(piles) != 2 || len(piles[0]) != 8 {
				t.Fatalf("%s: piles %s", key, field(t, m.S, "piles"))
			}
			wantKeys(t, key+" pile", piles[0][0], []string{"n", "card"})
		}
	case phaseHandEnd:
		// Alone at the table the summary waits for ready.
		people := 0
		for _, p := range s.Players {
			if p != nil && !p.Bot && !p.Left {
				people++
			}
		}
		if (people == 1) != (s.NextAt == 0) || s.NextAt != 0 && s.NextAt <= time.Now().Add(-time.Minute).UnixMilli() || s.PrevHand == nil || s.Turn != -1 {
			t.Errorf("handEnd: %d people, nextAt %d prevHand %v turn %d", people, s.NextAt, s.PrevHand != nil, s.Turn)
		}
		wantKeys(t, "prevHand", field(t, m.S, "prevHand"), []string{"tricks", "result"})
		wantKeys(t, "result", field(t, field(t, m.S, "prevHand"), "result"),
			[]string{"players", "playingTeam", "trumpBy", "trump", "dealer", "points", "roem", "score", "nat", "pit", "pitTeam", "bid", "discards", "gains"})
		var rows []json.RawMessage
		json.Unmarshal(field(t, m.S, "scores"), &rows)
		wantKeys(t, "score row", rows[0], []string{"hand", "dealer", "trump", "trumpBy", "playingTeam", "bid", "points", "roem", "score", "gains", "nat", "pit"})
		if s.Trick != nil || len(s.Hand) != 0 {
			t.Errorf("handEnd: trick %v hand %v", s.Trick, s.Hand)
		}
	case phaseGameOver:
		if s.NextAt != 0 || s.Turn != -1 {
			t.Errorf("gameOver: nextAt %d turn %d", s.NextAt, s.Turn)
		}
		var ev map[string]json.RawMessage
		json.Unmarshal(m.Ev, &ev)
		if len(ev) != 3 || ev["total"] == nil || ev["winner"] == nil {
			t.Errorf("gameOver event %s", m.Ev)
		}
	}
	if strings.HasSuffix(key, "/mine") && s.Phase == phasePlay {
		if s.Rule == "" || len(s.Legal) == 0 {
			t.Errorf("%s: rule %q legal %v", key, s.Rule, s.Legal)
		}
	}
}

// TestEventShapes checks the fields of each event kind.
func TestEventShapes(t *testing.T) {
	for _, players := range []int{4, 3} {
		t.Run(fmt.Sprint(players), func(t *testing.T) { testEventShapes(t, players) })
	}
}

func testEventShapes(t *testing.T, players int) {
	_, ts, _ := newTestServer(t)
	rng := rand.New(rand.NewPCG(13, uint64(players)))
	c := dial(t, ts)
	c.create("Piet", map[string]any{"hands": 4, "trumpMode": "gedraaid", "players": players}, false, true)
	want := map[string][]string{
		"deal":     {"type", "handNo", "dealer"},
		"turned":   {"type", "suit"},
		"bid":      {"type", "seat", "play"},
		"trump":    {"type", "seat", "suit", "forced"},
		"play":     {"type", "seat", "card"},
		"trick":    {"type", "winner", "points", "roem", "last"},
		"collect":  {"type", "winner"},
		"handEnd":  {"type", "result"},
		"gameOver": {"type", "total", "winner"},
	}
	if players == 3 {
		// The auction instead of gedraaid.
		delete(want, "turned")
		delete(want, "bid")
		want["auction"] = []string{"type", "seat", "bid"}
		want["contract"] = []string{"type", "seat", "bid", "forced"}
	}
	seen := map[string]bool{}
	acted, readied := 0, 0
	for !seen["gameOver"] {
		m := c.next(10 * time.Second)
		if m.T != "update" {
			continue
		}
		if e := m.evType(); e != "" {
			keys, ok := want[e]
			if !ok && e != "discard" {
				t.Fatalf("unexpected event %s", m.Ev)
			}
			if e == "discard" {
				keys = []string{"type", "seat"} // only when the human plays alone
			}
			wantKeys(t, "event "+e, m.Ev, keys)
			if e == "trick" && !strings.Contains(string(m.Ev), `"roem":[`) {
				t.Errorf("trick roem is not a list: %s", m.Ev)
			}
			seen[e] = true
		}
		switch {
		case c.myTurn() && c.seq > acted:
			acted = c.seq
			c.actRandom(rng)
		case m.state.Phase == phaseHandEnd && readied < m.state.HandNo:
			readied = m.state.HandNo
			c.send(map[string]any{"t": "ready"})
		}
	}
	for e := range want {
		if !seen[e] {
			t.Errorf("never saw event %s", e)
		}
	}
}
