package server

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"jannie/games/klaverjas/game"
)

// Lessons (games/klaverjas/README.md#lessons): in training Juf Jannie gives
// the lesson of option lesson, a step at a time. Each is a match of
// lessonLength hands, and a rematch repeats it from the start. Without one
// (vrij spelen) she only gives the hints and explains the tricks.
//
// The basic game (planBasis): after the deal she says who sits where and what
// the screen shows; after the first trump how the cards rank, with the manual
// for the rest; on the player's turn, the first time they lead, must follow
// suit, must trump or may play anything, which cards may be played. In the
// first hand every trick waits for its explanation, and the last one also
// says how the hand was scored. She praises the learner's first trick, and
// roem says once that it can be ignored here. At the deal of pointsHand she
// introduces the card points, and points out the last trick's 10.
//
// Roem and counting (planRoem): at the first deal she introduces roem, and
// points it out the first few times it falls. In countHand the learner counts
// the trumps, with a counter.
//
// Signals (planSeinen): at the first deal she introduces the table's signals,
// and points out the first few chances to give one and the first few the bots
// give. The other lessons play without signals.
//
// In all three she praises a hand won (once per two hands), and the last
// trick of the last hand closes the lesson with what comes next. Every step
// is a line of Juf Jannie in the chat too.
//
// A step stays on screen until the player reads it (tipRead), without a
// timer: during a pause the game waits for it, on the player's own turn
// only the hint does.

// The lessons (option lesson); "" is vrij spelen, without one.
const (
	planBasis  = "basis"
	planRoem   = "roem"
	planSeinen = "seinen"
)

// The plan of the lessons, hands counted from the first of the match.
const (
	lessonLength = 8 // the hands of every lesson
	pointsHand   = 3 // basis: the hand at whose deal the card points are introduced
	countHand    = 5 // roem: the hand in which the learner counts the trumps, with a counter
	lessonShows  = 3 // times roem, a chance to signal and a signal by a bot are pointed out
	lastShows    = 2 // times the last trick's 10 points are pointed out
)

// The parts of the lessons (room.taught counts them per match), besides the
// turns of playLesson, whose keys go in room.taught too.
const (
	lessonIntro   = "intro"
	lessonTrump   = "trumpOrder" // how the cards rank, after the first announcement
	lessonScore   = "score"
	lessonPoints  = "points"       // the card points introduced
	lessonLast    = "lastTrick"    // the last trick's 10 pointed out
	lessonCount   = "count"        // counting the trumps introduced
	lessonNoTrump = "noTrump"      // the others hold no trump any more (counting hand)
	lessonEarly   = "roemEarly"    // roem fell in the lesson on the basic game
	lessonWon     = "firstTrick"   // the learner's first trick praised
	lessonPraise  = "praise"       // a hand won praised, once per two hands (praise1, praise2, …)
	lessonRoem    = "roem"         // introduced
	lessonRoemAt  = "roemAt"       // pointed out in a trick
	lessonSignals = "signals"      // introduced
	lessonChance  = "signalChance" // a chance for the learner, on their turn
	lessonSignal  = "signal"       // given by a bot, in a trick
)

// lessonStep is one thing Juf Jannie explains. N numbers the steps of a room,
// so a late tap cannot skip the step after the one it was meant for; Spot
// names the part of the screen it is about
// (games/klaverjas/README.md#lessons-on-screen).
type lessonStep struct {
	N      int        `json:"n"`
	Text   string     `json:"text"`
	Spot   string     `json:"spot,omitempty"`
	Card   *game.Card `json:"card,omitempty"`   // spot "card": the card in the hand
	Manual string     `json:"manual,omitempty"` // a section of the manual to open from the step
}

// lessonsOn reports whether this match is a lesson.
func (r *room) lessonsOn() bool { return r.training && r.opts.Lesson != "" }

// inLesson reports whether this match is the lesson called plan.
func (r *room) inLesson(plan string) bool { return r.training && r.opts.Lesson == plan }

// tipsOn reports whether the humans get training hints and the
// explanations of tricks.
func (r *room) tipsOn() bool { return r.training && r.opts.Tips }

// trumpsLeft is how many trumps the others still hold, as the learner can
// count them from their own hand and the cards played; ok only during play
// in the counting hand (countHand), for its counter.
func (r *room) trumpsLeft() (n int, ok bool) {
	if !r.inLesson(planRoem) || r.handNo != countHand || r.deal == nil || r.deal.Phase() != game.PhasePlay {
		return 0, false
	}
	v := r.deal.View(r.learner())
	if !v.TrumpKnown {
		return 0, false
	}
	n = game.NumRanks - trumpsIn(v.Hand, v.Trump)
	for _, t := range append(slices.Clone(v.Tricks), v.Current) {
		for _, p := range t.Cards {
			if p.Card.Suit == v.Trump {
				n--
			}
		}
	}
	return n, true
}

