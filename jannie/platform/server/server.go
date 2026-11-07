// Package server runs the rooms of one card game over websockets: codes,
// lobby, the match loop with pacing, bots, chat and limits (docs/server.md,
// docs/protocol.md). Klaverjas is built in (Klaverjas): most of its code
// is in the klaverjas_*.go files, which the table's files call where
// klaverjas differs, and only those files import its packages. Another
// game plugs in on the exported API of api.go (Game, Play, Table).
//
// Each room is an actor: one goroutine owns all room state and runs
// commands from a channel; timers post back into that channel. Each
// connection has a reader and a writer goroutine with a bounded send queue.
package server

import (
	"context"
	crand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

// Config configures a Server.
type Config struct {
	Game           Game     // the game the server plays: Klaverjas(ai), or another on the API of api.go (required)
	Fast           bool     // scale all delays by 0.05 (tests)
	MaxRooms       int      // default 1500
	AllowedOrigins []string // websocket Origin patterns besides same-host
	Version        string   // reported by /api/health
	Logger         *slog.Logger
	GameLog        string // directory of the game log (docs/server.md#game-log); "" keeps none
}

// Server holds all rooms and connections.
type Server struct {
	cfg      Config
	log      *slog.Logger
	ai       AI   // klaverjas's bots and analysis; nil for another game
	ext      Game // another game than klaverjas (ext.go); nil for klaverjas
	maxSeats int  // the game's largest table: the seats of a room
	personas []Persona
	games    *gameLog // nil: no game log

	// Tunables; tests may change them before use.
	scale          float64       // multiplier on every game delay
	idleTimeout    time.Duration // remove a running game after this long with no human connected
	abandonTimeout time.Duration // the same for a lobby, a finished game or one without human seats
	overTimeout    time.Duration // remove a room this long after game over
	evictAfter     time.Duration // at MaxRooms, a room idle this long makes way for a new one
	janitorEvery   time.Duration
	msgRate        float64 // messages per second per connection (burst as many)
	joinRate       float64 // joins per second per connection (burst joinBurst)
	joinBurst      float64
	maxPerIP       int // websocket connections per client address
	createMax      int // rooms created per client address per createWindow
	createWindow   time.Duration
	liveMax        int // live rooms created per client address
	joinFailMax    int // failed joins per client address per joinFailWindow ...
	joinFailWindow time.Duration
	joinBlock      time.Duration // ... before its joins are refused this long
	pingEvery      time.Duration // a connection quiet this long gets a ping ...
	pingTimeout    time.Duration // ... and is closed without a pong this long after

	ctx    context.Context // cancelled at shutdown
	cancel context.CancelFunc
	wg     sync.WaitGroup // connection goroutines

	mu       sync.Mutex
	closing  bool
	rooms    map[string]*room
	clients  map[*client]struct{}
	ipConns  map[string]int
	creates  map[string][]time.Time
	live     map[string]int         // registered rooms per creator address
	joins    map[string]*joinRecord // failed joins per client address
	janitorO sync.Once

	players atomic.Int64 // humans connected to a room seat

	grading  chan struct{} // analysis slots (see analyse)
	explains chan struct{} // the reasoning's why (expert, training): one search at a time, on every core (see cmdWhy)
}

// New returns a server ready to serve; it panics without a game, for
// klaverjas without an AI, and for a game with too few personas or a bad
// range of seats.
func New(cfg Config) *Server {
	var ai AI
	var ext Game
	switch g := cfg.Game.(type) {
	case nil:
		panic("server: Config.Game is required")
	case klaverjasGame:
		if g.ai == nil {
			panic("server: Klaverjas needs an AI")
		}
		ai = g.ai
	default:
		if g.NewOptions() == nil {
			panic("server: " + g.Name() + ": NewOptions returned nil")
		}
		ext = g
	}
	least, most, def := cfg.Game.Seats()
	if least < 1 || least > def || def > most || most > maxTable {
		panic(fmt.Sprintf("server: %s: bad seats %d, %d, %d", cfg.Game.Name(), least, most, def))
	}
	if cfg.MaxRooms <= 0 {
		cfg.MaxRooms = 1500
	}
	if cfg.Version == "" {
		cfg.Version = "dev"
	}
	log := cfg.Logger
	if log == nil {
		log = slog.Default()
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		cfg:            cfg,
		log:            log,
		ai:             ai,
		ext:            ext,
		maxSeats:       most,
		personas:       cfg.Game.Personas(),
		games:          newGameLog(cfg.GameLog, log),
		scale:          1,
		idleTimeout:    30 * time.Minute,
		abandonTimeout: 5 * time.Minute,
		overTimeout:    30 * time.Minute,
		evictAfter:     2 * time.Minute,
		janitorEvery:   time.Minute,
		msgRate:        20,
		joinRate:       1,
		joinBurst:      3,
		// A club on one wifi shares these: 25 tables of four, the sockets of
		// phones that dropped out, the old tables during a new round, a failed
		// join per phone.
		maxPerIP:       150,
		createMax:      60,
		createWindow:   10 * time.Minute,
		liveMax:        60,
		joinFailMax:    200,
		joinFailWindow: time.Minute,
		joinBlock:      5 * time.Minute,
		pingEvery:      pingEvery,
		pingTimeout:    pingTimeout,
		ctx:            ctx,
		cancel:         cancel,
		rooms:          make(map[string]*room),
		clients:        make(map[*client]struct{}),
		ipConns:        make(map[string]int),
		creates:        make(map[string][]time.Time),
		live:           make(map[string]int),
		joins:          make(map[string]*joinRecord),
		grading:        make(chan struct{}, gradeSlots()),
		explains:       make(chan struct{}, 1),
	}
	if cfg.Fast {
		s.scale = 0.05
	}
	switch {
	case ext == nil && len(s.personas) < 4:
		panic("server: the AI needs at least 4 personas")
	case ext != nil && len(s.personas) < most-1:
		panic(fmt.Sprintf("server: %s needs at least %d personas", ext.Name(), most-1))
	}
	return s
}

// Handler serves /ws and /api/health.
func (s *Server) Handler() http.Handler {
	s.janitorO.Do(func() { go s.janitor() })
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.serveWS)
	mux.HandleFunc("/api/health", s.serveHealth)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "niet gevonden"})
	})
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (s *Server) serveHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false})
		return
	}
	s.mu.Lock()
	rooms, closing := len(s.rooms), s.closing
	s.mu.Unlock()
	status := http.StatusOK
	if closing {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{
		"ok":      !closing,
		"version": s.cfg.Version,
		"rooms":   rooms,
		"players": s.players.Load(),
	})
}

