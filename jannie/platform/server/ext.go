package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"slices"
	"time"

	"jannie/platform/cards"
)

// extPlay is the gameplay of a game on the exported API (api.go): it
// keeps the room's GameOptions and the Play of the match (or of the
// lobby), drives the table after every call into the Play, and turns the
// errors of Move into replies.
type extPlay struct {
	r       *room
	t       *Table
	g       Game
	opts    GameOptions
	p       Play
	gen     int           // bumped with every new Play: callbacks of an old one are dropped
	summary time.Duration // the hand summary on the table moves on after this; 0: on ready
}

// stepExt is where the game's pauses start among the room's steps: a
// game's Step s is the room's stepExt+s.
const stepExt step = 64

// newExt puts the server's game on the table of a new room, at the game's
// own number of players.
func (r *room) newExt() {
	g := r.srv.ext
	x := &extPlay{r: r, g: g, opts: g.NewOptions()}
	x.t = &Table{r: r}
	_, _, def := g.Seats()
	r.opts.Players = def
	r.x, r.gp = x, x
	x.fresh()
}

// fresh starts a new Play: for the lobby, or for a match.
func (x *extPlay) fresh() {
	x.gen++
	x.summary = 0
	x.p = x.g.New(x.t)
}

// wire is the options object of the state and the game log.
func (x *extPlay) wire() any { return x.opts.Wire(x.t.Opts()) }

func (x *extPlay) start() {
	r := x.r
	r.total = nil
	x.fresh()
	r.logMatch()
	x.p.Start()
	r.log.Info("match started", "game", x.g.Name(), "players", r.players(), "humans", r.humanCount(),
		"variant", x.p.Variant(), "ai", r.opts.AI)
	r.drive()
}

func (x *extPlay) lobby() { x.fresh() }

func (x *extPlay) turn() cards.Seat { return x.p.Turn() }

func (x *extPlay) handLen(i cards.Seat) int { return x.p.HandLen(i) }

func (x *extPlay) state(i cards.Seat) any { return x.p.State(i) }

func (x *extPlay) move(c *client, i cards.Seat, m *inMsg) bool {
	err := x.p.Move(i, Msg{T: m.T, Raw: m.raw})
	switch {
	case errors.Is(err, ErrUnknownMsg):
		return false
	case err == nil, errors.Is(err, ErrIgnore):
	case errors.Is(err, ErrNotYourTurn), errors.Is(err, ErrPaused):
		c.sendError(errNotTurn, err.Error())
	default:
		c.sendError(errInvalid, err.Error())
	}
	x.r.drive()
	return true
}

func (x *extPlay) decision(i cards.Seat, bb *brainBox) (func() any, any) {
	think, safe := x.p.Decision(i, bb.ext)
	return func() any { return bb.guard(think, safe) }, safe
}

func (x *extPlay) apply(i cards.Seat, a any) error {
	err := x.p.Apply(i, a)
	x.r.drive()
	return err
}

func (x *extPlay) single() bool { return x.p.Single() }

func (x *extPlay) resume(s step) {
	switch {
	case s == stepNextHand: // the summary of Table.Summary
		x.next()
		return
	case s > stepExt:
		x.p.Resume(Step(s - stepExt))
	}
	x.r.drive()
}

func (x *extPlay) next() {
	r := x.r
	r.pending = stepNone
	r.pendingAt, r.nextAt = time.Time{}, time.Time{}
	x.summary = 0
	for i := range r.seats {
		r.seats[i].ready = false
	}
	x.p.Next()
	r.drive()
}

// timeSummary sets when the summary moves on: after the game's time,
// whoever is at the table; without one it waits for ready.
func (x *extPlay) timeSummary(from time.Time) {
	r := x.r
	r.pendingAt, r.nextAt = time.Time{}, time.Time{}
	if x.summary <= 0 {
		return
	}
	r.pendingAt = from.Add(r.scaled(x.summary))
	r.nextAt = r.pendingAt
}