// learner is the seat of the person in training.
func (r *room) learner() game.Seat {
	for i := range r.seats {
		if r.seats[i].kind == seatHuman {
			return game.Seat(i)
		}
	}
	return 0
}

// once reports whether part key of the lesson is still to be given in this
// match, and marks it given.
func (r *room) once(key string) bool { return r.upTo(key, 1) }

// upTo reports whether part key of the lesson was given fewer than n times
// in this match, and counts it given once more.
func (r *room) upTo(key string, n int) bool {
	if r.taught[key] >= n {
		return false
	}
	if r.taught == nil {
		r.taught = make(map[string]int)
	}
	r.taught[key]++
	return true
}

// noSignals reports whether a training table plays without signals, whatever
// it agreed: makkelijk bots neither give nor read one, Juf Jannie included,
// so a hint has none to count on. The lesson on signals never plays at
// makkelijk (trainingOpts).
func (r *room) noSignals() bool { return r.training && r.opts.AI == "makkelijk" }

// signals are the table's agreements on signals as played now: in a lesson
// none until Juf Jannie has introduced them, which only the lesson on signals
// does.
func (r *room) signals() game.Signals {
	if r.noSignals() || r.lessonsOn() && r.taught[lessonSignals] == 0 {
		return game.Signals{}
	}
	return r.opts.Signals
}

// startLesson numbers steps and shows the first one. It numbers a copy:
// steps may be a list every room shares (roemSteps).
func (r *room) startLesson(steps []lessonStep) {
	steps = slices.Clone(steps)
	for k := range steps {
		r.lessonN++
		steps[k].N = r.lessonN
	}
	r.lessons = steps
	r.nextStep()
}

// nextStep shows the next step of the lesson and reports whether there was
// one.
func (r *room) nextStep() bool {
	r.lesson, r.lessonChat = nil, false
	if len(r.lessons) == 0 {
		return false
	}
	st := r.lessons[0]
	r.lesson, r.lessons = &st, r.lessons[1:]
	return true
}

// clearLesson takes the lesson off the screen unread.
func (r *room) clearLesson() {
	r.lesson, r.lessons = nil, nil
}

// teach starts the part of the lesson due as the current pause ends: at the
// first deal the opening of the lesson, at the deal of pointsHand the points,
// after the first announcement the trump lesson, after the announcement in
// countHand counting the trumps. The pause then waits for it to be read
// (readLesson). It reports whether it did.
func (r *room) teach() bool {
	if !r.lessonsOn() || r.lesson != nil {
		return false
	}
	basis, roem, seinen := r.inLesson(planBasis), r.inLesson(planRoem), r.inLesson(planSeinen)
	var steps []lessonStep
	switch dealt, announced := r.pending == stepDealt, r.pending == stepAnnounced; {
	case dealt && basis && r.once(lessonIntro):
		steps = r.introSteps()
	case dealt && basis && r.handNo == pointsHand && r.once(lessonPoints):
		steps = pointsSteps
	case dealt && roem && r.once(lessonRoem):
		steps = roemSteps
	case dealt && seinen && r.once(lessonSignals):
		steps = r.signalSteps()
	case announced && basis && r.once(lessonTrump):
		steps = r.trumpSteps()
	case announced && roem && r.handNo == countHand && r.once(lessonCount):
		steps = r.countSteps()
	default:
		return false
	}
	r.pendingAt = time.Time{}
	r.startLesson(steps)
	r.emit(nil)
	return true
}

// readLesson moves on from the step on screen, read by the player: to the
// next step, or the pause it held ends, or on the player's turn the hint
// shows. A tap for another step than the one on screen came late and
// changes nothing. It reports whether a lesson was on screen.
func (r *room) readLesson(n *int) bool {
	if r.lesson == nil {
		return false
	}
	if n != nil && *n != r.lesson.N {
		return true
	}
	if r.nextStep() {
		r.emit(nil)
		return true
	}
	if r.pending == stepNone {
		r.openedAt = time.Now() // the think time of the turn (review) starts now
		r.emit(nil)
		return true
	}
	r.runPending()
	return true
}

// chatLesson puts the step on screen in the chat, once: the first update
// that shows it has gone out.
func (r *room) chatLesson() {
	if r.lesson == nil || r.lessonChat {
		return
	}
	r.lessonChat = true
	r.coachChat(r.lesson.Text)
}

