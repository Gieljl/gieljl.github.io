package game

// need is what the rules demand of the next card.
type need uint8

const (
	needFree        need = iota // any card
	needSuit                    // a card of the led (non-trump) suit
	needTrump                   // any trump
	needHigherTrump             // a trump above the highest trump in the trick
	needNoUnder                 // anything except a trump below the trick's highest trump
	needNonTrump                // a non-trump card (undertrumping is not allowed)
)

// reason is why: it selects the Dutch explanation.
type reason uint8

const (
	rLead            reason = iota // first card of the trick
	rFollow                        // side suit led and you have it
	rTrumpOver                     // trump led, you can beat the highest trump
	rTrumpUnder                    // trump led, you cannot beat it: any trump
	rTrumpLedNone                  // trump led, you have none
	rVoidNoTrump                   // cannot follow, no trump
	rMustTrump                     // cannot follow, no trump in the trick yet
	rMustOvertrump                 // cannot follow, beat the trick's trump
	rCannotOvertrump               // Amsterdams: cannot follow or overtrump: play another suit
	rOnlyLowerTrumps               // nothing but lower trumps left: undertrump
	rPartnerFree                   // Amsterdams: partner wins, free choice (no undertrump)
	rRotterdamsUnder               // Rotterdams: cannot overtrump, must still trump (undertrump)
)

// situation is the rules' verdict for one player at one moment.
type situation struct {
	need     need
	why      reason
	led      Suit
	trump    Suit
	high     int8 // trump order of the trick's highest trump, -1 if none
	best     Card // card winning the trick so far
	partner  bool // partner is winning the trick
	hasLower bool // hand holds trumps below the trick's highest trump
	hasOther bool // hand holds non-trump cards
}

// judge determines what the player holding hand (a set of cards, see
// setOf), whose partner in this hand is partner (NoSeat if none), must
// play into the trick described by ti. It does not allocate.
func judge(hand uint32, ti *trickInfo, partner Seat, trump Suit, rules Rules) situation {
	s := situation{led: ti.led, trump: trump, high: ti.high, best: ti.best}
	if ti.n == 0 {
		s.why = rLead
		return s
	}
	trumps, above := hand&suitSet(trump), trumpsAbove(trump, ti.high)
	hasTrump, hasHigher := trumps != 0, trumps&above != 0
	hasLed := ti.led != trump && hand&suitSet(ti.led) != 0
	s.hasLower = trumps&^above != 0
	s.hasOther = hand&^suitSet(trump) != 0
	s.partner = partner != NoSeat && ti.winner == partner

	switch {
	case ti.led == trump && !hasTrump:
		s.why = rTrumpLedNone
	case ti.led == trump && hasHigher:
		s.need, s.why = needHigherTrump, rTrumpOver
	case ti.led == trump:
		s.need, s.why = needTrump, rTrumpUnder
	case hasLed:
		s.need, s.why = needSuit, rFollow
	case !hasTrump:
		s.why = rVoidNoTrump
	case rules == Amsterdams && s.partner:
		if s.hasOther || hasHigher {
			s.need, s.why = needNoUnder, rPartnerFree
		} else {
			s.why = rOnlyLowerTrumps
		}
	case hasHigher && ti.high < 0:
		s.need, s.why = needTrump, rMustTrump
	case hasHigher:
		s.need, s.why = needHigherTrump, rMustOvertrump
	case rules == Rotterdams && s.hasOther:
		// Rotterdams: whoever cannot follow must trump, also below the
		// trick's trump; a side card only without trumps
		// (games/klaverjas/README.md#following-suit-rules).
		s.need, s.why = needTrump, rRotterdamsUnder
	case s.hasOther:
		s.need, s.why = needNonTrump, rCannotOvertrump
	default:
		s.why = rOnlyLowerTrumps
	}
	return s
}

// allows reports whether c (assumed to be in the hand) may be played.
func (s *situation) allows(c Card) bool {
	switch s.need {
	case needSuit:
		return c.Suit == s.led
	case needTrump:
		return c.Suit == s.trump
	case needHigherTrump:
		return c.Suit == s.trump && trumpOrder[c.Rank] > s.high
	case needNoUnder:
		return c.Suit != s.trump || trumpOrder[c.Rank] > s.high
	case needNonTrump:
		return c.Suit != s.trump
	}
	return true
}

