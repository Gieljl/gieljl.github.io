package server_test

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
	"slices"
	"testing"
	"time"

	"jannie/platform/cards"
	"jannie/platform/server"
	"jannie/platform/server/servertest"
)

// The toy game, hoogste kaart, proves the API of package server without
// any real game, and is the template for one: everyone gets one card a
// round, lays it in turn from the round's first player, and the highest
// card (by rank, then suit) takes a point. After the option rounds (1–3)
// the most points win.

type toy struct{}

var toyPersonas = []server.Persona{
	{ID: "aap", Name: "Aap", Emoji: "🐒", Color: "#8a5a2b", Bio: "Aap.", Chattiness: 1, Speed: 1},
	{ID: "noot", Name: "Noot", Emoji: "🌰", Color: "#c2477a", Bio: "Noot.", Chattiness: 1, Speed: 1},
	{ID: "mies", Name: "Mies", Emoji: "🐈", Color: "#e07b24", Bio: "Mies.", Chattiness: 1, Speed: 1},
}

func (toy) Name() string                        { return "hoogste kaart" }
func (toy) Seats() (int, int, int)              { return 2, 3, 2 }
func (toy) Personas() []server.Persona          { return slices.Clone(toyPersonas) }
func (toy) NewOptions() server.GameOptions      { return &toyOpts{Rounds: 2} }
func (toy) NewBrain(string, string, uint64) any { return toyBrain{} }
func (toy) New(t *server.Table) server.Play     { return &toyPlay{t: t} }

func (toy) Chat(id string, ev server.ChatEvent, rng *rand.Rand) string {
	if ev.Kind == "greet" {
		return "Hallo, ik ben " + id + "."
	}
	return ""
}

type toyOpts struct{ Rounds int }

func (o *toyOpts) Set(fields map[string]json.RawMessage, lenient bool) error {
	v, ok := fields["rounds"]
	if !ok {
		return nil
	}
	var n int
	if json.Unmarshal(v, &n) != nil || n < 1 || n > 3 {
		if lenient {
			return nil
		}
		return errors.New("Speel 1, 2 of 3 rondes.")
	}
	o.Rounds = n
	return nil
}

type toyWire struct {
	Players int    `json:"players"`
	AI      string `json:"ai"`
	Tempo   string `json:"tempo"`
	Seed    int    `json:"seed"`
	Rounds  int    `json:"rounds"`
}

func (o *toyOpts) Wire(t server.TableOpts) any {
	return toyWire{Players: t.Players, AI: t.AI, Tempo: t.Tempo, Seed: t.Seed, Rounds: o.Rounds}
}

// toyBrain lays its card: there is nothing else to do.
type toyBrain struct{}

func (toyBrain) play(c cards.Card) cards.Card { return c }

const stepShow server.Step = 1 // the round's cards lie open

type toyPlay struct {
	t      *server.Table
	round  int
	hands  []cards.Card // this round's card per seat
	table  []cards.Played
	turn   cards.Seat
	points []int
}

type toyState struct {
	server.Shared
	Round  int            `json:"round"`
	Hand   []cards.Card   `json:"hand"`
	Table  []cards.Played `json:"table"`
	Points []int          `json:"points"`
	Winner int            `json:"winner"`
}

type toyEv struct {
	Type   string     `json:"type"`
	Seat   cards.Seat `json:"seat"`
	Card   cards.Card `json:"card"`
	Winner cards.Seat `json:"winner"`
}

func (p *toyPlay) rounds() int { return p.t.Options().(*toyOpts).Rounds }

func (p *toyPlay) Start() {
	p.points = make([]int, p.t.Players())
	p.t.SysChat("Hoogste kaart begint: %d rondes.", p.rounds())
	p.t.Later(p.t.Pace().Deal, func() { p.t.SysChat("Succes!") })
	p.deal()
}

