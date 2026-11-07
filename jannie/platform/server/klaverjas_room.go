package server

import "jannie/games/klaverjas/game"

// klaverjasRoom is the room's state for klaverjas, the built-in game: room
// embeds it. Like the rest of the room, it is owned by the room goroutine.
type klaverjasRoom struct {
	training bool
	expert   bool // the expert mode (klaverjas_expert.go): alone against three bots, looking back at any moment

	// The match.
	deal      *game.Deal
	collected bool // the completed current trick has been collected
	hintStep  int
	hintVal   *hint
	missed    *missedHint  // training: the hint the player did not follow in this trick
	misses    []missedHint // training: trump and bid hints not followed in this hand, told with its first trick
	scores    []scoreRow
	prev      *prevHand
	lastTrick *game.Trick

	// Training with a lesson (klaverjas_lesson.go).
	lesson     *lessonStep    // on screen until read: a pause waits for it, or on the learner's turn the hint does
	lessons    []lessonStep   // the steps after it
	lessonChat bool           // lesson went to the chat
	lessonN    int            // steps numbered so far, in this room
	taught     map[string]int // the parts of the lesson given in this match, and how often

	// The review of the humans' play (klaverjas_review.go).
	handTricks [][]game.Trick // the tricks of every finished hand of the match

	// The deals and the game log (klaverjas_gamelog.go).
	firstHand int          // the number of the match's first hand: option from, else 1
	dealt     dealtCards   // the cards of the hand in play as dealt
	acts      string       // the decisions of the hand in play (actToken), space-separated
	handActs  []string     // acts of every finished hand of the match
	handDealt []dealtCards // every finished hand of the match as dealt

	// The expert mode (klaverjas_expert.go).
	explaining bool // an explanation is being worked out (cmdWhy)
}

// dealtCards is a hand as dealt: the dealer, the seats' cards, the talon
// (three players) and the turned suit.
type dealtCards struct {
	dealer game.Seat
	hands  [4][]game.Card
	talon  []game.Card
	turned game.Suit
}

// createKlaverjas sets up a new room from the create message m: training,
// the expert mode or neither, and the options (handleCreate).
func (r *room) createKlaverjas(m *inMsg) {
	patch, _ := parseOpts(m.Opts, true)
	r.training = m.Training
	r.expert = m.Expert && !r.training
	if r.training {
		r.opts.Tempo = "rustig"
	}
	patch.apply(&r.opts)
	if patch.Players != nil {
		r.opts.Players = *patch.Players
	}
	if r.expert {
		r.opts.Players = 4 // the engine reasons for four
	}
	r.trainingOpts()
	r.expertOpts()
}

// seatTraining sets up the training table: Juf Jannie opposite the player,
// two random opponents.
func (r *room) seatTraining() {
	juf, ok := r.persona("jannie")
	if !ok {
		juf = r.randomPersona()
	}
	r.seats[2] = r.newBot(juf)
	r.seats[1] = r.newBot(r.randomPersona(juf.ID))
	r.seats[3] = r.newBot(r.randomPersona(juf.ID))
}

// trainingOpts keeps what belongs to training to its rooms: outside it no
// lesson, no tips and, but for the expert, no open cards. In it the table
// has four players, a lesson its own length, and the lesson on signals
// always something to teach: bots that signal, and agreements.
func (r *room) trainingOpts() {
	if !r.training {
		r.opts.Lesson, r.opts.Tips = "", false
		r.opts.Open = r.opts.Open && r.expert
		return
	}
	r.opts.Players = 4 // with Juf Jannie as partner
	if r.lessonsOn() {
		r.opts.Hands = lessonLength
	}
	if r.inLesson(planSeinen) {
		if r.opts.AI == "makkelijk" {
			r.opts.AI = "normaal"
		}
		if r.opts.Signals == (game.Signals{}) {
			r.opts.Signals = game.DefaultSignals
		}
	}
}

// cmdTipRead moves on from the lesson step n on screen (readLesson), or
// ends the pause on the last trick of a hand in training, kept for reading
// its tip: the summary follows at once. Once that pause is over it is a
// late tap and changes nothing.
func (r *room) cmdTipRead(n *int) {
	if r.readLesson(n) {
		return
	}
	if n != nil {
		return // a lesson tap that came after its step went: no tip read
	}
	if r.pending != stepCollect || r.nextAt.IsZero() {
		return
	}
	r.runPending()
}
