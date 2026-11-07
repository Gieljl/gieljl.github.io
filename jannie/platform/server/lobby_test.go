package server

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"jannie/games/klaverjas/game"
)

// botSeats lists the seats holding bots.
func botSeats(s *state) []int {
	var out []int
	for i, p := range s.Players {
		if p != nil && p.Bot {
			out = append(out, i)
		}
	}
	return out
}

func TestCreateDefaults(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("  Piet\u0007  ", nil, false, false)
	s := c.s
	if s.Phase != phaseLobby || s.You != 0 || s.Host != 0 || s.HandNo != 0 || s.Training {
		t.Fatalf("state: phase %s you %d host %d hand %d", s.Phase, s.You, s.Host, s.HandNo)
	}
	want := defaultOptions()
	want.Tips = false // training's
	if s.Opts != want {
		t.Errorf("opts %+v, want defaults", s.Opts)
	}
	if len(s.Roster) != len(fakePersonas) || s.Roster[0].ID != "dirk" || s.Roster[0].Bio == "" {
		t.Errorf("roster %+v", s.Roster)
	}
	if p := s.Players[0]; p == nil || p.Name != "Piet" || p.Bot || !p.Connected {
		t.Errorf("creator %+v", p)
	}
	for i := 1; i < 4; i++ {
		if s.Players[i] != nil {
			t.Errorf("seat %d not empty: %+v", i, s.Players[i])
		}
	}
	if len(c.code) != 4 || normCode(strings.ToLower(c.code)) != c.code || len(c.token) != 32 {
		t.Errorf("code %q token %q", c.code, c.token)
	}
}

// TestPlayersSetsTheTable: the number of players is the number of seats;
// they stay empty in the lobby until someone sits there or the host puts a
// bot there, and bots fill the rest at the start.
func TestPlayersSetsTheTable(t *testing.T) {
	_, ts, _ := newTestServer(t)
	for _, players := range []int{2, 3, 4} {
		c := dial(t, ts)
		c.create("Host", map[string]any{"players": players}, false, false)
		if len(c.s.Players) != players || len(c.s.Bids) != players || len(botSeats(c.s)) != 0 || c.s.Opts.Players != players {
			t.Errorf("%d players: seats %+v, opts %+v", players, c.s.Players, c.s.Opts)
		}
		c.send(map[string]any{"t": "start"})
		s := c.waitEvent("deal").state
		if got := botSeats(s); len(got) != players-1 || len(s.Total) != game.Scorers(players) {
			t.Errorf("%d players: bots at %v after the start, total %v", players, got, s.Total)
		}
		ids := map[string]bool{}
		for _, i := range botSeats(s) {
			ids[s.Players[i].BotID] = true
		}
		if len(ids) != players-1 {
			t.Errorf("%d players: bots not distinct", players)
		}
	}
	// Training is always four, whatever the options say.
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"players": 2}, true, false)
	if len(c.s.Players) != 4 || c.s.Opts.Players != 4 {
		t.Errorf("training at a table of %d", len(c.s.Players))
	}
}