func (p *toyPlay) deal() {
	n := p.t.Players()
	p.round++
	p.t.SetHand(p.round)
	deck := cards.NewDeck()
	p.t.Deals().Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
	p.hands, p.table = deck[:n], []cards.Played{}
	p.turn = cards.Seat((p.round - 1) % n)
	p.t.SetPhase("play")
	p.t.OpenTurn()
	p.t.Emit(toyEv{Type: "deal", Seat: p.turn})
}

func (p *toyPlay) Turn() cards.Seat {
	if p.hands == nil || len(p.table) == len(p.hands) {
		return cards.NoSeat
	}
	return p.turn
}

func (p *toyPlay) laid(i cards.Seat) bool {
	return slices.ContainsFunc(p.table, func(c cards.Played) bool { return c.Seat == i })
}

func (p *toyPlay) HandLen(i cards.Seat) int {
	if p.hands == nil || p.laid(i) {
		return 0
	}
	return 1
}

func (p *toyPlay) State(i cards.Seat) any {
	s := toyState{Shared: p.t.Shared(i), Round: p.round, Hand: []cards.Card{}, Table: p.table, Points: p.points, Winner: -1}
	if s.Table == nil {
		s.Table = []cards.Played{}
	}
	if s.Points == nil {
		s.Points = make([]int, p.t.Players())
	}
	if p.t.InHand() && !p.laid(i) {
		s.Hand = []cards.Card{p.hands[i]}
	}
	if s.Phase == "gameOver" {
		s.Winner = top(p.points)
	}
	return s
}

func (p *toyPlay) Move(i cards.Seat, m server.Msg) error {
	if m.T != "play" {
		return server.ErrUnknownMsg
	}
	var b struct{ Card string }
	json.Unmarshal(m.Raw, &b)
	c, err := cards.ParseCard(b.Card)
	if err != nil {
		return errors.New("Die kaart bestaat niet.")
	}
	return p.Apply(i, c)
}

func (p *toyPlay) Decision(i cards.Seat, brain any) (func() any, any) {
	c := p.hands[i]
	return func() any { return brain.(toyBrain).play(c) }, c
}

func (p *toyPlay) Apply(i cards.Seat, a any) error {
	c, _ := a.(cards.Card)
	switch {
	case !p.t.InHand() || p.hands == nil:
		return errors.New("Dat kan nu niet.")
	case p.t.Pending() != 0:
		return server.ErrPaused
	case i != p.Turn():
		return server.NotYourTurn(errors.New("Wacht op je beurt."))
	case c != p.hands[i]:
		return errors.New("Die kaart heb je niet.")
	}
	p.table = append(p.table, cards.Played{Seat: i, Card: c})
	ev := toyEv{Type: "play", Seat: i, Card: c, Winner: cards.NoSeat}
	if len(p.table) < len(p.hands) {
		p.turn = (p.turn + 1) % cards.Seat(len(p.hands))
		p.t.OpenTurn()
		p.t.Emit(ev)
		return nil
	}
	p.t.Trick()
	p.t.Pause(stepShow, p.t.Pace().Trick)
	p.t.Emit(ev)
	return nil
}

func (p *toyPlay) Single() bool { return true }

func (p *toyPlay) Resume(s server.Step) {
	if s != stepShow {
		return
	}
	w := p.table[0]
	for _, c := range p.table[1:] {
		if c.Card.Rank > w.Card.Rank || c.Card.Rank == w.Card.Rank && c.Card.Suit > w.Card.Suit {
			w = c
		}
	}
	p.points[w.Seat]++
	p.t.BotSay(w.Seat, server.ChatEvent{Kind: "wonRound", Mine: true}, time.Millisecond)
	p.t.Summary(toyEv{Type: "handEnd", Seat: w.Seat, Card: w.Card, Winner: w.Seat}, p.t.Pace().Summary)
}

func (p *toyPlay) Next() {
	if p.round < p.rounds() {
		p.deal()
		return
	}
	p.t.GameOver(p.points, top(p.points))
}

func (p *toyPlay) Variant() string { return "hoogste kaart" }

