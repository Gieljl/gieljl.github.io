package game

import "sort"

// suitPreference is the base display order; it already alternates colour.
var suitPreference = [NumSuits]Suit{Spades, Hearts, Clubs, Diamonds}

// SortHand returns a display-sorted copy of hand: suits grouped with
// alternating colours where possible, trump first when known, and within a
// suit low to high by the order that applies (trump order for trump).
func SortHand(hand []Card, trump Suit, trumpKnown bool) []Card {
	order := suitDisplayOrder(hand, trump, trumpKnown)
	var pos [NumSuits]int
	for i, s := range order {
		pos[s] = i
	}
	out := make([]Card, len(hand))
	copy(out, hand)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Suit != b.Suit {
			return pos[a.Suit] < pos[b.Suit]
		}
		if trumpKnown && a.Suit == trump {
			return trumpOrder[a.Rank] < trumpOrder[b.Rank]
		}
		return plainOrder[a.Rank] < plainOrder[b.Rank]
	})
	return out
}

// suitDisplayOrder picks the order of the suits present in hand with the
// fewest neighbouring suits of the same colour, trump first when known;
// ties go to suitPreference order.
func suitDisplayOrder(hand []Card, trump Suit, trumpKnown bool) []Suit {
	var present []Suit
	var seen [NumSuits]bool
	for _, c := range hand {
		seen[c.Suit&3] = true
	}
	for _, s := range suitPreference {
		if seen[s] {
			present = append(present, s)
		}
	}
	best := append([]Suit(nil), present...)
	bestCost := -1
	permute(present, 0, func(p []Suit) {
		if trumpKnown && seen[trump] && p[0] != trump {
			return
		}
		cost := 0
		for i := 1; i < len(p); i++ {
			if p[i].Red() == p[i-1].Red() {
				cost++
			}
		}
		// Permutations come in lexicographic preference order, so the
		// first one with the lowest cost wins ties.
		if bestCost < 0 || cost < bestCost {
			bestCost = cost
			copy(best, p)
		}
	})
	return best
}

// permute calls f with every permutation of s[k:] in lexicographic order of
// the original positions (s must start in that order).
func permute(s []Suit, k int, f func([]Suit)) {
	if k >= len(s)-1 {
		f(s)
		return
	}
	for i := k; i < len(s); i++ {
		// Rotate s[i] to position k to keep lexicographic order.
		v := s[i]
		copy(s[k+1:i+1], s[k:i])
		s[k] = v
		permute(s, k+1, f)
		copy(s[k:i], s[k+1:i+1])
		s[i] = v
	}
}
