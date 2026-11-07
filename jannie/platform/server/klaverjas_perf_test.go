package server

import (
	"bytes"
	"cmp"
	"compress/flate"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"math/rand/v2"
	"net"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"jannie/games/klaverjas/game"
)

// The server's own cost: fake humans play whole matches in process, with
// the fake AI, at full speed (go test -run '^$' -bench . ./platform/server),
// and TestPerfWire lists what one connection receives (-args -perf.wire).

var perfWire = flag.Bool("perf.wire", false, "TestPerfWire: list what one connection receives in a match")

// fakeHuman is a connection without a socket: it reads what the room
// queues for it and answers through Server.dispatch, as readLoop does,
// with random legal decisions.
type fakeHuman struct {
	s    *Server
	c    *client
	rng  *rand.Rand
	seen func(t, ev string, b []byte) // every message, if set
	done chan struct{}

	acted, readied int
}

// fakeState is what a fake human needs of a state to play.
type fakeState struct {
	Phase  string      `json:"phase"`
	You    int         `json:"you"`
	Turn   int         `json:"turn"`
	HandNo int         `json:"handNo"`
	Forced bool        `json:"forced"`
	Turned *game.Suit  `json:"turned"`
	Bid    int         `json:"bid"`
	Bidder int         `json:"bidder"`
	Hand   []game.Card `json:"hand"`
	Legal  []game.Card `json:"legal"`
	NextAt int64       `json:"nextAt"`
	Lesson *struct {
		N int `json:"n"`
	} `json:"lesson"`
	Review *struct {
		Pending bool `json:"pending"`
	} `json:"review"`
}

type fakeMsg struct {
	T   string `json:"t"`
	Seq int    `json:"seq"`
	Ev  *struct {
		Type string `json:"type"`
	} `json:"ev"`
	S *fakeState `json:"s"`
}

// run plays until the game is over and the review is in.
func (h *fakeHuman) run() {
	defer close(h.done)
	lesson := 0
	for {
		var b []byte
		select {
		case b = <-h.c.out:
		case <-h.c.quit:
			return
		}
		var m fakeMsg
		if err := json.Unmarshal(b, &m); err != nil {
			panic(err)
		}
		if h.seen != nil {
			ev := ""
			if m.Ev != nil {
				ev = m.Ev.Type
			}
			h.seen(m.T, ev, b)
		}
		if m.T != "update" {
			continue
		}
		st := m.S
		if st.Lesson != nil && st.Lesson.N != lesson {
			lesson = st.Lesson.N
			n := lesson // the room reads it later
			h.s.dispatch(h.c, &inMsg{T: "tipRead", N: &n})
		}
		switch {
		case st.Phase == phaseGameOver:
			if st.Review == nil || !st.Review.Pending {
				return
			}
		case st.Turn == st.You && h.acted < m.Seq && inHand(st.Phase):
			h.acted = m.Seq
			h.s.dispatch(h.c, h.decision(st))
		case st.Phase == phaseHandEnd && h.readied < st.HandNo:
			h.readied = st.HandNo
			h.s.dispatch(h.c, &inMsg{T: "ready"})
		case st.Phase == phasePlay && st.NextAt != 0 && st.Turn == -1: // the last trick waits for its tip
			h.s.dispatch(h.c, &inMsg{T: "tipRead"})
		}
	}
}

// drain reads the queue until the connection closes.
func (h *fakeHuman) drain() {
	for {
		select {
		case <-h.c.out:
		case <-h.c.quit:
			return
		}
	}
}

func inHand(phase string) bool {
	switch phase {
	case phaseAuction, phaseDiscard, phaseTrump, phaseBid, phasePlay:
		return true
	}
	return false
}

// decision is a random legal decision on the turn of st.
func (h *fakeHuman) decision(st *fakeState) *inMsg {
	m := &inMsg{}
	switch st.Phase {
	case phaseTrump:
		su := game.Suit(h.rng.IntN(4))
		for st.Forced && st.Turned != nil && su == *st.Turned {
			su = game.Suit(h.rng.IntN(4))
		}
		m.T, m.Suit = "trump", su.String()
	case phaseBid:
		p := h.rng.IntN(3) == 0
		m.T, m.Play = "bid", &p
	case phaseAuction:
		bid := 0
		if h.rng.IntN(3) == 0 {
			bid = game.MinBid
			if st.Bidder >= 0 {
				bid = st.Bid + game.BidStep
			}
		}
		m.T, m.Bid = "auction", &bid
	case phaseDiscard:
		hand := slices.Clone(st.Hand)
		h.rng.Shuffle(len(hand), func(i, j int) { hand[i], hand[j] = hand[j], hand[i] })
		m.T, m.Cards = "discard", []string{hand[0].String(), hand[1].String()}
	case phasePlay:
		m.T, m.Card = "play", st.Legal[h.rng.IntN(len(st.Legal))].String()
	}
	return m
}

