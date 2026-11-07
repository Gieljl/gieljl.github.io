package game

import (
	"errors"
	"strings"
	"testing"
)

// both marks a case that must hold for both rule sets.
const both Rules = 255

type legalCase struct {
	name   string
	rules  Rules  // Amsterdams, Rotterdams or both
	leader Seat   // who led; the player is leader+len(trick)
	trick  string // cards played so far, in order
	hand   string
	want   string // legal cards, in hand order
	rule   string // ExplainConstraint
	// illegal maps a card to its exact ExplainIllegal text (optional).
	illegal map[string]string
}

// All cases use ♥ as trump; TestLegalMoves replays them under every
// permutation of the suits.
var legalCases = []legalCase{
	// Leading.
	{name: "lead: free", rules: both, leader: 1, hand: "JH 7S AD 9C", want: "JH 7S AD 9C",
		rule: "Je komt uit: speel wat je wilt"},
	{name: "complete trick counts as a new lead", rules: both, leader: 0, trick: "AS 7S 8S 9S", hand: "JH 7D", want: "JH 7D",
		rule: "Je komt uit: speel wat je wilt"},

	// 1. Trump led.
	{name: "trump led: must overtrump", rules: both, leader: 0, trick: "AH", hand: "JH 7H 8S AD", want: "JH",
		rule: "Troef gevraagd: overtroeven (♥)",
		illegal: map[string]string{
			"7H": "Troef is gevraagd: je moet overtroeven (hoger dan ♥A).",
			"8S": "Troef is gevraagd: je moet troef bekennen (♥).",
			"KS": "Die kaart heb je niet.",
		}},
	{name: "trump led: any higher trump", rules: both, leader: 0, trick: "TH", hand: "9H AH KH 7C", want: "9H AH",
		rule: "Troef gevraagd: overtroeven (♥)"},
	{name: "trump led: overtrump the partner too", rules: both, leader: 0, trick: "9H 7H", hand: "JH 8H AC", want: "JH",
		rule: "Troef gevraagd: overtroeven (♥)"},
	{name: "trump led: highest trump played later counts", rules: both, leader: 0, trick: "7H JH", hand: "9H 8H AS", want: "9H 8H",
		rule:    "Troef gevraagd: je kunt niet overtroeven, speel een lagere troef (♥)",
		illegal: map[string]string{"AS": "Troef is gevraagd: je moet troef bekennen (♥), ook als dat ondertroeven is."}},
	{name: "trump led: cannot beat, undertrump is compulsory", rules: both, leader: 0, trick: "9H", hand: "AH 7H KS", want: "AH 7H",
		rule: "Troef gevraagd: je kunt niet overtroeven, speel een lagere troef (♥)"},
	{name: "trump led: no trump, free", rules: both, leader: 0, trick: "8H", hand: "AS TD 7C", want: "AS TD 7C",
		rule: "Troef gevraagd, maar je hebt geen troef: vrije keuze"},

	// 2. Side suit led, you can follow.
	{name: "follow: any card of the suit", rules: both, leader: 0, trick: "KS", hand: "7S AS JH 8D", want: "7S AS",
		rule:    "Bekennen: speel ♠",
		illegal: map[string]string{"JH": "Je moet bekennen (♠).", "8D": "Je moet bekennen (♠)."}},
	{name: "follow: no need to go higher", rules: both, leader: 0, trick: "TS", hand: "7S 8S", want: "7S 8S",
		rule: "Bekennen: speel ♠"},
	{name: "follow beats trumping", rules: both, leader: 0, trick: "KS JH", hand: "7S 9H", want: "7S",
		rule: "Bekennen: speel ♠"},

	// 3. Cannot follow, no trumps.
	{name: "void, no trump: free", rules: both, leader: 0, trick: "KS", hand: "AD 7C 8D", want: "AD 7C 8D",
		rule: "Je kunt niet bekennen en hebt geen troef: vrije keuze"},
	{name: "void, no trump, trick trumped: free", rules: both, leader: 0, trick: "KS 7H", hand: "AD 7C", want: "AD 7C",
		rule: "Je kunt niet bekennen en hebt geen troef: vrije keuze"},

	// 4. Cannot follow, holding trumps; no trump in the trick yet.
	{name: "void: opponent wins, must trump (any)", rules: both, leader: 0, trick: "KS", hand: "7H AD 8C", want: "7H",
		rule:    "Je kunt niet bekennen: je moet troeven (♥)",
		illegal: map[string]string{"AD": "Je kunt niet bekennen, dus je moet troeven (♥)."}},
	{name: "void: opponent wins, any trump will do", rules: both, leader: 3, trick: "7S AS", hand: "7H JH AD", want: "7H JH",
		rule: "Je kunt niet bekennen: je moet troeven (♥)"},
	{name: "amsterdams: partner wins with side suit, free", rules: Amsterdams, leader: 0, trick: "AS 7S", hand: "7H AD 8C", want: "7H AD 8C",
		rule: "Je maat heeft de slag: vrije keuze"},
	{name: "rotterdams: partner wins with side suit, must trump", rules: Rotterdams, leader: 0, trick: "AS 7S", hand: "7H AD 8C", want: "7H",
		rule:    "Rotterdams: je moet troeven (♥), ook al heeft je maat de slag",
		illegal: map[string]string{"AD": "Je kunt niet bekennen, dus je moet troeven (♥). Bij Rotterdams ook als je maat de slag heeft."}},
	{name: "amsterdams: partner wins, only trumps in hand: free", rules: Amsterdams, leader: 0, trick: "AS 7S", hand: "7H 8H", want: "7H 8H",
		rule: "Je maat heeft de slag: vrije keuze"},
	{name: "rotterdams: partner wins, only trumps in hand", rules: Rotterdams, leader: 0, trick: "AS 7S", hand: "7H 8H", want: "7H 8H",
		rule: "Rotterdams: je moet troeven (♥), ook al heeft je maat de slag"},
	{name: "void: second hand, opponent leads", rules: both, leader: 3, trick: "7S", hand: "QH AD", want: "QH",
		rule: "Je kunt niet bekennen: je moet troeven (♥)"},

	// Opponent winning with a trump.
	{name: "opponent trumped: must overtrump", rules: both, leader: 0, trick: "KS 9H", hand: "JH 7H AD", want: "JH",
		rule: "Je kunt niet bekennen: je moet overtroeven (♥)",
		illegal: map[string]string{
			"7H": "Ondertroeven mag niet: je moet overtroeven (hoger dan ♥9).",
			"AD": "Je kunt niet bekennen, dus je moet overtroeven (hoger dan ♥9).",
		}},
	{name: "amsterdams: opponent trumped, cannot overtrump, play another suit", rules: Amsterdams, leader: 0, trick: "KS 9H", hand: "AH 7H AD 8C", want: "AD 8C",
		rule:    "Je kunt niet overtroeven: speel een andere kleur (ondertroeven mag niet)",
		illegal: map[string]string{"AH": "Ondertroeven mag niet: je kunt niet overtroeven, dus speel een andere kleur."}},
	{name: "rotterdams: opponent trumped, cannot overtrump, must undertrump", rules: Rotterdams, leader: 0, trick: "KS 9H", hand: "AH 7H AD 8C", want: "AH 7H",
		rule:    "Rotterdams: je kunt niet overtroeven, maar je moet wel troeven: speel een lagere troef (♥)",
		illegal: map[string]string{"AD": "Bij Rotterdams moet je troeven (♥) als je niet kunt bekennen, ook als dat ondertroeven is."}},
	{name: "rotterdams: the reviewer's position", rules: Rotterdams, leader: 1, trick: "AS 9H 7S", hand: "7H 8H 8C", want: "7H 8H",
		rule: "Rotterdams: je kunt niet overtroeven, maar je moet wel troeven: speel een lagere troef (♥)"},
	{name: "opponent trumped: only lower trumps, undertrump", rules: both, leader: 0, trick: "KS 9H", hand: "AH 7H", want: "AH 7H",
		rule: "Je hebt alleen nog lagere troef: je moet ondertroeven"},
	{name: "opponent trumped: only trumps, some higher", rules: both, leader: 0, trick: "KS 9H", hand: "JH AH", want: "JH",
		rule: "Je kunt niet bekennen: je moet overtroeven (♥)"},
	{name: "amsterdams: opponent overtrumped my partner", rules: Amsterdams, leader: 0, trick: "KS 9H JH", hand: "AH 7D", want: "7D",
		rule: "Je kunt niet overtroeven: speel een andere kleur (ondertroeven mag niet)"},
	{name: "rotterdams: opponent overtrumped my partner", rules: Rotterdams, leader: 0, trick: "KS 9H JH", hand: "AH 7D", want: "AH",
		rule: "Rotterdams: je kunt niet overtroeven, maar je moet wel troeven: speel een lagere troef (♥)"},
	{name: "last hand, opponent trumped low", rules: both, leader: 0, trick: "KS 7S 8H", hand: "QH 7H AD", want: "QH",
		rule: "Je kunt niet bekennen: je moet overtroeven (♥)"},

	// Partner winning with a trump.
	{name: "amsterdams: partner trumped, free but no undertrump", rules: Amsterdams, leader: 1, trick: "KS 9H 7S", hand: "JH AH AD 8C", want: "JH AD 8C",
		rule:    "Je maat heeft de slag: vrije keuze (ondertroeven mag niet)",
		illegal: map[string]string{"AH": "Ondertroeven mag niet: je maat heeft de slag, dus speel een andere kaart."}},
	{name: "rotterdams: partner trumped, must overtrump the partner", rules: Rotterdams, leader: 1, trick: "KS 9H 7S", hand: "JH AH AD 8C", want: "JH",
		rule: "Rotterdams: je moet overtroeven (♥), ook over je maat heen",
		illegal: map[string]string{
			"AD": "Je kunt niet bekennen, dus je moet overtroeven (hoger dan ♥9). Bij Rotterdams ook als je maat de slag heeft.",
			"AH": "Ondertroeven mag niet: je moet overtroeven (hoger dan ♥9). Bij Rotterdams ook als je maat de slag heeft.",
		}},
	{name: "amsterdams: partner trumped, lower trumps only besides a side card", rules: Amsterdams, leader: 1, trick: "KS 9H 7S", hand: "AH 7H AD", want: "AD",
		rule: "Je maat heeft de slag: vrije keuze (ondertroeven mag niet)"},
	{name: "rotterdams: partner trumped, cannot overtrump, must undertrump", rules: Rotterdams, leader: 1, trick: "KS 9H 7S", hand: "AH 7H AD", want: "AH 7H",
		rule:    "Rotterdams: je kunt niet overtroeven, maar je moet wel troeven: speel een lagere troef (♥)",
		illegal: map[string]string{"AD": "Bij Rotterdams moet je troeven (♥) als je niet kunt bekennen, ook als dat ondertroeven is."}},
	{name: "partner trumped, only lower trumps", rules: both, leader: 1, trick: "KS 9H 7S", hand: "AH 7H", want: "AH 7H",
		rule: "Je hebt alleen nog lagere troef: je moet ondertroeven"},
	{name: "amsterdams: partner trumped, only trumps, one higher", rules: Amsterdams, leader: 1, trick: "KS 9H 7S", hand: "JH 7H", want: "JH",
		rule:    "Je maat heeft de slag, maar je hebt alleen troef: overtroeven (ondertroeven mag niet)",
		illegal: map[string]string{"7H": "Ondertroeven mag niet: je hebt alleen troef, dus je moet overtroeven (hoger dan ♥9)."}},
	{name: "rotterdams: partner trumped, only trumps, one higher", rules: Rotterdams, leader: 1, trick: "KS 9H 7S", hand: "JH 7H", want: "JH",
		rule: "Rotterdams: je moet overtroeven (♥), ook over je maat heen"},
	{name: "amsterdams: partner trumped, no lower trumps: free", rules: Amsterdams, leader: 1, trick: "KS 9H 7S", hand: "JH AD", want: "JH AD",
		rule: "Je maat heeft de slag: vrije keuze"},
	{name: "amsterdams: partner trumped low, my trumps all higher: free", rules: Amsterdams, leader: 2, trick: "AS 7H 8S", hand: "8H AD", want: "8H AD",
		rule: "Je maat heeft de slag: vrije keuze"},
	{name: "rotterdams: partner trumped low, must overtrump", rules: Rotterdams, leader: 2, trick: "AS 7H 8S", hand: "8H AD", want: "8H",
		rule: "Rotterdams: je moet overtroeven (♥), ook over je maat heen"},
	{name: "amsterdams: partner leads and wins, opponent discarded", rules: Amsterdams, leader: 1, trick: "AS 7D", hand: "9H TD", want: "9H TD",
		rule: "Je maat heeft de slag: vrije keuze"},
}

