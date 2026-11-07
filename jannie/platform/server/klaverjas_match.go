package server

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"jannie/games/klaverjas/game"
)

type actKind uint8

const (
	actTrump actKind = iota + 1
	actBid
	actAuction
	actDiscard
	actPlay
)

// action is one decision by a seat: a trump suit, spelen or passen, a bid
// in the auction (0: pass), two cards to lay away or a card to play.
type action struct {
	kind  actKind
	suit  game.Suit
	play  bool
	bid   int
	cards [2]game.Card
	card  game.Card
}

var errBadBrain = errors.New("brain answered something illegal")

// decide asks the brain for the decision of view v; a panic or an illegal
// answer falls back to a safe legal choice.
func (bb *brainBox) decide(v game.View) (a action) {
	bb.mu.Lock()
	defer bb.mu.Unlock()
	defer func() {
		if p := recover(); p != nil {
			bb.log.Error("bot panicked", "panic", fmt.Sprint(p), "phase", string(v.Phase))
			a = fallback(v)
		}
	}()
	switch v.Phase {
	case game.PhaseTrump:
		s := bb.b.ChooseTrump(v)
		if s >= game.NumSuits || (turnedBarred(v) && s == v.Turned) {
			bb.log.Error("bot chose an invalid trump", "err", errBadBrain)
			return fallback(v)
		}
		return action{kind: actTrump, suit: s}
	case game.PhaseBid:
		return action{kind: actBid, play: bb.b.Bid(v)}
	case game.PhaseAuction:
		bid := bb.b.Auction(v)
		if bid != 0 && (bid < v.MinNextBid() || bid > game.MaxBid || bid%game.BidStep != 0) {
			bb.log.Error("bot made an invalid bid", "err", errBadBrain)
			return fallback(v)
		}
		return action{kind: actAuction, bid: bid}
	case game.PhaseDiscard:
		cs := bb.b.Discard(v)
		if cs[0] == cs[1] || !slices.Contains(v.Hand, cs[0]) || !slices.Contains(v.Hand, cs[1]) {
			bb.log.Error("bot laid away cards it does not hold", "err", errBadBrain)
			return fallback(v)
		}
		return action{kind: actDiscard, cards: cs}
	case game.PhasePlay:
		c := bb.b.Play(v)
		if !slices.Contains(v.Legal, c) {
			bb.log.Error("bot played an illegal card", "err", errBadBrain)
			return fallback(v)
		}
		return action{kind: actPlay, card: c}
	}
	return fallback(v)
}

// fallback is a legal decision without any thought: the longest allowed
// suit as trump, pass, the last two cards to lay away, or the first legal
// card.
func fallback(v game.View) action {
	switch v.Phase {
	case game.PhaseTrump:
		var n [game.NumSuits]int
		for _, c := range v.Hand {
			n[c.Suit]++
		}
		barred := turnedBarred(v)
		best := game.Suit(0)
		if barred && v.Turned == best {
			best = 1
		}
		for s := game.Suit(0); s < game.NumSuits; s++ {
			if !(barred && s == v.Turned) && n[s] > n[best] {
				best = s
			}
		}
		return action{kind: actTrump, suit: best}
	case game.PhaseBid:
		return action{kind: actBid}
	case game.PhaseAuction:
		return action{kind: actAuction}
	case game.PhaseDiscard:
		a := action{kind: actDiscard}
		if n := len(v.Hand); n >= 2 {
			a.cards = [2]game.Card{v.Hand[n-2], v.Hand[n-1]}
		}
		return a
	default:
		legal := v.Legal
		if len(legal) == 0 {
			legal = game.LegalMoves(v.Hand, v.Current, v.Seat, v.Trump, v.Rules)
		}
		if len(legal) == 0 {
			return action{kind: actPlay}
		}
		return action{kind: actPlay, card: legal[0]}
	}
}

// turnedBarred reports whether the turned suit may not be chosen as trump:
// gedraaid after everyone passed. A forced soloist with three players
// chooses freely.
func turnedBarred(v game.View) bool { return v.Forced && v.Players != 3 }

// startKlaverjas deals the first hand of a match of klaverjas.
func (r *room) startKlaverjas() {
	r.total = make([]int, game.Scorers(r.players()))
	r.startReviews()
	// Without the seed: the chat names it at game over (docs/server.md#the-seed).
	if r.opts.From > 0 {
		r.sysChat("Het spel begint: potje %d, %s. Veel plezier!", r.firstHand, r.opts.variantNL())
	} else {
		r.sysChat("Het spel begint: %d potjes, %s. Veel plezier!", r.opts.Hands, r.opts.variantNL())
	}
	r.signalChat()
	r.logMatch()
	r.log.Info("match started", "players", r.players(), "humans", r.humanCount(), "hands", r.opts.Hands,
		"trumpMode", r.opts.TrumpMode.String(), "rules", r.opts.Rules.String(), "ai", r.opts.AI, "training", r.training,
		"expert", r.expert)
	r.startHand()
}