// top is the seat with the most points, -1 for a draw.
func top(points []int) int {
	best, shared := -1, false
	for k, n := range points {
		switch {
		case best < 0 || n > points[best]:
			best, shared = k, false
		case n == points[best]:
			shared = true
		}
	}
	if shared {
		return -1
	}
	return best
}

var toyKeys = append(slices.Clone(servertest.SharedKeys), "round", "hand", "table", "points", "winner")

// decodeToy decodes the toy state of an update.
func decodeToy(t *testing.T, m *servertest.Msg) toyState {
	t.Helper()
	var s toyState
	if err := json.Unmarshal(m.S, &s); err != nil {
		t.Fatalf("bad state %s: %v", m.S, err)
	}
	return s
}

// playToy plays the started match of h (and g, another human at the
// table, or nil) to game over, checking every state of h; it returns the
// last one and the events seen.
func playToy(t *testing.T, h, g *servertest.Client) (toyState, map[string]int) {
	t.Helper()
	events := map[string]int{}
	acted := map[int]int{} // seat → the seq of the update it last played on
	for {
		m := h.Next(5 * time.Second)
		if m.T == "error" {
			t.Fatalf("error %s: %s", m.Code, m.ErrMsg())
		}
		if _, _, text, _, sys := m.Chat(); m.T == "chat" && sys && text == "Succes!" {
			events["later"]++ // Table.Later
		}
		if m.T != "update" {
			continue
		}
		events[m.EvType()]++
		s := decodeToy(t, m)
		if want := slices.Clone(toyKeys); s.Phase == "lobby" {
			servertest.WantKeys(t, s.Phase, m.S, append(want, "roster"))
		} else {
			servertest.WantKeys(t, s.Phase, m.S, want)
		}
		if s.Phase == "gameOver" {
			if g != nil {
				g.Until(5*time.Second, "game over", func(m *servertest.Msg) bool {
					return m.T == "update" && decodeToy(t, m).Phase == "gameOver"
				})
			}
			return s, events
		}
		switch {
		case s.Turn == s.You && len(s.Hand) == 1 && acted[s.You] < m.Seq:
			acted[s.You] = m.Seq
			h.Send(map[string]any{"t": "play", "card": s.Hand[0].String()})
		case g != nil && s.Turn == g.Seat && acted[g.Seat] < m.Seq:
			gm := g.Until(5*time.Second, "Kees's turn", func(gm *servertest.Msg) bool {
				if gm.T != "update" || gm.Seq < m.Seq {
					return false
				}
				gs := decodeToy(t, gm)
				return gs.Turn == gs.You && len(gs.Hand) == 1
			})
			acted[g.Seat] = gm.Seq
			g.Send(map[string]any{"t": "play", "card": decodeToy(t, gm).Hand[0].String()})
		}
	}
}

// TestToyGame plays a match of the toy game: two humans and a bot.
func TestToyGame(t *testing.T) {
	srv := servertest.Start(t, toy{})
	h := srv.Dial()
	h.Create("Jaap", map[string]any{"players": 3, "rounds": 3, "hands": 8, "seed": 7}, false)
	servertest.WantKeys(t, "lobby", h.State, append(slices.Clone(toyKeys), "roster"))
	servertest.WantKeys(t, "opts", servertest.Field(t, h.State, "opts"), []string{"players", "ai", "tempo", "seed", "rounds"})
	var s toyState
	json.Unmarshal(h.State, &s)
	if len(s.Players) != 3 || s.Phase != "lobby" || len(s.Roster) != 3 || s.Turn != -1 {
		t.Fatalf("lobby: %s", h.State)
	}
	g := srv.Dial()
	g.Join(h.Code, "Kees", "")
	h.Send(map[string]any{"t": "start"})
	over, events := playToy(t, h, g)
	if sum(over.Points) != 3 || over.Round != 3 || over.Winner != top(over.Points) {
		t.Errorf("game over: %+v", over)
	}
	for _, ev := range []string{"deal", "play", "handEnd", "gameOver", "later"} {
		if events[ev] == 0 {
			t.Errorf("no event %s: %v", ev, events)
		}
	}
	// A rematch is a new match: points from 0.
	h.Send(map[string]any{"t": "rematch"})
	m := h.WaitEvent("deal")
	if s := decodeToy(t, m); s.Round != 1 || sum(s.Points) != 0 {
		t.Errorf("rematch: %s", m.S)
	}
}

