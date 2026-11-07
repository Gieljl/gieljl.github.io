package server

import (
	"encoding/json"

	"jannie/platform/cards"
)

// inMsg is any client message; the fields used depend on T
// (docs/protocol.md#client--server,
// games/klaverjas/README.md#client--server).
type inMsg struct {
	T        string          `json:"t"`
	Name     string          `json:"name"`
	Opts     json.RawMessage `json:"opts"`
	Training bool            `json:"training"`
	Expert   bool            `json:"expert"`
	Start    bool            `json:"start"`
	Code     string          `json:"code"`
	Token    string          `json:"token"`
	Seat     *int            `json:"seat"` // also create (expert): the seat to sit at, 0–3
	ID       string          `json:"id"`   // bot: the persona; call: the call session ("" hangs up)
	Suit     string          `json:"suit"`
	Play     *bool           `json:"play"`
	Bid      *int            `json:"bid"`
	Cards    []string        `json:"cards"`
	Card     string          `json:"card"`
	Text     string          `json:"text"`
	AI       *bool           `json:"ai"`
	Left     *bool           `json:"left"`  // vote, optional: the question it answers is about a seat its player left
	Hand     *int            `json:"hand"`  // why, feedback, handReview: the hand (its number)
	Trick    *int            `json:"trick"` // why, feedback: the trick (1–8; 0: the trump choice or bid)
	N        *int            `json:"n"`     // tipRead: the lesson step read (klaverjas_lesson.go)
	Mic      *bool           `json:"mic"`   // call: the microphone is on
	Cam      *bool           `json:"cam"`   // call: the camera is on
	To       string          `json:"to"`    // rtc: the call session it is for
	Desc     *rtcDesc        `json:"desc"`  // rtc: the session description (call.go)

	raw json.RawMessage // the message as it came in: another game reads its own fields (Msg)
}

// Error codes on the wire.
const (
	errUnknown    = "onbekend"
	errFull       = "vol"
	errStarted    = "gestart"
	errNotHost    = "geen-host"
	errNotTurn    = "niet-jouw-beurt"
	errInvalid    = "ongeldig"
	errLimit      = "limiet"
	errTooMany    = "te-veel-spellen"
	errRestarting = "herstart"
)

type errorMsg struct {
	T    string `json:"t"`
	Code string `json:"code"`
	Msg  string `json:"msg"`
}

type joinedMsg struct {
	T     string `json:"t"`
	Code  string `json:"code"`
	Seat  int    `json:"seat"`
	Token string `json:"token"`
}

type updateMsg struct {
	T   string `json:"t"`
	Seq int    `json:"seq"`
	Ev  any    `json:"ev"`
	S   any    `json:"s"` // klaverjas: *state; another game: its Play.State
}

type chatMsg struct {
	Seat int    `json:"seat"`
	Name string `json:"name"`
	Text string `json:"text"`
	TS   int64  `json:"ts"`
	Bot  bool   `json:"bot"`
	Sys  bool   `json:"sys"`
	// Coach: training, a line of Juf Jannie that the coach bubble shows (a
	// lesson step or the explanation of a trick), not a speech bubble.
	Coach bool `json:"coach,omitempty"`
}

type chatOut struct {
	T   string  `json:"t"`
	Msg chatMsg `json:"msg"`
}

type chatlogMsg struct {
	T    string    `json:"t"`
	Msgs []chatMsg `json:"msgs"`
}

// refusedMsg tells the host that name could not join: the table is full.
type refusedMsg struct {
	T    string `json:"t"`
	Name string `json:"name"`
}

// rtcOut passes a session description on from one call session to
// another (call.go).
type rtcOut struct {
	T    string   `json:"t"` // "rtc"
	From string   `json:"from"`
	Seat int      `json:"seat"`
	Desc *rtcDesc `json:"desc"`
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic("server: marshal: " + err.Error())
	}
	return b
}

func errorJSON(code, msg string) []byte {
	return mustJSON(errorMsg{T: "error", Code: code, Msg: msg})
}

var pongJSON = []byte(`{"t":"pong"}`)

// Events (ev.type), one struct per kind so zero values are always written.

type evLobby struct {
	Type string `json:"type"`
}

type evGameOver struct {
	Type   string `json:"type"`
	Total  []int  `json:"total"`
	Winner int    `json:"winner"`
}

// evSeat is join, leave, away, back and takeover, and with three players
// discard.
type evSeat struct {
	Type string     `json:"type"`
	Seat cards.Seat `json:"seat"`
}

type rosterEntry struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Emoji string `json:"emoji"`
	Color string `json:"color"`
	Bio   string `json:"bio"`
}

type playerState struct {
	Name      string     `json:"name"`
	Bot       bool       `json:"bot"`
	BotID     string     `json:"botId"`
	Emoji     string     `json:"emoji"`
	Color     string     `json:"color"`
	Connected bool       `json:"connected"`
	Away      bool       `json:"away"`
	Left      bool       `json:"left"`
	Vote      *bool      `json:"vote"`
	Call      *callState `json:"call"`
	Cards     int        `json:"cards"`
	Ready     bool       `json:"ready"`
}

// takeoverState is the question to the table: may an AI play the seat the
// game waits for? Left: its player left (else they dropped out).
type takeoverState struct {
	Seat cards.Seat `json:"seat"`
	Left bool       `json:"left"`
}