// signalChat puts the table's agreements on signals in the chat at the
// start of a match with four players
// (games/klaverjas/README.md#chat-at-the-start-of-a-match), each with what
// it says. A lesson has none to tell: Juf Jannie gives them herself in the
// lesson on signals, and the other lessons play without.
func (r *room) signalChat() {
	if r.players() != 4 || r.lessonsOn() {
		return
	}
	rules := signalRules(r.signals())
	if len(rules) == 0 {
		r.sysChat("Aan deze tafel spreken we geen seinen af.")
		return
	}
	r.sysChat("Seinen aan deze tafel:")
	for _, text := range rules {
		r.sysChat("%s", text)
	}
}

// startHand shuffles and deals the next hand from the match's seed; the
// first dealer is drawn from it too.
func (r *room) startHand() {
	n := r.players()
	var dealer game.Seat
	if r.deal != nil {
		dealer = r.deal.Voorhand()
	} else {
		dealer = r.firstDealer()
	}
	r.handNo++
	r.missed, r.misses = nil, nil
	hands, talon := game.ShuffleFor(n, r.deals)
	turned := game.Suit(r.deals.IntN(game.NumSuits))
	r.dealt = dealtCards{dealer: dealer, talon: slices.Clone(talon), turned: turned}
	for i := range hands {
		r.dealt.hands[i] = slices.Clone(hands[i])
	}
	r.acts = ""
	r.deal = game.NewDealFor(n, dealer, hands, talon, r.opts.TrumpMode, r.opts.Rules, turned)
	r.phase = string(r.deal.Phase())
	r.collected = false
	r.lastTrick = nil
	r.nextAt = time.Time{}
	for i := range r.seats {
		r.seats[i].ready = false
	}
	r.pause(stepDealt, r.pace().deal)
	r.gradeHands()
	r.emit(evDeal{Type: "deal", HandNo: r.handNo, Dealer: dealer})
	r.drive()
}

// firstDealer draws the dealer of the match's first hand from its seed. A
// match that starts at a later hand (option from) draws the deals before
// it too, and passes the deal on as often, so that hand is dealt as in the
// whole match.
func (r *room) firstDealer() game.Seat {
	n := r.players()
	dealer := game.Seat(r.deals.IntN(n))
	for range r.firstHand - 1 {
		game.ShuffleFor(n, r.deals)
		r.deals.IntN(game.NumSuits)
		dealer = game.Seat((int(dealer) + 1) % n)
	}
	return dealer
}

// lastHand is the number of the match's last hand: the one hand of option
// from, else the length of the match.
func (r *room) lastHand() int {
	if r.opts.From > 0 {
		return r.firstHand
	}
	return r.opts.Hands
}

// resumeKlaverjas goes on after pause s of a hand of klaverjas.
func (r *room) resumeKlaverjas(s step) {
	switch s {
	case stepDealt:
		r.openTurn()
		if r.deal.Mode() == game.Gedraaid {
			r.emit(evTurned{Type: "turned", Suit: r.deal.Turned()})
		} else {
			r.emit(nil)
		}
	case stepContract, stepAnnounced:
		r.openTurn()
		r.emit(nil)
	case stepCollect:
		r.collected = true
		r.nextAt = time.Time{}
		w := r.deal.Current().Winner
		if r.deal.Phase() == game.PhaseDone {
			r.emit(evCollect{Type: "collect", Winner: w})
			r.endHand()
			return
		}
		r.openTurn()
		r.emit(evCollect{Type: "collect", Winner: w})
	case stepNextHand:
		r.nextHand()
		return
	}
	r.drive()
}

// viewFor is what seat i knows, with the match fields filled in.
func (r *room) viewFor(i game.Seat) game.View {
	v := r.deal.View(i)
	v.HandNo = r.handNo
	v.HandsTotal = r.opts.Hands
	v.MatchScore = slices.Clone(r.total)
	sig := r.signals()
	v.Signals = &sig
	return v
}

