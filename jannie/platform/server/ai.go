package server

// Persona is a bot character as the server needs it. Name is without "(AI)";
// the server adds that suffix for display.
type Persona struct {
	ID, Name, Emoji, Color, Bio string
	Chattiness                  float64 // 0..1, scales how often the bot chats
	Speed                       float64 // multiplier on think time
}

// ChatEvent is something a bot may comment on (see bot.ChatEvent).
type ChatEvent struct {
	Kind            string
	Mine            bool
	Text            string
	Points          int
	InHand, Playing bool // for "reply": tricks are being played; the bot's team made trump
}