func TestOptsChangesPlayers(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	if g.seat != 1 {
		t.Fatalf("guest at seat %d, want the first empty seat 1", g.seat)
	}
	h.waitEvent("join")
	// The guest moves to seat 3, the host puts a bot at 2: going to three
	// seats takes seat 3 away, so the guest moves to the first free seat
	// and the bot stays.
	g.send(map[string]any{"t": "sit", "seat": 3})
	g.waitState("guest at 3", func(s *state) bool { return s.You == 3 })
	h.send(map[string]any{"t": "bot", "seat": 2, "id": "dirk"})
	h.waitState("bot at 2", func(s *state) bool { return s.Players[2] != nil })
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 3, "hands": 8, "trumpMode": "gedraaid"}})
	s := h.waitState("three seats", func(s *state) bool { return s.Opts.Players == 3 })
	if len(s.Players) != 3 || s.Players[1] == nil || s.Players[1].Name != "Gast" || !slices.Equal(botSeats(s), []int{2}) {
		t.Errorf("three seats: %+v %+v %+v", s.Players[0], s.Players[1], s.Players[2])
	}
	if s.Opts.Hands != 8 || s.Opts.TrumpMode != game.Gedraaid {
		t.Errorf("opts %+v", s.Opts)
	}
	if gs := g.waitState("guest moved", func(s *state) bool { return s.You == 1 }); len(gs.Players) != 3 {
		t.Errorf("guest sees %d seats", len(gs.Players))
	}
	h.send(map[string]any{"t": "bot", "seat": 3, "id": ""})
	h.waitError(errInvalid) // no such seat any more
	// Two seats: the bot makes way, nobody else has to.
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 2}})
	s = h.waitState("two seats", func(s *state) bool { return s.Opts.Players == 2 })
	if len(s.Players) != 2 || len(botSeats(s)) != 0 || s.Players[1].Name != "Gast" {
		t.Errorf("two seats: %+v %+v", s.Players[0], s.Players[1])
	}
	// A third person makes two seats too few.
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 3}})
	h.waitState("three seats", func(s *state) bool { return s.Opts.Players == 3 })
	x := dial(t, ts)
	x.join(h.code, "Derde", "")
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 2}})
	if e := h.waitError(errInvalid); e.errMsg() != "Er zitten al 3 mensen aan tafel." {
		t.Errorf("msg %q", e.errMsg())
	}
	// Agreements on signals: the defaults, then an object of which the
	// agreements left out keep their default.
	if s.Opts.Signals != game.DefaultSignals {
		t.Errorf("signals %+v, want the defaults", s.Opts.Signals)
	}
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"signals": map[string]any{"boerOverBoer": true, "hoogLaag": false}}})
	s = h.waitState("signals", func(s *state) bool { return s.Opts.Signals.BoerOverBoer })
	if want := (game.Signals{Aas: true, KleintjeBoer: true, BoerOverBoer: true}); s.Opts.Signals != want {
		t.Errorf("signals %+v, want %+v", s.Opts.Signals, want)
	}
	for _, bad := range []map[string]any{{"hands": 5}, {"ai": "goddelijk"}, {"tempo": 3}, {"rules": "haags"}, {"players": 1}, {"players": 5}, {"signals": "ja"}, {"signals": map[string]any{"aas": 1}}} {
		h.send(map[string]any{"t": "opts", "opts": bad})
		h.waitError(errInvalid)
	}
	g.send(map[string]any{"t": "opts", "opts": map[string]any{"hands": 4}})
	g.waitError(errNotHost)
}

func TestLobbyCommands(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.waitEvent("join")

	for _, m := range []map[string]any{
		{"t": "bot", "seat": 2, "id": ""}, {"t": "unbot", "seat": 2}, {"t": "start"},
	} {
		g.send(m)
		g.waitError(errNotHost)
	}
	h.send(map[string]any{"t": "bot", "seat": 1, "id": "dirk"})
	h.waitError(errInvalid) // a human sits there
	h.send(map[string]any{"t": "bot", "seat": 2, "id": "nobody"})
	h.waitError(errInvalid)
	h.send(map[string]any{"t": "bot", "seat": 2, "id": "dirk"})
	s := h.waitState("dirk at 2", func(s *state) bool { return s.Players[2] != nil })
	if p := s.Players[2]; p.BotID != "dirk" || p.Name != "Opa Dirk (AI)" || p.Emoji != "👴" || p.Color == "" || !p.Bot {
		t.Errorf("bot %+v", p)
	}
	h.send(map[string]any{"t": "bot", "seat": 3, "id": "dirk"})
	if e := h.waitError(errInvalid); e.errMsg() != "Opa Dirk (AI) zit al aan tafel." {
		t.Errorf("msg %q", e.errMsg())
	}
	h.send(map[string]any{"t": "bot", "seat": 2, "id": ""}) // replace with someone else
	s = h.waitState("replaced", func(s *state) bool { return s.Players[2] != nil && s.Players[2].BotID != "dirk" })
	h.send(map[string]any{"t": "unbot", "seat": 1})
	h.waitError(errInvalid)
	h.send(map[string]any{"t": "unbot", "seat": 2})
	h.waitState("seat 2 empty", func(s *state) bool { return s.Players[2] == nil })

	// Humans may move to an empty seat; the host role moves along.
	g.send(map[string]any{"t": "sit", "seat": 2})
	s = g.waitState("guest at 2", func(s *state) bool { return s.You == 2 })
	if s.Players[1] != nil || s.Players[2].Name != "Gast" {
		t.Errorf("after sit: %+v %+v", s.Players[1], s.Players[2])
	}
	g.send(map[string]any{"t": "sit", "seat": 0})
	g.waitError(errInvalid)
	h.send(map[string]any{"t": "sit", "seat": 3})
	s = h.waitState("host at 3", func(s *state) bool { return s.You == 3 })
	if s.Host != 3 {
		t.Errorf("host %d after the host moved to 3", s.Host)
	}

	// Start fills both empty seats with distinct bots.
	h.send(map[string]any{"t": "start"})
	s = h.waitEvent("deal").state
	if got := botSeats(s); !slices.Equal(got, []int{0, 1}) || s.Players[0].BotID == s.Players[1].BotID {
		t.Errorf("after start: bots at %v", got)
	}
	h.send(map[string]any{"t": "sit", "seat": 0})
	h.waitError(errStarted)
}

