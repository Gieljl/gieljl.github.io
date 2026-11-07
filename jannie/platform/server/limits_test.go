package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestMessageTooBig(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.send(map[string]any{"t": "chat", "text": strings.Repeat("x", maxMessageBytes)})
	select {
	case _, ok := <-c.in:
		if ok {
			t.Fatal("got a message instead of a close")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("connection not closed")
	}
	if err := <-c.errc; websocket.CloseStatus(err) != websocket.StatusMessageTooBig {
		t.Errorf("close: %v", err)
	}
}

func TestMessageRate(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.msgRate = 20 })
	c := dial(t, ts)
	// The server may close the connection as soon as the 21st ping arrives, so
	// a write after that can fail; one before it cannot.
	ping, _ := json.Marshal(map[string]any{"t": "ping"})
	for i := range 30 {
		if err := c.conn.Write(context.Background(), websocket.MessageText, ping); err != nil {
			if i <= 20 {
				t.Fatalf("send ping %d: %v", i+1, err)
			}
			break
		}
	}
	pongs := 0
	for {
		m := c.next(5 * time.Second)
		if m.T == "pong" {
			pongs++
			continue
		}
		if m.T != "error" || m.Code != errLimit {
			t.Fatalf("got %s %s", m.T, m.Code)
		}
		break
	}
	if pongs < 19 || pongs >= 30 { // 20 at once, plus whatever refilled meanwhile
		t.Errorf("%d pongs before the limit", pongs)
	}
	select {
	case _, ok := <-c.in:
		if ok {
			t.Error("still open after the rate limit")
		}
	case <-time.After(5 * time.Second):
		t.Error("not closed after the rate limit")
	}
	if err := <-c.errc; websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
		t.Errorf("close: %v", err)
	}
}

func TestBadMessages(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	ctx := context.Background()
	c.conn.Write(ctx, websocket.MessageText, []byte("{niet json"))
	c.waitError(errInvalid)
	c.create("Piet", nil, false, false)
	for _, m := range []map[string]any{
		{"t": "vliegen"}, {"t": "play", "card": "ZZ"}, {"t": "trump", "suit": "X"}, {"t": "bid"},
		{"t": "sit", "seat": 9}, {"t": "ready"}, {"t": "rematch"},
	} {
		c.send(m)
		c.waitError(errInvalid)
	}
	c.send(map[string]any{"t": "play", "card": "JH"})
	if e := c.waitError(errInvalid); e.errMsg() != "Dat kan nu niet." {
		t.Errorf("play in the lobby: %q", e.errMsg())
	}
	c.send(map[string]any{"t": "ping"})
	c.waitType("pong")
}

func TestPerIPLimits(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.maxPerIP, s.createMax = 4, 3 })
	for range s.maxPerIP {
		dialIP(t, ts, "192.0.2.1")
	}
	if _, err := dialErr(ts, "192.0.2.1"); err == nil {
		t.Error("connection over the limit accepted")
	}
	dialIP(t, ts, "192.0.2.2") // another address is fine

	c := dialIP(t, ts, "192.0.2.3")
	for range 3 {
		c.create("Piet", nil, false, false)
	}
	c.send(map[string]any{"t": "create", "name": "Piet"})
	c.waitError(errTooMany)
	// The limit is per address.
	d := dialIP(t, ts, "192.0.2.4")
	d.create("Piet", nil, false, false)
}

// A club plays on one wifi, so all of it comes from the same address: every
// phone asking for a table that is gone, as after a restart, 25 tables of
// four, a new round while the old tables still count, and the sockets of
// phones that dropped out.
func TestClubOnOneAddress(t *testing.T) {
	s, ts, _ := newTestServer(t)
	const ip = "192.0.2.30"
	tab := dialIP(t, ts, ip)
	for range s.maxPerIP {
		tab.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
		tab.waitError(errUnknown)
	}
	for range 25 {
		host := dialIP(t, ts, ip)
		host.create("Piet", nil, false, false)
		for _, name := range []string{"Joke", "Kees", "Riet"} {
			dialIP(t, ts, ip).join(host.code, name, "")
		}
	}
	for range 25 {
		dialIP(t, ts, ip).create("Piet", nil, false, false)
	}
	for range s.maxPerIP - 126 {
		dialIP(t, ts, ip)
	}
	if _, err := dialErr(ts, ip); err == nil {
		t.Error("connection over the limit accepted")
	}
}

