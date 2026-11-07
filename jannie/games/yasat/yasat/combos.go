package yasat

import "slices"

// Shape is the kind of a legal discard.
type Shape string

const (
	Single   Shape = "single"
	Pair     Shape = "pair"
	Three    Shape = "three"
	Four     Shape = "four"
	Straight Shape = "straight"
)

// Classify is the shape of a discard, "" when it is not a legal one: one
// card, two to four of a rank, or a straight of at least three cards of
// one colour with consecutive ranks (an ace low, A-2-3, or high, Q-K-A).
func Classify(cs []Card) Shape {
	switch {
	case len(cs) == 0 || hasDuplicate(cs):
		return ""
	case len(cs) == 1:
		return Single
	case sameRank(cs) && len(cs) <= 4:
		return []Shape{2: Pair, 3: Three, 4: Four}[len(cs)]
	case IsStraight(cs):
		return Straight
	}
	return ""
}

func hasDuplicate(cs []Card) bool {
	for i := range cs {
		if slices.Contains(cs[i+1:], cs[i]) {
			return true
		}
	}
	return false
}

func sameRank(cs []Card) bool {
	for _, c := range cs {
		if c.Rank != cs[0].Rank {
			return false
		}
	}
	return true
}

// IsStraight reports whether cs is a straight: at least three cards of one
// colour, consecutive ranks, at most one ace, low or high.
func IsStraight(cs []Card) bool {
	if len(cs) < 3 {
		return false
	}
	for _, c := range cs {
		if c.Red() != cs[0].Red() {
			return false
		}
	}
	var ords []int
	aces := 0
	for _, c := range cs {
		if c.Rank == Ace {
			aces++
		} else {
			ords = append(ords, int(c.Rank))
		}
	}
	slices.Sort(ords)
	for i := 1; i < len(ords); i++ {
		if ords[i] == ords[i-1] {
			return false
		}
	}
	switch aces {
	case 0:
		return consecutive(ords)
	case 1:
		return consecutive(append([]int{1}, ords...)) || consecutive(append(slices.Clone(ords), 14))
	}
	return false
}

func consecutive(ords []int) bool {
	for i := 1; i < len(ords); i++ {
		if ords[i] != ords[i-1]+1 {
			return false
		}
	}
	return true
}

// Discards is every legal discard of more than one card from hand (pairs,
// threes, fours and straights), without the singles.
func Discards(hand []Card) [][]Card {
	var out [][]Card
	n := len(hand)
	for mask := 1; mask < 1<<n; mask++ {
		if mask&(mask-1) == 0 {
			continue // one card
		}
		var sub []Card
		for i := range n {
			if mask&(1<<i) != 0 {
				sub = append(sub, hand[i])
			}
		}
		if Classify(sub) != "" {
			out = append(out, sub)
		}
	}
	return out
}