func TestJoinErrors(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", map[string]any{"players": 2}, false, false)

	x := dial(t, ts)
	x.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
	x.waitError(errUnknown)
	x.send(map[string]any{"t": "join", "code": "A1", "name": "X"})
	x.waitError(errUnknown)
	x.send(map[string]any{"t": "chat", "text": "hallo"})
	x.waitError(errUnknown)

	g := dial(t, ts)
	g.join(strings.ToLower(h.code), "Gast", "") // codes are case-insensitive
	if g.seat != 1 {
		t.Errorf("guest at seat %d, want the free seat 1", g.seat)
	}
	y := dial(t, ts)
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Y"})
	if e := y.waitError(errFull); !strings.Contains(e.errMsg(), "alle twee plaatsen zijn bezet") {
		t.Errorf("refusal %q", e.errMsg())
	}

	h.send(map[string]any{"t": "start"})
	h.waitEvent("deal")
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Y"})
	y.waitError(errStarted)
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Y", "token": "verkeerd"})
	y.waitError(errStarted)
}

// TestRefusedJoin: a join turned away from a full lobby tells the joiner
// what to ask for, and the host (a system line for the table, a refused
// message for the host only), at most once per refusedGap per room. Back
// in the lobby with every seat taken, nobody is invited to join.
func TestRefusedJoin(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	h := dial(t, ts)
	h.create("Host", map[string]any{"players": 2, "hands": 4}, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.waitEvent("join")
	r := roomOf(t, s, h.code)

	y := dial(t, ts)
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Yara"})
	if m := y.waitError(errFull); !strings.Contains(m.errMsg(), "bij Spelers een plaats bij te zetten") {
		t.Errorf("refusal text %q", m.errMsg())
	}
	if m := h.waitType("refused"); m.Name != "Yara" {
		t.Errorf("refused notice for %q", m.Name)
	}
	line := "Yara wilde aanschuiven, maar de tafel is vol."
	g.until(5*time.Second, "refusal line", func(m *msg) bool {
		return m.T == "chat" && slices.ContainsFunc(g.chats, func(c chatMsg) bool { return c.Sys && c.Text == line })
	})
	if !slices.ContainsFunc(h.chats, func(c chatMsg) bool { return c.Sys && c.Text == line }) {
		t.Errorf("host has no refusal line: %+v", h.chats)
	}

	// Within the gap: refused again, but nobody is told.
	call(r, func() { r.refusedAt = time.Now() })
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Zeno"})
	y.waitError(errFull)
	call(r, func() {}) // the join is handled: a notice would be queued before the pong
	h.send(map[string]any{"t": "ping"})
	h.until(5*time.Second, "pong", func(m *msg) bool {
		if m.T == "refused" {
			t.Errorf("second notice within the gap: %q", m.Name)
		}
		return m.T == "pong"
	})

	// A free seat taken by a bot: the host can remove it.
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 3}})
	h.waitState("three seats, seat 2 free", func(s *state) bool { return s.Opts.Players == 3 && s.Players[2] == nil })
	h.send(map[string]any{"t": "bot", "seat": 2, "id": ""})
	h.waitState("bot at 2", func(s *state) bool { return s.Players[2] != nil && s.Players[2].Bot })
	call(r, func() { r.refusedAt = time.Time{} })
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Yara"})
	if m := y.waitError(errFull); !strings.Contains(m.errMsg(), "AI-speler weg te halen") {
		t.Errorf("refusal text with every seat taken: %q", m.errMsg())
	}
	h.waitType("refused")

	// Game over and back to the lobby with both seats taken: no invitation.
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"players": 2}})
	h.waitState("two seats", func(s *state) bool { return s.Opts.Players == 2 })
	h.send(map[string]any{"t": "start"})
	h.waitEvent("deal")
	call(r, func() {
		r.pending = stepNone
		r.handNo = r.opts.Hands
		r.nextHand()
	})
	h.waitEvent("gameOver")
	h.send(map[string]any{"t": "lobby"})
	h.waitState("lobby", func(s *state) bool { return s.Phase == phaseLobby }) // the line comes first
	if !slices.ContainsFunc(h.chats, func(c chatMsg) bool { return c.Sys && c.Text == "Host zet de tafel opnieuw klaar." }) {
		t.Errorf("lobby line with a full table: %+v", h.chats)
	}
}