// clientIP is X-Real-IP (set by nginx from a trusted hop), else the peer.
func clientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) serveWS(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	s.mu.Lock()
	switch {
	case s.closing:
		s.mu.Unlock()
		http.Error(w, "De server wordt herstart.", http.StatusServiceUnavailable)
		return
	case s.ipConns[ip] >= s.maxPerIP:
		s.mu.Unlock()
		http.Error(w, "Te veel verbindingen vanaf jouw adres.", http.StatusTooManyRequests)
		return
	}
	s.ipConns[ip]++
	s.mu.Unlock()

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns:  s.cfg.AllowedOrigins,
		CompressionMode: websocket.CompressionNoContextTakeover,
	})
	if err != nil {
		s.releaseIP(ip)
		s.log.Info("websocket refused", "err", err.Error())
		return
	}
	s.serveConn(conn, ip, deviceOf(r.Header.Get("User-Agent")))
}

// ServeConn plays the table over conn until it closes: a connection in
// memory instead of a websocket, for a table that runs in the browser
// itself. It blocks; Handler is not needed for it.
func (s *Server) ServeConn(conn Conn, device string) {
	s.janitorO.Do(func() { go s.janitor() })
	const ip = "local"
	s.mu.Lock()
	s.ipConns[ip]++
	s.mu.Unlock()
	s.serveConn(conn, ip, device)
}

// serveConn runs an accepted connection; the address is counted already.
func (s *Server) serveConn(conn Conn, ip, device string) {
	c := newClient(s, conn, ip, device)
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		s.releaseIP(ip)
		c.conn.Close(websocket.StatusGoingAway, errRestarting)
		return
	}
	s.clients[c] = struct{}{}
	s.wg.Add(1)
	s.mu.Unlock()

	go c.writeLoop(s.ctx)
	c.readLoop(s.ctx)

	// The connection is gone: tell its room, then forget it.
	c.close(websocket.StatusNormalClosure, "")
	if rm := c.getRoom(); rm != nil {
		rm.post(func() { rm.disconnected(c) })
	}
	s.mu.Lock()
	delete(s.clients, c)
	s.mu.Unlock()
	s.releaseIP(ip)
	s.wg.Done()
}