// suitPerms lists all 24 permutations of the suits.
func suitPerms() [][NumSuits]Suit {
	var out [][NumSuits]Suit
	var rec func(p []Suit, used [NumSuits]bool)
	rec = func(p []Suit, used [NumSuits]bool) {
		if len(p) == NumSuits {
			out = append(out, [NumSuits]Suit(p))
			return
		}
		for s := Suit(0); s < NumSuits; s++ {
			if !used[s] {
				used[s] = true
				rec(append(p, s), used)
				used[s] = false
			}
		}
	}
	rec(nil, [NumSuits]bool{})
	return out
}

func permCards(cs []Card, p [NumSuits]Suit) []Card {
	out := make([]Card, len(cs))
	for i, c := range cs {
		out[i] = Card{Rank: c.Rank, Suit: p[c.Suit]}
	}
	return out
}

func permText(s string, p [NumSuits]Suit) string {
	var pairs []string
	for from := Suit(0); from < NumSuits; from++ {
		pairs = append(pairs, from.Symbol(), p[from].Symbol())
	}
	return strings.NewReplacer(pairs...).Replace(s)
}

func buildTrick(leader Seat, played []Card) Trick {
	t := Trick{Leader: leader, Winner: NoSeat}
	for i, c := range played {
		t.Cards = append(t.Cards, Played{Seat: (leader + Seat(i)) & 3, Card: c})
	}
	return t
}