func TestMaxRooms(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) {
		s.cfg.MaxRooms = 2
		s.evictAfter = time.Hour
	})
	a := dial(t, ts)
	a.create("Piet", nil, false, false)
	b := dial(t, ts)
	b.create("Piet", nil, false, false)
	c := dial(t, ts)
	c.send(map[string]any{"t": "create", "name": "Piet"})
	if e := c.waitError(errTooMany); !strings.Contains(e.errMsg(), "te veel spellen") {
		t.Errorf("msg %q", e.errMsg())
	}
	// A room nobody has been in for a while makes way for a new game.
	r := roomOf(t, s, a.code)
	a.conn.CloseNow()
	waitFor(t, "room a idle", func() bool { return r.idle.Load() != 0 })
	c.send(map[string]any{"t": "create", "name": "Piet"})
	c.waitError(errTooMany) // not idle long enough
	s.mu.Lock()
	s.evictAfter = 0
	s.mu.Unlock()
	c.create("Piet", nil, false, false)
	x := dial(t, ts)
	x.send(map[string]any{"t": "join", "code": a.code, "name": "X"})
	x.waitError(errUnknown)
	roomOf(t, s, b.code) // the rooms with a player stay
	roomOf(t, s, c.code)
	select {
	case <-r.done:
	case <-time.After(5 * time.Second):
		t.Error("the evicted room did not stop")
	}
}

func TestLiveRoomsPerAddress(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) { s.liveMax = 2 })
	c := dialIP(t, ts, "192.0.2.20")
	c.create("Piet", nil, false, false)
	c.create("Piet", nil, false, false) // the first lobby stays, empty
	c.send(map[string]any{"t": "create", "name": "Piet"})
	if e := c.waitError(errTooMany); !strings.Contains(e.errMsg(), "Vanaf jouw adres") {
		t.Errorf("msg %q", e.errMsg())
	}
	dialIP(t, ts, "192.0.2.21").create("Piet", nil, false, false) // per address
	// Leaving the lobby as the last player removes it: room for a new one.
	c.send(map[string]any{"t": "leave"})
	waitFor(t, "lobby removed", func() bool {
		s.mu.Lock()
		defer s.mu.Unlock()
		return s.live["192.0.2.20"] == 1
	})
	c.create("Piet", nil, false, false)
}

func TestJoinRate(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.joinRate, s.joinBurst = 1, 3 })
	x := dial(t, ts)
	for range 3 {
		x.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
		x.waitError(errUnknown)
	}
	x.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
	x.waitError(errLimit)
	x.send(map[string]any{"t": "ping"}) // still connected
	x.waitType("pong")
	time.Sleep(1100 * time.Millisecond)
	x.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
	x.waitError(errUnknown)
}

// TestFailedJoinsBlock: an address that keeps failing to join (guessing
// codes) is refused for a while; a seat token still works.
func TestFailedJoinsBlock(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) {
		s.joinFailMax = 3
		s.joinBlock = 300 * time.Millisecond
	})
	h := dial(t, ts)
	h.create("Host", map[string]any{"players": 2}, false, false)
	const ip = "192.0.2.30"
	g := dialIP(t, ts, ip)
	g.join(h.code, "Gast", "")

	x := dialIP(t, ts, ip)
	x.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
	x.waitError(errUnknown)
	x.send(map[string]any{"t": "join", "code": "YYYY", "name": "X"})
	x.waitError(errUnknown)
	y := dialIP(t, ts, ip)
	y.send(map[string]any{"t": "join", "code": h.code, "name": "Y"})
	y.waitError(errFull) // the third failure: the address is blocked now
	for _, m := range []map[string]any{
		{"t": "join", "code": "ZZZZ", "name": "X"},
		{"t": "join", "code": h.code, "name": "X"},
		{"t": "join", "code": h.code, "name": "X", "token": "verkeerd"},
		{"t": "join", "code": "ZZZZ", "name": "X", "token": "verkeerd"},
	} {
		x.send(m)
		if e := x.waitError(errLimit); e.errMsg() != msgJoinBlocked {
			t.Errorf("%v: %q", m, e.errMsg())
		}
	}
	// The seated guest gets back in with the token.
	g.conn.CloseNow()
	g2 := dialIP(t, ts, ip)
	g2.join(h.code, "Gast", g.token)
	if g2.seat != g.seat {
		t.Errorf("back at seat %d, want %d", g2.seat, g.seat)
	}
	// Other addresses are not affected; the block ends.
	z := dial(t, ts)
	z.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "Z"})
	z.waitError(errUnknown)
	time.Sleep(350 * time.Millisecond)
	x.send(map[string]any{"t": "join", "code": "ZZZZ", "name": "X"})
	x.waitError(errUnknown)
	s.mu.Lock()
	n := len(s.joins[ip].fails)
	s.mu.Unlock()
	if n != 1 {
		t.Errorf("%d failures counted after the block", n)
	}
}

