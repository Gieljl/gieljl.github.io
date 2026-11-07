// Package servertest is the test kit for a game on the API of package
// server: a server for the game in the test process at a very fast pace,
// and websocket clients that keep every message and the latest state as it
// came, for the test to decode as its game's.
package servertest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"jannie/platform/server"
)

// Scale is the servers' time scale: every game delay times 0.005.
const Scale = 0.005

// Server is a game server behind httptest.
type Server struct {
	*server.Server
	HTTP *httptest.Server
	t    testing.TB
}

// Start starts a server for g at Scale, without limits on messages and
// joins per connection, logging nowhere; tweak may change its Config (a
// game log, say). It stops when the test ends.
func Start(t testing.TB, g server.Game, tweak ...func(*server.Config)) *Server {
	t.Helper()
	cfg := server.Config{Game: g, Fast: true, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	for _, f := range tweak {
		f(&cfg)
	}
	s := server.New(cfg)
	s.TestMode(Scale)
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		s.Shutdown(ctx)
		ts.Close()
	})
	return &Server{Server: s, HTTP: ts, t: t}
}

// Msg is a server message (docs/protocol.md#server--client) as a test
// sees it.
type Msg struct {
	T     string          `json:"t"`
	Code  string          `json:"code"` // joined: the room; error: the error code
	Seat  int             `json:"seat"`
	Token string          `json:"token"`
	Seq   int             `json:"seq"`
	Ev    json.RawMessage `json:"ev"`
	S     json.RawMessage `json:"s"`   // update: the state, for the test to decode
	Msg   json.RawMessage `json:"msg"` // error: the text; chat: the line
	Text  string          `json:"text"`
	Name  string          `json:"name"`

	Raw []byte         `json:"-"` // the whole message
	ev  map[string]any // Ev decoded
}

// Event is the update's event decoded, nil for none.
func (m *Msg) Event() map[string]any { return m.ev }

// EvType is the update's event type, "" for none.
func (m *Msg) EvType() string {
	s, _ := m.ev["type"].(string)
	return s
}

// ErrMsg is an error's text.
func (m *Msg) ErrMsg() string {
	var s string
	json.Unmarshal(m.Msg, &s)
	return s
}

// Chat is a chat message's line.
func (m *Msg) Chat() (seat int, name, text string, bot, sys bool) {
	var c struct {
		Seat     int
		Name     string
		Text     string
		Bot, Sys bool
	}
	json.Unmarshal(m.Msg, &c)
	return c.Seat, c.Name, c.Text, c.Bot, c.Sys
}

// Client is a test websocket client.
type Client struct {
	t    testing.TB
	Conn *websocket.Conn
	in   chan *Msg
	errc chan error

	Code  string          // the room, once joined
	Seat  int             // the seat, once joined; -1 before
	Token string          // the seat token
	State json.RawMessage // the latest state
	Seq   int             // of the latest update
	Keep  bool            // keep every message read from now on in Kept
	Kept  []*Msg          // in the order read
}

var ipCounter atomic.Int64

// Dial connects a client from a fresh address; it closes when the test
// ends.
func (s *Server) Dial() *Client {
	s.t.Helper()
	n := ipCounter.Add(1)
	return s.DialIP(fmt.Sprintf("10.1.%d.%d", n/250, n%250+1))
}

// DialIP connects a client from address ip (X-Real-IP).
func (s *Server) DialIP(ip string) *Client {
	t := s.t
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(s.HTTP.URL, "http")+"/ws", &websocket.DialOptions{
		HTTPHeader: http.Header{"X-Real-Ip": {ip}, "User-Agent": {"servertest/1.0"}},
	})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	conn.SetReadLimit(1 << 20)
	c := &Client{t: t, Conn: conn, in: make(chan *Msg, 4096), errc: make(chan error, 1), Seat: -1}
	t.Cleanup(func() { conn.CloseNow() })
	go func() {
		for {
			_, data, err := conn.Read(context.Background())
			if err != nil {
				c.errc <- err
				close(c.in)
				return
			}
			m := &Msg{Raw: data}
			if err := json.Unmarshal(data, m); err != nil {
				c.errc <- fmt.Errorf("bad message %s: %w", data, err)
				close(c.in)
				return
			}
			if len(m.Ev) > 0 && string(m.Ev) != "null" {
				json.Unmarshal(m.Ev, &m.ev)
			}
			c.in <- m
		}
	}()
	return c
}

// Send sends v as JSON.
func (c *Client) Send(v any) {
	c.t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		c.t.Fatalf("send: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := c.Conn.Write(ctx, websocket.MessageText, b); err != nil {
		c.t.Fatalf("send %s: %v", b, err)
	}
}

// Close closes the connection at once, as a phone that drops out.
func (c *Client) Close() { c.Conn.CloseNow() }

// Next returns the next message; it fails the test after timeout.
func (c *Client) Next(timeout time.Duration) *Msg {
	c.t.Helper()
	select {
	case m, ok := <-c.in:
		if !ok {
			c.t.Fatalf("connection closed: %v", <-c.errc)
		}
		c.track(m)
		return m
	case <-time.After(timeout):
		c.t.Fatalf("no message within %v (seat %d)", timeout, c.Seat)
	}
	return nil
}

// Poll returns the next message if one is in, else nil, for a test that
// drives several clients in one loop; it fails the test when the
// connection is closed.
func (c *Client) Poll() *Msg {
	c.t.Helper()
	select {
	case m, ok := <-c.in:
		if !ok {
			c.t.Fatalf("connection closed (seat %d): %v", c.Seat, <-c.errc)
		}
		c.track(m)
		return m
	default:
		return nil
	}
}