// coachChat puts text in the chat as a line of Juf Jannie, the learner's
// partner. It is marked coach: the coach bubble shows it already, so the
// table shows no speech bubble for it.
func (r *room) coachChat(text string) {
	i := r.learner().Partner()
	r.addChat(chatMsg{Seat: int(i), Name: r.displayName(i), Text: text, TS: time.Now().UnixMilli(), Bot: true, Coach: true})
}

// who names seat i as Juf Jannie speaks of it: "ik" for herself, "jij" for
// the learner, else the name at the table.
func (r *room) who(i game.Seat) string {
	switch me := r.learner(); i {
	case me:
		return "jij"
	case me.Partner():
		return "ik"
	}
	return r.displayName(i)
}

// whose names the trick seat i holds: "jouw slag", "mijn slag", "de slag
// van Bram (AI)".
func (r *room) whose(i game.Seat) string {
	switch me := r.learner(); i {
	case me:
		return "jouw slag"
	case me.Partner():
		return "mijn slag"
	}
	return "de slag van " + r.displayName(i)
}

func (r *room) introSteps() []lessonStep {
	me := r.learner()
	juf := me.Partner()
	chat := "Wat ik zeg, kun je teruglezen in de chat."
	if r.tipsOn() {
		chat = "Ben je aan de beurt, dan geef ik je een tip, en na elke slag leg ik uit wat er gebeurde. " +
			"Mijn tip hoef je niet te volgen: je kunt elke kaart spelen die volgens de regels mag, en na de slag zie je wat er gebeurde. " + chat
	}
	return []lessonStep{
		{Spot: "partner", Text: "Ik ben " + r.seats[juf].persona.Name + ", je maat: ik zit tegenover je. Samen spelen we tegen " +
			r.displayName((me+1)%4) + " en " + r.displayName((me+3)%4) + ". Tik op Verder, of ergens op tafel, om door te gaan."},
		{Spot: "hand", Text: "Klaverjassen speel je met 32 kaarten: iedereen krijgt er 8. Onderaan zie je de jouwe."},
		{Spot: "trick", Text: "Om de beurt speelt iedereen een kaart op tafel. Die vier kaarten samen zijn een slag. " +
			"De hoogste kaart wint de slag, en wie wint, komt bij de volgende slag als eerste uit."},
		r.trumpIntro(),
		{Spot: "score", Text: "Elke slag levert punten op. Bovenaan staat de stand: Wij, dat zijn jij en ik, en Zij, de andere twee."},
		{Spot: "chat", Text: chat},
	}
}

// trumpIntro says how trump is chosen in this hand.
func (r *room) trumpIntro() lessonStep {
	text := "Eén kleur wordt troef: een troefkaart wint van elke kaart van een andere kleur. "
	if r.deal.Mode() == game.Gedraaid {
		text += "Zo meteen wordt er een kleur omgedraaid. Om de beurt zeg je of je met die kleur als troef wilt spelen, of dat je past."
		return lessonStep{Spot: "trump", Text: text}
	}
	switch first := r.deal.Voorhand(); first {
	case r.learner():
		text += "Jij komt als eerste uit en kiest daarom de troef: neem een kleur waar je veel kaarten van hebt, het liefst met de boer en de 9 erbij."
	case r.learner().Partner():
		text += "Ik kom als eerste uit en kies daarom de troef."
	default:
		text += r.displayName(first) + " komt als eerste uit en kiest daarom de troef."
	}
	return lessonStep{Spot: "trump", Text: text}
}

// trumpSteps say how the cards rank, after the first announcement; the
// manual has the whole order.
func (r *room) trumpSteps() []lessonStep {
	trump, _ := r.deal.Trump()
	return []lessonStep{
		{Spot: "trump", Manual: "punten", Text: trump.Symbol() + " is troef. In troef zijn de boer en de 9 de hoogste kaarten, " +
			"in de andere kleuren de aas. De hele volgorde staat in de handleiding, bij Kaartwaarden."},
	}
}

// pointsSteps introduce the card points, at the deal of hand pointsHand of
// the lesson on the basic game; the manual has what each card is worth.
var pointsSteps = []lessonStep{
	{Spot: "score", Manual: "punten", Text: "Vanaf dit potje let je ook op de punten: de kaarten in je slagen zijn punten waard. " +
		"De troefboer, de troefnegen, de azen en de tienen zijn het meest waard. Wat elke kaart waard is, staat in de handleiding, bij Kaartwaarden."},
	{Spot: "score", Text: "Alle kaarten samen zijn 152 punten, en de laatste slag levert 10 punten extra op: samen 162. " +
		"Wie troef koos, moet samen met de maat meer halen dan de andere twee. Lukt dat niet, dan gaan ze nat."},
}

