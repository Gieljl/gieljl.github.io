package server

import (
	crand "crypto/rand"
	"encoding/binary"
	"math/rand/v2"
	"time"

	"jannie/platform/cards"
)

// maxSeed bounds a seed someone types (option seed) and every seed drawn,
// so the Spelanalyse shows a number of at most nine digits.
const maxSeed = 999_999_999

// newSeed draws the seed of a match without a fixed one.
func newSeed() uint64 {
	var b [8]byte
	crand.Read(b[:])
	return binary.LittleEndian.Uint64(b[:])%maxSeed + 1
}

// dealRNG is the stream every deal of a match is drawn from: the first
// dealer, the cards and the turned suit, nothing else. So the same seed and
// options give the same cards, whatever the players do
// (docs/server.md#the-seed).
func dealRNG(seed uint64) *rand.Rand {
	return rand.New(rand.NewPCG(seed, seed^0x6b6c61766572))
}

// nameSeed puts the seed of the match in the chat at game over. Not
// before: who knows it can deal the same cards in a game of their own and
// see every hand of this one (docs/server.md#the-seed).
func (r *room) nameSeed() {
	r.sysChat("De seed van dit spel was %d.", r.seed)
}

// logPlayerAt is who sits at seat i now.
func (r *room) logPlayerAt(i cards.Seat) logPlayer {
	st := &r.seats[i]
	p := logPlayer{Seat: int(i), Name: r.displayName(i)}
	switch {
	case st.kind == seatBot:
		p.Bot, p.Level = st.persona.ID, r.opts.AI
	case st.away && st.client == nil:
		p.Bot, p.Level = "invaller", "normaal" // an AI plays for the absent player (see decide)
	case st.client != nil:
		p.IP, p.Device = st.client.ip, st.client.device
	}
	return p
}

// logMatch records a match that starts, with the version of the server,
// its seed and players.
func (r *room) logMatch() {
	if r.x != nil {
		rec := logGameMatch{T: "match", Match: r.matchID, Room: r.code, At: time.Now().UTC(), Version: r.srv.cfg.Version,
			Game: r.x.g.Name(), Seed: r.seed, Opts: r.x.wire()}
		for i := range r.players() {
			rec.Players = append(rec.Players, r.logPlayerAt(cards.Seat(i)))
		}
		r.srv.games.write(rec)
		return
	}
	r.logMatchKlaverjas()
}

// logSeat records that seat i changed hands during the match.
func (r *room) logSeat(i cards.Seat) {
	if r.matchID == "" || r.phase == phaseLobby {
		return
	}
	r.srv.games.write(logSeat{T: "seat", Match: r.matchID, At: time.Now().UTC(), Hand: r.handNo, Player: r.logPlayerAt(i)})
}

// logEnd records the end of the match.
func (r *room) logEnd() {
	r.srv.games.write(logEnd{T: "end", Match: r.matchID, At: time.Now().UTC(), Total: r.total, Winner: r.winner})
}

// logClose records a room that goes before its match is over.
func (r *room) logClose(reason string) {
	if r.matchID == "" || r.phase == phaseLobby || r.phase == phaseGameOver {
		return
	}
	r.srv.games.write(logClose{T: "close", Match: r.matchID, At: time.Now().UTC(), Hand: r.handNo, Reason: reason})
}
