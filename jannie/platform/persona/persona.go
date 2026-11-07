// Package persona holds the bots every game shares: who they are, how
// they look, and how bold, chatty and quick they are. What they say about
// themselves (a bio), what they say at the table and how they play are each
// game's: klaverjas's in package bot, toepen's in package toepbot.
package persona

// Persona is the identity of a bot.
type Persona struct {
	ID, Name, Emoji, Color string // Name without "(AI)"

	Aggression float64 // 0..1: boldness (klaverjas: trump on weaker hands, going for pit; toepen: toepen and bluffing)
	Chattiness float64 // 0..1: chance of commenting on events
	Speed      float64 // multiplier on think time (0.6 fast .. 1.4 slow)
}

var all = []Persona{
	{ID: "dirk", Name: "Opa Dirk", Emoji: "👴", Color: "#8a5a2b", Aggression: 0.25, Chattiness: 0.45, Speed: 1.3},
	{ID: "truus", Name: "Tante Truus", Emoji: "👵", Color: "#c2477a", Aggression: 0.5, Chattiness: 0.9, Speed: 1.1},
	{ID: "sjaak", Name: "Sjaak", Emoji: "🎲", Color: "#e07b24", Aggression: 0.9, Chattiness: 0.6, Speed: 0.8},
	{ID: "fatima", Name: "Fatima", Emoji: "🧠", Color: "#5b6ee1", Aggression: 0.45, Chattiness: 0.25, Speed: 0.9},
	{ID: "kees", Name: "Kees de Visser", Emoji: "🎣", Color: "#2a8c9c", Aggression: 0.35, Chattiness: 0.6, Speed: 1.0},
	{ID: "jannie", Name: "Juf Jannie", Emoji: "👩‍🏫", Color: "#3f9b5a", Aggression: 0.4, Chattiness: 0.5, Speed: 1.2},
	{ID: "bram", Name: "Bram", Emoji: "🛹", Color: "#9b59b6", Aggression: 0.7, Chattiness: 0.7, Speed: 0.6},
	{ID: "vera", Name: "Bakker Vera", Emoji: "🥐", Color: "#c9a227", Aggression: 0.55, Chattiness: 0.4, Speed: 0.85},
}

// All returns the eight personas, in their fixed order.
func All() []Persona { return append([]Persona(nil), all...) }

// ByID returns the persona with the given ID.
func ByID(id string) (Persona, bool) {
	for _, p := range all {
		if p.ID == id {
			return p, true
		}
	}
	return Persona{}, false
}