// humanAct applies a decision of a connected human and reports errors.
func (r *room) humanAct(c *client, i game.Seat, a action) {
	if !r.inHand() {
		c.sendError(errInvalid, "Dat kan nu niet.")
		return
	}
	miss := r.missedHintFor(i, a)
	if a.kind == actPlay {
		r.missed = miss // explained with the trick
		if r.pending == stepNone {
			r.clearLesson() // the lesson of the turn has done its job
		}
	}
	v, graded := r.beforeChoice(i, a)
	opened, on := r.openedAt, r.openedOn
	err := r.act(i, a)
	switch {
	case err != nil:
		r.missed = nil
		if graded {
			r.reviewOf(i).roemAt = 0
		}
	case miss != nil && a.kind != actPlay:
		r.misses = append(r.misses, *miss) // explained with the first trick
	}
	if err == nil && graded {
		r.timeChoice(i, opened, on, &v)
		r.gradeChoice(i, v, a)
	}
	switch {
	case err == nil:
	case errors.Is(err, game.ErrNotYourTurn), errors.Is(err, errPaused):
		c.sendError(errNotTurn, err.Error())
	default:
		c.sendError(errInvalid, err.Error())
	}
}

// act applies one decision of seat i, emits the events and moves on.
func (r *room) act(i game.Seat, a action) error {
	if !r.inHand() {
		return game.ErrWrongPhase
	}
	if r.pending != stepNone {
		return errPaused
	}
	d := r.deal
	p := r.pace()
	switch a.kind {
	case actTrump:
		forced := d.Forced()
		if err := d.ChooseTrump(i, a.suit); err != nil {
			return err
		}
		r.phase = phasePlay
		r.pause(stepAnnounced, p.announce)
		r.emit(evTrump{Type: "trump", Seat: i, Suit: a.suit, Forced: forced})
		r.chatTrump(i)
	case actAuction:
		if err := d.Auction(i, a.bid); err != nil {
			return err
		}
		r.phase = string(d.Phase())
		if d.Phase() == game.PhaseDiscard {
			soloist, bid := d.Contract()
			r.pause(stepContract, p.announce)
			r.emit(evAuction{Type: "auction", Seat: i, Bid: a.bid})
			r.emit(evContract{Type: "contract", Seat: soloist, Bid: bid, Forced: d.Forced()})
			break
		}
		r.openTurn()
		r.emit(evAuction{Type: "auction", Seat: i, Bid: a.bid})
		if a.bid == 0 {
			r.botSay(i, ChatEvent{Kind: "pass", Mine: true}, 300*time.Millisecond)
		}
	case actDiscard:
		if err := d.Discard(i, a.cards[:]); err != nil {
			return err
		}
		r.phase = string(d.Phase())
		r.openTurn()
		r.emit(evSeat{Type: "discard", Seat: i})
	case actBid:
		if err := d.Bid(i, a.play); err != nil {
			return err
		}
		if a.play {
			r.phase = phasePlay
			r.pause(stepAnnounced, p.announce)
			r.emit(evBid{Type: "bid", Seat: i, Play: true})
			r.emit(evTrump{Type: "trump", Seat: i, Suit: d.Turned()})
			r.chatTrump(i)
		} else {
			r.phase = string(d.Phase())
			r.openTurn()
			r.emit(evBid{Type: "bid", Seat: i})
			r.botSay(i, ChatEvent{Kind: "pass", Mine: true}, 300*time.Millisecond)
		}
	case actPlay:
		if err := d.Play(i, a.card); err != nil {
			return err
		}
		t := d.Current()
		if len(t.Cards) < d.Players() {
			r.openTurn()
			r.emit(evPlay{Type: "play", Seat: i, Card: a.card})
			if r.rng.Float64() < 0.1 {
				r.botSay(i, ChatEvent{Kind: "play", Mine: true}, 300*time.Millisecond)
			}
			break
		}
		r.collected = false
		r.lastTrick = &t
		r.trickNo++
		tips := r.trickTips(t)
		r.pause(stepCollect, p.trick)
		lesson := r.trickLessons(t, tips)
		switch read := readTime(tips); {
		case lesson != nil:
			r.pendingAt = time.Time{} // the trick waits for the lesson, its explanation first
		case d.Phase() == game.PhaseDone && read > 0:
			// Training: the summary would cover the last tip at once, so
			// the last trick stays until it is read (or tipRead).
			r.pause(stepCollect, max(p.trick, read))
			r.nextAt = r.pendingAt
		}
		r.emit(evPlay{Type: "play", Seat: i, Card: a.card})
		roem := t.Roem
		if roem == nil {
			roem = []game.RoemItem{}
		}
		if lesson != nil {
			r.startLesson(lesson) // on screen with the trick
		}
		r.emit(evTrick{Type: "trick", Winner: t.Winner, Points: t.Points, Roem: roem, Last: d.Phase() == game.PhaseDone})
		r.reviewTrick(t)
		if lesson == nil {
			r.sendTips(tips)
		}
		r.chatTrick(t)
	default:
		return errors.New("onbekende actie")
	}
	if r.acts != "" {
		r.acts += " "
	}
	r.acts += actToken(i, a)
	r.drive()
	return nil
}

