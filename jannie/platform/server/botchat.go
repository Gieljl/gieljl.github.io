package server

import (
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode"

	"jannie/platform/cards"
)

// botChatGap is the least time between two lines of one bot, divided by its
// Chattiness: chatty bots talk more often.
const botChatGap = 8 * time.Second

const (
	botChatMemory = 2 // lines per event kind a bot does not repeat
	botChatTries  = 6 // asks for a line it did not say just now
)

// botSay lets the bot at seat i react to ev, within its limits: one line
// per trick and one per gap, and not one of its latest lines for this kind
// of event (it stays silent rather than repeat itself). The line appears
// after delay (scaled). It reports whether the bot speaks.
func (r *room) botSay(i cards.Seat, ev ChatEvent, delay time.Duration) bool {
	st := &r.seats[i]
	if st.kind != seatBot {
		return false
	}
	now := time.Now()
	gap := r.scaled(time.Duration(float64(botChatGap) / max(st.persona.Chattiness, 0.2)))
	if st.chatAt == r.trickNo || (!st.lastChat.IsZero() && now.Sub(st.lastChat) < gap) {
		return false
	}
	text := cleanChat(r.aiChat(st.persona.ID, ev))
	if text == "" {
		return false // nothing to say about this
	}
	// The bot chose to speak; a later "" only means its dice said no again.
	for try := 1; st.saidLately(ev.Kind, text); try++ {
		if try == botChatTries {
			return false
		}
		text = cleanChat(r.aiChat(st.persona.ID, ev))
	}
	st.remember(ev.Kind, text)
	st.lastChat, st.chatAt = now, r.trickNo
	m := chatMsg{Seat: int(i), Name: botName(st.persona), Text: text, Bot: true}
	r.later(r.scaled(delay), func() {
		m.TS = time.Now().UnixMilli()
		r.addChat(m)
	})
	return true
}

// saidLately reports whether text is one of the bot's latest lines for
// kind ("" counts as said, so it is asked again). Numbers do not count:
// "20 roem. Niet slecht." and "50 roem. Niet slecht." are the same line.
func (st *seat) saidLately(kind, text string) bool {
	if text == "" {
		return true
	}
	return slices.Contains(st.said[kind], lineKey(text))
}

// remember keeps text among the bot's latest lines for kind. A new persona
// starts with an empty memory (newBot).
func (st *seat) remember(kind, text string) {
	if st.said == nil {
		st.said = make(map[string][]string)
	}
	lines := append(st.said[kind], lineKey(text))
	if len(lines) > botChatMemory {
		lines = lines[len(lines)-botChatMemory:]
	}
	st.said[kind] = lines
}

// lineKey is a chat line with every number replaced by #.
func lineKey(text string) string {
	var b strings.Builder
	digits := false
	for _, r := range text {
		if unicode.IsDigit(r) {
			if !digits {
				b.WriteByte('#')
			}
			digits = true
			continue
		}
		digits = false
		b.WriteRune(r)
	}
	return b.String()
}

func (r *room) aiChat(id string, ev ChatEvent) (text string) {
	defer func() {
		if p := recover(); p != nil {
			r.log.Error("Chat panicked", "panic", fmt.Sprint(p))
			text = ""
		}
	}()
	return r.srv.cfg.Game.Chat(id, ev, r.rng)
}

// botsReact offers ev to the bots in random order until n of them spoke;
// mk adapts the event per bot. Later lines get a little more delay.
func (r *room) botsReact(n int, delay time.Duration, mk func(i cards.Seat) (ChatEvent, bool)) {
	order := r.rng.Perm(r.players())
	for _, k := range order {
		if n == 0 {
			return
		}
		i := cards.Seat(k)
		if r.seats[i].kind != seatBot {
			continue
		}
		ev, ok := mk(i)
		if ok && r.botSay(i, ev, delay) {
			n--
			delay += 1500 * time.Millisecond
		}
	}
}

// greet: up to two bots say hello as the match starts.
func (r *room) greet() {
	r.botsReact(2, 2500*time.Millisecond, func(i cards.Seat) (ChatEvent, bool) {
		return ChatEvent{Kind: "greet"}, r.greets(i)
	})
}

// botReply: now and then a bot answers a human's chat line.
func (r *room) botReply(from cards.Seat, text string) {
	if r.rng.Float64() > 0.6 {
		return
	}
	if r.x != nil { // another game: its bots answer for themselves
		r.botsReact(1, 1400*time.Millisecond, func(i cards.Seat) (ChatEvent, bool) {
			return ChatEvent{Kind: "reply", Text: text, InHand: r.inHand()}, i != from
		})
		return
	}
	r.botReplyKlaverjas(from, text)
}
