//go:build js && wasm

// Command yasat-wasm is the Yasat table compiled to WebAssembly, to run in
// the browser itself: the site needs no server (games/yasat/README.md).
// It sets one global function, jannieConnect(onMessage, onClose), which
// opens a connection in memory to the table and returns {send, close};
// platform/web/js/local.js wraps it as a WebSocket.
package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"syscall/js"

	"github.com/coder/websocket"

	"jannie/games/yasat/yasatserver"
	"jannie/platform/server"
)

// version is set at build time: -ldflags "-X main.version=<git sha>".
var version = "dev"

func main() {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := server.New(server.Config{Game: yasatserver.New(), Version: version, Logger: log, MaxRooms: 4})
	js.Global().Set("jannieConnect", js.FuncOf(func(_ js.Value, args []js.Value) any {
		c := &memConn{in: make(chan []byte, 256), done: make(chan struct{}), onMessage: args[0], onClose: args[1]}
		go srv.ServeConn(c, "browser")
		send := js.FuncOf(func(_ js.Value, a []js.Value) any {
			select {
			case c.in <- []byte(a[0].String()):
			case <-c.done:
			default:
				c.Close(websocket.StatusPolicyViolation, "te veel")
			}
			return nil
		})
		closeFn := js.FuncOf(func(js.Value, []js.Value) any {
			c.shut(false)
			return nil
		})
		return js.ValueOf(map[string]any{"send": send, "close": closeFn})
	}))
	js.Global().Set("jannieVersion", version)
	select {}
}

// memConn is one connection in memory: messages from the page come in on
// in, and the table's go straight to onMessage.
type memConn struct {
	in        chan []byte
	done      chan struct{}
	once      sync.Once
	onMessage js.Value
	onClose   js.Value
}

var errClosed = errors.New("closed")

func (c *memConn) Read(ctx context.Context) (websocket.MessageType, []byte, error) {
	select {
	case b := <-c.in:
		return websocket.MessageText, b, nil
	case <-c.done:
		return 0, nil, errClosed
	case <-ctx.Done():
		return 0, nil, ctx.Err()
	}
}

func (c *memConn) Write(_ context.Context, _ websocket.MessageType, b []byte) error {
	select {
	case <-c.done:
		return errClosed
	default:
	}
	c.onMessage.Invoke(string(b))
	return nil
}

// shut closes the connection once; tell: the page hears of it.
func (c *memConn) shut(tell bool) {
	c.once.Do(func() {
		close(c.done)
		if tell {
			c.onClose.Invoke()
		}
	})
}

func (c *memConn) Close(websocket.StatusCode, string) error { c.shut(true); return nil }
func (c *memConn) CloseNow() error                          { c.shut(true); return nil }
func (c *memConn) Ping(context.Context) error               { return nil }
func (c *memConn) SetReadLimit(int64)                       {}