func TestLegalMoves(t *testing.T) {
	perms := suitPerms()
	for _, tc := range legalCases {
		for _, rules := range []Rules{Amsterdams, Rotterdams} {
			if tc.rules != both && tc.rules != rules {
				continue
			}
			for pi, p := range perms {
				trump := p[Hearts]
				played := permCards(cards(tc.trick), p)
				hand := permCards(cards(tc.hand), p)
				want := codes(permCards(cards(tc.want), p))
				trick := buildTrick(tc.leader, played)
				seat := (tc.leader + Seat(len(played))) & 3
				name := tc.name + "/" + rules.String()
				if pi > 0 {
					name += "/perm" + string(rune('0'+pi/10)) + string(rune('0'+pi%10))
				}

				if got := codes(LegalMoves(hand, trick, seat, trump, rules)); got != want {
					t.Errorf("%s: LegalMoves = %q, want %q", name, got, want)
				}
				if got := codes(AppendLegalMoves(cards("7C"), hand, trick, seat, trump, rules)); got != strings.TrimSpace("7C "+want) {
					t.Errorf("%s: AppendLegalMoves = %q", name, got)
				}
				if got, want := ExplainConstraint(hand, trick, seat, trump, rules), permText(tc.rule, p); got != want {
					t.Errorf("%s: ExplainConstraint = %q, want %q", name, got, want)
				}
				legal := map[Card]bool{}
				for _, c := range cards(tc.want) {
					legal[Card{Rank: c.Rank, Suit: p[c.Suit]}] = true
				}
				for _, c := range hand {
					msg := ExplainIllegal(c, hand, trick, seat, trump, rules)
					if legal[c] != (msg == "") || legal[c] != IsLegal(c, hand, trick, seat, trump, rules) {
						t.Errorf("%s: %v legal=%v but ExplainIllegal=%q IsLegal=%v", name, c, legal[c], msg,
							IsLegal(c, hand, trick, seat, trump, rules))
					}
				}
				for code, wantMsg := range tc.illegal {
					c := permCards(cards(code), p)[0]
					if got := ExplainIllegal(c, hand, trick, seat, trump, rules); got != permText(wantMsg, p) {
						t.Errorf("%s: ExplainIllegal(%v) = %q, want %q", name, c, got, permText(wantMsg, p))
					}
				}
			}
		}
	}
}