type perfScenario struct {
	name   string
	humans int
	create inMsg // opts, training, expert
}

var perfScenarios = []perfScenario{
	{"solo", 1, inMsg{}},
	{"solo_gedraaid", 1, inMsg{Opts: json.RawMessage(`{"trumpMode":"gedraaid"}`)}},
	{"4_humans", 4, inMsg{}},
	{"training_lesson", 1, inMsg{Opts: json.RawMessage(`{"lesson":"basis"}`), Training: true}},
	{"expert", 1, inMsg{Opts: json.RawMessage(`{"open":true}`), Expert: true}},
	{"3_players", 1, inMsg{Opts: json.RawMessage(`{"players":3}`)}},
	{"2_players", 1, inMsg{Opts: json.RawMessage(`{"players":2}`)}},
}

// perfServer is a server without pauses or think time.
func perfServer(tb testing.TB) *Server {
	s := New(Config{Game: Klaverjas(&fakeAI{}), Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	s.scale = 0
	tb.Cleanup(func() { s.Shutdown(context.Background()) })
	return s
}

var perfIP atomic.Int64

// perfAddr is a fresh client address, so the limits per address never
// stop a benchmark.
func perfAddr() string {
	n := perfIP.Add(1)
	return fmt.Sprintf("10.9.%d.%d", n/250, n%250+1)
}

// playRoom plays one match of sc (the first human creates the room, the
// others join; bots on the other seats) until the game is over and every
// review is in. The first human's messages go to seen. Unless keep, the
// humans then leave and the room is removed; with keep they stay seated.
func playRoom(tb testing.TB, s *Server, sc perfScenario, seen func(t, ev string, b []byte), keep bool) *room {
	hs := make([]*fakeHuman, sc.humans)
	for k := range hs {
		hs[k] = &fakeHuman{s: s, c: newClient(s, nil, perfAddr(), "bench"), rng: rand.New(rand.NewPCG(uint64(k), 7)), done: make(chan struct{})}
	}
	hs[0].seen = seen
	for _, h := range hs {
		go h.run()
	}
	m := sc.create
	m.T, m.Name, m.Start = "create", "Mens0", sc.humans == 1
	s.dispatch(hs[0].c, &m)
	r := hs[0].c.getRoom()
	if sc.humans > 1 {
		for k, h := range hs[1:] {
			s.dispatch(h.c, &inMsg{T: "join", Code: r.code, Name: fmt.Sprintf("Mens%d", k+1)})
		}
		call(r, func() {}) // every join is in
		s.dispatch(hs[0].c, &inMsg{T: "start"})
	}
	timeout := time.After(time.Minute)
	for _, h := range hs {
		select {
		case <-h.done:
		case <-timeout:
			tb.Fatalf("%s: the match did not finish", sc.name)
		}
		if h.c.aborted.Load() {
			tb.Fatalf("%s: a fake human fell behind (queue full)", sc.name)
		}
	}
	for _, h := range hs {
		go h.drain()
		if !keep {
			s.dispatch(h.c, &inMsg{T: "leave"})
			h.c.close(websocket.StatusNormalClosure, "")
		}
	}
	if !keep {
		r.post(func() { r.close("afgelopen") })
	}
	return r
}

// BenchmarkGame plays whole matches of 16 hands, a lesson of lessonLength:
// the server's own cost per match (the fake humans' decoding included).
func BenchmarkGame(b *testing.B) {
	for _, sc := range perfScenarios {
		b.Run(sc.name, func(b *testing.B) {
			s := perfServer(b)
			b.ReportAllocs()
			for b.Loop() {
				playRoom(b, s, sc, nil, false)
			}
		})
	}
}

// BenchmarkMarshalState encodes again, per op, every update one
// connection got in a solo match (they decode and encode byte for byte the
// same, checked once; the event as raw JSON): what emitTo does per seat
// and event.
func BenchmarkMarshalState(b *testing.B) {
	var msgs []updateMsg
	size, differ := 0, 0
	playRoom(b, perfServer(b), perfScenarios[0], func(t, _ string, raw []byte) {
		if t != "update" {
			return
		}
		var m struct {
			Seq int             `json:"seq"`
			Ev  json.RawMessage `json:"ev"`
			S   *state          `json:"s"`
		}
		if err := json.Unmarshal(raw, &m); err != nil {
			panic(err)
		}
		u := updateMsg{T: t, Seq: m.Seq, S: m.S}
		if string(m.Ev) != "null" {
			u.Ev = m.Ev
		}
		if !bytes.Equal(mustJSON(u), raw) {
			differ++
		}
		msgs = append(msgs, u)
		size += len(raw)
	}, false)
	if differ > 0 {
		b.Fatalf("%d of %d updates encode differently once decoded", differ, len(msgs))
	}
	b.SetBytes(int64(size))
	b.ReportAllocs()
	for b.Loop() {
		for _, m := range msgs {
			mustJSON(m)
		}
	}
	b.ReportMetric(float64(b.Elapsed().Nanoseconds())/float64(b.N*len(msgs)), "ns/update")
}

// BenchmarkStateGameOver builds and encodes the state at game over after
// 24 hands, as every update then does (a vote, a call switched on): the
// review with its replay, every graded decision in it.
func BenchmarkStateGameOver(b *testing.B) {
	for _, sc := range []perfScenario{
		{"solo", 1, inMsg{Opts: json.RawMessage(`{"hands":24}`)}},
		{"expert", 1, inMsg{Opts: json.RawMessage(`{"hands":24,"open":true}`), Expert: true}},
	} {
		b.Run(sc.name, func(b *testing.B) {
			r := playRoom(b, perfServer(b), sc, nil, true)
			size := 0
			b.ReportAllocs()
			for b.Loop() {
				call(r, func() { size = len(mustJSON(updateMsg{T: "update", S: r.stateFor(0)})) })
			}
			b.ReportMetric(float64(size), "B/update")
		})
	}
}

// wireStats counts what one connection receives, per kind of message (an
// update by its event): messages, bytes, and bytes as permessage-deflate
// sends them (each message alone, from 512 bytes on, as negotiated);
// and per key of the state its bytes summed over the updates.
type wireStats struct {
	kinds map[string]*kindStats
	keys  map[string]int
	total kindStats
}

type kindStats struct{ n, raw, deflated int }

// frame is the size of a websocket frame with a payload of n bytes, from
// the server (not masked).
func frame(n int) int {
	switch {
	case n < 126:
		return n + 2
	case n < 1<<16:
		return n + 4
	}
	return n + 10
}

func (w *wireStats) add(t, ev string, b []byte) {
	if t == "update" {
		t = "update/" + cmp.Or(ev, "null")
		var m struct {
			S map[string]json.RawMessage `json:"s"`
		}
		json.Unmarshal(b, &m)
		for k, v := range m.S {
			w.keys[k] += len(k) + len(v) + 4 // "k":v,
		}
	}
	d := len(b)
	if d >= 512 {
		var buf bytes.Buffer
		fw, _ := flate.NewWriter(&buf, flate.BestSpeed) // as coder/websocket
		fw.Write(b)
		fw.Flush()
		d = buf.Len() - 4 // without the empty block's tail
	}
	k := w.kinds[t]
	if k == nil {
		k = &kindStats{}
		w.kinds[t] = k
	}
	for _, s := range []*kindStats{k, &w.total} {
		s.n++
		s.raw += frame(len(b))
		s.deflated += frame(d)
	}
}

func (w *wireStats) report(tb testing.TB, title string) {
	var b strings.Builder
	fmt.Fprintf(&b, "\n%s: %d messages, %d B, %d B deflated\n", title, w.total.n, w.total.raw, w.total.deflated)
	kinds := slices.Collect(maps.Keys(w.kinds))
	slices.SortFunc(kinds, func(a, b string) int { return w.kinds[b].raw - w.kinds[a].raw })
	fmt.Fprintf(&b, "%-20s %5s %9s %7s %9s\n", "kind", "n", "B", "B/msg", "deflated")
	for _, k := range kinds {
		s := w.kinds[k]
		fmt.Fprintf(&b, "%-20s %5d %9d %7d %9d\n", k, s.n, s.raw, s.raw/s.n, s.deflated)
	}
	keys := slices.Collect(maps.Keys(w.keys))
	slices.SortFunc(keys, func(a, b string) int { return w.keys[b] - w.keys[a] })
	fmt.Fprintf(&b, "state keys, B over all updates:")
	for _, k := range keys {
		fmt.Fprintf(&b, " %s %d", k, w.keys[k])
	}
	tb.Log(b.String())
}

// TestPerfWire lists what one connection receives over a match of 16
// hands (a lesson: lessonLength), per kind of message and per key of the
// state.
func TestPerfWire(t *testing.T) {
	if !*perfWire {
		t.Skip("-args -perf.wire lists the messages of a match")
	}
	for _, sc := range perfScenarios {
		s := perfServer(t)
		s.scale = 0.002 // the counting fake human keeps up
		w := &wireStats{kinds: map[string]*kindStats{}, keys: map[string]int{}}
		playRoom(t, s, sc, w.add, false)
		w.report(t, sc.name)
	}
}

// BenchmarkWSGame plays a solo match of 16 hands per op over a real
// websocket, the client offering permessage-deflate (as browsers do) or
// not: the write path, and the bytes the server put on the wire.
func BenchmarkWSGame(b *testing.B) {
	for _, c := range []struct {
		name string
		mode websocket.CompressionMode
	}{{"deflate", websocket.CompressionNoContextTakeover}, {"off", websocket.CompressionDisabled}} {
		b.Run(c.name, func(b *testing.B) {
			s := New(Config{Game: Klaverjas(&fakeAI{}), Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
			s.scale = 0.0005
			s.msgRate, s.joinRate, s.joinBurst = 1000, 1000, 1000
			ts := httptest.NewUnstartedServer(s.Handler())
			l := &countingListener{Listener: ts.Listener}
			ts.Listener = l
			ts.Start()
			b.Cleanup(func() {
				s.Shutdown(context.Background())
				ts.Close()
			})
			url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
			matches, msgs, plain := 0, 0, 0
			b.ReportAllocs()
			for b.Loop() {
				n, size := playWS(b, url, c.mode)
				matches, msgs, plain = matches+1, msgs+n, plain+size
			}
			b.ReportMetric(float64(l.out.Load())/float64(matches), "wireB/match")
			b.ReportMetric(float64(plain)/float64(matches), "jsonB/match")
			b.ReportMetric(float64(msgs)/float64(matches), "msgs/match")
		})
	}
}

// playWS plays a solo match over a websocket that offers compression
// mode; it returns the messages and their bytes as read (inflated).
func playWS(b *testing.B, url string, mode websocket.CompressionMode) (n, size int) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader:      http.Header{"X-Real-Ip": {perfAddr()}},
		CompressionMode: mode,
	})
	if err != nil {
		b.Fatalf("dial: %v", err)
	}
	defer conn.CloseNow()
	conn.SetReadLimit(1 << 20)
	send := func(m *inMsg) {
		if err := conn.Write(ctx, websocket.MessageText, mustJSON(m)); err != nil {
			b.Fatalf("write: %v", err)
		}
	}
	send(&inMsg{T: "create", Name: "Piet", Start: true})
	h := &fakeHuman{rng: rand.New(rand.NewPCG(1, 7))}
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			b.Fatalf("read: %v", err)
		}
		n, size = n+1, size+len(data)
		var m fakeMsg
		if json.Unmarshal(data, &m) != nil || m.T != "update" {
			continue
		}
		switch st := m.S; {
		case st.Phase == phaseGameOver && (st.Review == nil || !st.Review.Pending):
			send(&inMsg{T: "leave"})
			conn.Close(websocket.StatusNormalClosure, "")
			return n, size
		case st.Turn == st.You && h.acted < m.Seq && inHand(st.Phase):
			h.acted = m.Seq
			send(h.decision(st))
		case st.Phase == phaseHandEnd && h.readied < st.HandNo:
			h.readied = st.HandNo
			send(&inMsg{T: "ready"})
		}
	}
}

// countingListener counts the bytes the server writes on all its
// connections: frames and compression included.
type countingListener struct {
	net.Listener
	out atomic.Int64
}

func (l *countingListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return &countingConn{Conn: c, out: &l.out}, nil
}

type countingConn struct {
	net.Conn
	out *atomic.Int64
}

func (c *countingConn) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	c.out.Add(int64(n))
	return n, err
}
