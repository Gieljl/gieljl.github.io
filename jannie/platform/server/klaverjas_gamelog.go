package server

import (
	"strconv"
	"strings"
	"time"

	"jannie/games/klaverjas/game"
)

type logMatch struct {
	T        string      `json:"t"` // "match"
	Match    string      `json:"match"`
	Room     string      `json:"room"`
	At       time.Time   `json:"at"`
	Version  string      `json:"version"` // of the server: the git commit it was built from ("dev" from source)
	Seed     uint64      `json:"seed"`
	Training bool        `json:"training"`
	Expert   bool        `json:"expert,omitempty"`
	Opts     Options     `json:"opts"`
	Players  []logPlayer `json:"players"`
}

// logHand is a finished hand: the cards dealt per seat (and the talon with
// three players), every decision in order (see actToken) and the result.
type logHand struct {
	T      string          `json:"t"` // "hand"
	Match  string          `json:"match"`
	At     time.Time       `json:"at"`
	Hand   int             `json:"hand"`
	Dealer game.Seat       `json:"dealer"`
	Turned game.Suit       `json:"turned"`
	Cards  []string        `json:"cards"`
	Talon  string          `json:"talon,omitempty"`
	Acts   string          `json:"acts"`
	Result game.HandResult `json:"result"`
}

// logReview is a player's review once every grade is in, without the
// replay (the hand records hold the cards).
type logReview struct {
	T      string       `json:"t"` // "review"
	Match  string       `json:"match"`
	At     time.Time    `json:"at"`
	Seat   int          `json:"seat"`
	Name   string       `json:"name"`
	Review *reviewState `json:"review"`
}

type logFeedback struct {
	T      string    `json:"t"` // "feedback"
	Match  string    `json:"match"`
	At     time.Time `json:"at"`
	Seat   int       `json:"seat"`
	Name   string    `json:"name"`
	IP     string    `json:"ip"`
	Device string    `json:"device"`
	Hand   int       `json:"hand,omitempty"` // 0: about the game as a whole
	Trick  int       `json:"trick,omitempty"`
	By     *int      `json:"by,omitempty"` // the reasoning sheet (expert, training): the seat of the decision commented on (their own)
	Text   string    `json:"text"`
}

// actToken is one decision of a hand in the "acts" of a hand record: the
// seat, then for a card the card ("2AS"), else a letter and its value:
// b1/b0 spelen or passen (gedraaid), tH a trump suit, a90 a bid in the
// auction (a0: pas), dJS7H the two cards laid away.
func actToken(i game.Seat, a action) string {
	s := string(rune('0' + i))
	switch a.kind {
	case actPlay:
		return s + a.card.String()
	case actBid:
		if a.play {
			return s + "b1"
		}
		return s + "b0"
	case actTrump:
		return s + "t" + a.suit.String()
	case actAuction:
		return s + "a" + strconv.Itoa(a.bid)
	case actDiscard:
		return s + "d" + a.cards[0].String() + a.cards[1].String()
	}
	return s + "?"
}

// cardsString is cards as one compact string: "7SAS9H".
func cardsString(cards []game.Card) string {
	var b strings.Builder
	for _, c := range cards {
		b.WriteString(c.String())
	}
	return b.String()
}

// logMatchKlaverjas is logMatch for klaverjas: its record has no game
// name, but the training and expert modes.
func (r *room) logMatchKlaverjas() {
	rec := logMatch{T: "match", Match: r.matchID, Room: r.code, At: time.Now().UTC(), Version: r.srv.cfg.Version, Seed: r.seed,
		Training: r.training, Expert: r.expert, Opts: r.opts}
	for i := range r.players() {
		rec.Players = append(rec.Players, r.logPlayerAt(game.Seat(i)))
	}
	r.srv.games.write(rec)
}

// logHand records the hand just finished.
func (r *room) logHand(res game.HandResult) {
	rec := logHand{T: "hand", Match: r.matchID, At: time.Now().UTC(), Hand: r.handNo, Dealer: r.deal.Dealer(),
		Turned: r.deal.Turned(), Acts: r.acts, Talon: cardsString(r.dealt.talon), Result: res}
	for i := range r.players() {
		rec.Cards = append(rec.Cards, cardsString(r.dealt.hands[i]))
	}
	r.srv.games.write(rec)
}

// logReview records the review of seat i once, when it is complete.
func (r *room) logReview(i game.Seat, rv *review) {
	if rv.logged {
		return
	}
	out := r.reviewFor(i)
	if out == nil || out.Pending {
		return
	}
	rv.logged = true
	out.Replay = nil
	r.srv.games.write(logReview{T: "review", Match: r.matchID, At: time.Now().UTC(), Seat: int(i), Name: r.displayName(i), Review: out})
}