// TestLegalCoversEveryReason makes sure the table reaches every branch.
func TestLegalCoversEveryReason(t *testing.T) {
	seen := map[reason]bool{}
	for _, tc := range legalCases {
		for _, rules := range []Rules{Amsterdams, Rotterdams} {
			if tc.rules != both && tc.rules != rules {
				continue
			}
			played := cards(tc.trick)
			ti := infoFromTrick(buildTrick(tc.leader, played), Hearts)
			s := judge(setOf(cards(tc.hand)), &ti, ((tc.leader + Seat(len(played))) & 3).Partner(), Hearts, rules)
			seen[s.why] = true
		}
	}
	for r := rLead; r <= rRotterdamsUnder; r++ {
		if !seen[r] {
			t.Errorf("no test case for reason %d", r)
		}
	}
}

func TestLegalDoesNotAllocate(t *testing.T) {
	hand := cards("JH AH 7H AD 8C")
	trick := buildTrick(1, cards("KS 9H 7S"))
	dst := make([]Card, 0, 8)
	allocs := testing.AllocsPerRun(1000, func() {
		dst = AppendLegalMoves(dst[:0], hand, trick, 0, Hearts, Amsterdams)
		_ = IsLegal(card("AD"), hand, trick, 0, Hearts, Rotterdams)
	})
	if allocs != 0 {
		t.Errorf("AppendLegalMoves allocates %.1f times per call", allocs)
	}
}

