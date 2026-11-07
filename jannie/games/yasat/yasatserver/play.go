package yasatserver

import (
	"encoding/json"
	"errors"
	"slices"
	"time"

	"jannie/games/yasat/yasat"
	"jannie/games/yasat/yasatbot"
	"jannie/platform/cards"
	"jannie/platform/server"
)

// play is one match of Yasat at a table.
type play struct {
	t       *server.Table
	n       int
	round   *yasat.Round
	roundNo int
	dealer  int
	totals  []int
	history []roundResult
	seen    []yasatbot.Seen
	aces    [][]yasat.Card // per seat: the aces as 11; nil: not chosen yet
	asked   []bool         // per seat: must choose aces
	last    *roundResult
}

// roundResult is a scored round, as it goes on the wire.
type roundResult struct {
	Round   int            `json:"round"`
	Caller  int            `json:"caller"`
	Won     bool           `json:"won"`
	Results []yasat.Result `json:"results"`
	Hands   [][]yasat.Card `json:"hands"`
}

func (p *play) length() string { return p.t.Options().(*Options).Length }

func (p *play) Start() {
	p.n = p.t.Players()
	p.totals = make([]int, p.n)
	p.dealer = p.n - 1 // seat 0 starts the first round
	p.t.SysChat("Yasat begint: %s.", lengthText(p.length()))
	p.deal()
}

func lengthText(l string) string {
	switch l {
	case "first10":
		return "wie het eerst 10 punten heeft, wint"
	case "classic":
		return "eindeloos, tot jullie stoppen"
	}
	return "10 rondes, de meeste punten winnen"
}

func (p *play) deal() {
	p.roundNo++
	p.t.SetHand(p.roundNo)
	p.round = yasat.Deal(p.n, p.dealer, p.t.Deals())
	p.seen = nil
	p.aces, p.asked = nil, nil
	p.t.SetPhase("play")
	p.t.Pause(stepDealt, p.t.Pace().Deal)
	p.t.Emit(ev{Type: "deal", Seat: p.round.Dealer})
}

func (p *play) Resume(s server.Step) {
	switch s {
	case stepDealt:
		p.t.OpenTurn()
		p.t.Emit(nil)
	case stepAces:
		for i := range p.n {
			if p.asked[i] && p.aces[i] == nil {
				p.aces[i] = yasatbot.BestAces(p.round.Hands[i], p.totals[i])
			}
		}
		p.score()
	}
}

func (p *play) Turn() cards.Seat {
	if p.round == nil || p.round.Over() || p.t.Pending() != 0 || !p.t.InHand() {
		return cards.NoSeat
	}
	return cards.Seat(p.round.Turn)
}

func (p *play) HandLen(i cards.Seat) int {
	if p.round == nil || int(i) >= len(p.round.Hands) {
		return 0
	}
	return len(p.round.Hands[i])
}

func (p *play) Single() bool { return false }

func (p *play) Variant() string { return "yasat " + p.length() }

// ---- the state ----

type state struct {
	server.Shared
	Round    int            `json:"round"`
	Dealer   int            `json:"dealer"`
	Hand     []yasat.Card   `json:"hand"`
	Top      []yasat.Card   `json:"top"`
	Deck     int            `json:"deck"`
	Totals   []int          `json:"totals"`
	Weighted []int          `json:"weighted"`
	Streak   int            `json:"streak"` // the seat with the longest streak, -1: nobody
	CanCall  bool           `json:"canCall"`
	Moves    []move         `json:"moves"`   // this round's, in order
	Caller   int            `json:"caller"`  // -1 until someone calls
	Hands    [][]yasat.Card `json:"hands"`   // everyone's, once the round is over
	Aces     []bool         `json:"aces"`    // per seat: still choosing its aces
	AcesEnd  int64          `json:"acesEnd"` // unix ms: the ace choice ends
	Last     *roundResult   `json:"last"`    // the round just scored
	History  []roundResult  `json:"history"` // every scored round
	Winner   int            `json:"winner"`  // at game over, -1 otherwise
}

// move is one turn as everyone saw it.
type move struct {
	Seat     int          `json:"seat"`
	Discard  []yasat.Card `json:"discard"`
	Took     *yasat.Card  `json:"took,omitempty"`
	FromDeck bool         `json:"deck"`
}