func TestLeaveAndTakeOver(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 4}, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.send(map[string]any{"t": "start"})
	h.waitEvent("deal")

	// The host leaves mid-game: the seat waits with the name, nobody plays
	// it, and the guest becomes host.
	h.send(map[string]any{"t": "leave"})
	m := g.until(5*time.Second, "leave", func(m *msg) bool { return m.T == "update" && m.evType() == "leave" })
	s := m.state
	if p := s.Players[0]; p == nil || p.Bot || !p.Left || p.Connected || p.Name != "Host" {
		t.Fatalf("seat 0 after leave: %+v", p)
	}
	if s.Host != 1 {
		t.Errorf("host %d, want 1", s.Host)
	}
	if !slices.ContainsFunc(g.chats, func(c chatMsg) bool { return c.Sys && c.Text == "Host is vertrokken." }) {
		t.Errorf("no leave line in %+v", g.chats)
	}
	// The old token no longer works, but a newcomer takes over the seat.
	n := dial(t, ts)
	n.join(h.code, "Nieuw", h.token)
	if n.seat != 0 {
		t.Fatalf("newcomer at seat %d, want 0", n.seat)
	}
	if p := n.s.Players[0]; p.Bot || p.Left || p.Name != "Nieuw" {
		t.Errorf("seat 0 after takeover: %+v", p)
	}
	g.waitEvent("join")
	if !slices.ContainsFunc(g.chats, func(c chatMsg) bool { return c.Sys && c.Text == "Nieuw neemt de plaats van Host over." }) {
		t.Errorf("no takeover line in %+v", g.chats)
	}
	x := dial(t, ts)
	x.send(map[string]any{"t": "join", "code": h.code, "name": "X"})
	x.waitError(errStarted)
}

func TestHostHandover(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.01 })
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")
	h.waitEvent("join")

	// A disconnected host hands over after the grace period (30 s scaled).
	h.conn.CloseNow()
	s := g.waitState("host handover", func(s *state) bool { return s.Host == g.seat })
	if s.Players[0] == nil || s.Players[0].Connected {
		t.Errorf("old host: %+v", s.Players[0])
	}
	if !slices.ContainsFunc(g.chats, func(c chatMsg) bool { return c.Sys && c.Text == "Gast is nu de host." }) {
		t.Errorf("no host line in %+v", g.chats)
	}
	// The new host leaves the lobby: nobody connected remains but the old
	// host's seat, who becomes host again.
	g.send(map[string]any{"t": "leave"})
	h2 := dial(t, ts)
	h2.join(h.code, "Host", h.token)
	if h2.s.Host != 0 || h2.s.Players[1] != nil {
		t.Errorf("after rejoin: host %d, seat 1 %+v", h2.s.Host, h2.s.Players[1])
	}
	// The last human leaving the lobby removes the room.
	h2.send(map[string]any{"t": "leave"})
	x := dial(t, ts)
	deadline := time.Now().Add(2 * time.Second)
	for {
		x.send(map[string]any{"t": "join", "code": h.code, "name": "X"})
		m := x.until(2*time.Second, "answer", func(m *msg) bool { return m.T == "error" || m.T == "joined" })
		if m.T == "error" && m.Code == errUnknown {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("room still there: %s %s", m.T, m.errMsg())
		}
		x.send(map[string]any{"t": "leave"})
	}
}

