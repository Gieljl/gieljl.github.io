package game

import "errors"

// Rules selects the obligation to trump when you cannot follow suit.
type Rules uint8

const (
	// Amsterdams: no need to (over)trump a trick your partner is winning.
	Amsterdams Rules = iota
	// Rotterdams: always (over)trump when you cannot follow suit.
	Rotterdams
)

// String returns "amsterdams" or "rotterdams".
func (r Rules) String() string {
	switch r {
	case Amsterdams:
		return "amsterdams"
	case Rotterdams:
		return "rotterdams"
	}
	return "?"
}

// NameNL returns the display name ("Amsterdams").
func (r Rules) NameNL() string {
	switch r {
	case Amsterdams:
		return "Amsterdams"
	case Rotterdams:
		return "Rotterdams"
	}
	return "?"
}

// ParseRules parses "amsterdams" or "rotterdams".
func ParseRules(s string) (Rules, error) {
	switch s {
	case "amsterdams":
		return Amsterdams, nil
	case "rotterdams":
		return Rotterdams, nil
	}
	return 0, errors.New("onbekende spelregels: " + quote(s))
}

func (r Rules) MarshalText() ([]byte, error) {
	if r > Rotterdams {
		return nil, errors.New("game: invalid rules")
	}
	return []byte(r.String()), nil
}

func (r *Rules) UnmarshalText(b []byte) error {
	v, err := ParseRules(string(b))
	if err != nil {
		return err
	}
	*r = v
	return nil
}

// TrumpMode selects how trump is chosen.
type TrumpMode uint8

const (
	// Utrechts ("verplicht spelen"): voorhand chooses trump.
	Utrechts TrumpMode = iota
	// Gedraaid ("vrij"): a turned suit is offered to each player in turn.
	Gedraaid
)

// String returns "utrechts" or "gedraaid".
func (m TrumpMode) String() string {
	switch m {
	case Utrechts:
		return "utrechts"
	case Gedraaid:
		return "gedraaid"
	}
	return "?"
}

// NameNL returns the display name ("Utrechts").
func (m TrumpMode) NameNL() string {
	switch m {
	case Utrechts:
		return "Utrechts"
	case Gedraaid:
		return "Gedraaid"
	}
	return "?"
}

// ParseTrumpMode parses "utrechts" or "gedraaid".
func ParseTrumpMode(s string) (TrumpMode, error) {
	switch s {
	case "utrechts":
		return Utrechts, nil
	case "gedraaid":
		return Gedraaid, nil
	}
	return 0, errors.New("onbekende troefkeuze: " + quote(s))
}

func (m TrumpMode) MarshalText() ([]byte, error) {
	if m > Gedraaid {
		return nil, errors.New("game: invalid trump mode")
	}
	return []byte(m.String()), nil
}

func (m *TrumpMode) UnmarshalText(b []byte) error {
	v, err := ParseTrumpMode(string(b))
	if err != nil {
		return err
	}
	*m = v
	return nil
}