type ev struct {
	Type       string       `json:"type"` // deal, move, call, aces, handEnd
	Seat       int          `json:"seat"`
	Discard    []yasat.Card `json:"discard,omitempty"`
	Took       *yasat.Card  `json:"took,omitempty"`
	FromDeck   bool         `json:"deck,omitempty"`
	Reshuffled bool         `json:"reshuffled,omitempty"`
	Drew       *yasat.Card  `json:"drew,omitempty"` // only in the mover's own update: the card from the deck
	Result     *roundResult `json:"result,omitempty"`
}

func (p *play) weighted() ([]int, int) {
	rounds := make([][][]yasat.Event, len(p.history))
	for k, r := range p.history {
		rounds[k] = make([][]yasat.Event, p.n)
		for i, x := range r.Results {
			rounds[k][i] = x.Events
		}
	}
	return yasat.Weighted(rounds, max(p.n, p.t.Players()))
}

func (p *play) State(i cards.Seat) any {
	n := max(p.n, p.t.Players())
	s := state{Shared: p.t.Shared(i), Round: p.roundNo, Dealer: p.dealer, Hand: []yasat.Card{}, Top: []yasat.Card{},
		Totals: p.totals, Moves: []move{}, Caller: -1, History: p.history, Winner: -1, Last: p.last}
	if s.Totals == nil {
		s.Totals = make([]int, n)
	}
	if s.History == nil {
		s.History = []roundResult{}
	}
	s.Weighted, s.Streak = p.weighted()
	if r := p.round; r != nil {
		if int(i) >= 0 && int(i) < len(r.Hands) {
			s.Hand = r.Hands[i]
		}
		s.Top, s.Deck, s.Caller = r.Top(), len(r.Deck), r.Caller
		s.CanCall = p.t.Pending() == 0 && r.CanCall(int(i))
		for _, x := range p.seen {
			s.Moves = append(s.Moves, move{Seat: x.Seat, Discard: x.Discard, Took: x.Took, FromDeck: x.FromDeck})
		}
		if r.Over() {
			s.Hands = r.Hands
		}
	}
	if p.asked != nil && s.Phase == "aces" {
		s.Aces = make([]bool, p.n)
		for k := range p.n {
			s.Aces[k] = p.asked[k] && p.aces[k] == nil
		}
		s.AcesEnd = p.t.PauseEnds().UnixMilli()
	}
	if s.Phase == "gameOver" {
		s.Winner = p.winner(s.Weighted)
	}
	return s
}

// winner is the highest weighted score, a tie going to the lowest total;
// -1 when they are equal on both.
func (p *play) winner(w []int) int {
	best, shared := -1, false
	for i := range p.n {
		switch {
		case best < 0 || w[i] > w[best] || w[i] == w[best] && p.totals[i] < p.totals[best]:
			best, shared = i, false
		case w[i] == w[best] && p.totals[i] == p.totals[best]:
			shared = true
		}
	}
	if shared {
		return -1
	}
	return best
}

// ---- moves ----

func (p *play) Move(i cards.Seat, m server.Msg) error {
	switch m.T {
	case "yasat":
		return p.Apply(i, yasatbot.Decision{Call: true})
	case "move":
		var b struct {
			Discard []string `json:"discard"`
			Take    string   `json:"take"`
			Deck    bool     `json:"deck"`
		}
		if json.Unmarshal(m.Raw, &b) != nil {
			return errors.New("Dat bericht begrijp ik niet.")
		}
		mv := yasat.Move{FromDeck: b.Deck}
		for _, code := range b.Discard {
			c, err := yasat.ParseCard(code)
			if err != nil {
				return err
			}
			mv.Discard = append(mv.Discard, c)
		}
		if !b.Deck {
			c, err := yasat.ParseCard(b.Take)
			if err != nil {
				return errors.New("Kies de stapel of een kaart van de aflegstapel.")
			}
			mv.Take = c
		}
		return p.Apply(i, yasatbot.Decision{Move: mv})
	case "aces":
		var b struct {
			Eleven []string `json:"eleven"`
		}
		json.Unmarshal(m.Raw, &b)
		if p.asked == nil || int(i) >= len(p.asked) || !p.asked[i] {
			return server.ErrIgnore
		}
		if p.aces[i] != nil {
			return server.ErrIgnore
		}
		eleven := []yasat.Card{}
		for _, code := range b.Eleven {
			c, err := yasat.ParseCard(code)
			if err != nil || c.Rank != yasat.Ace || !slices.Contains(p.round.Hands[i], c) {
				return errors.New("Die aas heb je niet.")
			}
			eleven = append(eleven, c)
		}
		p.chose(int(i), eleven)
		return nil
	}
	return server.ErrUnknownMsg
}

