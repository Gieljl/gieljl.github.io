package server

import (
	"errors"
	"log/slog"
	"sync"
	"time"

	"jannie/platform/cards"
)

// step is a pause in the match flow; while one is pending nobody may act.
type step uint8

const (
	stepNone      step = iota
	stepDealt          // the deal animation: then the first turn opens
	stepContract       // three players: the auction is over: then the soloist lays two cards away
	stepAnnounced      // trump was announced: then voorhand leads
	stepCollect        // a complete trick lies on the table: then it is collected
	stepNextHand       // the hand summary: then the next hand (or game over)
)

// brainBox serialises calls into one Brain and guards against bad answers.
type brainBox struct {
	mu  sync.Mutex
	b   Brain // klaverjas
	ext any   // another game's (Game.NewBrain), driven through Play (ext.go)
	log *slog.Logger
}

// inHand reports whether a hand is being played: klaverjas's auction,
// discard, trump, bid or play, or another game's phases (Table.SetPhase).
func (r *room) inHand() bool {
	switch r.phase {
	case phaseLobby, phaseHandEnd, phaseGameOver:
		return false
	}
	return true
}

// startMatch fills the empty seats and deals the first hand.
func (r *room) startMatch() {
	r.fillSeats()
	for i := range r.seats {
		st := &r.seats[i]
		st.ready = false
		// The others let an AI play for an absent player in the match that
		// ended: in this one they are waited for and asked again.
		st.away, st.asked = false, false
		if st.kind == seatBot {
			st.brain = r.newBrain(st.persona.ID, r.opts.AI)
		}
	}
	r.handNo = 0
	r.deal = nil
	r.scores = nil
	r.prev = nil
	r.lastTrick = nil
	r.winner = -1
	r.overAt = time.Time{}
	r.matchID = newToken()[:12]
	r.seed = uint64(r.opts.Seed)
	if r.seed == 0 {
		r.seed = newSeed()
	}
	r.deals = dealRNG(r.seed)
	r.firstHand = max(1, r.opts.From)
	r.handNo = r.firstHand - 1
	r.handActs, r.handDealt = nil, nil
	r.taught = nil // a rematch repeats the lesson from the start
	r.gp.start()
	r.greet()
}

// pause starts a pause of d (scaled) that ends with runPending.
func (r *room) pause(s step, d time.Duration) {
	r.pending = s
	r.pendingAt = time.Now().Add(r.scaled(d))
}

// openTurn marks the start of a turn: think time for bots and the hint
// cache key.
func (r *room) openTurn() {
	r.turnAt = time.Now()
	r.openedAt = r.turnAt
	turn := r.gp.turn()
	r.openedOn = turn != cards.NoSeat && r.seats[turn].client != nil
	r.step++
	r.think = r.thinkTime(turn)
	r.turnLesson(turn)
}

func (r *room) thinkTime(i cards.Seat) time.Duration {
	if i == cards.NoSeat {
		return 0
	}
	speed := 1.0
	if st := &r.seats[i]; st.kind == seatBot && st.persona.Speed > 0 {
		speed = st.persona.Speed
	}
	f := speed * (0.7 + 0.6*r.rng.Float64())
	if r.gp.single() {
		f *= 0.6
	}
	return r.scaled(time.Duration(float64(r.pace().think) * f))
}

