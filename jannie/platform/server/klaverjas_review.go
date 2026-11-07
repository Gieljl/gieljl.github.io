package server

import (
	"cmp"
	"fmt"
	"math"
	"runtime"
	"slices"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"jannie/games/klaverjas/game"
)

// The review (games/klaverjas/README.md#spelanalyse-on-the-server) grades
// every decision a human makes with a choice, in the background, and
// shows the result to that player alone when the match is over; each
// finished hand with the player's graded decisions in it on request
// (handReview). It grades with the search of the hints, which plays four
// players: at a table of three or two there is none.

const (
	riskyNat     = 0.4 // a bid to play with a higher chance of nat is listed as risky
	reviewListed = 3   // moments listed per kind
)

// gradeSlots is how many analyses run at once over all rooms; each takes
// one core.
func gradeSlots() int { return max(1, runtime.GOMAXPROCS(0)/4) }

// analyse runs f in one of the server's analysis slots, unless stale says,
// once a slot is free, that nobody needs it any more. A panic is logged.
func (s *Server) analyse(stale func() bool, f func()) {
	s.grading <- struct{}{}
	defer func() {
		<-s.grading
		if p := recover(); p != nil {
			s.log.Error("analysis panicked", "panic", fmt.Sprint(p))
		}
	}()
	if !stale() {
		f()
	}
}

// review collects the analysis of one human's play in a match. Grades come
// in from the background; pending counts those still out.
type review struct {
	pending int         // analyses still out
	grading int         // of which grades of choices
	stale   atomic.Bool // the match is over (written by the room, read by the analyses)

	hands int     // hands dealt to the player
	luck  float64 // summed HandLuck of those hands

	choices int // decisions with more than one option
	stake   float64
	lost    float64

	leads, leadsBest   int
	trumps, trumpsBest int // trump choices and bids

	roem, roemTimes int // roem given to the opponents
	roemAt          int // what the player's card gives if the opponents take the current trick

	risky          []int // hands with a bid to play at more than riskyNat chance of nat
	missed, strong []moment

	graded    map[int][]gradedJSON // every decision analysed, by hand number, in order (keep)
	gradingIn map[int]int          // grades still out, by hand number
	watch     int                  // the hand asked for last (cmdHandReview); 0: none

	thinks []think // how long each decision took (see timeChoice)
	logged bool    // the complete review is in the game log

	feedbackN int // feedback lines given (cmdFeedback)
}

// think is how long a human took over one decision, from the turn opening.
type think struct {
	d           time.Duration
	hand, trick int // trick 0: a trump choice or bid
}

// moment is a decision named in the review: points left against the
// better option, or a strong move against the obvious one. Of the two
// options, Us and Them say what the stronger one (better, or the strong
// move) brought each team more than the weaker one on average, and Nat
// and NatThem the chance in percent that each team played and went nat
// with the weaker one and with the stronger one.
type moment struct {
	Hand    int         `json:"hand"`
	Trick   int         `json:"trick"` // 1–8; 0 for a trump choice or bid
	Played  choiceJSON  `json:"played"`
	Better  *choiceJSON `json:"better,omitempty"`
	Alt     *choiceJSON `json:"alt,omitempty"` // a strong move: the obvious option it beat
	Points  int         `json:"points"`        // Us − Them
	Us      int         `json:"us"`
	Them    int         `json:"them"`
	Nat     [2]int      `json:"nat"`
	NatThem [2]int      `json:"natThem"`
	Why     string      `json:"why"`             // the reason of the hint, or "" when it cannot be cut out
	Text    string      `json:"text"`            // the whole hint
	Cards   []game.Card `json:"cards,omitempty"` // a trump choice or bid: the player's hand
	Table   *game.Trick `json:"table,omitempty"` // a card: the trick it went into
}