// missedHint is a training hint the player did not follow: it advised
// another card, trump suit or bid than the one chosen.
type missedHint struct {
	seat game.Seat
	hint hint
}

// missedHintFor returns the hint seat i saw this turn when action a is not
// the advised one, else nil.
func (r *room) missedHintFor(i game.Seat, a action) *missedHint {
	h := r.hintVal
	if !r.tipsOn() || r.hintStep != r.step || h == nil || r.deal == nil || r.deal.Turn() != i {
		return nil
	}
	switch {
	case a.kind == actPlay && h.Card != nil && *h.Card != a.card:
	case a.kind == actTrump && h.Suit != nil && *h.Suit != a.suit:
	case a.kind == actBid && h.Play != nil && *h.Play != a.play:
	default:
		return nil
	}
	return &missedHint{seat: i, hint: *h}
}

// trickTips explains a finished trick to the player in training, per seat,
// and what the hint was when they played another card. The first trick of
// a hand also says so of a trump choice or bid that went against the hint.
func (r *room) trickTips(t game.Trick) (tips [4]string) {
	missed, choices := r.missed, r.misses
	r.missed, r.misses = nil, nil
	if !r.tipsOn() {
		return tips
	}
	trump, _ := r.deal.Trump()
	for i := range r.seats {
		st := &r.seats[i]
		if st.kind != seatHuman || st.client == nil {
			continue
		}
		var names [4]string
		for k := range names {
			names[k] = r.displayName(game.Seat(k))
		}
		names[i] = "Jij"
		parts := []string{r.explainTrick(t, trump, names)}
		for _, m := range choices {
			if m.seat == game.Seat(i) {
				parts = append(parts, r.missedText(game.Seat(i), &m))
			}
		}
		if missed != nil && missed.seat == game.Seat(i) {
			parts = append(parts, r.missedText(game.Seat(i), missed))
		}
		tips[i] = strings.TrimSpace(strings.Join(parts, " "))
	}
	return tips
}

// sendTips sends the tips of trickTips, each also in the chat as a line of
// Juf Jannie, to read back.
func (r *room) sendTips(tips [4]string) {
	for i, text := range tips {
		if st := &r.seats[i]; text != "" && st.client != nil {
			st.client.send(mustJSON(tipMsg{T: "tip", Text: text}))
			r.coachChat(text)
		}
	}
}

// readTime is how long the longest of the tips takes to read: a moment to
// look up and 250 ms a word, at most tipReadMax. 0 without a tip.
func readTime(tips [4]string) time.Duration {
	words := 0
	for _, text := range tips {
		words = max(words, len(strings.Fields(text)))
	}
	if words == 0 {
		return 0
	}
	return min(2*time.Second+time.Duration(words)*250*time.Millisecond, tipReadMax)
}

// missedText says what the hint advised, with its reason: "Juf Jannie had ♣9
// aangeraden: …", "Juf Jannie had ♥ als troef aangeraden: …", "Juf Jannie had
// aangeraden om te passen: …". The opening of the hint that only repeats
// the advice ("Speel ♣9: ", "Kies ♥ als troef: ", "Passen: ") is left out.
func (r *room) missedText(i game.Seat, m *missedHint) string {
	who := "De tip"
	if p := &r.seats[i.Partner()]; p.kind == seatBot {
		who = p.persona.Name
	}
	h := &m.hint
	var advised string
	switch {
	case h.Card != nil:
		advised = "had " + game.CardShortNL(*h.Card) + " aangeraden"
	case h.Suit != nil:
		advised = "had " + h.Suit.Symbol() + " als troef aangeraden"
	case h.Play != nil && *h.Play:
		advised = "had aangeraden om te spelen"
	case h.Play != nil:
		advised = "had aangeraden om te passen"
	}
	why, ok := hintWhy(h)
	switch {
	case ok && why != "":
		return who + " " + advised + ": " + why
	case h.Text == "":
		return who + " " + advised + "."
	}
	return who + " " + advised + ". " + h.Text
}