// countSteps introduce counting the trumps, after the announcement in hand
// countHand of the lesson on roem: how many the others hold now, and the
// counter.
func (r *room) countSteps() []lessonStep {
	trump, _ := r.deal.Trump()
	mine := trumpsIn(r.deal.Hand(r.learner()), trump)
	have := "jij hebt er " + numberNL(mine)
	if mine == 0 {
		have = "jij hebt er geen"
	}
	return []lessonStep{
		{Spot: "trump", Text: "Nu de troeven. Tel in dit potje de troeven. Er zijn 8 troeven; " + have + ", dus de anderen hebben er " +
			numberNL(game.NumRanks-mine) + ". Elke troef die een ander speelt, tel je af."},
		{Spot: "trump", Text: "Het getal bij de troef bovenaan is hoeveel troeven de anderen nog hebben. Dat telt alleen in dit potje mee; " +
			"daarna tel je zelf. Hebben de anderen geen troef meer, dan kan niemand meer troeven als jij een andere kleur speelt."},
	}
}

// trumpsIn counts the trumps in cards.
func trumpsIn(cards []game.Card, trump game.Suit) int {
	n := 0
	for _, c := range cards {
		if c.Suit == trump {
			n++
		}
	}
	return n
}

// roemSteps introduce roem, at the first deal of the lesson on roem.
var roemSteps = []lessonStep{
	{Spot: "trick", Text: "In deze les leer je roem en troeven tellen. Eerst roem: extra punten voor kaarten die samen in één slag liggen. " +
		"Wie de slag wint, krijgt de roem, ook voor de kaarten van de anderen."},
	{Spot: "trick", Text: "Drie op een rij van één kleur (zoals 9, 10 en boer) is 20 roem, vier op een rij 50, en vrouw en heer van troef (stuk) 20. " +
		"Vier gelijke kaarten zijn 100, vier boeren 200. De eerste keren wijs ik het je aan."},
}

// signalRules explain the agreements of sig, one text each, in the order
// of the manual: in Juf Jannie's lesson on signals and in the chat at the
// start of a match.
func signalRules(sig game.Signals) []string {
	var each []string
	if sig.Aas {
		each = append(each, "Met de aas seinen: heeft je maat de slag en gooi je een aas bij van een kleur die nog niet gespeeld is, "+
			"dan zeg je: ik heb de 10 ook. Je maat speelt die kleur dan later naar je toe.")
	}
	if sig.HoogLaag {
		each = append(each, "Op- en afseinen: heeft je maat de slag en kun je niet bekennen, dan zeg je met een 7, 8 of 9: speel deze kleur, daar heb ik de hoogste van (opseinen). "+
			"Met een 10, boer, vrouw of heer zeg je: de hoogste van deze kleur heb ik niet (afseinen).")
	}
	if sig.KleintjeBoer {
		each = append(each, "Kleintje boer: kom je van het koppel dat troef koos voor het eerst uit met een 7, 8 of 9 van een andere kleur, "+
			"dan zeg je: ik heb de troefboer. Je maat speelt dan troef terug.")
	}
	if sig.BoerOverBoer {
		each = append(each, "Boer over boer: kom je van het koppel dat troef koos voor het eerst uit met de boer van een andere kleur, "+
			"dan zeg je ook: ik heb de troefboer.")
	}
	return each
}

// signalSteps introduce the table's signals, at the first deal of the lesson
// on signals: what a signal is, then each agreement.
func (r *room) signalSteps() []lessonStep {
	var each []lessonStep
	for _, text := range signalRules(r.opts.Signals) {
		each = append(each, lessonStep{Text: text})
	}
	count := numberNL(len(each))
	if len(each) == 1 {
		count = "er één"
	} else {
		count = "er " + count
	}
	return append([]lessonStep{{Text: "In deze les leer je seinen: met de kaart die je speelt, vertel je je maat iets over je hand. " +
		"Aan deze tafel spreken we " + count + " af; de eerste keren wijs ik ze je aan."}}, each...)
}