// view is what the bot at seat i decides from: copies, since it thinks
// off the room goroutine.
func (p *play) view(i int) yasatbot.View {
	r := p.round
	v := yasatbot.View{Seat: i, Hand: slices.Clone(r.Hands[i]), Top: slices.Clone(r.Top()), DeckLen: len(r.Deck),
		Totals: slices.Clone(p.totals), Seen: slices.Clone(p.seen)}
	for _, h := range r.Hands {
		v.HandLens = append(v.HandLens, len(h))
		v.Hands = append(v.Hands, slices.Clone(h))
	}
	if len(r.Deck) > 0 {
		c := r.Deck[0]
		v.DeckTop = &c
	}
	for _, h := range p.history {
		round := make([][]yasat.Event, p.n)
		for k, x := range h.Results {
			round[k] = slices.Clone(x.Events)
		}
		v.History = append(v.History, round)
	}
	return v
}

func (p *play) Decision(i cards.Seat, brain any) (func() any, any) {
	v := p.view(int(i))
	hand := v.Hand
	worst := hand[0]
	for _, c := range hand {
		if c.Value() > worst.Value() {
			worst = c
		}
	}
	safe := yasatbot.Decision{Move: yasat.Move{Discard: []yasat.Card{worst}, FromDeck: true}}
	if p.round.Check(int(i), safe.Move) != nil && len(v.Top) > 0 {
		safe.Move = yasat.Move{Discard: []yasat.Card{worst}, Take: v.Top[0]}
	}
	return func() any { return brain.(*yasatbot.Bot).Decide(v) }, safe
}

func (p *play) Apply(i cards.Seat, a any) error {
	d, _ := a.(yasatbot.Decision)
	r := p.round
	switch {
	case r == nil || !p.t.InHand() || r.Over():
		return errors.New("Dat kan nu niet.")
	case p.t.Pending() != 0:
		return server.ErrPaused
	case int(i) != r.Turn:
		return server.NotYourTurn(errors.New("Wacht op je beurt."))
	}
	if d.Call {
		if err := r.Call(int(i)); err != nil {
			return err
		}
		p.t.SysChat("%s roept Yasat met %d %s!", p.t.DisplayName(i), yasat.Points(r.Hands[i]), punten(yasat.Points(r.Hands[i])))
		p.t.Emit(ev{Type: "call", Seat: int(i)})
		p.askAces()
		return nil
	}
	drew, err := r.Play(int(i), d.Move)
	if err != nil {
		return err
	}
	seen := yasatbot.Seen{Seat: int(i), Discard: slices.Clone(d.Move.Discard), FromDeck: drew.FromDeck}
	e := ev{Type: "move", Seat: int(i), Discard: seen.Discard, FromDeck: drew.FromDeck, Reshuffled: drew.Reshuffled}
	if !drew.FromDeck {
		c := drew.Card
		seen.Took, e.Took = &c, &c
	}
	p.seen = append(p.seen, seen)
	if drew.Reshuffled {
		p.t.SysChat("De aflegstapel is geschud: een nieuwe stapel.")
	}
	p.t.Trick()
	p.t.OpenTurn()
	p.t.Emit(e)
	return nil
}

func punten(n int) string {
	if n == 1 {
		return "punt"
	}
	return "punten"
}

// ---- the end of a round ----