// allowed returns the set of cards, among all 32, that the situation
// allows (as allows does card by card).
func (s *situation) allowed() uint32 {
	switch s.need {
	case needSuit:
		return suitSet(s.led)
	case needTrump:
		return suitSet(s.trump)
	case needHigherTrump:
		return trumpsAbove(s.trump, s.high)
	case needNoUnder:
		return ^suitSet(s.trump) | trumpsAbove(s.trump, s.high)
	case needNonTrump:
		return ^suitSet(s.trump)
	}
	return allCards
}

// Sets of cards inside the package: bit Card.Index for each card.
const allCards uint32 = 1<<32 - 1

// setOf returns the set of cards.
func setOf(cards []Card) uint32 {
	var m uint32
	for _, c := range cards {
		m |= 1 << c.Index()
	}
	return m
}

// suitSet is the set of the eight cards of suit s.
func suitSet(s Suit) uint32 { return 0xFF << (uint(s) * NumRanks) }

// trumpRanksAbove[h+1] has bit r set for the ranks whose trump order is
// above h (all ranks for h = -1).
var trumpRanksAbove = func() (m [NumRanks + 1]uint8) {
	for i := range m {
		for r := Rank(0); r < NumRanks; r++ {
			if int(trumpOrder[r]) >= i { // trump order above i-1
				m[i] |= 1 << r
			}
		}
	}
	return m
}()

// trumpsAbove is the set of trumps whose trump order is above h (every
// trump for h < 0).
func trumpsAbove(trump Suit, h int8) uint32 {
	return uint32(trumpRanksAbove[h+1]) << (uint(trump) * NumRanks)
}

// LegalMoves returns the cards of hand that seat may play into trick
// (a complete trick counts as empty: the next card leads a new one).
func LegalMoves(hand []Card, trick Trick, seat Seat, trump Suit, rules Rules) []Card {
	return AppendLegalMoves(make([]Card, 0, len(hand)), hand, trick, seat, trump, rules)
}

// AppendLegalMoves appends the legal cards to dst, in hand order; with
// enough capacity in dst it does not allocate.
func AppendLegalMoves(dst, hand []Card, trick Trick, seat Seat, trump Suit, rules Rules) []Card {
	ti := infoFromTrick(trick, trump)
	return appendLegal(dst, hand, &ti, seat.Partner(), trump, rules)
}

// LegalReply returns the cards of hand that seat may play as the second
// card of a trick that leader led with lead (as LegalMoves), hand and
// result as bitmasks: bit Card.Index for each card.
func LegalReply(hand uint32, lead Card, leader, seat Seat, trump Suit, rules Rules) uint32 {
	ti := trickInfo{n: 1, led: lead.Suit, winner: leader, best: lead, high: -1}
	if lead.Suit == trump {
		ti.high = trumpOrder[lead.Rank]
	}
	s := judge(hand, &ti, seat.Partner(), trump, rules)
	return hand & s.allowed()
}

func appendLegal(dst, hand []Card, ti *trickInfo, partner Seat, trump Suit, rules Rules) []Card {
	s := judge(setOf(hand), ti, partner, trump, rules)
	if s.need == needFree {
		return append(dst, hand...)
	}
	for _, c := range hand {
		if s.allows(c) {
			dst = append(dst, c)
		}
	}
	return dst
}

// IsLegal reports whether seat may play card (which must be in hand).
func IsLegal(card Card, hand []Card, trick Trick, seat Seat, trump Suit, rules Rules) bool {
	if !contains(hand, card) {
		return false
	}
	ti := infoFromTrick(trick, trump)
	s := judge(setOf(hand), &ti, seat.Partner(), trump, rules)
	return s.allows(card)
}

// ExplainConstraint returns a short Dutch line describing what seat must
// play, shown above the hand on that player's turn.
func ExplainConstraint(hand []Card, trick Trick, seat Seat, trump Suit, rules Rules) string {
	ti := infoFromTrick(trick, trump)
	s := judge(setOf(hand), &ti, seat.Partner(), trump, rules)
	return s.constraint()
}

