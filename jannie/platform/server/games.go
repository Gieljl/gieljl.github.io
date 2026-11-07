package server

import "jannie/platform/cards"

// A server plays one game (Config.Game). The room is the table every game
// shares: codes and links, seats and the lobby, bots, chat, calls,
// reconnects, the question whether an AI may play for someone who is gone,
// pacing and limits. The game on it is a gameplay: klaverjas, built in on
// the match code of the klaverjas_*.go files (adapted in klaverjas_game.go),
// or a game on the exported API (api.go), adapted by extPlay (ext.go).

// gameplay is what the table needs from the game on it. Every method runs
// on the room goroutine.
type gameplay interface {
	// start deals the first hand of a match; the seats are filled and the
	// match's seed drawn (r.deals).
	start()
	// lobby is the table back in the lobby after a match (cmdLobby).
	lobby()
	// turn is the seat whose decision the game waits for, NoSeat when it
	// waits for nobody in particular (a pause, or everyone at once).
	turn() cards.Seat
	// handLen is the number of cards seat i holds, for players[i].cards.
	handLen(i cards.Seat) int
	// state is the full state `s` of an update for seat i.
	state(i cards.Seat) any
	// move handles a message of the human at seat i that belongs to the
	// game; false when m is none of its messages.
	move(c *client, i cards.Seat, m *inMsg) bool
	// decision is the decision of the bot (or substitute) at seat i for
	// this turn, to work out in the background with bb (it must not touch
	// the room), and a safe one for when that comes out illegal.
	decision(i cards.Seat, bb *brainBox) (think func() any, safe any)
	// apply plays decision a of the bot at seat i.
	apply(i cards.Seat, a any) error
	// single reports whether the decision on turn has one option: the bot
	// then thinks shorter.
	single() bool
	// resume goes on after the pause s (runPending).
	resume(s step)
	// next deals the next hand after the summary, or ends the match.
	next()
}