// turnLesson starts the part of the lesson for the learner's turn i in play:
// in the lesson on the basic game the first time they meet its situation
// (playLesson), in the lesson on signals the first few chances to give one.
// Only the hint waits for it.
func (r *room) turnLesson(i game.Seat) {
	if !r.lessonsOn() || r.lesson != nil || r.pending != stepNone || i != r.learner() || r.deal.Phase() != game.PhasePlay {
		return
	}
	var steps []lessonStep
	if r.inLesson(planBasis) {
		if key, text := playLesson(r.deal.View(i)); key != "" && r.once(key) {
			steps = append(steps, lessonStep{Text: text, Spot: "rule"})
		}
	}
	if r.taught[lessonSignals] > 0 && r.taught[lessonChance] < lessonShows {
		var hinted *game.Card
		if r.tipsOn() {
			if h := r.hintFor(i); h != nil {
				hinted = h.Card
			}
		}
		if sig, ok := r.signalChance(i, hinted); ok && r.upTo(lessonChance, lessonShows) {
			steps = append(steps, chanceStep(sig, hinted))
		}
	}
	if len(steps) > 0 {
		r.startLesson(steps)
	}
}

func (r *room) signalChance(i game.Seat, hinted *game.Card) (s Signal, ok bool) {
	defer func() {
		if p := recover(); p != nil {
			r.log.Error("SignalChance panicked", "panic", fmt.Sprint(p))
			s, ok = Signal{}, false
		}
	}()
	v := r.viewFor(i)
	var prefer game.Card
	switch {
	case hinted != nil:
		prefer = *hinted
	case len(v.Legal) > 0:
		prefer = v.Legal[0]
	}
	return r.srv.ai.SignalChance(v, prefer)
}

// chanceStep points out sig, a signal the learner can give now: what the
// card would say, and what Juf Jannie does with it. The card lights up in
// the hand.
func chanceStep(sig Signal, hinted *game.Card) lessonStep {
	card, suit := game.CardShortNL(sig.Card), game.SuitNameNL(sig.Card.Suit)
	var text string
	switch sig.Kind {
	case "aas":
		text = "Hier kun je seinen: gooi je " + card + " bij op mijn slag, dan weet ik dat je " + game.CardShortNL(sig.Means) +
			" ook hebt (met de aas seinen). Dan speel ik later " + suit + " naar je toe."
	case "hoogLaag":
		text = "Hier kun je seinen: gooi je " + card + " bij op mijn slag, een laag kaartje, dan weet ik dat je de hoogste " + suit +
			" hebt (opseinen). Dan speel ik later " + suit + " naar je toe."
	default: // kleintjeBoer, boerOverBoer
		what, name := "een kleintje van een bijkleur", "kleintje boer"
		if sig.Kind == "boerOverBoer" {
			what, name = "de boer van een bijkleur", "boer over boer"
		}
		text = "Hier kun je seinen: kom je uit met " + card + ", " + what + ", dan weet ik dat je de troefboer hebt (" + name +
			"). Dan speel ik troef terug als ik aan slag kom."
	}
	if hinted != nil && *hinted != sig.Card {
		text += " Mijn tip is een andere kaart."
	}
	c := sig.Card
	return lessonStep{Text: text, Spot: "card", Card: &c}
}

// playLesson is the lesson for the turn of v in play: which cards may be
// played, and why, for the situations a beginner meets first. key names
// the situation; "" for the others (the rule above the hand says those).
func playLesson(v game.View) (key, text string) {
	trick := v.Current.Cards
	if len(trick) == 0 {
		return "lead", "Jij komt uit: je mag elke kaart spelen. Wie na je komt, moet die kleur bekennen: ook die kleur spelen, als dat kan."
	}
	led, trump := trick[0].Card.Suit, v.Trump
	has := func(s game.Suit) bool {
		return slices.ContainsFunc(v.Hand, func(c game.Card) bool { return c.Suit == s })
	}
	const dim = " De kaarten die niet mogen, zijn donkerder."
	sym := led.Symbol()
	switch {
	case led == trump && has(trump):
		return "trumpLed", "Troef is gevraagd: speel ook troef, en hoger dan de hoogste troef op tafel als je kunt (overtroeven)." + dim
	case led == trump:
		return "free", "Troef is gevraagd, maar je hebt geen troef: dan mag je elke kaart spelen."
	case has(led):
		return "follow", sym + " is gevraagd en je hebt " + sym + ", dus je moet " + sym + " spelen: dat heet bekennen." + dim
	case !has(trump):
		return "free", "Je hebt geen " + sym + " en ook geen troef: dan mag je elke kaart spelen."
	case !slices.ContainsFunc(v.Legal, func(c game.Card) bool { return c.Suit != trump }):
		text = "Je hebt geen " + sym + ", dus je moet troeven: speel een " + trump.Symbol() + ". Een troef wint van elke " + sym + "."
		if slices.ContainsFunc(trick, func(p game.Played) bool { return p.Card.Suit == trump }) {
			text += " Er ligt al troef: troef hoger als je kunt (overtroeven)."
		}
		return "trump", text + dim
	case winning(trick, trump) == v.Seat.Partner():
		return "partner", "Je hebt geen " + sym + ", maar ik heb de slag. Dan hoef je niet te troeven: je mag ook een andere kleur bijgooien."
	}
	return "", ""
}