// ExplainIllegal returns a Dutch sentence why card may not be played,
// or "" if it is legal.
func ExplainIllegal(card Card, hand []Card, trick Trick, seat Seat, trump Suit, rules Rules) string {
	if !contains(hand, card) {
		return "Die kaart heb je niet."
	}
	ti := infoFromTrick(trick, trump)
	s := judge(setOf(hand), &ti, seat.Partner(), trump, rules)
	if s.allows(card) {
		return ""
	}
	return s.illegal(card)
}

func (s *situation) constraint() string {
	t := s.trump.Symbol()
	switch s.why {
	case rLead:
		return "Je komt uit: speel wat je wilt"
	case rFollow:
		return "Bekennen: speel " + s.led.Symbol()
	case rTrumpOver:
		return "Troef gevraagd: overtroeven (" + t + ")"
	case rTrumpUnder:
		return "Troef gevraagd: je kunt niet overtroeven, speel een lagere troef (" + t + ")"
	case rTrumpLedNone:
		return "Troef gevraagd, maar je hebt geen troef: vrije keuze"
	case rVoidNoTrump:
		return "Je kunt niet bekennen en hebt geen troef: vrije keuze"
	case rMustTrump:
		if s.partner {
			return "Rotterdams: je moet troeven (" + t + "), ook al heeft je maat de slag"
		}
		return "Je kunt niet bekennen: je moet troeven (" + t + ")"
	case rMustOvertrump:
		if s.partner {
			return "Rotterdams: je moet overtroeven (" + t + "), ook over je maat heen"
		}
		return "Je kunt niet bekennen: je moet overtroeven (" + t + ")"
	case rCannotOvertrump:
		return "Je kunt niet overtroeven: speel een andere kleur (ondertroeven mag niet)"
	case rOnlyLowerTrumps:
		return "Je hebt alleen nog lagere troef: je moet ondertroeven"
	case rRotterdamsUnder:
		return "Rotterdams: je kunt niet overtroeven, maar je moet wel troeven: speel een lagere troef (" + t + ")"
	case rPartnerFree:
		switch {
		case !s.hasLower:
			return "Je maat heeft de slag: vrije keuze"
		case !s.hasOther:
			return "Je maat heeft de slag, maar je hebt alleen troef: overtroeven (ondertroeven mag niet)"
		default:
			return "Je maat heeft de slag: vrije keuze (ondertroeven mag niet)"
		}
	}
	return ""
}

func (s *situation) illegal(card Card) string {
	t := s.trump.Symbol()
	above := " (hoger dan " + CardShortNL(s.best) + ")"
	switch s.why {
	case rFollow:
		return "Je moet bekennen (" + s.led.Symbol() + ")."
	case rTrumpOver:
		if card.Suit != s.trump {
			return "Troef is gevraagd: je moet troef bekennen (" + t + ")."
		}
		return "Troef is gevraagd: je moet overtroeven" + above + "."
	case rTrumpUnder:
		return "Troef is gevraagd: je moet troef bekennen (" + t + "), ook als dat ondertroeven is."
	case rMustTrump:
		if s.partner {
			return "Je kunt niet bekennen, dus je moet troeven (" + t + "). Bij Rotterdams ook als je maat de slag heeft."
		}
		return "Je kunt niet bekennen, dus je moet troeven (" + t + ")."
	case rMustOvertrump:
		var msg string
		if card.Suit == s.trump {
			msg = "Ondertroeven mag niet: je moet overtroeven" + above + "."
		} else {
			msg = "Je kunt niet bekennen, dus je moet overtroeven" + above + "."
		}
		if s.partner {
			msg += " Bij Rotterdams ook als je maat de slag heeft."
		}
		return msg
	case rCannotOvertrump:
		return "Ondertroeven mag niet: je kunt niet overtroeven, dus speel een andere kleur."
	case rRotterdamsUnder:
		return "Bij Rotterdams moet je troeven (" + t + ") als je niet kunt bekennen, ook als dat ondertroeven is."
	case rPartnerFree:
		if !s.hasOther {
			return "Ondertroeven mag niet: je hebt alleen troef, dus je moet overtroeven" + above + "."
		}
		return "Ondertroeven mag niet: je maat heeft de slag, dus speel een andere kaart."
	}
	return "Die kaart mag je nu niet spelen."
}

func contains(hand []Card, c Card) bool {
	for _, h := range hand {
		if h == c {
			return true
		}
	}
	return false
}
