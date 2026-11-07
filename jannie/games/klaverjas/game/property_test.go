package game

import (
	"math/rand/v2"
	"slices"
	"strings"
	"testing"
)

// Independent reference of the rules in
// games/klaverjas/README.md#rules-as-implemented, written as literally as
// possible, to cross-check the optimised engine.

const (
	refTrumpRanking = "78QKTA9J" // low → high
	refPlainRanking = "789JQKTA"
)

func refStrength(c Card, trump Suit) int {
	code := c.String()[:1]
	if c.Suit == trump {
		return strings.Index(refTrumpRanking, code)
	}
	return strings.Index(refPlainRanking, code)
}

func refWinner(trick []Played, trump Suit) Seat {
	led := trick[0].Card.Suit
	best := trick[0]
	for _, p := range trick[1:] {
		bestTrump, pTrump := best.Card.Suit == trump, p.Card.Suit == trump
		switch {
		case pTrump && !bestTrump:
			best = p
		case pTrump && bestTrump && refStrength(p.Card, trump) > refStrength(best.Card, trump):
			best = p
		case !pTrump && !bestTrump && p.Card.Suit == led && refStrength(p.Card, trump) > refStrength(best.Card, trump):
			best = p
		}
	}
	return best.Seat
}

func refLegal(hand []Card, trick []Played, seat Seat, trump Suit, rules Rules) []Card {
	return refLegalWith(hand, trick, (seat+2)%4, trump, rules)
}

// refLegalWith is refLegal for a player whose partner is partner (NoSeat:
// none, as for the soloist with three players or with two).
func refLegalWith(hand []Card, trick []Played, partner Seat, trump Suit, rules Rules) []Card {
	if len(trick) == 0 {
		return hand
	}
	filter := func(keep func(Card) bool) []Card {
		var out []Card
		for _, c := range hand {
			if keep(c) {
				out = append(out, c)
			}
		}
		return out
	}
	isTrump := func(c Card) bool { return c.Suit == trump }
	beatsAllTrumps := func(c Card) bool {
		if c.Suit != trump {
			return false
		}
		for _, p := range trick {
			if p.Card.Suit == trump && refStrength(p.Card, trump) >= refStrength(c, trump) {
				return false
			}
		}
		return true
	}
	led := trick[0].Card.Suit
	if led == trump {
		trumps := filter(isTrump)
		if len(trumps) == 0 {
			return hand
		}
		if over := filter(beatsAllTrumps); len(over) > 0 {
			return over
		}
		return trumps
	}
	if follow := filter(func(c Card) bool { return c.Suit == led }); len(follow) > 0 {
		return follow
	}
	if len(filter(isTrump)) == 0 {
		return hand
	}
	over := filter(beatsAllTrumps)
	nonTrump := filter(func(c Card) bool { return !isTrump(c) })
	if rules == Amsterdams && partner != NoSeat && refWinner(trick, trump) == partner {
		if allowed := filter(func(c Card) bool { return !isTrump(c) || beatsAllTrumps(c) }); len(allowed) > 0 {
			return allowed
		}
		return hand
	}
	if len(over) > 0 {
		return over
	}
	if rules == Rotterdams {
		// Rotterdams: always trump when you cannot follow, undertrumping if
		// you must; a side card only without trumps.
		return filter(isTrump)
	}
	if len(nonTrump) > 0 {
		return nonTrump
	}
	return hand
}

// checkMasks checks the bitmasks of the fast paths against the cards they
// stand for: HandMask against Hand for every seat, LegalMask against legal.
func checkMasks(t *testing.T, d *Deal, legal []Card) {
	t.Helper()
	for s := range Seat(d.Players()) {
		if d.HandMask(s) != setOf(d.Hand(s)) {
			t.Fatalf("seat %v: HandMask %x, hand %v", s, d.HandMask(s), d.Hand(s))
		}
	}
	if d.LegalMask() != setOf(legal) {
		t.Fatalf("LegalMask %x, legal %v", d.LegalMask(), legal)
	}
}