func TestIllegalPlayError(t *testing.T) {
	// Dealer 3: seat 0 is voorhand and leads.
	d := NewDeal(3, [4][]Card{
		cards("KS AS 7C 8C 9C TC JC QC"),
		cards("7H 8H 9H AD KD QD JD TD"),
		cards("7S 8S 9S TS JS QS AH KH"),
		cards("TH JH QH AC KC 7D 8D 9D"),
	}, Utrechts, Amsterdams, 0)
	if err := d.ChooseTrump(0, Hearts); err != nil {
		t.Fatal(err)
	}
	if err := d.Play(0, card("KS")); err != nil {
		t.Fatal(err)
	}
	before := *d
	err := d.Play(1, card("AD"))
	var ie *IllegalError
	if !errors.As(err, &ie) || !errors.Is(err, ErrIllegal) || ie.Card != card("AD") ||
		ie.Reason != "Je kunt niet bekennen, dus je moet troeven (♥)." || err.Error() != ie.Reason {
		t.Fatalf("Play illegal = %v (%#v)", err, ie)
	}
	if *d != before {
		t.Error("illegal play changed the deal")
	}
	if err := d.Play(1, card("KS")); !errors.Is(err, ErrNotInHand) {
		t.Errorf("card not in hand: %v", err)
	}
	if err := d.Play(1, card("7H")); err != nil {
		t.Fatal(err)
	}
}