// guard calls think under the brain's lock; a panic gives safe instead.
func (bb *brainBox) guard(think func() any, safe any) (a any) {
	bb.mu.Lock()
	defer bb.mu.Unlock()
	defer func() {
		if p := recover(); p != nil {
			bb.log.Error("bot panicked", "panic", fmt.Sprint(p))
			a = safe
		}
	}()
	return think()
}

// brainOf is the brain that plays seat i: its bot's, or the substitute's.
func (r *room) brainOf(i cards.Seat) *brainBox {
	st := &r.seats[i]
	if st.brain == nil { // the substitute of a human
		st.brain = r.newBrain("", "normaal")
	}
	return st.brain
}

// ---- options ----

// optFields reads an options object; nil for none.
func optFields(raw json.RawMessage) (map[string]json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return nil, errors.New("Ongeldige spelregels.")
	}
	return fields, nil
}

// tableKeys are the options the table reads itself (TableOpts).
var tableKeys = []string{"players", "ai", "tempo", "seed"}

// tableOpts reads the table's options of fields, as parseOpts does, with
// the game's range of players; it takes them out of fields.
func (x *extPlay) tableOpts(fields map[string]json.RawMessage, lenient bool) (optsPatch, error) {
	var p optsPatch
	if v, ok := fields["players"]; ok {
		least, most, _ := x.g.Seats()
		var n int
		switch {
		case json.Unmarshal(v, &n) == nil && n >= least && n <= most:
			p.Players = &n
		case !lenient:
			return optsPatch{}, fmt.Errorf("Kies %d tot en met %d spelers.", least, most)
		}
	}
	rest := map[string]json.RawMessage{}
	for _, k := range tableKeys[1:] {
		if v, ok := fields[k]; ok {
			rest[k] = v
		}
	}
	if len(rest) > 0 {
		q, err := parseOpts(mustJSON(rest), lenient)
		if err != nil {
			return optsPatch{}, err
		}
		p.AI, p.Tempo, p.Seed = q.AI, q.Tempo, q.Seed
	}
	for _, k := range tableKeys {
		delete(fields, k)
	}
	return p, nil
}

// createOpts sets the options of a new room, skipping bad values.
func (x *extPlay) createOpts(raw json.RawMessage) {
	r := x.r
	fields, _ := optFields(raw)
	p, _ := x.tableOpts(fields, true)
	x.opts.Set(fields, true)
	p.apply(&r.opts)
	if p.Players != nil {
		r.opts.Players = *p.Players
	}
}

// setOpts changes the options in the lobby: all of them, or none and an
// error.
func (x *extPlay) setOpts(raw json.RawMessage) error {
	r := x.r
	fields, err := optFields(raw)
	if err != nil {
		return err
	}
	p, err := x.tableOpts(fields, false)
	if err != nil {
		return err
	}
	seats := p.Players != nil && *p.Players != r.opts.Players
	if h := r.humanCount(); seats && h > *p.Players {
		return fmt.Errorf("Er zitten al %d mensen aan tafel.", h)
	}
	if err := x.opts.Set(fields, false); err != nil {
		return err
	}
	if seats {
		r.setPlayers(*p.Players)
	}
	p.apply(&r.opts)
	return nil
}

// ---- the table ----

// Table is the table a Play plays at: what it may read and do there. Its
// methods run on the room goroutine only, as Play's do; a game's own
// goroutines go through Think and Later. Delays are game delays, scaled by
// the server (Config.Fast).
type Table struct{ r *room }

// Code is the room's code.
func (t *Table) Code() string { return t.r.code }

// Opts are the options every game has.
func (t *Table) Opts() TableOpts {
	o := t.r.opts
	return TableOpts{Players: o.Players, AI: o.AI, Tempo: o.Tempo, Seed: o.Seed}
}

// Options are the game's own options of the room (Game.NewOptions).
func (t *Table) Options() GameOptions { return t.r.x.opts }

// Players is the number of seats at the table.
func (t *Table) Players() int { return t.r.players() }