// TestRandomDeals plays thousands of random deals with random legal moves
// and checks every move and every total against the reference.
func TestRandomDeals(t *testing.T) {
	n := 10000
	if testing.Short() {
		n = 1000
	}
	rng := rand.New(rand.NewPCG(2026, 10))
	var natCount, pitCount int
	for i := range n {
		mode, rules := TrumpMode(i%2), Rules(i/2%2)
		dealt := Shuffle(rng)
		d := NewDeal(Seat(rng.IntN(4)), dealt, mode, rules, Suit(rng.IntN(4)))
		chooseRandom(t, d, rng)
		trump, _ := d.Trump()
		var played []Card
		for d.Phase() == PhasePlay {
			s := d.Turn()
			v := d.View(s)
			cur := d.Current()
			trickCards := cur.Cards
			if cur.Complete() {
				trickCards = nil
				if cur.Winner != s {
					t.Fatalf("seat %v leads after a trick won by %v", s, cur.Winner)
				}
			} else if cur.Next() != s {
				t.Fatalf("turn %v, trick expects %v", s, cur.Next())
			}
			want := refLegal(v.Hand, trickCards, s, trump, rules)
			if !slices.Equal(v.Legal, want) {
				t.Fatalf("deal %d: legal %v, reference %v (hand %v trick %v trump %v %v)",
					i, v.Legal, want, v.Hand, trickCards, trump, rules)
			}
			checkMasks(t, d, want)
			if len(trickCards) == 1 {
				lead := trickCards[0]
				if got := LegalReply(setOf(v.Hand), lead.Card, lead.Seat, s, trump, rules); got != setOf(want) {
					t.Fatalf("deal %d: LegalReply %x, legal %v", i, got, want)
				}
			}
			if rule := ExplainConstraint(v.Hand, v.Current, s, trump, rules); rule == "" {
				t.Fatal("empty constraint text")
			}
			for _, c := range v.Hand {
				msg := ExplainIllegal(c, v.Hand, v.Current, s, trump, rules)
				if slices.Contains(want, c) != (msg == "") {
					t.Fatalf("ExplainIllegal(%v) = %q disagrees with legal %v", c, msg, want)
				}
				if msg == ErrIllegal.Error() {
					t.Fatalf("generic illegal text for %v (hand %v trick %v)", c, v.Hand, trickCards)
				}
				if msg != "" {
					before := *d
					if err := d.Play(s, c); err == nil || err.Error() != msg || *d != before {
						t.Fatalf("illegal %v accepted or changed state: %v", c, err)
					}
				}
			}
			c := want[rng.IntN(len(want))]
			if err := d.Play(s, c); err != nil {
				t.Fatalf("legal %v rejected: %v", c, err)
			}
			played = append(played, c)
		}

		checkMasks(t, d, nil)
		if d.Phase() != PhaseDone || d.Turn() != NoSeat || len(played) != 32 {
			t.Fatalf("deal %d ended in phase %v after %d cards", i, d.Phase(), len(played))
		}
		all := slices.Concat(dealt[0], dealt[1], dealt[2], dealt[3])
		slices.SortFunc(all, func(a, b Card) int { return a.Index() - b.Index() })
		slices.SortFunc(played, func(a, b Card) int { return a.Index() - b.Index() })
		if !slices.Equal(all, played) {
			t.Fatalf("deal %d: played cards differ from dealt", i)
		}
		for s := Seat(0); s < 4; s++ {
			if d.HandLen(s) != 0 {
				t.Fatalf("seat %v still holds cards", s)
			}
		}

		var points, roem, won [2]int
		tricks := d.Tricks()
		if len(tricks) != 8 {
			t.Fatalf("%d tricks", len(tricks))
		}
		leader := d.Voorhand()
		for k, tr := range tricks {
			if tr.Leader != leader || len(tr.Cards) != 4 {
				t.Fatalf("trick %d led by %v, want %v", k, tr.Leader, leader)
			}
			w := refWinner(tr.Cards, trump)
			if tr.Winner != w {
				t.Fatalf("trick %d winner %v, reference %v", k, tr.Winner, w)
			}
			cs := make([]Card, 4)
			for j, p := range tr.Cards {
				cs[j] = p.Card
				if p.Seat != (leader+Seat(j))%4 {
					t.Fatalf("trick %d out of turn", k)
				}
			}
			wantPts := CardPoints(cs, trump)
			if k == 7 {
				wantPts += 10
			}
			if tr.Points != wantPts || tr.RoemTotal() != refRoem(cs, trump) {
				t.Fatalf("trick %d points %d roem %d", k, tr.Points, tr.RoemTotal())
			}
			points[w.Team()] += tr.Points
			roem[w.Team()] += tr.RoemTotal()
			won[w.Team()]++
			leader = w
		}
		if points[0]+points[1] != 162 || won[0]+won[1] != 8 {
			t.Fatalf("points %v won %v", points, won)
		}
		res := d.Result()
		if res.Points != points || d.HandPoints() != points || d.HandRoem() != roem || d.TricksWon() != won {
			t.Fatalf("tallies %v %v, want %v %v", res.Points, d.HandRoem(), points, roem)
		}
		pitTeam := -1
		for team := range 2 {
			if won[team] == 8 {
				pitTeam = team
				roem[team] += 100
			}
		}
		p := res.PlayingTeam
		if p != d.TrumpBy().Team() || res.Trump != trump || res.Dealer != d.Dealer() || res.Roem != roem ||
			res.PitTeam != pitTeam || res.Pit != (pitTeam >= 0) {
			t.Fatalf("result %+v", res)
		}
		total := 162 + roem[0] + roem[1]
		nat := 2*(points[p]+roem[p]) <= total
		if res.Nat != nat {
			t.Fatalf("nat = %v, want %v (%+v)", res.Nat, nat, res)
		}
		if nat {
			if res.Score[p] != 0 || res.Score[1-p] != total {
				t.Fatalf("nat score %v", res.Score)
			}
			natCount++
		} else if res.Score != [2]int{points[0] + roem[0], points[1] + roem[1]} {
			t.Fatalf("score %v", res.Score)
		}
		if res.Pit {
			pitCount++
		}
	}
	if natCount == 0 {
		t.Error("random play never went nat")
	}
	t.Logf("%d deals: %d nat, %d pit", n, natCount, pitCount)
}