// TestHostStaysWhileNobodyConnected: when the host's grace is up while
// nobody else is connected, the role stays. Here Anna (host) dropped
// first, Bert 20 s later; at Anna's 30 s Bert does not get it, so Anna,
// back first, can start.
func TestHostStaysWhileNobodyConnected(t *testing.T) {
	s, _, _ := newTestServer(t, func(s *Server) { s.scale = 1 })
	r := newRoom(s, "HOST")
	a, b := newClient(s, nil, "10.0.0.1", ""), newClient(s, nil, "10.0.0.2", "")
	r.seats[0], r.seats[1] = newHuman("Anna"), newHuman("Bert")
	r.setClient(0, a)
	r.setClient(1, b)
	r.host = 0
	r.setClient(0, nil)
	r.setClient(1, nil)
	r.seats[0].leftAt = time.Now().Add(-31 * time.Second)
	r.seats[1].leftAt = time.Now().Add(-11 * time.Second)
	r.checkHost() // Anna's grace timer
	if r.host != 0 {
		t.Errorf("with nobody connected the role went to %s", r.seats[r.host].name)
	}
	r.setClient(0, a)
	r.checkHost()
	if !r.lobbyHost(a, 0) {
		t.Errorf("Anna, back first, is no host")
	}
}

// TestHostAfterLeave: the host leaves the lobby while the two others are
// disconnected, so the role goes to Bert, gone a moment. Carl is back
// first: he gets it when Bert's grace is up, with no host command of his
// own (the client shows him none).
func TestHostAfterLeave(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.scale = 0.02 }) // grace 600 ms
	a := dial(t, ts)
	a.create("Anna", nil, false, false)
	b := dial(t, ts)
	b.join(a.code, "Bert", "")
	c := dial(t, ts)
	c.join(a.code, "Carl", "")
	r := roomOf(t, s, a.code)
	b.conn.CloseNow()
	a.waitSeat("away", 1)
	c.conn.CloseNow()
	a.waitSeat("away", 2)
	a.send(map[string]any{"t": "leave"})
	var host game.Seat
	waitFor(t, "Anna gone", func() bool {
		var kind seatKind
		call(r, func() { kind, host = r.seats[0].kind, r.host })
		return kind == seatEmpty
	})
	if host != 1 {
		t.Fatalf("host %d after Anna left, want Bert's seat 1", host)
	}
	c2 := dial(t, ts)
	c2.join(a.code, "Carl", c.token)
	c2.waitState("Carl host", func(s *state) bool { return s.Host == s.You })
}

func TestChat(t *testing.T) {
	_, ts, _ := newTestServer(t)
	h := dial(t, ts)
	h.create("Host", nil, false, false)
	g := dial(t, ts)
	g.join(h.code, "Gast", "")

	long := strings.Repeat("é", 250)
	h.send(map[string]any{"t": "chat", "text": "  hallo\n\tdaar‮  "})
	h.send(map[string]any{"t": "chat", "text": "   "}) // ignored
	h.send(map[string]any{"t": "chat", "text": long})
	got := []string{}
	for len(got) < 2 {
		m := g.waitType("chat")
		var cm chatMsg
		json.Unmarshal(m.Msg, &cm)
		if cm.Sys {
			continue
		}
		if cm.Seat != 0 || cm.Name != "Host" || cm.Bot || cm.TS == 0 {
			t.Errorf("chat %+v", cm)
		}
		got = append(got, cm.Text)
	}
	if got[0] != "hallo daar" || got[1] != strings.Repeat("é", 200) {
		t.Errorf("chat texts %q", got)
	}
	// Burst of 5, then 1 per second: two lines are used, so a quick run of
	// eight more hits the limit.
	for range 8 {
		h.send(map[string]any{"t": "chat", "text": "spam"})
	}
	h.waitError(errLimit)

	// A newcomer gets the log, at most 50 lines.
	n := dial(t, ts)
	n.send(map[string]any{"t": "join", "code": h.code, "name": "Nieuw"})
	n.waitType("joined")
	log := n.waitType("chatlog")
	if len(log.Msgs) == 0 || len(log.Msgs) > 50 {
		t.Errorf("chatlog has %d lines", len(log.Msgs))
	}
}