// Deals is the stream the deals of the match come from: drawn from its
// seed, so the same seed and options give the same cards. The game never
// sees the seed itself; the table names it at game over
// (docs/server.md#the-seed).
func (t *Table) Deals() *rand.Rand { return t.r.deals }

// MatchID is the match's id in the game log.
func (t *Table) MatchID() string { return t.r.matchID }

// DisplayName is how seat i appears in chat and texts: the name, a bot's
// with "(AI)".
func (t *Table) DisplayName(i cards.Seat) string { return t.r.displayName(i) }

// BotPlays reports whether a bot makes seat i's decisions: a bot seat, or
// a human who dropped out and whom the others let a substitute play for.
func (t *Table) BotPlays(i cards.Seat) bool { return t.r.botPlays(i) }

// HumanCount is the number of humans at the table.
func (t *Table) HumanCount() int { return t.r.humanCount() }

// InHand reports whether a hand is being played: the phase is one of the
// game's (SetPhase), not the lobby, the summary or game over.
func (t *Table) InHand() bool { return t.r.inHand() }

// Pending is the game's pause in progress (Pause), 0 for none.
func (t *Table) Pending() Step {
	if p := t.r.pending; p > stepExt {
		return Step(p - stepExt)
	}
	return 0
}

// PauseEnds is when the game's pause in progress ends.
func (t *Table) PauseEnds() time.Time {
	if t.Pending() == 0 {
		return time.Time{}
	}
	return t.r.pendingAt
}

// Pace is the unscaled delays of the table's tempo.
func (t *Table) Pace() Pace {
	p := t.r.pace()
	return Pace{Think: p.think, Deal: p.deal, Announce: p.announce, Trick: p.trick, Summary: p.summary}
}

// Logger is the room's server log. Never log chat text or tokens.
func (t *Table) Logger() *slog.Logger { return t.r.log }

// Shared is the part of the state for seat i that every game shares.
func (t *Table) Shared(i cards.Seat) Shared {
	r := t.r
	s := Shared{
		Code: r.code, Phase: r.phase, Opts: r.x.wire(), You: int(i), Host: int(r.host),
		Players: make([]*playerState, r.players()), Turn: -1, NextAt: unixMilli(r.nextAt),
	}
	for k := range s.Players {
		s.Players[k] = r.playerState(cards.Seat(k))
	}
	if r.phase == phaseLobby {
		s.Roster = r.roster()
	}
	if r.inHand() {
		if r.pending == stepNone {
			s.Turn = int(r.x.p.Turn())
		}
		if q := r.asking; q != cards.NoSeat {
			s.Takeover = &takeoverState{Seat: q, Left: r.seats[q].kind == seatLeft}
		}
	}
	return s
}

// SetPhase sets the room's phase to one of the game's own; the lobby,
// handEnd and gameOver are the table's (Summary, GameOver).
func (t *Table) SetPhase(phase string) {
	switch phase {
	case "", phaseLobby, phaseHandEnd, phaseGameOver:
		t.r.log.Error("game set a phase of the table", "phase", phase)
		return
	}
	t.r.phase = phase
}

// SetHand sets the number of the hand in play (the game log's).
func (t *Table) SetHand(n int) { t.r.handNo = n }

// Pause starts the game's pause s of d: nobody may act meanwhile, and
// Resume(s) follows (while nobody is connected only the summary waits).
func (t *Table) Pause(s Step, d time.Duration) {
	if s == 0 || int(s) > 255-int(stepExt) {
		t.r.log.Error("game paused with a bad step", "step", int(s))
		return
	}
	t.r.pause(stepExt+step(s), d)
}

// EndPause ends the game's pause in progress without Resume.
func (t *Table) EndPause() {
	if t.Pending() != 0 {
		t.r.pending = stepNone
	}
}

// OpenTurn marks the start of a turn (Turn): the bot's think time starts,
// and the time after which the others are asked about an absent player.
func (t *Table) OpenTurn() { t.r.openTurn() }

// Emit sends an update with event ev (nil: none) to every connected human.
func (t *Table) Emit(ev any) { t.r.emit(ev) }

