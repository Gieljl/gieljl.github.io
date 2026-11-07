package yasat

// Event is something a round gave a player, counted in the weighted score.
type Event string

const (
	EvYasat       Event = "yasat"
	EvOwn         Event = "own"
	EvOwned       Event = "owned"
	EvMultiOwned  Event = "multi-owned"
	EvKill        Event = "kill"
	EvDoubleKill  Event = "double-kill"
	EvMultiKill   Event = "multi-kill"
	EvMegaKill    Event = "mega-kill"
	EvMonsterKill Event = "monster-kill"
	EvDeath       Event = "death"
	EvNullify50   Event = "nullify-50"
	EvNullify100  Event = "nullify-100"
	EvEnable50    Event = "enable-50"
	EvEnable100   Event = "enable-100"
	EvLullify     Event = "lullify"
	EvEnable69    Event = "enable-69"
	EvContra50    Event = "contra-own-50"
	EvContra100   Event = "contra-own-100"
)

// Penalty is what an owned caller gets instead of their hand.
const Penalty = 35

// Result is one player's part of a scored round.
type Result struct {
	Hand   int     `json:"hand"`   // the hand's points (aces as chosen)
	Added  int     `json:"added"`  // what went onto the total before the 50/100 rules
	Total  int     `json:"total"`  // the total after the round
	Events []Event `json:"events"` // never nil
}

// Score scores a round that ended with caller's call: hands are the
// hands' points (aces as chosen), before the totals before the round.
//
// The caller wins when nobody has fewer points: they add nothing (yasat).
// Otherwise they add 35 (owned; multi-owned for more than one) and whoever
// had fewer adds nothing (own). Everyone else adds their hand. A total
// over 100 goes back to 0 (death; the winning caller gets a kill, or a
// double, multi, mega or monster kill). A total that lands on exactly 50
// or 100 goes back to 0 (nullify; the caller is credited enable), from 69
// to 100 also (lullify, enable-69), and an owned caller who lands there
// with the penalty gets contra-own.
func Score(hands []int, caller int, before []int) (results []Result, callerWon bool) {
	n := len(hands)
	results = make([]Result, n)
	owners := 0
	for i := range n {
		if i != caller && hands[i] < hands[caller] {
			owners++
		}
	}
	callerWon = owners == 0
	for i := range n {
		r := &results[i]
		r.Hand, r.Added, r.Events = hands[i], hands[i], []Event{}
		switch {
		case i == caller && callerWon:
			r.Added = 0
			r.Events = append(r.Events, EvYasat)
		case i == caller:
			r.Added = Penalty
			r.Events = append(r.Events, EvOwned)
			if owners > 1 {
				r.Events = append(r.Events, EvMultiOwned)
			}
		case hands[i] < hands[caller]:
			r.Added = 0
			r.Events = append(r.Events, EvOwn)
		}
	}
	enable := func(ev Event) {
		c := &results[caller]
		for _, x := range c.Events {
			if x == ev {
				return
			}
		}
		c.Events = append(c.Events, ev)
	}
	for i := range n {
		r := &results[i]
		prev := before[i]
		sum := prev + r.Added
		switch {
		case sum > 100:
			r.Total = 0
			r.Events = append(r.Events, EvDeath)
		case prev == 69 && sum == 100:
			r.Total = 0
			r.Events = append(r.Events, EvLullify)
			enable(EvEnable69)
		case sum == 50 || sum == 100:
			r.Total = 0
			if i == caller && !callerWon && r.Added == Penalty {
				r.Events = append(r.Events, pick(sum, EvContra50, EvContra100))
				enable(pick(sum, EvEnable50, EvEnable100))
				break
			}
			r.Events = append(r.Events, pick(sum, EvNullify50, EvNullify100))
			if i != caller {
				enable(pick(sum, EvEnable50, EvEnable100))
			}
		default:
			r.Total = sum
		}
	}
	kills := 0
	for i := range n {
		if i != caller && hasEvent(results[i].Events, EvDeath) {
			kills++
		}
	}
	if kills > 0 && callerWon {
		ev := []Event{EvKill, EvDoubleKill, EvMultiKill, EvMegaKill, EvMonsterKill}[min(kills, 5)-1]
		results[caller].Events = append(results[caller].Events, ev)
	}
	return results, callerWon
}

func pick(sum int, at50, at100 Event) Event {
	if sum == 50 {
		return at50
	}
	return at100
}

func hasEvent(evs []Event, e Event) bool {
	for _, x := range evs {
		if x == e {
			return true
		}
	}
	return false
}

// HasEvent reports whether evs has e.
func HasEvent(evs []Event, e Event) bool { return hasEvent(evs, e) }

// Weights are the weighted score of every event, and LongestStreak's bonus
// for the longest run of yasats (above one) reached first; the defaults of
// the Yasat app.
var Weights = map[Event]int{
	EvYasat: 1, EvDeath: -5, EvKill: 2, EvOwn: 3, EvOwned: -2, EvMultiOwned: -1, EvLullify: 2, EvEnable69: 0,
	EvContra50: 2, EvContra100: 2, EvNullify50: 1, EvNullify100: 2, EvEnable50: -1, EvEnable100: -1,
	EvDoubleKill: 5, EvMultiKill: 8, EvMegaKill: 11, EvMonsterKill: 14,
}

// LongestStreak is the bonus of whoever first reached the longest run of
// yasats in a row, when it is longer than one.
const LongestStreak = 2

// Weighted is everyone's weighted score after the rounds' events
// (rounds[k][i]: seat i's in round k), and the seat holding the longest
// streak (-1: nobody).
func Weighted(rounds [][][]Event, n int) (scores []int, streakOwner int) {
	scores = make([]int, n)
	run := make([]int, n)
	best, owner := 1, -1
	for _, round := range rounds {
		for i := range n {
			if hasEvent(round[i], EvYasat) {
				run[i]++
			} else {
				run[i] = 0
			}
			if run[i] > best {
				best, owner = run[i], i
			}
			for _, e := range round[i] {
				scores[i] += Weights[e]
			}
		}
	}
	if owner >= 0 {
		scores[owner] += LongestStreak
	}
	return scores, owner
}