func sum(xs []int) (n int) {
	for _, x := range xs {
		n += x
	}
	return n
}

// TestToyMessages: the table's messages and options around the toy game,
// and the errors of its own.
func TestToyMessages(t *testing.T) {
	srv := servertest.Start(t, toy{})
	h := srv.Dial()
	// Training is klaverjas's: the ordinary game; bad values are skipped.
	h.Create("Jaap", map[string]any{"players": 9, "rounds": 9, "tempo": "snel"}, false, map[string]any{"training": true})
	var s toyState
	json.Unmarshal(h.State, &s)
	if len(s.Players) != 2 || string(servertest.Field(t, h.State, "opts")) != `{"players":2,"ai":"normaal","tempo":"snel","seed":0,"rounds":2}` {
		t.Fatalf("lenient create: %s", servertest.Field(t, h.State, "opts"))
	}
	for _, tc := range []struct {
		opts map[string]any
		want string
	}{
		{map[string]any{"players": 4}, "Kies 2 tot en met 3 spelers."},
		{map[string]any{"players": 1}, "Kies 2 tot en met 3 spelers."},
		{map[string]any{"rounds": 0, "players": 3}, "Speel 1, 2 of 3 rondes."}, // all or nothing
		{map[string]any{"ai": "geweldig", "rounds": 1}, "Onbekend niveau voor de AI."},
	} {
		h.Send(map[string]any{"t": "opts", "opts": tc.opts})
		if m := h.WaitError("ongeldig"); m.ErrMsg() != tc.want {
			t.Errorf("opts %v: %q, want %q", tc.opts, m.ErrMsg(), tc.want)
		}
	}
	h.Send(map[string]any{"t": "play", "card": "AS"})
	if m := h.WaitError("ongeldig"); m.ErrMsg() != "Dat kan nu niet." {
		t.Errorf("play in the lobby: %q", m.ErrMsg())
	}
	h.Send(map[string]any{"t": "opts", "opts": map[string]any{"players": 3, "rounds": 1, "trumpMode": "gedraaid"}})
	m := h.WaitEvent("lobby")
	if string(servertest.Field(t, m.S, "opts")) != `{"players":3,"ai":"normaal","tempo":"snel","seed":0,"rounds":1}` {
		t.Errorf("opts: %s", servertest.Field(t, m.S, "opts"))
	}
	for _, typ := range []string{"trump", "why", "handReview", "tipRead", "feedback", "toep"} {
		h.Send(map[string]any{"t": typ, "suit": "H"})
		if m := h.WaitError("ongeldig"); m.ErrMsg() != "Dat bericht ken ik niet." {
			t.Errorf("%s: %q", typ, m.ErrMsg())
		}
	}
	g := srv.Dial()
	g.Join(h.Code, "Kees", "")
	h.Send(map[string]any{"t": "start"})
	m = g.WaitEvent("deal")
	s = decodeToy(t, m)
	if s.Phase != "play" || len(s.Hand) != 1 || !s.Players[2].Bot || s.Turn != 0 {
		t.Fatalf("started: %s", m.S)
	}
	g.Send(map[string]any{"t": "play", "card": s.Hand[0].String()})
	if m := g.WaitError("niet-jouw-beurt"); m.ErrMsg() != "Wacht op je beurt." {
		t.Errorf("not my turn: %q", m.ErrMsg())
	}
	g.Send(map[string]any{"t": "play", "card": "nee"})
	if m := g.WaitError("ongeldig"); m.ErrMsg() != "Die kaart bestaat niet." {
		t.Errorf("no card: %q", m.ErrMsg())
	}
	over, _ := playToy(t, h, g)
	if sum(over.Points) != 1 {
		t.Errorf("one round, points %v", over.Points)
	}
}