// Later runs f on the room goroutine after d, unless the match is over by
// then.
func (t *Table) Later(d time.Duration, f func()) {
	r, x := t.r, t.r.x
	gen := x.gen
	r.later(r.scaled(d), func() {
		if x.gen != gen {
			return
		}
		f()
		r.drive()
	})
}

// Background runs f off the room goroutine, for work that takes a while
// (an analysis for a player), and then gets f's answer on the room
// goroutine at once, unless the match is over by then. A panic in f gives
// nil.
func (t *Table) Background(f func() any, then func(any)) {
	r, x := t.r, t.r.x
	gen := x.gen
	go func() {
		var a any
		func() {
			defer func() {
				if p := recover(); p != nil {
					r.log.Error("background work panicked", "panic", fmt.Sprint(p))
				}
			}()
			a = f()
		}()
		r.post(func() {
			if x.gen != gen {
				return
			}
			then(a)
			r.drive()
		})
	}()
}

// Think lets the bot (or substitute) of seat i decide now, while others
// decide too: the time in which everyone answers at once. f runs off the
// room goroutine with the seat's brain, one call into it at a time (a
// panic gives nil); then gets f's answer on the room goroutine after the
// seat's think time, unless the match is over by then. then checks that
// the answer is still wanted.
func (t *Table) Think(i cards.Seat, f func(brain any) any, then func(any)) {
	r, x := t.r, t.r.x
	bb, delay, gen := r.brainOf(i), r.thinkTime(i), x.gen
	go func() {
		a := bb.guard(func() any { return f(bb.ext) }, nil)
		r.later(delay, func() {
			if x.gen != gen {
				return
			}
			then(a)
			r.drive()
		})
	}()
}

// Trick counts a completed trick: a bot says at most one line per trick.
func (t *Table) Trick() { t.r.trickNo++ }

// Summary ends the hand: the phase is handEnd, everyone may say ready, and
// the update with ev goes out. The summary moves on (Next) once everyone
// connected is ready, or after `after`; 0 waits for ready.
func (t *Table) Summary(ev any, after time.Duration) {
	r, x := t.r, t.r.x
	r.phase = phaseHandEnd
	for i := range r.seats {
		r.seats[i].ready = false
	}
	r.pending = stepNextHand
	x.summary = max(after, 0)
	r.timeSummary(time.Now())
	r.emit(ev)
}

// GameOver ends the match with the scores per seat (or side) and the
// winner (-1: a draw): the event gameOver goes out, the chat names the
// match's seed and the game log records the end. A line of the game's own
// about the end (who won) goes in the chat before GameOver, so the seed
// comes last.
func (t *Table) GameOver(total []int, winner int) {
	r := t.r
	r.pending = stepNone
	r.pendingAt, r.nextAt = time.Time{}, time.Time{}
	r.phase = phaseGameOver
	r.overAt = time.Now()
	r.total = slices.Clone(total)
	r.winner = winner
	r.emit(evGameOver{Type: "gameOver", Total: slices.Clone(total), Winner: winner})
	r.nameSeed()
	r.logEnd()
}

// SysChat puts a line of the table in the chat.
func (t *Table) SysChat(format string, args ...any) { t.r.sysChat(format, args...) }

// BotSay lets the bot at seat i react to ev after delay, within the limits
// of bot chat (docs/server.md#bot-chat); it reports whether the bot speaks.
func (t *Table) BotSay(i cards.Seat, ev ChatEvent, delay time.Duration) bool {
	return t.r.botSay(i, ev, delay)
}

// BotsReact offers ev to the bots in random order until n of them spoke;
// mk adapts the event per seat, false: not this one.
func (t *Table) BotsReact(n int, delay time.Duration, mk func(i cards.Seat) (ChatEvent, bool)) {
	t.r.botsReact(n, delay, mk)
}

// Log writes rec, a struct of the game's own, as one line of the game log
// (docs/server.md#game-log).
func (t *Table) Log(rec any) { t.r.srv.games.write(rec) }