// winning is the seat whose card wins the cards of a trick so far.
func winning(cards []game.Played, trump game.Suit) game.Seat {
	best := cards[0]
	for _, p := range cards[1:] {
		if game.Beats(p.Card, best.Card, cards[0].Card.Suit, trump) {
			best = p
		}
	}
	return best.Seat
}

// trickLessons returns the steps that come with trick t, just completed. In
// the lesson on the basic game: the learner's first trick won, roem once to
// be ignored, once the points are introduced the last trick's 10 the first
// few times, and after the last trick of the first hand how it was scored. In
// the lesson on roem: roem the first few times, and in the counting hand that
// the others have no trump left. In the lesson on signals: a signal by a bot
// the first few times, Juf Jannie's own only when it is true. In all of them
// after the last trick of a hand our side won, praise (once per two hands),
// and after the last trick of the match the closing step. In the first hand
// of the basic game, and before another step, the explanation of the trick
// (tips) comes first. The trick waits until all are read; nil: it goes as
// usual.
func (r *room) trickLessons(t game.Trick, tips [4]string) []lessonStep {
	if !r.lessonsOn() {
		return nil
	}
	basis := r.inLesson(planBasis)
	var steps []lessonStep
	if basis && t.Winner == r.learner() && r.once(lessonWon) {
		steps = append(steps, lessonStep{Spot: "trick", Text: "Je eerste slag is binnen. Mooi zo."})
	}
	switch {
	case t.RoemTotal() == 0:
	case basis && r.once(lessonEarly):
		steps = append(steps, lessonStep{Spot: "trick", Text: "In deze slag zit roem: extra punten voor bepaalde kaarten samen in één slag. " +
			"Dat leer je in de les over roem; tot dan kun je het negeren."})
	case r.taught[lessonRoem] > 0 && r.upTo(lessonRoemAt, lessonShows):
		steps = append(steps, r.roemStep(t))
	}
	if r.taught[lessonSignals] > 0 && r.taught[lessonSignal] < lessonShows {
		for _, sig := range r.trickSignals() {
			// TrickSignals reports how the table reads a card, true or not:
			// Juf Jannie claims nothing she does not hold.
			if sig.Seat == r.learner().Partner() && !slices.Contains(r.deal.Hand(sig.Seat), sig.Means) {
				continue
			}
			if sig.Seat != r.learner() && r.upTo(lessonSignal, lessonShows) {
				steps = append(steps, r.signalStep(sig))
				break
			}
		}
	}
	if n, ok := r.trumpsLeft(); ok && n == 0 && r.taught[lessonCount] > 0 && r.once(lessonNoTrump) {
		steps = append(steps, lessonStep{Spot: "trump", Text: "De anderen hebben geen troef meer. Speel je nu een andere kleur, " +
			"dan kan niemand die nog troeven: de hoogste kaart van die kleur haalt de slag."})
	}
	last := r.deal.Phase() == game.PhaseDone
	if last && r.taught[lessonPoints] > 0 && r.upTo(lessonLast, lastShows) {
		steps = append(steps, r.lastStep(t))
	}
	first := basis && r.handNo == 1
	var praised, compliment string
	if last {
		if what, well := r.praise(); well != "" && r.once(lessonPraise+strconv.Itoa((r.handNo+1)/2)) {
			praised, compliment = what+" "+well, well
		}
	}
	switch {
	case first && last && r.once(lessonScore):
		steps = append(steps, r.scoreStep(compliment)) // it says what happened already
	case praised != "":
		steps = append(steps, lessonStep{Spot: "score", Text: praised})
	}
	if last && r.handNo == r.lastHand() {
		steps = append(steps, lessonStep{Spot: "score", Text: closingText[r.opts.Lesson]})
	}
	if len(steps) == 0 && !first {
		return nil
	}
	if text := tips[r.learner()]; text != "" {
		steps = append([]lessonStep{{Spot: "trick", Text: text}}, steps...)
	}
	return steps
}

// closingText closes each lesson, at the last trick of its last hand: what
// comes next.
var closingText = map[string]string{
	planBasis:  "Dit was de les over het basisspel. In de volgende les leer je roem en troeven tellen: die kies je bij Oefenen.",
	planRoem:   "Dit was de les over roem en tellen. In de volgende les leer je seinen: die kies je bij Oefenen.",
	planSeinen: "Dit was de les over seinen, de laatste les. Bij Oefenen kun je nu vrij spelen.",
}

