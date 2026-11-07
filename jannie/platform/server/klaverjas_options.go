package server

import (
	"encoding/json"
	"errors"

	"jannie/games/klaverjas/game"
)

// Options are the room settings chosen by the host
// (games/klaverjas/README.md#options).
type Options struct {
	Players   int            `json:"players"`
	Hands     int            `json:"hands"`
	TrumpMode game.TrumpMode `json:"trumpMode"`
	Rules     game.Rules     `json:"rules"`
	AI        string         `json:"ai"`
	Tempo     string         `json:"tempo"`
	Open      bool           `json:"open"`
	Lesson    string         `json:"lesson"`  // training: the lesson Juf Jannie gives (klaverjas_lesson.go); "": vrij spelen
	Tips      bool           `json:"tips"`    // training: a hint on every turn and an explanation after every trick
	Signals   game.Signals   `json:"signals"` // the table's agreements on signals (games/klaverjas/README.md#seinen-signals)
	Seed      int            `json:"seed"`    // 1..maxSeed: every match deals the same cards; 0: a new seed per match
	From      int            `json:"from"`    // expert: 1..maxHands: the match is that one hand of the seed's deals; 0: the whole match
}

func defaultOptions() Options {
	return Options{
		Players:   4,
		Hands:     16,
		TrumpMode: game.Utrechts,
		Rules:     game.Amsterdams,
		AI:        "normaal",
		Tempo:     "normaal",
		Tips:      true,
		Signals:   game.DefaultSignals,
	}
}

// maxHands is the longest match (option hands), and so the last hand that
// option from can name.
const maxHands = 24

var (
	validHands   = map[int]bool{4: true, 8: true, 12: true, 16: true, 20: true, 24: true}
	validLevels  = map[string]bool{"makkelijk": true, "normaal": true, "sterk": true}
	validLessons = map[string]bool{"": true, planBasis: true, planRoem: true, planSeinen: true}
)

// optsPatch is a partial options update; nil fields are unchanged.
type optsPatch struct {
	Players   *int
	Hands     *int
	TrumpMode *game.TrumpMode
	Rules     *game.Rules
	AI        *string
	Tempo     *string
	Open      *bool
	Lesson    *string
	Tips      *bool
	Signals   *game.Signals
	Seed      *int
	From      *int
}

// parseOpts reads a partial options object. With lenient, invalid values
// are skipped (create: stale settings must not block a new game); otherwise
// the first invalid value is an error with a Dutch message.
func parseOpts(raw json.RawMessage, lenient bool) (optsPatch, error) {
	var p optsPatch
	if len(raw) == 0 || string(raw) == "null" {
		return p, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		if lenient {
			return p, nil
		}
		return p, errors.New("Ongeldige spelregels.")
	}
	fail := func(msg string) error {
		if lenient {
			return nil
		}
		return errors.New(msg)
	}
	for key, val := range fields {
		var err error
		switch key {
		case "players":
			var n int
			if json.Unmarshal(val, &n) != nil || n < 2 || n > 4 {
				err = fail("Kies 2, 3 of 4 spelers.")
			} else {
				p.Players = &n
			}
		case "hands":
			var n int
			if json.Unmarshal(val, &n) != nil || !validHands[n] {
				err = fail("Kies 4, 8, 12, 16, 20 of 24 potjes.")
			} else {
				p.Hands = &n
			}
		case "trumpMode":
			var m game.TrumpMode
			if json.Unmarshal(val, &m) != nil {
				err = fail("Onbekende troefkeuze.")
			} else {
				p.TrumpMode = &m
			}
		case "rules":
			var r game.Rules
			if json.Unmarshal(val, &r) != nil {
				err = fail("Onbekende spelregels.")
			} else {
				p.Rules = &r
			}
		case "ai":
			var s string
			if json.Unmarshal(val, &s) != nil || !validLevels[s] {
				err = fail("Onbekend niveau voor de AI.")
			} else {
				p.AI = &s
			}
		case "tempo":
			var s string
			if json.Unmarshal(val, &s) != nil || pacings[s] == (pacing{}) {
				err = fail("Onbekend tempo.")
			} else {
				p.Tempo = &s
			}
		case "open":
			var b bool
			if json.Unmarshal(val, &b) != nil {
				err = fail("Ongeldige waarde voor open kaarten.")
			} else {
				p.Open = &b
			}
		case "lesson":
			var s string
			if json.Unmarshal(val, &s) != nil || !validLessons[s] {
				err = fail("Ongeldige les.")
			} else {
				p.Lesson = &s
			}
		case "tips":
			var b *bool // null would otherwise switch them off
			if json.Unmarshal(val, &b) != nil || b == nil {
				err = fail("Ongeldige waarde voor tips.")
			} else {
				p.Tips = b
			}
		case "seed":
			var n *int
			if json.Unmarshal(val, &n) != nil || n != nil && (*n < 0 || *n > maxSeed) {
				err = fail("Een seed is een getal van 1 tot 999999999, of leeg.")
			} else {
				seed := 0
				if n != nil {
					seed = *n
				}
				p.Seed = &seed
			}
		case "from":
			var n *int
			if json.Unmarshal(val, &n) != nil || n != nil && (*n < 0 || *n > maxHands) {
				err = fail("Kies een potje van 1 tot 24, of laat het leeg voor het hele spel.")
			} else {
				from := 0
				if n != nil {
					from = *n
				}
				p.From = &from
			}
		case "signals":
			// Agreements left out keep their default.
			sig := game.DefaultSignals
			if json.Unmarshal(val, &sig) != nil {
				err = fail("Ongeldige afspraken over seinen.")
			} else {
				p.Signals = &sig
			}
		}
		if err != nil {
			return optsPatch{}, err
		}
	}
	return p, nil
}

// apply sets the fields of p on o, except Players (rooms handle seats).
func (p optsPatch) apply(o *Options) {
	if p.Hands != nil {
		o.Hands = *p.Hands
	}
	if p.TrumpMode != nil {
		o.TrumpMode = *p.TrumpMode
	}
	if p.Rules != nil {
		o.Rules = *p.Rules
	}
	if p.AI != nil {
		o.AI = *p.AI
	}
	if p.Tempo != nil {
		o.Tempo = *p.Tempo
	}
	if p.Open != nil {
		o.Open = *p.Open
	}
	if p.Lesson != nil {
		o.Lesson = *p.Lesson
	}
	if p.Tips != nil {
		o.Tips = *p.Tips
	}
	if p.Signals != nil {
		o.Signals = *p.Signals
	}
	if p.Seed != nil {
		o.Seed = *p.Seed
	}
	if p.From != nil {
		o.From = *p.From
	}
}

// variantNL names the variant for system lines: "Utrechts/Amsterdams",
// with three players "drie spelers, bieden, Amsterdams", with two "twee
// spelers, Utrechts".
func (o Options) variantNL() string {
	switch o.Players {
	case 3:
		return "drie spelers, bieden, " + o.Rules.NameNL()
	case 2:
		return "twee spelers, " + o.TrumpMode.NameNL()
	}
	return o.TrumpMode.NameNL() + "/" + o.Rules.NameNL()
}