func (c *Client) track(m *Msg) {
	if c.Keep {
		c.Kept = append(c.Kept, m)
	}
	switch m.T {
	case "joined":
		c.Code, c.Seat, c.Token = m.Code, m.Seat, m.Token
	case "update":
		if m.Seq < c.Seq {
			c.t.Errorf("seq went back from %d to %d", c.Seq, m.Seq)
		}
		c.Seq, c.State = m.Seq, m.S
	}
}

// Until reads messages until pred holds and returns that message; it
// fails the test after timeout.
func (c *Client) Until(timeout time.Duration, what string, pred func(*Msg) bool) *Msg {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		left := time.Until(deadline)
		if left <= 0 {
			c.t.Fatalf("timeout waiting for %s (seat %d)", what, c.Seat)
		}
		select {
		case m, ok := <-c.in:
			if !ok {
				c.t.Fatalf("connection closed while waiting for %s: %v", what, <-c.errc)
			}
			c.track(m)
			if pred(m) {
				return m
			}
		case <-time.After(left):
			c.t.Fatalf("timeout waiting for %s (seat %d)", what, c.Seat)
		}
	}
}

// WaitType waits up to 5 s for a message of type t.
func (c *Client) WaitType(t string) *Msg {
	c.t.Helper()
	return c.Until(5*time.Second, "message "+t, func(m *Msg) bool { return m.T == t })
}

// WaitError waits up to 5 s for an error, which must have code.
func (c *Client) WaitError(code string) *Msg {
	c.t.Helper()
	m := c.Until(5*time.Second, "error "+code, func(m *Msg) bool { return m.T == "error" })
	if m.Code != code {
		c.t.Fatalf("error code %q (%s), want %q", m.Code, m.ErrMsg(), code)
	}
	return m
}

// WaitEvent waits up to 10 s for an update with event ev.
func (c *Client) WaitEvent(ev string) *Msg {
	c.t.Helper()
	return c.Until(10*time.Second, "event "+ev, func(m *Msg) bool { return m.T == "update" && m.EvType() == ev })
}

// Create makes a room and waits for joined, the chat log and the first
// update; extra adds fields to the create message (training, expert).
func (c *Client) Create(name string, opts map[string]any, start bool, extra ...map[string]any) {
	c.t.Helper()
	m := map[string]any{"t": "create", "name": name, "opts": opts, "start": start}
	for _, e := range extra {
		for k, v := range e {
			m[k] = v
		}
	}
	c.Send(m)
	c.WaitType("joined")
	c.WaitType("chatlog")
	c.WaitType("update")
}

// TryJoin asks to join room code and returns joined or the error.
func (c *Client) TryJoin(code, name, token string) *Msg {
	c.t.Helper()
	c.Send(map[string]any{"t": "join", "code": code, "name": name, "token": token})
	return c.Until(5*time.Second, "joined", func(m *Msg) bool { return m.T == "joined" || m.T == "error" })
}

// Join enters room code and waits for joined, the chat log and a state.
func (c *Client) Join(code, name, token string) {
	c.t.Helper()
	if m := c.TryJoin(code, name, token); m.T == "error" {
		c.t.Fatalf("join failed: %s %s", m.Code, m.ErrMsg())
	}
	c.WaitType("chatlog")
	c.WaitType("update")
}

// Keys are the keys of a JSON object, sorted.
func Keys(t testing.TB, raw json.RawMessage) []string {
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

// WantKeys fails the test unless the object raw has exactly the keys want.
func WantKeys(t testing.TB, what string, raw json.RawMessage, want []string) {
	t.Helper()
	w := slices.Clone(want)
	sort.Strings(w)
	if got := Keys(t, raw); !slices.Equal(got, w) {
		t.Errorf("%s keys:\n got  %v\n want %v", what, got, w)
	}
}

// Field is the value of key in the object raw, nil without it.
func Field(t testing.TB, raw json.RawMessage, key string) json.RawMessage {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("not an object: %s", raw)
	}
	return m[key]
}

// SeedLine is the table's system line at game over that names the seed of
// the match (docs/server.md#the-seed).
func SeedLine(seed uint64) string { return fmt.Sprintf("De seed van dit spel was %d.", seed) }

// SeedAtEnd checks the messages c kept: none before its n-th update with
// event gameOver (1: the first) names seed as a number, and SeedLine comes
// after that update. A seed of four digits or fewer (one in 100000) may be
// a score or a count: it is not looked for then.
func SeedAtEnd(t testing.TB, c *Client, n int, seed uint64) {
	t.Helper()
	num := regexp.MustCompile(`(^|[^0-9])` + strconv.FormatUint(seed, 10) + `([^0-9]|$)`)
	over := 0
	for k, m := range c.Kept {
		if m.T == "update" && m.EvType() == "gameOver" {
			if over++; over == n {
				for _, after := range c.Kept[k+1:] {
					if _, _, text, _, sys := after.Chat(); after.T == "chat" && sys && text == SeedLine(seed) {
						return
					}
				}
				t.Errorf("seat %d: no line %q after game over %d", c.Seat, SeedLine(seed), n)
				return
			}
		}
		if seed >= 10000 && num.Match(m.Raw) {
			t.Errorf("seat %d: seed %d before game over %d: %s", c.Seat, seed, n, m.Raw)
			return
		}
	}
	t.Errorf("seat %d: no game over %d in %d messages", c.Seat, n, len(c.Kept))
}

// SharedKeys are the keys of the state every game shares (server.Shared),
// roster aside (the lobby only).
var SharedKeys = []string{"code", "phase", "opts", "you", "host", "players", "turn", "takeover", "nextAt"}