func (r *room) trickSignals() (s []Signal) {
	defer func() {
		if p := recover(); p != nil {
			r.log.Error("TrickSignals panicked", "panic", fmt.Sprint(p))
			s = nil
		}
	}()
	return r.srv.ai.TrickSignals(r.viewFor(r.learner()))
}

// praise is what Juf Jannie says of the hand just over when our side won
// it, made the contract or the opponents went nat: what happened, and the
// compliment; "" otherwise.
func (r *room) praise() (what, well string) {
	res := r.deal.Result()
	we := r.learner().Team()
	switch {
	case res.Pit && res.PitTeam == we:
		return "Pit: alle acht slagen voor ons.", "Heel goed gespeeld."
	case res.PlayingTeam == we && !res.Nat:
		return "We hebben het gehaald.", "Goed gespeeld."
	case res.PlayingTeam != we && res.Nat:
		return "Zij gaan nat.", "Goed verdedigd."
	}
	return "", ""
}

// lastStep points out the 10 points of the last trick t, and who gets them:
// not the side that won it when that side went nat.
func (r *room) lastStep(t game.Trick) lessonStep {
	team, we := "ons", r.learner().Team()
	if t.Winner.Team() != we {
		team = "hen"
	}
	text := "Dit was de laatste slag: die levert 10 punten extra op. " + capital(r.who(t.Winner)) + " won hem, "
	switch res := r.deal.Result(); {
	case !res.Nat || t.Winner.Team() != res.PlayingTeam:
		text += "dus de " + strconv.Itoa(t.Points) + " punten van deze slag zijn voor " + team + "."
	case t.Winner.Team() == we:
		text += "maar wij gaan nat, dus zij krijgen alle punten."
	default:
		text += "maar zij gaan nat, dus wij krijgen alle punten."
	}
	return lessonStep{Spot: "trick", Text: text}
}

// roemStep points out the roem in trick t: the cards it is made of, and
// who gets it.
func (r *room) roemStep(t game.Trick) lessonStep {
	trump, _ := r.deal.Trump()
	cards := make([]game.Card, len(t.Cards))
	for k, p := range t.Cards {
		cards[k] = p.Card
	}
	team := "ons"
	if t.Winner.Team() != r.learner().Team() {
		team = "hen"
	}
	return lessonStep{Spot: "trick", Text: "Roem in deze slag: " + strings.Join(roemParts(cards, trump), ", en ") + ". " +
		capital(r.who(t.Winner)) + " won de slag, dus de " + strconv.Itoa(t.RoemTotal()) + " roem is voor " + team + "."}
}

// roemParts names the roem in the cards of a trick by the cards it is made
// of: "♠9, ♠10 en ♠B op een rij (driekaart, 20)", "♥V en ♥H van troef
// (stuk, 20)", "vier boeren (200)". It finds what game.TrickRoem finds.
func roemParts(cards []game.Card, trump game.Suit) []string {
	if len(cards) == 4 && !slices.ContainsFunc(cards, func(c game.Card) bool { return c.Rank != cards[0].Rank }) {
		switch cards[0].Rank {
		case game.Jack:
			return []string{"vier boeren (200)"}
		case game.Ace:
			return []string{"vier azen (100)"}
		case game.Ten:
			return []string{"vier tienen (100)"}
		case game.King:
			return []string{"vier heren (100)"}
		case game.Queen:
			return []string{"vier vrouwen (100)"}
		}
		return nil
	}
	var parts []string
	for su := game.Suit(0); su < game.NumSuits; su++ {
		var in []game.Card
		for _, c := range cards {
			if c.Suit == su {
				in = append(in, c)
			}
		}
		slices.SortFunc(in, func(a, b game.Card) int { return int(a.Rank) - int(b.Rank) })
		// The longest run of ranks that follow each other.
		var run, cur []game.Card
		for k, c := range in {
			if k == 0 || c.Rank != in[k-1].Rank+1 {
				cur = nil
			}
			cur = append(cur, c)
			if len(cur) > len(run) {
				run = cur
			}
		}
		switch {
		case len(run) >= 4:
			parts = append(parts, listNL(run)+" op een rij (vierkaart, 50)")
		case len(run) == 3:
			parts = append(parts, listNL(run)+" op een rij (driekaart, 20)")
		}
	}
	queen, king := game.Card{Rank: game.Queen, Suit: trump}, game.Card{Rank: game.King, Suit: trump}
	if slices.Contains(cards, queen) && slices.Contains(cards, king) {
		parts = append(parts, game.CardShortNL(queen)+" en "+game.CardShortNL(king)+" van troef (stuk, 20)")
	}
	return parts
}