func TestBotChatLimits(t *testing.T) {
	s, _, _ := newTestServer(t, func(s *Server) { s.scale = 1 })
	r := newRoom(s, "CHAT")
	r.seats[1] = r.newBot(fakePersonas[1])
	if !r.botSay(1, ChatEvent{Kind: "greet"}, 0) {
		t.Fatal("bot did not greet")
	}
	if r.botSay(1, ChatEvent{Kind: "greet"}, 0) {
		t.Error("second line in the same trick")
	}
	r.trickNo++
	if r.botSay(1, ChatEvent{Kind: "greet"}, 0) {
		t.Error("second line within 8 s")
	}
	r.seats[1].lastChat = time.Now().Add(-9 * time.Second)
	if !r.botSay(1, ChatEvent{Kind: "greet"}, 0) {
		t.Error("no line after 9 s in a new trick")
	}
	r.trickNo++
	r.seats[1].lastChat = time.Now().Add(-9 * time.Second)
	if r.botSay(1, ChatEvent{Kind: "trump"}, 0) {
		t.Error("the fake AI has nothing to say about trump")
	}
	// A quiet bot (Chattiness 0.2) waits 40 s.
	r.seats[3] = r.newBot(fakePersonas[3])
	r.seats[3].lastChat = time.Now().Add(-20 * time.Second)
	if r.botSay(3, ChatEvent{Kind: "greet"}, 0) {
		t.Error("quiet bot spoke after 20 s")
	}
	if r.botSay(0, ChatEvent{Kind: "greet"}, 0) {
		t.Error("an empty seat spoke")
	}
}

func TestBotsGreetAndReply(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Piet", map[string]any{}, false, true)
	m := c.until(5*time.Second, "bot greeting", func(m *msg) bool {
		if m.T != "chat" {
			return false
		}
		var cm chatMsg
		json.Unmarshal(m.Msg, &cm)
		return cm.Bot
	})
	var cm chatMsg
	json.Unmarshal(m.Msg, &cm)
	if !slices.Contains(fakeGreetings, cm.Text) || !strings.HasSuffix(cm.Name, " (AI)") || cm.Seat < 1 || cm.Sys {
		t.Errorf("greeting %+v", cm)
	}
}

func TestHealth(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.cfg.Version = "abc123" })
	c := dial(t, ts)
	c.create("Piet", nil, false, false)
	resp, err := http.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var h map[string]any
	if err := json.Unmarshal(body, &h); err != nil {
		t.Fatalf("health %s: %v", body, err)
	}
	if h["ok"] != true || h["version"] != "abc123" || h["rooms"] != 1.0 || h["players"] != 1.0 || len(h) != 4 {
		t.Errorf("health %s", body)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("content type %q", ct)
	}
	resp, err = http.Post(ts.URL+"/api/health", "text/plain", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("POST health: %d", resp.StatusCode)
	}
}

func TestCleanName(t *testing.T) {
	for in, want := range map[string]string{
		"  Piet  ":                    "Piet",
		"":                            "Speler",
		" \t\n ":                      "Speler",
		"Jan\u0000\u001b[31m Klaas":   "Jan[31m Klaas",
		"Opa Dirk (AI)":               "Opa Dirk",
		"(ai)":                        "Speler",
		"Een heel erg lange naam die": "Een heel erg lange n",
		"Ali‮ba":                      "Aliba",
		"👩‍🏫 Ans":                     "👩‍🏫 Ans",
		"a  \t b":                     "a b",
		"\xff\xfeMarie":               "Marie",

		// No fake "(AI)": not recreated by the cut to 20, not hidden by
		// invisible or look-alike characters, nowhere in the name.
		"Opa Dirk Jansen (AI)X":        "Opa Dirk Jansen X",
		"Opa Dirk (AI)\u200b":          "Opa Dirk",
		"Opa Dirk (AI)\u00ad":          "Opa Dirk",
		"Opa Dirk （ＡＩ）":                "Opa Dirk",
		"Opa Dirk (\u0410\u0406)":      "Opa Dirk", // Cyrillic А and І
		"Opa Dirk (A\u200dI)":          "Opa Dirk",
		"Opa Dirk ( a . i )":           "Opa Dirk",
		"Opa Dirk (Al)":                "Opa Dirk",
		"Opa (AI) Dirk":                "Opa Dirk",
		"((AI)AI)":                     "Speler",
		"Piet\u3164(AI)":               "Piet",
		"Ali (Alice)":                  "Ali (Alice)",
		"AI Bram":                      "AI Bram",
		"Opa Dirk\U000E0041\U000E0049": "Opa Dirk",

		// Invisible names become Speler.
		"\u200b\u200b":             "Speler",
		"\u200d":                   "Speler",
		"\ufeff":                   "Speler",
		"\u3164":                   "Speler",
		"\u2800":                   "Speler",
		"\U000E0041":               "Speler",
		"\u0301\u0301":             "Speler",
		"\u115f\u1160 \uffa0":      "Speler",
		"\u2065\ufff0\ufdd0\uffff": "Speler",

		// Marks: at most three on a letter; real text keeps them.
		"H" + strings.Repeat("\u0301", 199): "H\u0301\u0301\u0301",
		"Zoe\u0308":                         "Zoe\u0308",
		"Nguyê\u0303n":                      "Nguyê\u0303n",

		// Joiners stay between visible characters only.
		"🏳️‍🌈 Kim":         "🏳️‍🌈 Kim",
		"👨‍👩‍👧 Fam":        "👨‍👩‍👧 Fam",
		"1️⃣ Eva":          "1️⃣ Eva",
		"Ans\u200d":        "Ans",
		"\u200dAns":        "Ans",
		"An\u200d\u200ds":  "An\u200ds",
		"An\u200d s":       "An s",
		"می\u200cخواهم":    "می\u200cخواهم",
		"Kees\u202e\u2066": "Kees",
	} {
		if got := cleanName(in); got != want {
			t.Errorf("cleanName(%q) = %q, want %q", in, got, want)
		}
	}
	// The cut to 20 characters keeps whole characters and no joiner at the end.
	long := strings.Repeat("a", 19) + "👩‍🏫"
	if got := cleanName(long); got != strings.Repeat("a", 19)+"👩" {
		t.Errorf("cleanName(%q) = %q", long, got)
	}
}

