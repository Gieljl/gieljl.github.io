package server

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
	"time"

	"jannie/platform/cards"
)

// The API a game other than klaverjas plays on
// (docs/server.md#the-game-api). The server is the table: codes and links,
// seats and the lobby, bots and their chat, calls, reconnects, the
// question whether an AI may play for someone who is gone, pacing, the
// hand summary, game over, the game log and the limits. The game brings
// its rules (Play), its options (GameOptions), its bots (NewBrain, Chat)
// and its personas. One server plays one game: Config.Game.

// Game is a card game the server can play.
type Game interface {
	// Name is the game's name in logs ("toepen").
	Name() string
	// Seats is the smallest and the largest table, and the table a new
	// room starts with; at most 8.
	Seats() (min, max, def int)
	// Personas are the bots that can sit at the table, with the game's
	// bios; at least max seats − 1 (New panics otherwise).
	Personas() []Persona
	// NewOptions returns the game's own options at their defaults; the
	// table keeps one per room.
	NewOptions() GameOptions
	// NewBrain returns the decisions of one bot seat: a persona at level
	// "makkelijk", "normaal" or "sterk"; personaID "" asks for the neutral
	// substitute of a human who dropped out, once the others agreed. The
	// table hands it back to Play.Decision and Table.Think, one call at a
	// time.
	NewBrain(personaID, level string, seed uint64) any
	// Chat is a line of the persona about ev, "" for silence.
	Chat(personaID string, ev ChatEvent, rng *rand.Rand) string
	// New returns the play of one match at table t. The table asks for a
	// fresh one when a room opens and when it goes back to the lobby (only
	// State is called then) and for every match it starts (Start, then the
	// rest).
	New(t *Table) Play
}

// GameOptions are the game's own options of a room. The table reads the
// options every game has: players, ai, tempo and seed (TableOpts).
type GameOptions interface {
	// Set applies the game's keys of fields and ignores the others. Unless
	// lenient (create: stale settings must not block a new game, so bad
	// values are skipped) it is all or nothing: the first bad value is an
	// error with a Dutch message and nothing changes.
	Set(fields map[string]json.RawMessage, lenient bool) error
	// Wire is the flat options object of the state's opts and of the game
	// log's match record: the table's options and the game's.
	Wire(TableOpts) any
}

// TableOpts are the options every game has (docs/server.md#table-options).
type TableOpts struct {
	Players int    // the seats at the table
	AI      string // the bots' level: makkelijk, normaal or sterk
	Tempo   string // rustig, normaal or snel (Pace)
	Seed    int    // 1..999999999: every match deals the same cards; 0: a new seed per match
}

// Play is one match of a game at a table. Every method runs on the room
// goroutine; the table drives the match (bots, pauses, the question about
// an absent player) after every call.
type Play interface {
	// Start deals the first hand: the seats are filled and the match's
	// seed drawn (Table.Deals); the table has written the game log's match
	// record.
	Start()
	// Turn is the seat whose decision the match waits for, NoSeat when it
	// waits for nobody in particular (a pause, or everyone at once).
	Turn() cards.Seat
	// HandLen is the number of cards seat i holds (players[i].cards).
	HandLen(i cards.Seat) int
	// State is the full state `s` of an update for seat i: Table.Shared
	// embedded, and the game's own keys.
	State(i cards.Seat) any
	// Move handles a message of the human at seat i that is none of the
	// table's. It returns ErrUnknownMsg for none of the game's either,
	// ErrIgnore for one to drop without a reply (a late tap), an error
	// marked NotYourTurn or ErrPaused (niet-jouw-beurt), or another error
	// whose text goes back as ongeldig.
	Move(i cards.Seat, m Msg) error
	// Decision is the decision of the bot (or substitute) at seat i on its
	// turn: think works it out off the room goroutine with brain (it must
	// not touch the match), and safe is a legal one, played when think
	// panics or its answer is refused by Apply.
	Decision(i cards.Seat, brain any) (think func() any, safe any)
	// Apply plays a decision of Decision for seat i.
	Apply(i cards.Seat, a any) error
	// Single reports whether the decision on turn has one option: a bot
	// then thinks shorter.
	Single() bool
	// Resume goes on after the game's pause s (Table.Pause).
	Resume(s Step)
	// Next deals the next hand after the summary (Table.Summary), or ends
	// the match (Table.GameOver).
	Next()
	// Variant names the game and its options, for the server log.
	Variant() string
}

// Msg is a message of a player to the game: its type and the whole
// message as it came in, to read the game's own fields from.
type Msg struct {
	T   string
	Raw json.RawMessage
}

// Step names a pause of the game (Table.Pause); the game numbers its own
// from 1.
type Step uint8

// Pace is the unscaled delays of a tempo (docs/server.md#pacing): a bot's
// think time, the deal, an announcement, a completed trick and the hand
// summary.
type Pace struct {
	Think, Deal, Announce, Trick, Summary time.Duration
}

var (
	// ErrUnknownMsg is Play.Move's answer to a message that is none of
	// the game's: "Dat bericht ken ik niet."
	ErrUnknownMsg = errors.New("Dat bericht ken ik niet.")
	// ErrIgnore is Play.Move's answer to a message dropped without a
	// reply.
	ErrIgnore = errors.New("ignored")
	// ErrPaused is the answer to a decision during a pause.
	ErrPaused = errPaused
	// ErrNotYourTurn marks the errors of NotYourTurn.
	ErrNotYourTurn = errors.New("Je bent niet aan de beurt.")
)

// NotYourTurn marks err as a decision of a player whose turn it is not:
// it goes back as niet-jouw-beurt with err's text.
func NotYourTurn(err error) error { return notYourTurn{err} }

type notYourTurn struct{ err error }

func (e notYourTurn) Error() string        { return e.err.Error() }
func (e notYourTurn) Unwrap() error        { return e.err }
func (e notYourTurn) Is(target error) bool { return target == ErrNotYourTurn }

// Shared is the part of the state `s` every game shares
// (docs/protocol.md#the-shared-state): the room's code, phase and options,
// the seat it is for, the host, the bots to choose from (lobby), the
// players, whose turn it is (-1: nobody's, or a pause), the question about
// an absent player, and when the hand summary moves on (unix ms; 0: it
// waits for ready). A game embeds it in its state; it may set NextAt for a
// countdown of its own.
type Shared struct {
	Code     string         `json:"code"`
	Phase    string         `json:"phase"`
	Opts     any            `json:"opts"`
	You      int            `json:"you"`
	Host     int            `json:"host"`
	Roster   []rosterEntry  `json:"roster,omitempty"`
	Players  []*playerState `json:"players"`
	Turn     int            `json:"turn"`
	Takeover *takeoverState `json:"takeover"`
	NextAt   int64          `json:"nextAt"`
}

// maxTable is the largest table of any game (Game.Seats).
const maxTable = 8

// TestMode multiplies every game delay by scale and lifts the limits on
// messages and joins per connection, for test clients that act at many
// times the normal pace (servertest). Call it before Handler.
func (s *Server) TestMode(scale float64) {
	s.scale = scale
	s.msgRate = 1000
	s.joinRate, s.joinBurst = 1000, 1000
}