// listNL names cards as "♠9, ♠10 en ♠B".
func listNL(cards []game.Card) string {
	names := make([]string, len(cards))
	for k, c := range cards {
		names[k] = game.CardShortNL(c)
	}
	if len(names) < 2 {
		return strings.Join(names, "")
	}
	return strings.Join(names[:len(names)-1], ", ") + " en " + names[len(names)-1]
}

// signalStep explains sig, a signal by a bot: what the card says at this
// table, and when Juf Jannie gave it what follows for the learner.
func (r *room) signalStep(sig Signal) lessonStep {
	who := capital(r.who(sig.Seat))
	card, means := game.CardShortNL(sig.Card), game.CardShortNL(sig.Means)
	suit := game.SuitNameNL(sig.Card.Suit)
	var said, then string
	switch sig.Kind {
	case "aas":
		said = who + " gooide " + card + " bij op " + r.whose(sig.Seat.Partner()) +
			", en aan deze tafel betekent dat: “ik heb " + means + " ook” (met de aas seinen)."
		then = "Speel later " + suit + ", dan kan mijn " + means + " de slag halen."
	case "hoogLaag":
		said = who + " gooide " + card + " bij op " + r.whose(sig.Seat.Partner()) +
			", een laag kaartje, en aan deze tafel betekent dat: “speel " + suit + ", daar heb ik de hoogste van” (opseinen)."
		then = "Speel later " + suit + ", dan haal ik die slag."
	default: // kleintjeBoer, boerOverBoer
		what, name := "een kleintje van een bijkleur", "kleintje boer"
		if sig.Kind == "boerOverBoer" {
			what, name = "de boer van een bijkleur", "boer over boer"
		}
		means = "de troefboer"
		said = who + " kwam voor het eerst uit, met " + card + ": " + what +
			". Van het koppel dat troef koos, betekent dat aan deze tafel: “ik heb de troefboer” (" + name + ")."
		then = "Kom jij aan slag, speel dan troef: dan haal ik met de boer de troeven op."
	}
	if sig.Seat != r.learner().Partner() {
		then = ""
	}
	parts := []string{"Dat was een sein.", said, then}
	return lessonStep{Spot: "trick", Text: strings.Join(slices.DeleteFunc(parts, func(s string) bool { return s == "" }), " ")}
}

// scoreStep says how the first hand was scored, after its last trick, with
// compliment (or "") after the result.
func (r *room) scoreStep(compliment string) lessonStep {
	res := r.deal.Result()
	we := r.learner().Team()
	they := 1 - we
	side := func(k int) string {
		s := strconv.Itoa(res.Points[k]) + " punten"
		if res.Roem[k] > 0 {
			s += " en " + strconv.Itoa(res.Roem[k]) + " roem"
		}
		return s
	}
	pick := func(us bool, a, b string) string {
		if us {
			return a
		}
		return b
	}
	parts := []string{"Het potje is uit: wij hebben " + side(we) + ", zij " + side(they) + "."}
	if res.Pit {
		parts = append(parts, pick(res.PitTeam == we, "Wij", "Zij")+" hebben alle acht slagen: dat is pit, 100 roem extra.")
	}
	us := res.PlayingTeam == we
	parts = append(parts, capital(r.who(res.TrumpBy))+" koos troef, dus "+pick(us, "wij", "zij")+" moesten meer halen dan "+
		pick(us, "zij", "wij")+", roem meegeteld.")
	switch {
	case !res.Nat:
		parts = append(parts, "Dat is gelukt.")
	case us:
		parts = append(parts, "Dat is niet gelukt: wij gaan nat, en zij krijgen alle "+strconv.Itoa(res.Score[they])+" punten.")
	default:
		parts = append(parts, "Dat is niet gelukt: zij gaan nat, en wij krijgen alle "+strconv.Itoa(res.Score[we])+" punten.")
	}
	if compliment != "" {
		parts = append(parts, compliment)
	}
	parts = append(parts, "Na "+strconv.Itoa(r.opts.Hands)+" potjes wint het koppel met de meeste punten.")
	return lessonStep{Spot: "score", Text: strings.Join(parts, " ")}
}

// capital makes the first letter of s upper case.
func capital(s string) string {
	c, n := utf8.DecodeRuneInString(s)
	return string(unicode.ToUpper(c)) + s[n:]
}
