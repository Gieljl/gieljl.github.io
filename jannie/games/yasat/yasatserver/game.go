// Package yasatserver is Yasat (games/yasat/README.md) as a game for
// package server: its options, the rounds at the table, the bots'
// decisions, the ace choices at the end of a round, and the state and
// events on the wire. The rules are package yasat's, the bots package
// yasatbot's.
package yasatserver

import (
	"encoding/json"
	"errors"
	"math/rand/v2"
	"time"

	"jannie/games/yasat/yasatbot"
	"jannie/platform/persona"
	"jannie/platform/server"
)

// New returns Yasat for server.Config.Game.
func New() server.Game { return game{} }

type game struct{}

func (game) Name() string                    { return "yasat" }
func (game) Seats() (int, int, int)          { return 2, 6, 4 }
func (game) NewOptions() server.GameOptions  { return &Options{Length: "bo10"} }
func (game) New(t *server.Table) server.Play { return &play{t: t} }

func (game) Personas() []server.Persona {
	var out []server.Persona
	for _, p := range persona.All() {
		out = append(out, server.Persona{ID: p.ID, Name: p.Name, Emoji: p.Emoji, Color: p.Color, Bio: bios[p.ID],
			Chattiness: p.Chattiness, Speed: p.Speed})
	}
	return out
}

var bios = map[string]string{
	"dirk":   "Speelt al zestig jaar kaart en gooit nooit te vroeg Yasat. Voorzichtig.",
	"truus":  "Houdt van een praatje en van een nette, lage hand.",
	"sjaak":  "Roept Yasat zodra het mag, en soms net te vroeg. Een gokker.",
	"fatima": "Telt mee wat er weggegooid wordt en jaagt op kills en nullifies.",
	"kees":   "Geduldig als aan de waterkant: pakt liever van de stapel.",
	"jannie": "Speelt rustig en evenwichtig, en legt graag uit waarom.",
	"bram":   "Snel, los en niet bang voor een Owned.",
	"vera":   "Pakt graag van de aflegstapel en durft te roepen.",
}

func (game) NewBrain(personaID, level string, seed uint64) any {
	return yasatbot.New(yasatbot.PersonalityOf(personaID), yasatbot.ParseLevel(level), seed)
}

func (game) Chat(personaID string, ev server.ChatEvent, rng *rand.Rand) string {
	p, ok := persona.ByID(personaID)
	if !ok || rng.Float64() > p.Chattiness {
		return ""
	}
	lines := chatLines[ev.Kind]
	if ev.Kind == "greet" {
		return lines[rng.IntN(len(lines))]
	}
	if !ev.Mine {
		lines = chatLines[ev.Kind+"/opp"]
	}
	if len(lines) == 0 {
		return ""
	}
	return lines[rng.IntN(len(lines))]
}

var chatLines = map[string][]string{
	"greet":       {"Hoi allemaal!", "Zin in een potje Yasat.", "Daar gaan we.", "Succes!"},
	"reply":       {"Haha.", "Zeker.", "Let maar op je punten.", "We zien het wel."},
	"yasat":       {"Yasat!", "Lekker laag.", "Die was binnen."},
	"yasat/opp":   {"Goed geroepen.", "Mooi gespeeld.", "Hmm, die zag ik niet aankomen."},
	"owned":       {"Au. Te vroeg geroepen.", "Daar ging ik.", "Pfff, owned."},
	"owned/opp":   {"Owned!", "Te gretig!", "Haha, die is voor mij."},
	"death":       {"Over de honderd... weer op nul.", "Dood. Opnieuw beginnen."},
	"death/opp":   {"Daar gaat er een.", "Kill!"},
	"nullify":     {"Precies raak: weer op nul.", "Nullify, lekker."},
	"nullify/opp": {"Mooi uitgekomen.", "Dat was geluk."},
}

// ---- options ----

// Options are Yasat's own: how long a game lasts.
type Options struct {
	Length string // bo10: ten rounds; first10: until a weighted score of 10; classic: no end
}

// Set reads length (server.GameOptions).
func (o *Options) Set(fields map[string]json.RawMessage, lenient bool) error {
	v, ok := fields["length"]
	if !ok {
		return nil
	}
	var s string
	if json.Unmarshal(v, &s) != nil || s != "bo10" && s != "first10" && s != "classic" {
		if lenient {
			return nil
		}
		return errors.New("Kies 10 rondes, tot 10 punten of eindeloos.")
	}
	o.Length = s
	return nil
}

type wireOpts struct {
	Players int    `json:"players"`
	AI      string `json:"ai"`
	Tempo   string `json:"tempo"`
	Seed    int    `json:"seed"`
	Length  string `json:"length"`
}

// Wire is the options on the wire (server.GameOptions).
func (o *Options) Wire(t server.TableOpts) any {
	return wireOpts{Players: t.Players, AI: t.AI, Tempo: t.Tempo, Seed: t.Seed, Length: o.Length}
}

// The pauses of a round (server.Step).
const (
	stepDealt server.Step = iota + 1 // the deal animation, then the first turn
	stepAces                         // after a call: the time to choose the aces
)

// acesTime is how long the players with aces have to choose; then the
// best choice is made for whoever did not.
const acesTime = 25 * time.Second