func (s *Server) releaseIP(ip string) {
	s.mu.Lock()
	if s.ipConns[ip]--; s.ipConns[ip] <= 0 {
		delete(s.ipConns, ip)
	}
	s.mu.Unlock()
}

// dispatch routes one client message: create and join find or make a room,
// ping is answered here, everything else goes to the client's room.
func (s *Server) dispatch(c *client, m *inMsg) {
	switch m.T {
	case "ping":
		c.send(pongJSON)
	case "create":
		s.create(c, m)
	case "join":
		if !c.joinBucket.take(time.Now()) {
			c.sendError(errLimit, "Even rustig aan: probeer het over een paar seconden opnieuw.")
			return
		}
		s.join(c, m)
	default:
		r := c.getRoom()
		if r == nil || !r.post(func() { r.handle(c, m) }) {
			if m.T == "leave" {
				return
			}
			c.sendError(errUnknown, "Je zit niet (meer) aan een tafel.")
		}
	}
}

// switchRoom detaches c from the room it is in, if that is not r.
func (s *Server) switchRoom(c *client, r *room) {
	old := c.getRoom()
	if old == nil || old == r {
		return
	}
	c.leaveRoom(old)
	old.post(func() { old.disconnected(c) })
}

func (s *Server) create(c *client, m *inMsg) {
	now := time.Now()
	ip := c.ip
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		c.sendError(errRestarting, msgRestarting)
		return
	}
	if s.live[ip] >= s.liveMax {
		s.mu.Unlock()
		c.sendError(errTooMany, "Vanaf jouw adres zijn al te veel spellen open. Probeer het over een paar minuten opnieuw.")
		return
	}
	recent := pruneTimes(s.creates[ip], now.Add(-s.createWindow))
	if len(recent) >= s.createMax {
		s.creates[ip] = recent
		s.mu.Unlock()
		c.sendError(errTooMany, "Je hebt in korte tijd te veel spellen gemaakt. Probeer het over een paar minuten opnieuw.")
		return
	}
	var evicted *room
	if len(s.rooms) >= s.cfg.MaxRooms {
		// Full: the room nobody has been in for longest makes way.
		if evicted = s.idlestLocked(now); evicted == nil {
			s.mu.Unlock()
			c.sendError(errTooMany, "Er worden nu te veel spellen tegelijk gespeeld. Probeer het over een paar minuten opnieuw.")
			return
		}
		s.unregisterLocked(evicted)
	}
	s.creates[ip] = append(recent, now)
	code := s.newCode()
	r := newRoom(s, code)
	r.creator = ip
	s.rooms[code] = r
	s.live[ip]++
	s.mu.Unlock()

	if evicted != nil {
		evicted.post(func() { evicted.close("plaats gemaakt") })
	}
	go r.loop()
	s.switchRoom(c, r)
	c.setRoom(r)
	if !r.post(func() { r.handleCreate(c, m) }) {
		c.leaveRoom(r)
		c.sendError(errUnknown, msgNoRoom)
	}
}

func (s *Server) join(c *client, m *inMsg) {
	code := normCode(m.Code)
	s.mu.Lock()
	r := s.rooms[code]
	closing := s.closing
	blocked := s.joinBlockedLocked(c.ip, time.Now())
	s.mu.Unlock()
	switch {
	case closing:
		c.sendError(errRestarting, msgRestarting)
		return
	case blocked && (r == nil || m.Token == ""):
		// Only a seat token gets through; the answer tells nothing about the code.
		c.sendError(errLimit, msgJoinBlocked)
		return
	case r == nil:
		s.joinFailed(c.ip)
		c.sendError(errUnknown, msgNoRoom)
		return
	}
	s.switchRoom(c, r)
	c.setRoom(r)
	if !r.post(func() { r.handleJoin(c, m, blocked) }) {
		c.leaveRoom(r)
		c.sendError(errUnknown, msgNoRoom)
	}
}

const (
	msgNoRoom      = "Dit spel bestaat niet (meer). Controleer de code."
	msgRestarting  = "De server wordt herstart. Het lopende spel stopt helaas."
	msgJoinBlocked = "Te veel mislukte pogingen om mee te doen. Probeer het over een paar minuten opnieuw."
)

// joinRecord is the failed joins of one client address.
type joinRecord struct {
	fails []time.Time // within joinFailWindow
	until time.Time   // joins refused until then
}

