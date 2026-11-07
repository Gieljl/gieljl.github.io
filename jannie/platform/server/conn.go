package server

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

const (
	maxMessageBytes = 16384 // a call's session description takes several KiB
	sendQueueLen    = 256
	writeTimeout    = 10 * time.Second
	// A connection the server has heard nothing from, or sent nothing to,
	// for pingEvery gets a ping (docs/server.md#limits), checked pingChecks
	// times as often. The browser pings every 20 s itself (net.js), and the
	// pong it gets keeps the proxies' idle timeout away just as well, so a
	// page that pings gets no server pings: a phone's radio wakes for one
	// keepalive, not for two that run on their own clocks.
	pingEvery   = 25 * time.Second
	pingChecks  = 5
	pingTimeout = 20 * time.Second
)

// Conn is what the table needs of one connection: a websocket's
// (*websocket.Conn), or one in memory (ServeConn, the site that runs the
// table in the browser).
type Conn interface {
	Read(ctx context.Context) (websocket.MessageType, []byte, error)
	Write(ctx context.Context, typ websocket.MessageType, p []byte) error
	Close(code websocket.StatusCode, reason string) error
	CloseNow() error
	Ping(ctx context.Context) error
	SetReadLimit(n int64)
}

// client is one websocket connection. The reader goroutine decodes and
// dispatches messages; the writer goroutine owns all writes and pings.
type client struct {
	srv    *Server
	conn   Conn
	ip     string
	device string // the browser's User-Agent, cut short (game log)

	out      chan []byte   // bounded send queue
	quit     chan struct{} // closed when the connection is closing
	quitOnce sync.Once
	closeMu  sync.Mutex
	code     websocket.StatusCode
	reason   string
	pinging  atomic.Bool
	aborted  atomic.Bool  // closing without flushing the queue
	heard    atomic.Int64 // unix ns of the last message or pong from the browser

	mu   sync.Mutex
	room *room // the room this connection plays in, if any

	bucket     tokenBucket // reader only: all messages
	joinBucket tokenBucket // reader only: joins
}

func newClient(s *Server, conn Conn, ip, device string) *client {
	c := &client{
		srv:        s,
		conn:       conn,
		ip:         ip,
		device:     device,
		out:        make(chan []byte, sendQueueLen),
		quit:       make(chan struct{}),
		code:       websocket.StatusNormalClosure,
		bucket:     tokenBucket{tokens: s.msgRate, max: s.msgRate, rate: s.msgRate},
		joinBucket: tokenBucket{tokens: s.joinBurst, max: s.joinBurst, rate: s.joinRate},
	}
	c.hear(time.Now())
	return c
}

// hear notes that the browser is there: a message or a pong came in.
func (c *client) hear(now time.Time) { c.heard.Store(now.UnixNano()) }

// quiet is how long nothing came in from the browser.
func (c *client) quiet(now time.Time) time.Duration { return now.Sub(time.Unix(0, c.heard.Load())) }

// send queues a message; a client whose queue is full is disconnected (it
// resyncs on reconnect). It never blocks.
func (c *client) send(b []byte) {
	select {
	case <-c.quit:
		return
	default:
	}
	select {
	case c.out <- b:
	default:
		c.aborted.Store(true)
		c.close(websocket.StatusPolicyViolation, "te traag")
	}
}

// sendError queues an error message.
func (c *client) sendError(code, msg string) { c.send(errorJSON(code, msg)) }

// close starts closing the connection; the writer flushes what is queued,
// then sends a close frame.
func (c *client) close(code websocket.StatusCode, reason string) {
	c.quitOnce.Do(func() {
		c.closeMu.Lock()
		c.code, c.reason = code, reason
		c.closeMu.Unlock()
		close(c.quit)
	})
}

// closeWithError queues an error message, then closes.
func (c *client) closeWithError(code, msg string, status websocket.StatusCode) {
	c.send(errorJSON(code, msg))
	c.close(status, code)
}