func TestOriginCheck(t *testing.T) {
	_, ts, _ := newTestServer(t, func(s *Server) { s.cfg.AllowedOrigins = []string{"*.kroes.dev"} })
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	try := func(origin string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {origin}}})
		if err == nil {
			c.CloseNow()
		}
		return err
	}
	if err := try("https://evil.example"); err == nil {
		t.Error("foreign origin accepted")
	}
	if err := try(ts.URL); err != nil {
		t.Errorf("same origin refused: %v", err)
	}
	if err := try("https://klaverjas.kroes.dev"); err != nil {
		t.Errorf("allowed pattern refused: %v", err)
	}
}

func TestShutdown(t *testing.T) {
	s, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Piet", map[string]any{}, false, true)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go s.Shutdown(ctx)
	e := c.waitError(errRestarting)
	if e.errMsg() != msgRestarting {
		t.Errorf("msg %q", e.errMsg())
	}
	deadline := time.After(5 * time.Second)
	for {
		select {
		case _, ok := <-c.in:
			if !ok {
				if err := <-c.errc; websocket.CloseStatus(err) != websocket.StatusServiceRestart {
					t.Errorf("close: %v", err)
				}
				if _, err := dialErr(ts, "198.51.100.1"); err == nil {
					t.Error("new connection accepted while shutting down")
				}
				return
			}
		case <-deadline:
			t.Fatal("connection not closed at shutdown")
		}
	}
}

func TestJanitor(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) {
		s.idleTimeout = 100 * time.Millisecond
		s.overTimeout = 100 * time.Millisecond
		s.janitorEvery = 20 * time.Millisecond
	})
	rooms := func() int {
		s.mu.Lock()
		defer s.mu.Unlock()
		return len(s.rooms)
	}
	// A room nobody is connected to goes.
	c := dial(t, ts)
	c.create("Piet", map[string]any{}, false, true)
	c.conn.CloseNow()
	waitFor(t, "idle room removed", func() bool { return rooms() == 0 })
	if n := s.players.Load(); n != 0 {
		t.Errorf("%d players counted after the room went", n)
	}

	// A finished game goes too, even with players connected; they hear so.
	d := dial(t, ts)
	d.create("Piet", map[string]any{"hands": 4}, false, true)
	s.mu.Lock()
	r := s.rooms[d.code]
	s.mu.Unlock()
	call(r, func() {
		r.pending = stepNone
		r.handNo = r.opts.Hands
		r.nextHand()
	})
	d.waitEvent("gameOver")
	e := d.waitError(errUnknown)
	if !strings.Contains(e.errMsg(), "opgeruimd") {
		t.Errorf("msg %q", e.errMsg())
	}
	waitFor(t, "finished room removed", func() bool { return rooms() == 0 })
}

// TestJanitorAbandoned: with nobody connected, a lobby, a finished game and
// a game everyone left go after the short timeout; a running game someone
// may return to stays.
func TestJanitorAbandoned(t *testing.T) {
	s, ts, _ := newTestServer(t, func(s *Server) {
		s.idleTimeout = time.Hour
		s.overTimeout = time.Hour
		s.abandonTimeout = 100 * time.Millisecond
		s.janitorEvery = 20 * time.Millisecond
	})
	registered := func(code string) bool {
		s.mu.Lock()
		defer s.mu.Unlock()
		return s.rooms[code] != nil
	}
	running := dial(t, ts)
	running.create("Piet", map[string]any{}, false, true)
	running.conn.CloseNow()
	left := dial(t, ts)
	left.create("Piet", map[string]any{}, false, true)
	left.send(map[string]any{"t": "leave"})
	lobby := dial(t, ts)
	lobby.create("Piet", map[string]any{}, false, false)
	lobby.conn.CloseNow()
	over := dial(t, ts)
	over.create("Piet", map[string]any{"hands": 4}, false, true)
	r := roomOf(t, s, over.code)
	call(r, func() {
		r.pending = stepNone
		r.handNo = r.opts.Hands
		r.nextHand()
	})
	over.waitEvent("gameOver")
	if !registered(over.code) {
		t.Fatal("finished game with a player removed")
	}
	over.conn.CloseNow()
	waitFor(t, "abandoned rooms removed", func() bool {
		return !registered(left.code) && !registered(lobby.code) && !registered(over.code)
	})
	time.Sleep(100 * time.Millisecond)
	if !registered(running.code) {
		t.Error("a running game with a human seat went after the short timeout")
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timeout: %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}