// joinFailed counts a refused join (unknown code, full, started) from ip;
// joinFailMax of them within joinFailWindow block the address's joins for
// joinBlock, so guessing room codes stays slow.
func (s *Server) joinFailed(ip string) {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	j := s.joins[ip]
	if j == nil {
		j = &joinRecord{}
		s.joins[ip] = j
	}
	j.fails = append(pruneTimes(j.fails, now.Add(-s.joinFailWindow)), now)
	if len(j.fails) >= s.joinFailMax {
		j.fails, j.until = nil, now.Add(s.joinBlock)
		s.log.Info("joins blocked for an address", "minutes", s.joinBlock.Minutes())
	}
}

// joinBlockedLocked reports whether ip may not join now; s.mu must be held.
func (s *Server) joinBlockedLocked(ip string, now time.Time) bool {
	j := s.joins[ip]
	return j != nil && now.Before(j.until)
}

// idlestLocked returns the registered room that has had no human connected
// for longest, at least evictAfter, or nil; s.mu must be held.
func (s *Server) idlestLocked(now time.Time) *room {
	var best *room
	var bestAt int64
	limit := now.Add(-s.evictAfter).UnixNano()
	for _, r := range s.rooms {
		if at := r.idle.Load(); at != 0 && at <= limit && (best == nil || at < bestAt) {
			best, bestAt = r, at
		}
	}
	return best
}

func pruneTimes(ts []time.Time, after time.Time) []time.Time {
	i := 0
	for i < len(ts) && !ts[i].After(after) {
		i++
	}
	if i == len(ts) {
		return nil
	}
	return ts[i:]
}

// newCode returns an unused room code; s.mu must be held.
func (s *Server) newCode() string {
	for {
		var b [4]byte
		for i := range b {
			b[i] = codeAlphabet[rand.IntN(len(codeAlphabet))]
		}
		if code := string(b[:]); s.rooms[code] == nil {
			return code
		}
	}
}

// newToken returns a random seat token.
func newToken() string {
	var b [16]byte
	crand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// removeRoom forgets r if it is still registered under its code.
func (s *Server) removeRoom(r *room) {
	s.mu.Lock()
	s.unregisterLocked(r)
	s.mu.Unlock()
}

// unregisterLocked forgets r if it is still registered; s.mu must be held.
func (s *Server) unregisterLocked(r *room) {
	if s.rooms[r.code] != r {
		return
	}
	delete(s.rooms, r.code)
	if s.live[r.creator]--; s.live[r.creator] <= 0 {
		delete(s.live, r.creator)
	}
}

// janitor periodically lets every room check whether it should go, and
// forgets old room-creation timestamps and failed joins.
func (s *Server) janitor() {
	t := time.NewTicker(s.janitorEvery)
	defer t.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case now := <-t.C:
			s.mu.Lock()
			rooms := make([]*room, 0, len(s.rooms))
			for _, r := range s.rooms {
				rooms = append(rooms, r)
			}
			for ip, ts := range s.creates {
				if ts = pruneTimes(ts, now.Add(-s.createWindow)); ts == nil {
					delete(s.creates, ip)
				} else {
					s.creates[ip] = ts
				}
			}
			for ip, j := range s.joins {
				if j.fails = pruneTimes(j.fails, now.Add(-s.joinFailWindow)); j.fails == nil && !now.Before(j.until) {
					delete(s.joins, ip)
				}
			}
			s.mu.Unlock()
			for _, r := range rooms {
				r.post(r.checkIdle)
			}
		}
	}
}

// Shutdown tells every connected player that the server restarts, closes
// all connections and stops all rooms. It waits for the connections to
// finish until ctx is done.
func (s *Server) Shutdown(ctx context.Context) {
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		return
	}
	s.closing = true
	clients := make([]*client, 0, len(s.clients))
	for c := range s.clients {
		clients = append(clients, c)
	}
	rooms := make([]*room, 0, len(s.rooms))
	for _, r := range s.rooms {
		rooms = append(rooms, r)
	}
	s.rooms = make(map[string]*room)
	s.live = make(map[string]int)
	s.mu.Unlock()

	for _, r := range rooms {
		r.stop()
	}
	for _, c := range clients {
		c.closeWithError(errRestarting, msgRestarting, websocket.StatusServiceRestart)
	}
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
	}
	s.cancel()
	// A match cut short here has no end or close record in the game log.
	s.games.close()
	s.log.Info("server stopped", "rooms", len(rooms), "connections", len(clients))
}