// hintWhy returns the reason in the text of hint h, after its opening that
// only names the advice: "Speel ♣9: ", "Kies ♥ als troef: ", "Spelen: ",
// "Passen: ". ok is false for a hint that opens otherwise.
func hintWhy(h *hint) (why string, ok bool) {
	switch {
	case h.Card != nil:
		why, ok = strings.CutPrefix(h.Text, "Speel "+game.CardShortNL(*h.Card)+": ")
	case h.Suit != nil:
		_, why, ok = strings.Cut(h.Text, "Kies "+h.Suit.Symbol()+" als troef: ")
	case h.Play != nil && *h.Play:
		why, ok = strings.CutPrefix(h.Text, "Spelen: ")
	case h.Play != nil:
		why, ok = strings.CutPrefix(h.Text, "Passen: ")
	}
	return why, ok
}

func (r *room) explainTrick(t game.Trick, trump game.Suit, names [4]string) (text string) {
	defer func() {
		if p := recover(); p != nil {
			r.log.Error("ExplainTrick panicked", "panic", fmt.Sprint(p))
			text = ""
		}
	}()
	return r.srv.ai.ExplainTrick(t, trump, names)
}

// hintFor returns the training hint for seat i on its turn, computed once
// per turn.
func (r *room) hintFor(i game.Seat) *hint {
	if r.hintStep == r.step && r.hintVal != nil {
		return r.hintVal
	}
	v := r.viewFor(i)
	a, ok := r.advise(v)
	if !ok {
		return nil
	}
	h := &hint{Text: a.Text}
	switch v.Phase {
	case game.PhaseTrump:
		if a.Suit != nil && *a.Suit < game.NumSuits && !(v.Forced && *a.Suit == v.Turned) {
			s := *a.Suit
			h.Suit = &s
		}
	case game.PhaseBid:
		if a.Play != nil {
			p := *a.Play
			h.Play = &p
		}
	case game.PhasePlay:
		if a.Card != nil && slices.Contains(v.Legal, *a.Card) {
			c := *a.Card
			h.Card = &c
		}
	}
	if h.Card == nil && h.Suit == nil && h.Play == nil && h.Text == "" {
		return nil
	}
	r.hintStep, r.hintVal = r.step, h
	return h
}

func (r *room) advise(v game.View) (a Advice, ok bool) {
	defer func() {
		if p := recover(); p != nil {
			r.log.Error("Advise panicked", "panic", fmt.Sprint(p))
			ok = false
		}
	}()
	return r.srv.ai.Advise(v), true
}

// endHand scores the finished hand and shows the summary.
func (r *room) endHand() {
	d := r.deal
	res := d.Result()
	gains := res.Gains[:len(r.total)]
	r.scores = append(r.scores, scoreRow{
		Hand: r.handNo, Dealer: res.Dealer, Trump: res.Trump, TrumpBy: res.TrumpBy,
		PlayingTeam: res.PlayingTeam, Bid: res.Bid, Points: res.Points, Roem: res.Roem, Score: res.Score,
		Gains: slices.Clone(gains), Nat: res.Nat, Pit: res.Pit,
	})
	for k, g := range gains {
		r.total[k] += g
	}
	r.prev = &prevHand{Tricks: d.Tricks(), Result: res}
	r.handTricks = append(r.handTricks, d.Tricks())
	r.handActs = append(r.handActs, r.acts)
	r.handDealt = append(r.handDealt, r.dealt)
	r.logHand(res)
	r.phase = phaseHandEnd
	for i := range r.seats {
		r.seats[i].ready = false
	}
	r.pending = stepNextHand
	r.timeSummary(time.Now())
	r.emit(evHandEnd{Type: "handEnd", Result: res})
	r.chatHandEnd(res)
	r.drive()
}

// nextHand deals the next hand, or ends the match after the last one.
func (r *room) nextHand() {
	r.pending = stepNone
	r.nextAt = time.Time{}
	if r.handNo < r.lastHand() {
		r.startHand()
		return
	}
	r.phase = phaseGameOver
	r.overAt = time.Now()
	r.winner = topScorer(r.total)
	r.emit(evGameOver{Type: "gameOver", Total: slices.Clone(r.total), Winner: r.winner})
	r.nameSeed()
	r.chatGameOver()
	r.logEnd()
	for i := range r.seats {
		if rv := r.seats[i].review; rv != nil {
			r.logReview(game.Seat(i), rv)
		}
	}
	r.log.Info("match over", "hands", r.handNo, "total", r.total)
	r.drive()
}

// topScorer returns the index of the highest total, -1 when the highest
// is shared (a draw).
func topScorer(total []int) int {
	best, shared := -1, false
	for k, t := range total {
		switch {
		case best < 0 || t > total[best]:
			best, shared = k, false
		case t == total[best]:
			shared = true
		}
	}
	if shared {
		return -1
	}
	return best
}
