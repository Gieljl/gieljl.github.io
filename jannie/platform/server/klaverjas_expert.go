package server

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"jannie/games/klaverjas/game"
)

// The expert mode (games/klaverjas/README.md#expert-mode-on-the-server),
// reached by an easter egg on the home screen: alone against three bots,
// at a seat of choice, with the cards of a seed, the whole match or one
// hand of it (option from). While the match runs and after it, the expert
// asks the engine's reasoning for their own decisions (why) and comments
// on them (feedback), which goes to the game log. Looking back at a hand
// is the review's (handReview).

// maxExpertFeedback limits the feedback lines in a match of a player who
// comments from the reasoning sheet (the expert, training).
const maxExpertFeedback = 200

// expertOpts keeps option from to expert rooms, in a match long enough to
// number its hand.
func (r *room) expertOpts() {
	if !r.expert {
		r.opts.From = 0
		return
	}
	for r.opts.Hands < r.opts.From {
		r.opts.Hands += 4
	}
}

// handData is hand h (its number) of the match as dealt and its decisions
// so far, as tokens (actToken): a finished hand or the one in play.
func (r *room) handData(h int) (dealtCards, []string, bool) {
	if k := h - r.firstHand; k >= 0 && k < len(r.handDealt) {
		return r.handDealt[k], strings.Fields(r.handActs[k]), true
	}
	if h == r.handNo && r.deal != nil && r.inHand() {
		return r.dealt, strings.Fields(r.acts), true
	}
	return dealtCards{}, nil, false
}

// dealOf starts the deal of cards dc.
func (r *room) dealOf(dc dealtCards) *game.Deal {
	return game.NewDealFor(r.players(), dc.dealer, dc.hands, dc.talon, r.opts.TrumpMode, r.opts.Rules, dc.turned)
}

// handReplay is finished hand h as the replay shows it
// (games/klaverjas/README.md#the-review): the cards as dealt, sorted under
// its trump, the tricks, and the graded decisions of rv's player in it.
func (r *room) handReplay(h int, rv *review) replayHand {
	dc, acts, _ := r.handData(h)
	d := r.dealOf(dc)
	out := replayHand{Hand: h, Choices: rv.choicesIn(h)}
	for _, tok := range acts {
		seat, a, err := parseAct(tok)
		if err != nil || applyAct(d, seat, a) != nil {
			break
		}
	}
	trump, known := d.Trump()
	for s := range r.players() {
		out.Cards[s] = game.SortHand(dc.hands[s], trump, known)
	}
	out.Tricks = d.Tricks()
	return out
}

// decision finds the decision of seat in trick t (1–8; 0: the seat's last
// decision before the first card, or the one awaited now) of hand h, and
// rebuilds the deal up to it. done is what was decided, or nil for the
// decision awaited now: the hand in play, the seat's turn. ok is false
// when there is no such decision (yet).
func (r *room) decision(h, t int, seat game.Seat) (d *game.Deal, done *action, ok bool) {
	dc, acts, found := r.handData(h)
	if !found || !seat.ValidFor(r.players()) || t < 0 || t > 8 {
		return nil, nil, false
	}
	live := h == r.handNo && r.inHand()
	// Before the first card a seat may decide twice (gedraaid: a pass, then
	// trump once everyone passed): on its turn, the decision awaited now.
	awaited := t == 0 && live && r.deal.Turn() == seat && (r.deal.Phase() == game.PhaseBid || r.deal.Phase() == game.PhaseTrump)
	at, cards := -1, 0
	for k, tok := range acts {
		s, a, err := parseAct(tok)
		if err != nil {
			return nil, nil, false
		}
		switch {
		case a.kind == actPlay:
			if s == seat && cards/r.players()+1 == t {
				at = k
			}
			cards++
		case t == 0 && s == seat && !awaited:
			at = k
		}
	}
	d = r.dealOf(dc)
	upTo := acts
	if at >= 0 {
		upTo = acts[:at]
	}
	for _, tok := range upTo {
		s, a, _ := parseAct(tok)
		if applyAct(d, s, a) != nil {
			return nil, nil, false
		}
	}
	if at >= 0 {
		_, a, _ := parseAct(acts[at])
		return d, &a, true
	}
	play := d.Phase() == game.PhasePlay
	now := live && d.Turn() == seat && (t == 0) != play && (t == 0 || cards/r.players()+1 == t)
	return d, nil, now
}

// reasoning reports whether players here may ask the engine's reasoning
// for their decisions (why) and comment on them while the match runs: in
// the expert mode and in training.
func (r *room) reasoning() bool { return r.expert || r.training }

// matchView is what seat knew in deal d, a moment of hand h, with the
// match fields filled in as viewFor does, and the signals the table plays
// with by now (r.signals: none before the lesson on them).
func (r *room) matchView(d *game.Deal, seat game.Seat, h int) game.View {
	v := d.View(seat)
	v.HandNo, v.HandsTotal = h, r.opts.Hands
	v.MatchScore = make([]int, len(r.total))
	for _, row := range r.scores {
		if row.Hand < h {
			for k, g := range row.Gains {
				v.MatchScore[k] += g
			}
		}
	}
	sig := r.signals()
	v.Signals = &sig
	return v
}

// decisionArgs reads the decision of the sender a why or feedback is
// about: hand and trick.
func decisionArgs(m *inMsg) (h, t int, ok bool) {
	if m.Hand == nil || m.Trick == nil {
		return 0, 0, false
	}
	return *m.Hand, *m.Trick, true
}

