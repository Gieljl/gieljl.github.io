package server

import (
	"context"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// TestPingOnlyWhenQuiet: a browser that pings itself (net.js, every 20 s)
// gets no pings from the server, whose pongs keep the connection busy
// enough; a quiet one gets them, and one that does not answer is closed,
// also while its room keeps writing to it (a phone that dropped mid-game).
// The pong timeout is generous, so a loaded machine (the image build runs
// this test) does not close the quiet browser.
func TestPingOnlyWhenQuiet(t *testing.T) {
	s, ts := newTestServerWith(t, &fakeAI{}, func(s *Server) {
		s.pingEvery, s.pingTimeout = 400*time.Millisecond, time.Second
	})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	open := func(ip string, answer bool) (*websocket.Conn, *atomic.Int64, chan struct{}) {
		var pings atomic.Int64
		conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
			HTTPHeader: http.Header{"X-Real-Ip": {ip}},
			OnPingReceived: func(context.Context, []byte) bool {
				pings.Add(1)
				return answer
			},
		})
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
		t.Cleanup(func() { conn.CloseNow() })
		closed := make(chan struct{})
		go func() { // control frames are handled while reading
			defer close(closed)
			for {
				if _, _, err := conn.Read(ctx); err != nil {
					return
				}
			}
		}()
		return conn, &pings, closed
	}
	talker, talks, _ := open("10.6.0.1", true)
	_, quiets, quietClosed := open("10.6.0.2", true)
	_, deaf, deafClosed := open("10.6.0.3", false)
	go func() { // the server writes to the deaf browser until it is closed
		for {
			select {
			case <-deafClosed:
				return
			case <-time.After(40 * time.Millisecond):
			}
			s.mu.Lock()
			for c := range s.clients {
				if c.ip == "10.6.0.3" {
					c.send([]byte(`{"t":"pong"}`))
				}
			}
			s.mu.Unlock()
		}
	}()
	for end := time.Now().Add(2 * time.Second); time.Now().Before(end); time.Sleep(40 * time.Millisecond) {
		if err := talker.Write(ctx, websocket.MessageText, []byte(`{"t":"ping"}`)); err != nil {
			t.Fatalf("ping: %v", err)
		}
	}
	if n := talks.Load(); n != 0 {
		t.Errorf("a browser that pings got %d server pings", n)
	}
	if n := quiets.Load(); n < 2 {
		t.Errorf("a quiet browser got %d server pings in 2 s, want one every 400 ms or so", n)
	}
	select {
	case <-quietClosed:
		t.Errorf("a quiet browser that answers pings was closed")
	default:
	}
	select {
	case <-deafClosed:
		if deaf.Load() == 0 {
			t.Errorf("closed without a ping")
		}
	case <-time.After(5 * time.Second):
		t.Errorf("a browser that does not answer pings stays connected")
	}
}