func TestCleanChat(t *testing.T) {
	for in, want := range map[string]string{
		"  hallo\n\tdaar  ":                 "hallo daar",
		"\u200b\u200b\u200b":                "",
		"\u3164":                            "",
		"\u2800 \u2800":                     "",
		"\u0301\u0301":                      "",
		"hoi 👋\u200d":                       "hoi 👋",
		"gg\U000E0067\U000E0062":            "gg",
		"(AI) mag in de chat":               "(AI) mag in de chat",
		"H" + strings.Repeat("\u0300", 199): "H\u0300\u0300\u0300",
	} {
		if got := cleanChat(in); got != want {
			t.Errorf("cleanChat(%q) = %q, want %q", in, got, want)
		}
	}
	if got := cleanChat(strings.Repeat("ab ", 100)); utf8.RuneCountInString(got) != 200 || strings.HasSuffix(got, " ") {
		t.Errorf("long line: %d characters %q", utf8.RuneCountInString(got), got[len(got)-4:])
	}
}

// TestBotChatNoRepeats: a bot does not say one of its latest lines for an
// event again (numbers aside), and stays silent rather than repeat itself.
func TestBotChatNoRepeats(t *testing.T) {
	s, _, _ := newTestServer(t, func(s *Server) { s.scale = 1 })
	r := newRoom(s, "ECHO")
	t.Cleanup(r.stop) // lines are posted to a room loop that does not run
	r.seats[1] = r.newBot(fakePersonas[1])
	var said []string
	for k := range 300 {
		st := &r.seats[1]
		st.lastChat = time.Now().Add(-time.Minute)
		r.trickNo++
		if r.botSay(1, ChatEvent{Kind: "roem", Mine: true, Points: 20 + 30*(k%2)}, 0) {
			lines := st.said["roem"]
			said = append(said, lines[len(lines)-1])
		}
	}
	if len(said) < 250 {
		t.Errorf("the bot spoke %d times out of 300 with lines left to say", len(said))
	}
	for k := range said {
		for back := 1; back <= botChatMemory && back <= k; back++ {
			if said[k] == said[k-back] {
				t.Fatalf("line %d %q repeats line %d", k, said[k], k-back)
			}
		}
	}
	if !slices.Contains(said, "# roem. Niet slecht.") {
		t.Errorf("numbers not folded: %q", said[:8])
	}
	// A new persona on the seat starts afresh.
	r.seats[1] = r.newBot(fakePersonas[2])
	if r.seats[1].said != nil {
		t.Errorf("new bot remembers %v", r.seats[1].said)
	}
	// With only lines said lately to choose from (the fake has one answer
	// to "hoi"), the bot keeps quiet.
	hoi := ChatEvent{Kind: "reply", Text: "hoi"}
	if !r.botSay(1, hoi, 0) {
		t.Fatal("no answer to hoi")
	}
	r.seats[1].lastChat = time.Now().Add(-time.Minute)
	r.trickNo++
	if r.botSay(1, hoi, 0) {
		t.Error("the bot repeated itself instead of keeping quiet")
	}
}
