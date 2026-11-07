package server

import (
	"slices"
	"testing"
)

// mainOptsKeys are klaverjas's options on the wire
// (games/klaverjas/README.md#options).
var mainOptsKeys = []string{"players", "hands", "trumpMode", "rules", "ai", "tempo", "open", "lesson", "tips", "signals", "seed", "from"}

// TestKlaverjasKnowsNoOtherGame: a klaverjas server knows nothing of
// toepen. Its option keys are ignored and a table of five refused; its
// messages are unknown, in the lobby and in a hand.
func TestKlaverjasKnowsNoOtherGame(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.send(map[string]any{"t": "create", "name": "Jaap",
		"opts": map[string]any{"game": "toepen", "players": 6, "limit": 15, "was": false, "armoede": false}})
	h.waitType("joined")
	h.waitType("chatlog")
	m := h.waitType("update")
	wantKeys(t, "lobby", m.S, append(slices.Clone(baseKeys), "roster"))
	wantKeys(t, "opts", field(t, m.S, "opts"), mainOptsKeys)
	if len(m.state.Players) != 4 || m.state.Opts.Players != 4 {
		t.Errorf("create with six: %d seats", len(m.state.Players))
	}
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 5}})
	if m := h.waitError(errInvalid); m.errMsg() != "Kies 2, 3 of 4 spelers." {
		t.Errorf("five players: %q", m.errMsg())
	}
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"game": "toepen", "limit": 10, "was": true, "armoede": true, "players": 3}})
	m = h.waitEvent("lobby")
	wantKeys(t, "opts", field(t, m.S, "opts"), mainOptsKeys)
	if len(m.state.Players) != 3 {
		t.Errorf("players 3 with toepen's keys: %d seats", len(m.state.Players))
	}
	unknown := func(when string) {
		t.Helper()
		for _, typ := range []string{"toep", "answer", "was", "check"} {
			h.send(map[string]any{"t": typ, "play": true})
			if m := h.waitError(errInvalid); m.errMsg() != "Dat bericht ken ik niet." {
				t.Errorf("%s %s: %q", typ, when, m.errMsg())
			}
		}
	}
	unknown("in the lobby")
	h.send(map[string]any{"t": "start"})
	m = h.waitEvent("deal")
	wantKeys(t, "deal", m.S, baseKeys)
	unknown("in a hand")
}

// A full table of klaverjas says so as it always did: the text counts the
// game's largest table, four.
func TestKlaverjasFullTable(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Jaap", nil, false, false)
	for _, name := range []string{"Kees", "Bram", "Vera"} {
		dial(t, ts).join(h.code, name, "")
	}
	y := dial(t, ts)
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Te laat"})
	if e := y.waitError(errFull); e.errMsg() != "Deze tafel is vol: alle vier de plaatsen zijn bezet." {
		t.Errorf("fifth: %q", e.errMsg())
	}
}

// Klaverjas's texts write only 2..4 as words, as before there were other
// games: the roem lesson says "jij hebt er drie, dus de anderen hebben er
// 5". The texts about a full table of any game spell out up to eight.
func TestNumberWords(t *testing.T) {
	for n, want := range map[int]string{0: "0", 1: "1", 2: "twee", 4: "vier", 5: "5", 8: "8"} {
		if got := numberNL(n); got != want {
			t.Errorf("numberNL(%d) = %q, want %q", n, got, want)
		}
	}
	for n, want := range map[int]string{2: "twee", 4: "vier", 5: "vijf", 6: "zes", 8: "acht", 9: "9"} {
		if got := seatsNL(n); got != want {
			t.Errorf("seatsNL(%d) = %q, want %q", n, got, want)
		}
	}
}