// askAces asks everyone but the caller who holds an ace whether it counts
// 1 or 11; without any, the round is scored at once.
func (p *play) askAces() {
	r := p.round
	p.asked, p.aces = make([]bool, p.n), make([][]yasat.Card, p.n)
	someone := false
	for i := range p.n {
		if i != r.Caller && slices.ContainsFunc(r.Hands[i], func(c yasat.Card) bool { return c.Rank == yasat.Ace }) {
			p.asked[i], someone = true, true
		}
	}
	if !someone {
		p.score()
		return
	}
	p.t.SetPhase("aces")
	p.t.Pause(stepAces, acesTime)
	callerPts := yasat.Points(r.Hands[r.Caller])
	for i := range p.n {
		if !p.asked[i] || !p.t.BotPlays(cards.Seat(i)) {
			continue
		}
		hand, total := slices.Clone(r.Hands[i]), p.totals[i]
		p.t.Think(cards.Seat(i), func(brain any) any {
			if yasat.Points(hand) < callerPts { // an owner keeps every ace at 1
				return []yasat.Card{}
			}
			return brain.(*yasatbot.Bot).Aces(hand, total)
		}, func(a any) {
			if p.aces == nil || p.aces[i] != nil || p.round != r {
				return
			}
			eleven, _ := a.([]yasat.Card)
			if eleven == nil {
				eleven = []yasat.Card{}
			}
			p.chose(i, eleven)
		})
	}
	p.t.Emit(ev{Type: "aces", Seat: r.Caller})
}

// chose records seat i's aces as 11; once everyone chose, the round is scored.
func (p *play) chose(i int, eleven []yasat.Card) {
	p.aces[i] = eleven
	for k := range p.n {
		if p.asked[k] && p.aces[k] == nil {
			p.t.Emit(nil)
			return
		}
	}
	p.t.EndPause()
	p.score()
}

func (p *play) score() {
	r := p.round
	hands := make([]int, p.n)
	for i := range p.n {
		if p.aces != nil {
			hands[i] = yasat.PointsWith(r.Hands[i], p.aces[i])
		} else {
			hands[i] = yasat.Points(r.Hands[i])
		}
	}
	res, won := yasat.Score(hands, r.Caller, p.totals)
	for i := range p.n {
		p.totals[i] = res[i].Total
	}
	rr := roundResult{Round: p.roundNo, Caller: r.Caller, Won: won, Results: res, Hands: r.Hands}
	p.history = append(p.history, rr)
	p.last = &rr
	if won {
		p.dealer = r.Caller
	}
	p.react(rr)
	p.t.Summary(ev{Type: "handEnd", Seat: r.Caller, Result: &rr}, 0)
}

// react lets the bots say something about the round: the caller about
// their call, the others about a death or a nullify of their own.
func (p *play) react(rr roundResult) {
	c := cards.Seat(rr.Caller)
	kind := "yasat"
	if !rr.Won {
		kind = "owned"
	}
	if p.t.BotPlays(c) {
		p.t.BotSay(c, server.ChatEvent{Kind: kind, Mine: true}, 600*time.Millisecond)
	}
	p.t.BotsReact(1, 1200*time.Millisecond, func(i cards.Seat) (server.ChatEvent, bool) {
		x := rr.Results[i]
		switch {
		case yasat.HasEvent(x.Events, yasat.EvDeath):
			return server.ChatEvent{Kind: "death", Mine: true}, true
		case yasat.HasEvent(x.Events, yasat.EvNullify50) || yasat.HasEvent(x.Events, yasat.EvNullify100) || yasat.HasEvent(x.Events, yasat.EvLullify):
			return server.ChatEvent{Kind: "nullify", Mine: true}, true
		case i != c:
			return server.ChatEvent{Kind: kind}, true
		}
		return server.ChatEvent{}, false
	})
}

func (p *play) Next() {
	w, _ := p.weighted()
	top := 0
	for _, x := range w {
		top = max(top, x)
	}
	switch l := p.length(); {
	case l == "bo10" && len(p.history) >= 10, l == "first10" && top >= 10:
		win := p.winner(w)
		if win >= 0 {
			p.t.SysChat("%s wint met %d punten.", p.t.DisplayName(cards.Seat(win)), w[win])
		} else {
			p.t.SysChat("Gelijkspel.")
		}
		p.t.GameOver(w, win)
		return
	}
	p.deal()
}