// gradedJSON is a graded decision in the replay of its hand
// (games/klaverjas/README.md#the-review): the choice, and as in a moment
// the better option or the obvious one it beat, with the points and
// outcomes, when it lost or gained points. A decision without either has
// only its trick and the choice.
type gradedJSON struct {
	Trick   int         `json:"trick"` // 1–8; 0 for a trump choice or bid
	Played  choiceJSON  `json:"played"`
	Better  *choiceJSON `json:"better,omitempty"`
	Alt     *choiceJSON `json:"alt,omitempty"`
	Points  int         `json:"points,omitempty"`
	Us      int         `json:"us,omitempty"`
	Them    int         `json:"them,omitempty"`
	Nat     *[2]int     `json:"nat,omitempty"`
	NatThem *[2]int     `json:"natThem,omitempty"`
	Why     string      `json:"why,omitempty"`
	Text    string      `json:"text,omitempty"`
}

type choiceJSON struct {
	Card *game.Card `json:"card,omitempty"`
	Suit *game.Suit `json:"suit,omitempty"`
	Play *bool      `json:"play,omitempty"`
}

// reviewState is the review for the player of a state
// (games/klaverjas/README.md#the-review).
type reviewState struct {
	ID      string   `json:"id"` // the match, for the history kept on the device
	Pending bool     `json:"pending"`
	Pct     int      `json:"pct"`
	Hands   int      `json:"hands"`
	Choices int      `json:"choices"`
	Luck    int      `json:"luck"` // points per hand against an average hand
	Lost    int      `json:"lost"`
	LostN   int      `json:"lostN"`
	StrongN int      `json:"strongN"`
	Leads   [2]int   `json:"leads"`  // best, of
	Trumps  [2]int   `json:"trumps"` // best, of
	Roem    [2]int   `json:"roem"`   // points, times
	Risky   [2]int   `json:"risky"`  // bids, of which nat
	Strong  []moment `json:"strong"`
	Missed  []moment `json:"missed"`

	Speed  *speedState  `json:"speed"`  // null when no decision was timed
	Replay []replayHand `json:"replay"` // the finished hands of the match
	Seed   uint64       `json:"seed"`   // of the match (docs/server.md#table-options)
}

// speedState is how fast the player decided
// (games/klaverjas/README.md#the-review): times in ms.
type speedState struct {
	speedSum
	Slowest struct {
		Hand  int `json:"hand"`
		Trick int `json:"trick"`
		Ms    int `json:"ms"`
	} `json:"slowest"`
	Others *speedSum `json:"others"` // the other people at the table; null without any
}

type speedSum struct {
	N      int `json:"n"`      // decisions timed
	Median int `json:"median"` // ms
	Total  int `json:"total"`  // ms: the time the table waited for these decisions
}

// replayHand is a hand as the replay shows it (handReplay): its number,
// the cards dealt to each seat, sorted as in a hand under its trump, the
// tricks, and the viewer's graded decisions in it.
type replayHand struct {
	Hand    int            `json:"hand"`
	Cards   [4][]game.Card `json:"cards"`
	Tricks  []game.Trick   `json:"tricks"`
	Choices []gradedJSON   `json:"choices"`
}

// reviewOf returns the review of human seat i, started when needed (a
// player who joined during the match).
func (r *room) reviewOf(i game.Seat) *review {
	st := &r.seats[i]
	if st.review == nil {
		st.review = &review{}
	}
	return st.review
}

// reviewing reports whether this match is reviewed: a table of four.
func (r *room) reviewing() bool { return r.players() == 4 }

// startReviews starts a review for every human at the start of a match.
func (r *room) startReviews() {
	r.handTricks = nil
	for i := range r.seats {
		if rv := r.seats[i].review; rv != nil {
			rv.stale.Store(true)
		}
		r.seats[i].review = nil
		if r.seats[i].kind == seatHuman && r.reviewing() {
			r.seats[i].review = &review{}
		}
	}
}

// gradeHands measures, in the background, what the cards just dealt are
// worth to each human.
func (r *room) gradeHands() {
	if !r.reviewing() {
		return
	}
	for k := range r.seats {
		i := game.Seat(k)
		if r.seats[i].kind != seatHuman {
			continue
		}
		rv, v := r.reviewOf(i), r.viewFor(i)
		rv.roemAt = 0
		rv.pending++
		go func() {
			var luck float64
			r.srv.analyse(rv.staleIn(r), func() { luck = r.srv.ai.HandLuck(v) })
			r.post(func() {
				rv.pending--
				rv.hands++
				rv.luck += luck
				r.reviewDone(i, rv)
			})
		}()
	}
}