// drive schedules whatever happens next: the end of a pause, a bot's move,
// or the question about a human who dropped out on their turn. It cancels
// everything scheduled before, so it is called after every state change. A
// bot decides once per turn however often drive runs (see botMove).
func (r *room) drive() {
	r.gen++
	if r.timer != nil {
		r.timer.Stop()
		r.timer = nil
	}
	if !r.inHand() && r.phase != phaseHandEnd {
		return
	}
	live := r.live()
	if r.pending != stepNone {
		// The hand summary waits for the players (alone at the table only
		// for ready, see timeSummary), and a pause with a lesson on screen
		// for it to be read; the other pauses are part of the animation and
		// always end.
		if r.pending == stepNextHand && (!live || r.pendingAt.IsZero()) || r.lesson != nil {
			return
		}
		r.after(time.Until(r.pendingAt), r.runPending)
		return
	}
	if !live || !r.inHand() {
		return
	}
	turn := r.gp.turn()
	if turn == cards.NoSeat {
		return
	}
	st := &r.seats[turn]
	switch {
	case r.botPlays(turn):
		r.botMove(turn, r.turnAt.Add(r.think))
	case st.kind == seatHuman && st.client == nil && !st.asked:
		// Gone on their turn: after a while the others are asked whether
		// an AI may play for them meanwhile.
		due := latest(r.openedAt, st.leftAt).Add(r.scaled(askAfter))
		r.after(time.Until(due), func() { r.ask(turn) })
	}
	// Anyone else is waited for, without a time limit: a connected human,
	// and an absent player until they return, someone takes their seat or
	// everyone lets an AI play it (see question).
}

func latest(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

// runPending ends the current pause, unless a lesson is due first (teach):
// then it ends once that is read.
func (r *room) runPending() {
	if r.teach() {
		return
	}
	s := r.pending
	r.pending = stepNone
	r.gp.resume(s)
}

// botTurn is the decision of a bot (or of a substitute) for one turn. A
// strong bot searches for a while on all cores, so it decides once per
// turn, whatever happens meanwhile (joins, windows, a seat changing hands);
// drive only schedules when the decision is played.
type botTurn struct {
	step  int // r.step of the turn; 0: none
	seat  cards.Seat
	ready bool // the decision is in
	act   any  // the decision, once ready (klaverjas: an action)
	safe  any  // a legal decision, should act come out illegal
}

// botMove makes sure seat i, played by a bot, moves at due: it starts the
// turn's decision in the background, or schedules the decision once it is
// in. When the brain finishes, it drives again.
func (r *room) botMove(i cards.Seat, due time.Time) {
	b := &r.bot
	if b.step != r.step || b.seat != i {
		r.decide(i)
		return
	}
	if b.ready {
		r.after(time.Until(due), func() { r.applyBot(i) })
	}
}

// decide asks the brain of seat i for the decision of this turn.
func (r *room) decide(i cards.Seat) {
	st := &r.seats[i]
	if st.brain == nil { // the substitute of a human
		st.brain = r.newBrain("", "normaal")
	}
	think, safe := r.gp.decision(i, st.brain)
	step := r.step
	r.bot = botTurn{step: step, seat: i, safe: safe}
	go func() {
		a := think()
		r.post(func() {
			if b := &r.bot; b.step == step && b.seat == i && !b.ready {
				b.act, b.ready = a, true
				r.drive()
			}
		})
	}()
}

// applyBot plays the decision of this turn for seat i, if the turn is still
// theirs and a bot still plays it.
func (r *room) applyBot(i cards.Seat) {
	b := r.bot
	if !b.ready || b.step != r.step || b.seat != i || r.pending != stepNone || !r.inHand() ||
		r.gp.turn() != i || !r.botPlays(i) || !r.live() {
		return
	}
	if err := r.gp.apply(i, b.act); err != nil {
		r.log.Error("bot move rejected", "seat", int(i), "err", err.Error())
		if err := r.gp.apply(i, b.safe); err != nil {
			r.log.Error("fallback move rejected", "seat", int(i), "err", err.Error())
		}
	}
}

var errPaused = errors.New("Even geduld, het spel gaat zo verder.")

// timeSummary sets when the hand summary moves on by itself: the summary
// time after from. Alone at the table (training, or one person with bots)
// it does not: the player looks back at the hand at leisure and goes on
// with ready.
func (r *room) timeSummary(from time.Time) {
	if r.x != nil {
		r.x.timeSummary(from) // the game said how long (Table.Summary)
		return
	}
	r.pendingAt, r.nextAt = time.Time{}, time.Time{}
	if r.training || r.humanCount() == 1 {
		return
	}
	r.pendingAt = from.Add(r.scaled(r.pace().summary))
	r.nextAt = r.pendingAt
}