func (c *client) getRoom() *room {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.room
}

func (c *client) setRoom(r *room) {
	c.mu.Lock()
	c.room = r
	c.mu.Unlock()
}

// leaveRoom clears the binding if it is still r.
func (c *client) leaveRoom(r *room) {
	c.mu.Lock()
	if c.room == r {
		c.room = nil
	}
	c.mu.Unlock()
}

// writeLoop sends queued messages, and pings a quiet connection, until the
// connection closes.
func (c *client) writeLoop(ctx context.Context) {
	tick := time.NewTicker(c.srv.pingEvery / pingChecks)
	defer tick.Stop()
	wrote := time.Now() // the last frame out: also the proxies wait for one
	for {
		select {
		case b := <-c.out:
			if err := c.write(ctx, b); err != nil {
				c.close(websocket.StatusGoingAway, "")
				c.conn.CloseNow()
				return
			}
			wrote = time.Now()
		case now := <-tick.C:
			if c.quiet(now) >= c.srv.pingEvery || now.Sub(wrote) >= c.srv.pingEvery {
				c.ping(ctx)
				wrote = now
			}
		case <-c.quit:
			if c.aborted.Load() {
				c.conn.CloseNow()
				return
			}
			c.flush(ctx)
			c.closeMu.Lock()
			code, reason := c.code, c.reason
			c.closeMu.Unlock()
			c.conn.Close(code, reason)
			return
		case <-ctx.Done():
			c.conn.CloseNow()
			return
		}
	}
}

// flush writes what is still queued (e.g. a final error), best effort.
func (c *client) flush(ctx context.Context) {
	for {
		select {
		case b := <-c.out:
			if c.write(ctx, b) != nil {
				return
			}
		default:
			return
		}
	}
}

func (c *client) write(ctx context.Context, b []byte) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return c.conn.Write(ctx, websocket.MessageText, b)
}

// ping runs one ping in the background; a missing pong closes the connection.
func (c *client) ping(ctx context.Context) {
	if !c.pinging.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer c.pinging.Store(false)
		ctx, cancel := context.WithTimeout(ctx, c.srv.pingTimeout)
		defer cancel()
		if err := c.conn.Ping(ctx); err != nil {
			c.close(websocket.StatusGoingAway, "geen antwoord")
			return
		}
		c.hear(time.Now())
	}()
}

// readLoop decodes messages and hands them to the server until the
// connection fails or is closed.
func (c *client) readLoop(ctx context.Context) {
	c.conn.SetReadLimit(maxMessageBytes)
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-c.quit:
			// Give the writer time to flush and close cleanly, then make
			// sure Read returns.
			t := time.NewTimer(writeTimeout)
			defer t.Stop()
			select {
			case <-t.C:
				cancel()
			case <-ctx.Done():
			}
		case <-ctx.Done():
		}
	}()
	for {
		typ, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		now := time.Now()
		c.hear(now)
		if !c.bucket.take(now) {
			c.closeWithError(errLimit, "Te veel berichten tegelijk; de verbinding is verbroken.", websocket.StatusPolicyViolation)
			return
		}
		if typ != websocket.MessageText {
			continue
		}
		var m inMsg
		if err := json.Unmarshal(data, &m); err != nil {
			c.sendError(errInvalid, "Dat bericht begrijp ik niet.")
			continue
		}
		m.raw = data
		c.srv.dispatch(c, &m)
	}
}

// isClosed reports whether the connection is closing.
func (c *client) isClosed() bool {
	select {
	case <-c.quit:
		return true
	default:
		return false
	}
}

// tokenBucket is a simple rate limiter: max tokens, refilled at rate/s.
type tokenBucket struct {
	tokens, max, rate float64
	last              time.Time
}

func (b *tokenBucket) take(now time.Time) bool {
	if !b.last.IsZero() {
		b.tokens += now.Sub(b.last).Seconds() * b.rate
		if b.tokens > b.max {
			b.tokens = b.max
		}
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