// beforeChoice returns the view seat i decides action a on, when it is
// their turn, and notes the roem their card would give.
func (r *room) beforeChoice(i game.Seat, a action) (game.View, bool) {
	if !r.reviewing() || r.pending != stepNone || r.deal == nil || r.deal.Turn() != i {
		return game.View{}, false
	}
	v := r.viewFor(i)
	if a.kind == actPlay {
		r.reviewOf(i).roemAt = roemAdded(&v, a.card)
	}
	return v, true
}

// roemAdded is the roem card c adds to the cards on the table in v, beyond
// the least that a legal card adds.
func roemAdded(v *game.View, c game.Card) int {
	cards := make([]game.Card, 0, 4)
	for _, p := range v.Current.Cards {
		cards = append(cards, p.Card)
	}
	n := len(cards)
	with := func(x game.Card) int { return game.RoemPoints(append(cards[:n], x), v.Trump) }
	least := with(c)
	for _, l := range v.Legal {
		least = min(least, with(l))
	}
	return with(c) - least
}

// gradeChoice grades action a of seat i, decided in view v, in the
// background, when the player had a choice.
func (r *room) gradeChoice(i game.Seat, v game.View, a action) {
	var c Choice
	switch a.kind {
	case actPlay:
		if len(v.Legal) < 2 {
			return
		}
		c.Card = &a.card
	case actTrump:
		c.Suit = &a.suit
	case actBid:
		c.Play = &a.play
	}
	rv := r.reviewOf(i)
	rv.pending++
	rv.grading++
	if rv.gradingIn == nil {
		rv.gradingIn = make(map[int]int)
	}
	rv.gradingIn[v.HandNo]++
	go func() {
		var g Grade
		ok := false // analysed: not skipped as stale, no panic
		r.srv.analyse(rv.staleIn(r), func() { g, ok = r.srv.ai.Grade(v, c), true })
		r.post(func() {
			rv.pending--
			rv.grading--
			rv.gradingIn[v.HandNo]--
			rv.add(&v, c, g)
			if ok && g.Stake != 0 { // a failed search grades nothing
				rv.keep(&v, c, g)
			}
			r.reviewDone(i, rv)
			if st := &r.seats[i]; st.review == rv && st.client != nil && rv.watch == v.HandNo && r.phase != phaseLobby {
				r.sendHandReview(st.client, i, v.HandNo)
			}
		})
	}()
}

// timeChoice books how long seat i took over the decision it made in view
// v, the turn having opened at opened; only when they were connected all
// along: then (on) and since.
func (r *room) timeChoice(i game.Seat, opened time.Time, on bool, v *game.View) {
	if !on || r.seats[i].leftAt.After(opened) {
		return
	}
	t := think{d: time.Since(opened), hand: v.HandNo}
	if v.Phase == game.PhasePlay {
		t.trick = len(v.Tricks) + 1
	}
	rv := r.reviewOf(i)
	rv.thinks = append(rv.thinks, t)
}

// staleIn reports whether rv's analyses are no longer needed in room r:
// a new match started, or the room was closed.
func (rv *review) staleIn(r *room) func() bool {
	return func() bool {
		select {
		case <-r.done:
			return true
		default:
			return rv.stale.Load()
		}
	}
}

// reviewTrick books the roem that the humans' own cards gave the
// opponents in trick t, just completed.
func (r *room) reviewTrick(t game.Trick) {
	for i := range r.seats {
		rv := r.seats[i].review
		if rv == nil || rv.roemAt == 0 {
			continue
		}
		if t.Winner.Team() != game.Seat(i).Team() {
			rv.roem += rv.roemAt
			rv.roemTimes++
		}
		rv.roemAt = 0
	}
}

// reviewDone sends a finished review to its player, and to the game log,
// once the last grade is in after the match ended.
func (r *room) reviewDone(i game.Seat, rv *review) {
	st := &r.seats[i]
	if rv.pending != 0 || r.phase != phaseGameOver || st.review != rv {
		return
	}
	r.logReview(i, rv)
	if st.client != nil {
		r.resync(st.client, i)
	}
}