// TestRandomPositions checks LegalMoves against the reference in random,
// not necessarily reachable positions (any hand, any partial trick).
func TestRandomPositions(t *testing.T) {
	rng := rand.New(rand.NewPCG(99, 1))
	deck := NewDeck()
	n := 200000
	if testing.Short() {
		n = 20000
	}
	for range n {
		rng.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
		k := rng.IntN(4)
		h := 1 + rng.IntN(8)
		leader := Seat(rng.IntN(4))
		trick := buildTrick(leader, deck[:k])
		hand := deck[k : k+h]
		seat := (leader + Seat(k)) & 3
		trump, rules := Suit(rng.IntN(4)), Rules(rng.IntN(2))
		got := LegalMoves(hand, trick, seat, trump, rules)
		want := refLegal(hand, trick.Cards, seat, trump, rules)
		if !slices.Equal(got, want) {
			t.Fatalf("LegalMoves(%v, %v, seat %v, trump %v, %v) = %v, reference %v",
				hand, trick.Cards, seat, trump, rules, got, want)
		}
		if k > 0 {
			if w, _ := trick.CurrentWinner(trump); w != refWinner(trick.Cards, trump) {
				t.Fatalf("CurrentWinner(%v) = %v", trick.Cards, w)
			}
		}
	}
}

func BenchmarkLegalMoves(b *testing.B) {
	hand := cards("JH AH 7H AD 8C")
	trick := buildTrick(1, cards("KS 9H 7S"))
	dst := make([]Card, 0, 8)
	b.ReportAllocs()
	for b.Loop() {
		dst = AppendLegalMoves(dst[:0], hand, trick, 0, Hearts, Amsterdams)
	}
}

func BenchmarkRoemPoints(b *testing.B) {
	cs := cards("TH JH QH KH")
	b.ReportAllocs()
	for b.Loop() {
		_ = RoemPoints(cs, Hearts)
	}
}

func BenchmarkPlayout(b *testing.B) {
	rng := rand.New(rand.NewPCG(1, 1))
	d := NewDeal(0, Shuffle(rng), Utrechts, Amsterdams, 0)
	if err := d.ChooseTrump(1, Hearts); err != nil {
		b.Fatal(err)
	}
	var sim Deal
	buf := make([]Card, 0, 8)
	b.ReportAllocs()
	for b.Loop() {
		sim = *d
		for sim.Phase() == PhasePlay {
			buf = sim.AppendLegal(buf[:0])
			_ = sim.Play(sim.Turn(), buf[rng.IntN(len(buf))])
		}
	}
}