// cmdWhy works out the engine's reasoning for a decision of the asker
// (games/klaverjas/README.md#client--server), made or awaited now. It
// runs in the background, one at a time per room and over all rooms (the
// search takes every core), and the answer goes to the asker.
func (r *room) cmdWhy(c *client, i game.Seat, m *inMsg) {
	if !r.reasoning() || r.phase == phaseLobby {
		c.sendError(errInvalid, "De redenering van de AI vraag je op bij Oefenen.")
		return
	}
	h, t, ok := decisionArgs(m)
	var d *game.Deal
	var done *action
	if ok {
		d, done, ok = r.decision(h, t, i)
	}
	if !ok {
		c.sendError(errInvalid, "Die beslissing is er (nog) niet.")
		return
	}
	if r.explaining {
		c.sendError(errLimit, "Even geduld: de AI denkt nog na over de vorige vraag.")
		return
	}
	r.explaining = true
	v := r.matchView(d, i, h)
	msg := whyMsg{T: "why", Hand: h, Trick: t, Seat: i, Options: []optionJSON{}}
	if done != nil {
		played := choiceOf(*done)
		msg.Played = &played
	}
	go func() {
		r.srv.explains <- struct{}{}
		e := r.explain(v)
		<-r.srv.explains
		r.post(func() {
			r.explaining = false
			msg.fill(e)
			if r.seats[i].client == c {
				c.send(mustJSON(msg))
			}
		})
	}()
}

// explain asks the AI for the reasoning of view v; a panic gives none.
func (r *room) explain(v game.View) (e Explanation) {
	defer func() {
		if p := recover(); p != nil {
			r.log.Error("Explain panicked", "panic", fmt.Sprint(p))
			e = Explanation{}
		}
	}()
	return r.srv.ai.Explain(v)
}

// fill puts explanation e in msg, rounded: points to tenths, shares of
// deals to thousandths.
func (msg *whyMsg) fill(e Explanation) {
	tenths := func(x float64) float64 { return math.Round(10*x) / 10 }
	share := func(x float64) float64 { return math.Round(1000*x) / 1000 }
	msg.Normaal, msg.Rule, msg.Sterk = choiceJSON(e.Normaal), e.Rule, choiceJSON(e.Sterk)
	msg.SterkWhy, msg.HintWhy = e.SterkWhy, e.HintWhy
	msg.Hint, msg.HintText, msg.Worlds = choiceJSON(e.Hint), e.HintText, e.Worlds
	for _, o := range e.Options {
		oj := optionJSON{choiceJSON: choiceJSON(o.Choice), Value: tenths(o.Value), SE: tenths(o.SE),
			Us: tenths(o.Us), Them: tenths(o.Them), NatUs: share(o.NatUs), NatThem: share(o.NatThem), Why: o.Why}
		for _, p := range o.Parts {
			oj.Parts = append(oj.Parts, tenths(p))
		}
		msg.Options = append(msg.Options, oj)
	}
}

// choiceOf is decision a as a choice: a card, a suit or a bid.
func choiceOf(a action) choiceJSON {
	switch a.kind {
	case actPlay:
		c := a.card
		return choiceJSON{Card: &c}
	case actTrump:
		s := a.suit
		return choiceJSON{Suit: &s}
	case actBid:
		p := a.play
		return choiceJSON{Play: &p}
	}
	return choiceJSON{}
}

var errBadAct = errors.New("onbekende actie")

// parseAct reads a token of actToken.
func parseAct(tok string) (game.Seat, action, error) {
	if len(tok) < 3 || tok[0] < '0' || tok[0] > '3' {
		return game.NoSeat, action{}, errBadAct
	}
	seat, rest := game.Seat(tok[0]-'0'), tok[1:]
	// A kind is a small letter; a card starts with a capital or a digit.
	switch rest[0] {
	case 'b':
		if rest == "b0" || rest == "b1" {
			return seat, action{kind: actBid, play: rest == "b1"}, nil
		}
	case 't':
		if s, err := game.ParseSuit(rest[1:]); err == nil {
			return seat, action{kind: actTrump, suit: s}, nil
		}
	case 'a':
		if n, err := strconv.Atoi(rest[1:]); err == nil {
			return seat, action{kind: actAuction, bid: n}, nil
		}
	case 'd':
		if len(rest) == 5 {
			a, errA := game.ParseCard(rest[1:3])
			b, errB := game.ParseCard(rest[3:5])
			if errA == nil && errB == nil {
				return seat, action{kind: actDiscard, cards: [2]game.Card{a, b}}, nil
			}
		}
	default:
		if c, err := game.ParseCard(rest); err == nil {
			return seat, action{kind: actPlay, card: c}, nil
		}
	}
	return game.NoSeat, action{}, errBadAct
}

// applyAct makes decision a of seat in deal d.
func applyAct(d *game.Deal, seat game.Seat, a action) error {
	switch a.kind {
	case actTrump:
		return d.ChooseTrump(seat, a.suit)
	case actBid:
		return d.Bid(seat, a.play)
	case actAuction:
		return d.Auction(seat, a.bid)
	case actDiscard:
		return d.Discard(seat, a.cards[:])
	case actPlay:
		return d.Play(seat, a.card)
	}
	return errBadAct
}