// add books grade g of choice c, decided in view v.
func (rv *review) add(v *game.View, c Choice, g Grade) {
	rv.choices++
	rv.stake += g.Stake
	rv.lost += g.Lost
	if c.Card != nil {
		if len(v.Current.Cards) == 0 {
			rv.leads++
			if g.Lost == 0 {
				rv.leadsBest++
			}
		}
	} else {
		rv.trumps++
		if g.Lost == 0 {
			rv.trumpsBest++
		}
		if c.Play != nil && *c.Play && g.Nat > riskyNat {
			rv.risky = append(rv.risky, v.HandNo)
		}
	}
	m, _ := momentOf(v, c, g)
	switch {
	case g.Lost > 0:
		rv.missed = append(rv.missed, m)
	case g.Gain > 0:
		rv.strong = append(rv.strong, m)
	}
}

// momentOf is grade g of choice c, decided in view v, as a moment; rated
// when the choice lost or gained points, else it has no better option,
// points or outcomes.
func momentOf(v *game.View, c Choice, g Grade) (m moment, rated bool) {
	m = moment{Hand: v.HandNo, Played: choiceJSON(c)}
	if c.Card != nil {
		m.Trick = len(v.Tricks) + 1
	} else {
		m.Cards = game.SortHand(v.Hand, v.Trump, v.TrumpKnown)
	}
	h := hint{Card: c.Card, Suit: c.Suit, Play: c.Play, Text: g.Text}
	var weak, strong Outcome
	switch {
	case g.Lost > 0:
		better := choiceJSON(g.Better)
		m.Better = &better
		h = hint{Card: better.Card, Suit: better.Suit, Play: better.Play, Text: g.Text}
		m.Points = int(math.Round(g.Lost))
		weak, strong = g.Played, g.Other
	case g.Gain > 0:
		if g.Obvious != (Choice{}) {
			alt := choiceJSON(g.Obvious)
			m.Alt = &alt
		}
		m.Points = int(math.Round(g.Gain))
		weak, strong = g.Other, g.Played
	default:
		return m, false
	}
	// Rounded apart, the two teams' shares still add up to the points.
	m.Us = int(math.Round(strong.Us - weak.Us))
	m.Them = m.Us - m.Points
	pct := func(p float64) int { return int(math.Round(100 * p)) }
	m.Nat = [2]int{pct(weak.NatUs), pct(strong.NatUs)}
	m.NatThem = [2]int{pct(weak.NatThem), pct(strong.NatThem)}
	if why, ok := hintWhy(&h); ok {
		m.Why = why
	}
	m.Text = g.Text
	return m, true
}

// keep books grade g of choice c, decided in view v, with the decisions of
// its hand: by trick, and before the first card a bid before a trump
// choice (gedraaid: a pass, then trump once everyone passed).
func (rv *review) keep(v *game.View, c Choice, g Grade) {
	m, rated := momentOf(v, c, g)
	d := gradedJSON{Trick: m.Trick, Played: m.Played}
	if rated {
		d.Better, d.Alt, d.Points, d.Us, d.Them = m.Better, m.Alt, m.Points, m.Us, m.Them
		d.Nat, d.NatThem, d.Why, d.Text = &m.Nat, &m.NatThem, m.Why, m.Text
	}
	if rv.graded == nil {
		rv.graded = make(map[int][]gradedJSON)
	}
	pre := func(d gradedJSON) int { // a bid before a trump choice
		if d.Played.Play != nil {
			return 0
		}
		return 1
	}
	ds := append(rv.graded[v.HandNo], d)
	slices.SortStableFunc(ds, func(a, b gradedJSON) int { return cmp.Or(cmp.Compare(a.Trick, b.Trick), cmp.Compare(pre(a), pre(b))) })
	rv.graded[v.HandNo] = ds
}

// choicesIn is the decisions of hand h kept by keep, never nil ([] on the
// wire); none without a review.
func (rv *review) choicesIn(h int) []gradedJSON {
	if rv == nil || rv.graded[h] == nil {
		return []gradedJSON{}
	}
	return rv.graded[h]
}

// reviewFor is the review for the player at seat i once the match is over,
// or nil.
func (r *room) reviewFor(i game.Seat) *reviewState {
	rv := r.seats[i].review
	if r.phase != phaseGameOver || rv == nil || (rv.choices == 0 && rv.grading == 0) {
		return nil
	}
	out := &reviewState{ID: r.matchID, Pending: rv.pending > 0}
	if out.Pending {
		return out
	}
	out.Pct = 100
	if rv.stake > 0 {
		out.Pct = min(100, max(0, int(math.Round(100*(1-rv.lost/rv.stake)))))
	}
	out.Hands, out.Choices = rv.hands, rv.choices
	if rv.hands > 0 {
		out.Luck = int(math.Round(rv.luck / float64(rv.hands)))
	}
	out.Lost, out.LostN, out.StrongN = int(math.Round(rv.lost)), len(rv.missed), len(rv.strong)
	out.Leads = [2]int{rv.leadsBest, rv.leads}
	out.Trumps = [2]int{rv.trumpsBest, rv.trumps}
	out.Roem = [2]int{rv.roem, rv.roemTimes}
	for _, h := range rv.risky {
		out.Risky[0]++
		for _, row := range r.scores {
			if row.Hand == h && row.Nat && row.PlayingTeam == i.Team() {
				out.Risky[1]++
			}
		}
	}
	out.Strong, out.Missed = r.listed(rv.strong), r.listed(rv.missed)
	out.Speed = r.speedOf(i)
	out.Replay = r.replay(rv)
	out.Seed = r.seed
	return out
}

// speedOf is how fast the player at seat i decided in this match, and the
// other people at the table; nil when none of the player's decisions was
// timed.
func (r *room) speedOf(i game.Seat) *speedState {
	own := r.seats[i].review.thinks
	if len(own) == 0 {
		return nil
	}
	sum := func(ts []think) speedSum {
		ds := make([]time.Duration, len(ts))
		var total time.Duration
		for k, t := range ts {
			ds[k] = t.d
			total += t.d
		}
		slices.Sort(ds)
		med := ds[len(ds)/2]
		if len(ds)%2 == 0 {
			med = (ds[len(ds)/2-1] + med) / 2
		}
		return speedSum{N: len(ts), Median: int(med.Milliseconds()), Total: int(total.Milliseconds())}
	}
	sp := &speedState{speedSum: sum(own)}
	slow := slices.MaxFunc(own, func(a, b think) int { return cmp.Compare(a.d, b.d) })
	sp.Slowest.Hand, sp.Slowest.Trick, sp.Slowest.Ms = slow.hand, slow.trick, int(slow.d.Milliseconds())
	var others []think
	for k := range r.seats {
		if rv := r.seats[k].review; game.Seat(k) != i && rv != nil {
			others = append(others, rv.thinks...)
		}
	}
	if len(others) > 0 {
		o := sum(others)
		sp.Others = &o
	}
	return sp
}

// replay is every finished hand of the match, for the replay of the
// review, with the graded decisions of rv's player.
func (r *room) replay(rv *review) []replayHand {
	out := make([]replayHand, len(r.handDealt))
	for k := range out {
		out[k] = r.handReplay(r.firstHand+k, rv)
	}
	return out
}

// finished reports whether hand h (its number) of the match is over.
func (r *room) finished(h int) bool {
	k := h - r.firstHand
	return k >= 0 && k < len(r.handDealt)
}

// cmdHandReview sends the asker a finished hand of the match as the replay
// shows it, with their graded decisions in it
// (games/klaverjas/README.md#client--server), and again each time a grade
// of that hand comes in, until they ask for another (watch).
func (r *room) cmdHandReview(c *client, i game.Seat, m *inMsg) {
	if !r.reviewing() {
		c.sendError(errInvalid, "Terugkijken kan alleen met z'n vieren.")
		return
	}
	if r.phase == phaseLobby || m.Hand == nil || !r.finished(*m.Hand) {
		c.sendError(errInvalid, "Dat potje is er (nog) niet.")
		return
	}
	if rv := r.seats[i].review; rv != nil {
		rv.watch = *m.Hand
	}
	r.sendHandReview(c, i, *m.Hand)
}

// rewatch sends c, back at seat i, the hand it asked for last again, with
// the grades that came in while it was away.
func (r *room) rewatch(c *client, i game.Seat) {
	if rv := r.seats[i].review; rv != nil && rv.watch != 0 && r.phase != phaseLobby && r.finished(rv.watch) {
		r.sendHandReview(c, i, rv.watch)
	}
}

// sendHandReview sends c, the client of seat i, finished hand h with the
// seat's graded decisions in it and how many are still being graded.
func (r *room) sendHandReview(c *client, i game.Seat, h int) {
	rv := r.seats[i].review
	msg := handReviewMsg{T: "handReview", Hand: h, Replay: r.handReplay(h, rv)}
	if rv != nil {
		msg.Pending = rv.gradingIn[h]
	}
	c.send(mustJSON(msg))
}

// Limits on the feedback of a player.
const (
	maxFeedback    = 20   // feedback lines per player and match (maxExpertFeedback with the reasoning sheet)
	maxFeedbackLen = 2000 // characters
)

// cmdFeedback keeps a player's free text about the game in the game log
// (games/klaverjas/README.md#client--server), at game over with a review.
// The expert and a player in training give it while the match runs too,
// also about one of their own decisions (hand and trick), from the
// reasoning sheet.
func (r *room) cmdFeedback(c *client, i game.Seat, m *inMsg) {
	rv := r.seats[i].review
	limit := maxFeedback
	switch {
	case r.reasoning() && r.phase != phaseLobby && rv != nil:
		limit = maxExpertFeedback
	case r.phase != phaseGameOver || rv == nil:
		c.sendError(errInvalid, "Een opmerking geef je bij de spelanalyse, na het spel.")
		return
	}
	text := cleanFeedback(m.Text)
	if text == "" {
		c.sendError(errInvalid, "Schrijf eerst wat je kwijt wilt.")
		return
	}
	if rv.feedbackN >= limit {
		c.sendError(errLimit, "Je hebt al genoeg opmerkingen gegeven bij dit spel.")
		return
	}
	rv.feedbackN++
	rec := logFeedback{T: "feedback", Match: r.matchID, At: time.Now().UTC(), Seat: int(i), Name: r.displayName(i),
		IP: c.ip, Device: c.device, Text: text}
	if h, t, ok := decisionArgs(m); r.reasoning() && ok && t >= 0 && t <= 8 {
		if _, _, found := r.handData(h); found {
			by := int(i)
			rec.Hand, rec.Trick, rec.By = h, t, &by
		}
	}
	r.srv.games.write(rec)
	c.send(mustJSON(savedMsg{T: "saved", What: "feedback"}))
}

// cleanFeedback cleans feedback line by line (cleanText), keeping the
// lines, at most maxFeedbackLen characters in all.
func cleanFeedback(s string) string {
	var lines []string
	left := maxFeedbackLen
	for _, l := range strings.Split(s, "\n") {
		if left <= 0 {
			break
		}
		if l = cleanText(l, left); l != "" {
			lines = append(lines, l)
			left -= utf8.RuneCountInString(l) + 1
		}
	}
	return strings.Join(lines, "\n")
}

// listed picks the moments with the most points, in the order they were
// played, each with the trick its card went into.
func (r *room) listed(all []moment) []moment {
	out := append(make([]moment, 0, len(all)), all...) // never nil: [] on the wire
	slices.SortStableFunc(out, func(a, b moment) int { return cmp.Compare(b.Points, a.Points) })
	out = out[:min(len(out), reviewListed)]
	slices.SortStableFunc(out, func(a, b moment) int {
		return cmp.Or(cmp.Compare(a.Hand, b.Hand), cmp.Compare(a.Trick, b.Trick))
	})
	for k := range out {
		m := &out[k]
		if h := m.Hand - r.firstHand; m.Trick > 0 && h >= 0 && h < len(r.handTricks) && m.Trick-1 < len(r.handTricks[h]) {
			t := r.handTricks[h][m.Trick-1]
			m.Table = &t
		}
	}
	return out
}
