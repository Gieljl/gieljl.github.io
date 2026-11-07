package server

import (
	"math/rand/v2"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"jannie/games/klaverjas/game"
)

// seenStep is a lesson step as the learner saw it, with the state around
// it.
type seenStep struct {
	lessonStep
	hand, turn, cards int // hand number, whose turn, cards in the trick on the table
	trump, hint       bool
	ev                string // the update's event
}

// lessonRun is what the learner saw in a training match.
type lessonRun struct {
	seen  []seenStep
	said  []string    // the texts of the steps and tips, in the order they came
	roem  []int       // the hand of every trick with roem
	tips  map[int]int // tips per hand
	hints map[int]int // turns with a hint per hand
	left  map[int][]int
	// left: per hand the trump counter of every update during play, with
	// the trumps the learner held then (as trumpsLeft+held: the trumps not
	// yet played, which only goes down)
}

// readLessons plays c's training match: it reads every lesson step once
// (tipRead with its n, after hook), follows the hint on c's turn (without
// one a random legal choice) and goes on from every summary, until done.
func readLessons(t *testing.T, c *tclient, done func() bool, hook func(seenStep)) (run lessonRun) {
	t.Helper()
	run.tips, run.hints, run.left = map[int]int{}, map[int]int{}, map[int][]int{}
	rng := rand.New(rand.NewPCG(1, 2))
	read, acted, readied := 0, 0, 0
	deadline := time.Now().Add(60 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatalf("readLessons: not done in phase %s, hand %d", c.phase(), c.s.HandNo)
		}
		m := c.next(5 * time.Second)
		if m.T == "tip" {
			run.said = append(run.said, m.Text)
			run.tips[c.s.HandNo]++
			continue
		}
		if m.T != "update" {
			continue
		}
		checkUpdate(t, c, m)
		s := c.s
		if r, _ := m.ev["roem"].([]any); m.evType() == "trick" && len(r) > 0 {
			run.roem = append(run.roem, s.HandNo)
		}
		if n := s.TrumpsLeft; n != nil {
			held := 0
			for _, k := range s.Hand {
				if s.Trump != nil && k.Suit == *s.Trump {
					held++
				}
			}
			run.left[s.HandNo] = append(run.left[s.HandNo], *n+held)
			if s.Phase != phasePlay || *n < 0 {
				t.Errorf("hand %d: trump counter %d in phase %s", s.HandNo, *n, s.Phase)
			}
		}
		if l := s.Lesson; l != nil && l.N > read {
			read = l.N
			st := seenStep{lessonStep: *l, hand: s.HandNo, turn: s.Turn, trump: s.Trump != nil, hint: s.Hint != nil, ev: m.evType()}
			if s.Trick != nil {
				st.cards = len(s.Trick.Cards)
			}
			run.seen = append(run.seen, st)
			run.said = append(run.said, l.Text)
			if hook != nil {
				hook(st)
			}
			c.send(map[string]any{"t": "tipRead", "n": l.N})
			continue
		}
		switch {
		case s.Lesson == nil && c.myTurn() && c.seq > acted:
			acted = c.seq
			if s.Hint == nil {
				c.actRandom(rng)
				break
			}
			run.hints[s.HandNo]++
			c.actHint()
		case s.Phase == phaseHandEnd && readied < s.HandNo:
			readied = s.HandNo
			c.send(map[string]any{"t": "ready"})
		}
	}
	return run
}

// lessonSeed deals, with the fake bots and the learner following the hints,
// more tricks with roem than a lesson points out, and a counting hand in which
// the others run out of trumps before the last trick.
const lessonSeed = 7

// playLessonMatch plays lesson plan with the cards of lessonSeed: it asks for
// sixteen hands, which a lesson ignores, and returns what the learner saw.
func playLessonMatch(t *testing.T, c *tclient, plan string, hook func(seenStep)) lessonRun {
	t.Helper()
	c.create("Leerling", map[string]any{"lesson": plan, "hands": 16, "seed": lessonSeed}, true, true)
	if s := c.s; s.Opts.Lesson != plan || s.Opts.Hands != lessonLength || s.Hands != lessonLength {
		t.Fatalf("lesson %q: opts %+v, %d hands", plan, s.Opts, s.Hands)
	}
	return readLessons(t, c, func() bool { return c.phase() == phaseGameOver }, hook)
}

func (run lessonRun) all(pred func(seenStep) bool) (out []seenStep) {
	for _, st := range run.seen {
		if pred(st) {
			out = append(out, st)
		}
	}
	return out
}

// with is the steps of run whose text has part.
func (run lessonRun) with(part string) []seenStep {
	return run.all(func(st seenStep) bool { return strings.Contains(st.Text, part) })
}

// prev is the step shown before st in a first match (numbered from 1).
func (run lessonRun) prev(st seenStep) seenStep { return run.seen[st.N-2] }

// next is the step shown after st in a first match.
func (run lessonRun) next(st seenStep) seenStep { return run.seen[st.N] }

// explained reports whether st is the explanation of a trick by the fake AI.
func (st seenStep) explained() bool {
	return st.cards == 4 && strings.HasSuffix(st.Text, "wint de slag.")
}

// checkLesson checks what holds in every lesson of a first match: the step
// numbers have no gaps; each lesson shows its own steps and none of the
// others'; praise falls on the last trick of a hand, at most once per two
// hands; a trick after the first hand of the basic game waits only for a step
// of the lesson; every hand has hints and tips, but for the tips of the first
// hand of the basic game, which are steps there; and the chat has every step
// and tip once, in order, as Juf Jannie. The last step closes the lesson.
func checkLesson(t *testing.T, c *tclient, run lessonRun, plan string) {
	t.Helper()
	for k, st := range run.seen {
		if st.N != k+1 {
			t.Fatalf("step %d has n %d: %+v", k, st.N, run.seen)
		}
	}
	marks := map[string][]string{
		planBasis: {"Tik op Verder", " is troef. In troef ", "Het potje is uit: ", "Je eerste slag is binnen.", "In deze slag zit roem: ",
			"Vanaf dit potje let je ook op de punten", "Dit was de laatste slag: "},
		planRoem:   {"In deze les leer je roem", "Roem in deze slag: ", "Nu de troeven.", "Het getal bij de troef", "De anderen hebben geen troef meer."},
		planSeinen: {"In deze les leer je seinen", "Met de aas seinen: ", "Dat was een sein. ", "Hier kun je seinen: "},
	}
	for lesson, parts := range marks {
		if lesson == plan {
			continue
		}
		for _, part := range parts {
			if got := run.with(part); len(got) > 0 {
				t.Errorf("%q in the lesson %s: %+v", part, plan, got)
			}
		}
	}
	if plan != planBasis && slices.ContainsFunc(run.seen, func(st seenStep) bool { return st.Spot == "rule" }) {
		t.Errorf("a turn lesson in the lesson %s", plan)
	}
	if len(run.left) > 0 && plan != planRoem {
		t.Errorf("a trump counter in the lesson %s: %v", plan, run.left)
	}
	// The closing step, last of all, on the last trick of the match.
	end := run.seen[len(run.seen)-1]
	if end.Text != closingText[plan] || end.Spot != "score" || end.hand != lessonLength || end.cards != 4 {
		t.Errorf("closing step %+v", end)
	}
	if got := run.with("Dit was de les over "); len(got) != 1 {
		t.Errorf("closing steps %+v", got)
	}
	praised := run.all(func(st seenStep) bool {
		return slices.Contains([]string{"Pit: alle acht slagen voor ons. Heel goed gespeeld.", "We hebben het gehaald. Goed gespeeld.",
			"Zij gaan nat. Goed verdedigd."}, st.Text)
	})
	blocks := map[int]bool{}
	for _, st := range praised {
		if st.cards != 4 || blocks[(st.hand+1)/2] {
			t.Errorf("praise %+v (blocks so far %v)", st, blocks)
		}
		blocks[(st.hand+1)/2] = true
	}
	for _, st := range run.all(func(st seenStep) bool { return st.explained() && (plan != planBasis || st.hand > 1) }) {
		next := run.next(st).Text
		if !slices.ContainsFunc([]string{"Roem in deze slag: ", "In deze slag zit roem: ", "Dat was een sein. ", "Dit was de laatste slag: ",
			"De anderen hebben geen troef meer.", "Je eerste slag is binnen.", "Pit: ", "We hebben het gehaald.", "Zij gaan nat.", "Dit was de les over "},
			func(p string) bool { return strings.HasPrefix(next, p) }) {
			t.Errorf("hand %d: a trick waits for %q", st.hand, next)
		}
	}
	for h := 1; h <= lessonLength; h++ {
		if run.hints[h] == 0 || run.tips[h] == 0 && (plan != planBasis || h > 1) {
			t.Errorf("hand %d: %d hints, %d tips", h, run.hints[h], run.tips[h])
		}
	}
	var coach []string
	for _, m := range c.chats {
		if m.Coach {
			coach = append(coach, m.Text)
			if m.Seat != 2 || m.Name != "Juf Jannie (AI)" || !m.Bot {
				t.Errorf("coach line %+v", m)
			}
		}
	}
	if !slices.Equal(coach, run.said) {
		t.Errorf("coach lines in the chat:\n%q\nsaid:\n%q", coach, run.said)
	}
}

// checkHintSignals checks whether the hints of all hands of a match had
// agreements on signals to count on.
func checkHintSignals(t *testing.T, ai *fakeAI, hands int, want bool) {
	t.Helper()
	for h := 1; h <= hands; h++ {
		if on, ok := ai.signalsIn.Load(h); !ok || on.(bool) != want {
			t.Errorf("hand %d: hints with signals %v (seen %v), want %v", h, on, ok, want)
		}
	}
}

// TestLessonBasis: the lesson on the basic game, a match of lessonLength hands. The
// intro after the first deal and the trump lesson hold the game until read,
// step by step; every trick of the first hand waits for its explanation, the
// last one also for the score; the learner's first turns get a lesson with
// the hint. The card points are introduced at the deal of the third hand,
// with the last trick's 10 of that hand and the next. Roem says once that it
// can be ignored, and she praises the learner's first trick and a hand won.
// The table plays without signals.
func TestLessonBasis(t *testing.T) {
	_, ts, ai := newTestServer(t)
	c := dial(t, ts)
	run := playLessonMatch(t, c, planBasis, func(st seenStep) {
		switch {
		case st.N == 1:
			// A double tap: the second tipRead for step 1 must not skip
			// step 2 (the numbers seen stay without gaps).
			c.send(map[string]any{"t": "tipRead", "n": 1})
		case st.spotIs("trick") && st.cards == 4 && st.hand == 1:
			// The trick waits for its explanation, however long it takes.
			time.Sleep(40 * time.Millisecond)
			for m := c.poll(); m != nil; m = c.poll() {
				if m.evType() == "collect" {
					t.Errorf("the trick was collected before its explanation was read")
				}
			}
		}
	})
	checkLesson(t, c, run, planBasis)
	seen := run.seen
	// The intro: who sits where and what the screen shows, before the
	// first turn.
	spots := []string{}
	for _, st := range seen[:6] {
		spots = append(spots, st.Spot)
		if st.hand != 1 || st.turn != -1 || st.trump || st.cards != 0 {
			t.Errorf("intro step %+v", st)
		}
	}
	if want := []string{"partner", "hand", "trick", "trump", "score", "chat"}; !slices.Equal(spots, want) {
		t.Errorf("intro spots %v, want %v", spots, want)
	}
	if text := seen[0].Text; !strings.Contains(text, "Juf Jannie") || !strings.Contains(text, "Verder") {
		t.Errorf("first step %q", text)
	}
	if !strings.Contains(seen[5].Text, "Mijn tip hoef je niet te volgen") {
		t.Errorf("the intro does not say the hint is free to ignore: %q", seen[5].Text)
	}
	// The trump lesson: one step once trump is known, while play waits,
	// with the manual for the order.
	trumps := run.all(func(st seenStep) bool { return st.trump && st.Spot == "trump" })
	if len(trumps) != 1 || trumps[0].hand != 1 || trumps[0].turn != -1 || trumps[0].Manual != "punten" || !strings.Contains(trumps[0].Text, "handleiding") {
		t.Errorf("trump steps %+v", trumps)
	}
	// Every trick of the first hand: its explanation on the full trick,
	// as a step and not as a tip; the last one is followed by the score.
	explained := run.all(func(st seenStep) bool { return st.hand == 1 && st.explained() })
	if len(explained) != 8 || run.tips[1] != 0 {
		t.Errorf("%d explained tricks and %d tips in the first hand, want 8 and 0", len(explained), run.tips[1])
	}
	score := run.with("Het potje is uit: ")
	if len(score) != 1 || score[0].hand != 1 || score[0].Spot != "score" || score[0].cards != 4 || !strings.HasPrefix(score[0].Text, "Het potje is uit: wij hebben ") ||
		score[0].N != explained[len(explained)-1].N+1 || !strings.HasSuffix(score[0].Text, "Na "+strconv.Itoa(lessonLength)+" potjes wint het koppel met de meeste punten.") {
		t.Errorf("score steps %+v", score)
	}
	// The learner's turns: a lesson with the hint, each situation once.
	situations := map[string]int{}
	for _, st := range run.all(func(st seenStep) bool { return st.Spot == "rule" }) {
		if st.turn != c.seat || !st.hint || st.cards == 4 {
			t.Errorf("turn lesson %+v", st)
		}
		situations[situation(st.Text)]++
	}
	if len(situations) == 0 || situations[""] > 0 {
		t.Errorf("turn lessons %v", situations)
	}
	for k, n := range situations {
		if n > 1 {
			t.Errorf("turn lesson %s %d times", k, n)
		}
	}
	// The points: introduced at the deal of the third hand, with the
	// manual; then the last trick of that hand and the next says what it
	// brings, after its explanation.
	points := run.with("Vanaf dit potje let je ook op de punten")
	if len(points) != 1 || points[0].hand != pointsHand || points[0].turn != -1 || points[0].cards != 0 || points[0].Manual != "punten" ||
		!strings.HasPrefix(run.next(points[0]).Text, "Alle kaarten samen zijn 152 punten") {
		t.Errorf("points introduced %+v", points)
	}
	last := run.with("Dit was de laatste slag: ")
	if len(last) != lastShows || last[0].hand != pointsHand || last[1].hand != pointsHand+1 {
		t.Errorf("last tricks pointed out %+v", last)
	}
	for _, st := range last {
		if prev := run.prev(st); !prev.explained() {
			t.Errorf("last trick step %+v after %+v", st, prev)
		}
	}
	// Roem says once that it can wait, after the explanation of its trick.
	waits := run.with("In deze slag zit roem: ")
	if len(run.roem) < 2 || len(waits) != 1 || !run.prev(waits[0]).explained() ||
		!strings.Contains(waits[0].Text, "Dat leer je in de les over roem") {
		t.Errorf("roem pointed out %+v, with tricks with roem in hands %v", waits, run.roem)
	}
	// Praise: the learner's first trick, after its explanation.
	won := run.with("Je eerste slag is binnen.")
	if len(won) != 1 || !run.prev(won[0]).explained() || !strings.HasPrefix(run.prev(won[0]).Text, "Jij wint de slag") {
		t.Errorf("first trick praised %+v", won)
	}
	// In the first hand the score already says what happened: the
	// compliment follows the result.
	s := score[0].Text
	good := strings.Contains(s, "wij moesten") && strings.Contains(s, "Dat is gelukt.") || strings.Contains(s, "zij gaan nat")
	if good != slices.ContainsFunc([]string{"gelukt. Goed gespeeld. Na ", "punten. Goed verdedigd. Na ", "gelukt. Heel goed gespeeld. Na "},
		func(p string) bool { return strings.Contains(s, p) }) {
		t.Errorf("the score of the first hand %q", s)
	}
	checkHintSignals(t, ai, lessonLength, false)
	for h := 1; h <= lessonLength; h++ {
		if run.hints[h] == 0 {
			t.Errorf("hand %d: no hints", h)
		}
	}
}

// TestLessonRoem: the lesson on roem and counting. Roem is introduced at the
// first deal, before any turn, and pointed out the first three times, after
// the explanation of its trick. In countHand the learner counts the trumps,
// once trump is known, with a counter in that hand only; the others
// having no trump left is told in it. There is no intro, and the tricks of the
// first hand go as in vrij spelen, with their tip. The table plays without
// signals.
func TestLessonRoem(t *testing.T) {
	_, ts, ai := newTestServer(t)
	c := dial(t, ts)
	run := playLessonMatch(t, c, planRoem, nil)
	checkLesson(t, c, run, planRoem)
	seen := run.seen
	if len(seen) < 2 || !strings.HasPrefix(seen[0].Text, "In deze les leer je roem en troeven tellen. Eerst roem: ") ||
		!strings.HasPrefix(seen[1].Text, "Drie op een rij") {
		t.Fatalf("the opening %+v", seen)
	}
	for _, st := range seen[:2] {
		if st.hand != 1 || st.turn != -1 || st.trump || st.cards != 0 {
			t.Errorf("opening step %+v", st)
		}
	}
	pointed := run.with("Roem in deze slag: ")
	if len(pointed) != lessonShows || len(run.roem) <= lessonShows {
		t.Errorf("roem pointed out %d times, with tricks with roem in hands %v", len(pointed), run.roem)
	}
	for _, st := range pointed {
		if !run.prev(st).explained() {
			t.Errorf("roem step %+v after %+v", st, run.prev(st))
		}
	}
	// Counting the trumps: in countHand once trump is known, before
	// the first card; the counter only during play of that hand, and the
	// trumps not yet played (the counter and the learner's own) only go
	// down from 8.
	count := run.with("Nu de troeven. Tel in dit potje de troeven. Er zijn 8 troeven; ")
	if len(count) != 1 || count[0].hand != countHand || count[0].turn != -1 || !count[0].trump || count[0].cards != 0 ||
		!strings.HasPrefix(run.next(count[0]).Text, "Het getal bij de troef") {
		t.Errorf("counting introduced %+v", count)
	}
	for h, out := range run.left {
		if h != countHand {
			t.Errorf("trump counter in hand %d", h)
		}
		if len(out) == 0 || out[0] != 8 || !slices.IsSortedFunc(out, func(a, b int) int { return b - a }) {
			t.Errorf("trumps not played, by the counter: %v", out)
		}
	}
	if len(run.left[countHand]) == 0 {
		t.Error("no trump counter in the counting hand")
	}
	none := run.with("De anderen hebben geen troef meer.")
	if len(none) != 1 || none[0].hand != countHand || run.prev(none[0]).cards != 4 {
		t.Errorf("no trump left %+v", none)
	}
	if run.tips[1] == 0 {
		t.Error("no tips in the first hand")
	}
	checkHintSignals(t, ai, lessonLength, false)
}

// TestLessonSeinen: the lesson on signals. They are introduced at the first
// deal, each agreement of the table (by default three) a step of its own, in
// the manual's order; from there the table plays with them. The first three
// chances for the learner and the first three signals of the bots are pointed
// out. There is no intro, and roem is not mentioned.
func TestLessonSeinen(t *testing.T) {
	_, ts, ai := newTestServer(t)
	c := dial(t, ts)
	run := playLessonMatch(t, c, planSeinen, nil)
	checkLesson(t, c, run, planSeinen)
	seen := run.seen
	if len(seen) < 4 || seen[0].Text != "In deze les leer je seinen: met de kaart die je speelt, vertel je je maat iets over je hand. "+
		"Aan deze tafel spreken we er drie af; de eerste keren wijs ik ze je aan." ||
		!strings.HasPrefix(seen[1].Text, "Met de aas seinen: ") || !strings.HasPrefix(seen[2].Text, "Op- en afseinen: ") || !strings.HasPrefix(seen[3].Text, "Kleintje boer: ") {
		t.Fatalf("the opening %+v", seen)
	}
	for _, st := range seen[:4] {
		if st.hand != 1 || st.turn != -1 || st.trump || st.cards != 0 {
			t.Errorf("opening step %+v", st)
		}
	}
	// The fake reads every lead as kleintje boer: the first three tricks
	// a bot led explain it.
	bySignal := run.all(func(st seenStep) bool { return strings.HasPrefix(st.Text, "Dat was een sein. ") })
	if len(bySignal) != lessonShows || ai.signalled.Load() == 0 {
		t.Errorf("%d signals by bots pointed out (asked %d times)", len(bySignal), ai.signalled.Load())
	}
	for _, st := range bySignal {
		if strings.HasPrefix(st.Text, "Dat was een sein. Jij") || !run.prev(st).explained() {
			t.Errorf("signal step %+v", st)
		}
	}
	// The fake offers a chance on every turn that follows a lead: the first
	// three, with the card lit up, before the hint.
	chances := run.all(func(st seenStep) bool { return st.Spot == "card" })
	if len(chances) != lessonShows {
		t.Errorf("%d chances to signal pointed out", len(chances))
	}
	for _, st := range chances {
		if st.turn != c.seat || !st.hint || st.Card == nil || !strings.HasPrefix(st.Text, "Hier kun je seinen: gooi je "+game.CardShortNL(*st.Card)) {
			t.Errorf("chance step %+v", st)
		}
	}
	checkHintSignals(t, ai, lessonLength, true)
	if run.tips[1] == 0 {
		t.Error("no tips in the first hand")
	}
}

// TestVrijSpelen: without a lesson Juf Jannie only gives hints and tips, in
// every hand of the length asked for; there is no step, no counter, and the
// chat has the table's signals from the start.
func TestVrijSpelen(t *testing.T) {
	_, ts, ai := newTestServer(t)
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"hands": 4, "seed": lessonSeed}, true, true)
	if s := c.s; s.Opts.Lesson != "" || s.Hands != 4 || !s.Opts.Tips {
		t.Fatalf("opts %+v", s.Opts)
	}
	run := readLessons(t, c, func() bool { return c.phase() == phaseGameOver }, nil)
	if len(run.seen) != 0 || len(run.left) != 0 {
		t.Errorf("steps %+v, trump counter %v", run.seen, run.left)
	}
	for h := 1; h <= 4; h++ {
		if run.hints[h] == 0 || run.tips[h] != 8 {
			t.Errorf("hand %d: %d hints, %d tips", h, run.hints[h], run.tips[h])
		}
	}
	checkHintSignals(t, ai, 4, true)
	if !slices.ContainsFunc(c.chats, func(m chatMsg) bool { return m.Sys && m.Text == "Seinen aan deze tafel:" }) {
		t.Errorf("no signals in the chat: %+v", c.chats)
	}
}

// TestLessonRematch: "Nog een partij" repeats the lesson from the start: with
// the same seed the learner sees and reads the same again, and the step
// numbers go on, so a late tap of the match before cannot skip a step.
func TestLessonRematch(t *testing.T) {
	for _, plan := range []string{planBasis, planRoem, planSeinen} {
		t.Run(plan, func(t *testing.T) {
			_, ts, _ := newTestServer(t)
			c := dial(t, ts)
			one := playLessonMatch(t, c, plan, nil)
			c.send(map[string]any{"t": "rematch"})
			c.waitState("the rematch", func(s *state) bool { return s.Phase != phaseGameOver })
			if s := c.s; s.Opts.Lesson != plan || s.Hands != lessonLength || s.HandNo != 1 {
				t.Fatalf("rematch: hand %d of %d, opts %+v", s.HandNo, s.Hands, s.Opts)
			}
			two := readLessons(t, c, func() bool { return c.phase() == phaseGameOver }, nil)
			if !slices.Equal(one.said, two.said) {
				t.Errorf("the first match:\n%q\nthe rematch:\n%q", one.said, two.said)
			}
			if a, b := one.seen[len(one.seen)-1].N, two.seen[0].N; b != a+1 {
				t.Errorf("the rematch starts at step %d after step %d", b, a)
			}
			if plan == planSeinen && slices.ContainsFunc(c.chats, func(m chatMsg) bool { return m.Sys && m.Text == "Seinen aan deze tafel:" }) {
				t.Error("signals in the chat at the start of a rematch of the lesson on signals")
			}
		})
	}
}

// TestLessonOpts: what a lesson does to the options, at create and in the
// lobby. A lesson has its own length, vrij spelen the one asked for. The
// lesson on signals never plays at makkelijk or without agreements; the other
// lessons leave both alone. Outside training there is no lesson. An unknown
// lesson is skipped at create and refused in the lobby, and an older client's
// option lessons is ignored.
func TestLessonOpts(t *testing.T) {
	_, ts, _ := newTestServer(t)
	none := map[string]any{"aas": false, "hoogLaag": false, "kleintjeBoer": false, "boerOverBoer": false}
	boer := map[string]any{"aas": false, "hoogLaag": false, "kleintjeBoer": false, "boerOverBoer": true}
	std := game.DefaultSignals
	for _, tc := range []struct {
		name     string
		opts     map[string]any
		training bool
		lesson   string
		hands    int
		ai       string
		signals  game.Signals
	}{
		{"basis has its length", map[string]any{"lesson": "basis", "hands": 24}, true, "basis", lessonLength, "normaal", std},
		{"roem has its length", map[string]any{"lesson": "roem", "hands": 8}, true, "roem", lessonLength, "normaal", std},
		{"seinen has its length", map[string]any{"lesson": "seinen", "hands": 12}, true, "seinen", lessonLength, "normaal", std},
		{"vrij, hands asked for", map[string]any{"hands": 8}, true, "", 8, "normaal", std},
		{"vrij by name, hands asked for", map[string]any{"lesson": "", "hands": 24}, true, "", 24, "normaal", std},
		{"seinen raises makkelijk", map[string]any{"lesson": "seinen", "ai": "makkelijk"}, true, "seinen", lessonLength, "normaal", std},
		{"seinen keeps sterk", map[string]any{"lesson": "seinen", "ai": "sterk"}, true, "seinen", lessonLength, "sterk", std},
		{"seinen fills empty signals", map[string]any{"lesson": "seinen", "signals": none}, true, "seinen", lessonLength, "normaal", std},
		{"seinen keeps the signals agreed", map[string]any{"lesson": "seinen", "signals": boer}, true, "seinen", lessonLength, "normaal", game.Signals{BoerOverBoer: true}},
		{"basis keeps makkelijk and no signals", map[string]any{"lesson": "basis", "ai": "makkelijk", "signals": none}, true, "basis", lessonLength, "makkelijk", game.Signals{}},
		{"roem keeps makkelijk and no signals", map[string]any{"lesson": "roem", "ai": "makkelijk", "signals": none}, true, "roem", lessonLength, "makkelijk", game.Signals{}},
		{"vrij keeps makkelijk and no signals", map[string]any{"ai": "makkelijk", "signals": none}, true, "", 16, "makkelijk", game.Signals{}},
		{"no lesson outside training", map[string]any{"lesson": "seinen", "hands": 8, "ai": "makkelijk", "signals": none}, false, "", 8, "makkelijk", game.Signals{}},
		{"an unknown lesson is skipped", map[string]any{"lesson": "kaarten", "hands": 8}, true, "", 8, "normaal", std},
		{"a lesson of another type is skipped", map[string]any{"lesson": true, "hands": 8}, true, "", 8, "normaal", std},
		{"an older client's lessons is ignored", map[string]any{"lessons": true, "hands": 8}, true, "", 8, "normaal", std},
	} {
		c := dial(t, ts)
		c.create("Speler", tc.opts, tc.training, false)
		o := c.s.Opts
		if o.Lesson != tc.lesson || o.Hands != tc.hands || o.AI != tc.ai || o.Signals != tc.signals {
			t.Errorf("%s: opts %+v", tc.name, o)
		}
	}

	// In the lobby of a training match the same holds.
	h := dial(t, ts)
	h.create("Host", map[string]any{"hands": 8, "ai": "makkelijk", "signals": none}, true, false)
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"lesson": "seinen"}})
	h.waitEvent("lobby")
	if o := h.s.Opts; o.Lesson != "seinen" || o.Hands != lessonLength || o.AI != "normaal" || o.Signals != std {
		t.Errorf("lesson on signals chosen in the lobby: opts %+v", o)
	}
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"lesson": "kaarten"}})
	if e := h.waitError(errInvalid); e.errMsg() != "Ongeldige les." {
		t.Errorf("an unknown lesson in the lobby: %q", e.errMsg())
	}
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"lesson": 1}})
	if e := h.waitError(errInvalid); e.errMsg() != "Ongeldige les." {
		t.Errorf("a lesson of another type in the lobby: %q", e.errMsg())
	}
	h.send(map[string]any{"t": "opts", "opts": map[string]any{"lesson": "", "hands": 12}})
	h.waitEvent("lobby")
	if o := h.s.Opts; o.Lesson != "" || o.Hands != 12 {
		t.Errorf("back to vrij spelen: opts %+v", o)
	}
	// Outside training the lobby clears it, with open cards.
	g := dial(t, ts)
	g.create("Host", map[string]any{"open": true}, false, false)
	if g.s.Opts.Open {
		t.Error("open cards at create outside training")
	}
	g.send(map[string]any{"t": "opts", "opts": map[string]any{"lesson": "basis", "open": true}})
	g.waitEvent("lobby")
	if o := g.s.Opts; o.Lesson != "" || o.Open {
		t.Errorf("a lesson or open cards in the lobby outside training: opts %+v", o)
	}
}

// TestLessonsWithoutTips: every lesson with tips off. It has no hint on a
// turn and no explanation after a trick, and no step names a tip.
func TestLessonsWithoutTips(t *testing.T) {
	for _, plan := range []string{planBasis, planRoem, planSeinen} {
		t.Run(plan, func(t *testing.T) {
			_, ts, ai := newTestServer(t)
			c := dial(t, ts)
			c.create("Leerling", map[string]any{"lesson": plan, "tips": false, "seed": lessonSeed}, true, true)
			run := readLessons(t, c, func() bool { return c.phase() == phaseGameOver }, nil)
			if len(run.seen) == 0 || c.tips != 0 || len(run.hints) != 0 || ai.explained.Load() != 0 {
				t.Errorf("%d steps, %d tips, hints %v, %d tricks explained", len(run.seen), c.tips, run.hints, ai.explained.Load())
			}
			for _, text := range run.said {
				if strings.Contains(strings.ToLower(text), "tip") {
					t.Errorf("tips off: %q", text)
				}
			}
			if end := run.seen[len(run.seen)-1]; end.Text != closingText[plan] {
				t.Errorf("closing step %+v", end)
			}
		})
	}
}

func (st seenStep) spotIs(spot string) bool { return st.Spot == spot }

// situation tells the lessons of playLesson apart by their text.
func situation(text string) string {
	for _, k := range []struct{ key, has string }{
		{"lead", "Jij komt uit"}, {"follow", "dat heet bekennen"}, {"trumpLed", "Troef is gevraagd: speel"},
		{"trump", "dus je moet troeven"}, {"partner", "ik heb de slag"}, {"free", "dan mag je elke kaart spelen"},
	} {
		if strings.Contains(text, k.has) {
			return k.key
		}
	}
	return ""
}

// TestLessonResync: a rejoin in the middle of a lesson shows the same step.
func TestLessonResync(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Leerling", map[string]any{"lesson": "basis"}, true, true)
	s := c.waitState("the intro", func(s *state) bool { return s.Lesson != nil })
	c.send(map[string]any{"t": "tipRead", "n": s.Lesson.N})
	s = c.waitState("step 2", func(s *state) bool { return s.Lesson != nil && s.Lesson.N == 2 })
	d := dial(t, ts)
	d.send(map[string]any{"t": "join", "code": c.code, "name": "Leerling", "token": c.token})
	d.waitType("joined")
	log := d.waitType("chatlog")
	d.waitType("update")
	if l := d.s.Lesson; l == nil || *l != *s.Lesson {
		t.Errorf("rejoined with lesson %+v, want %+v", l, s.Lesson)
	}
	// Both steps so far are in the chat log, step 2 once.
	var coach []string
	for _, m := range log.Msgs {
		if m.Coach {
			coach = append(coach, m.Text)
		}
	}
	if len(coach) != 2 || coach[1] != s.Lesson.Text {
		t.Errorf("coach lines in the chat log %q", coach)
	}
}

// TestLateLessonTap: a tap for a lesson step that came once the step was
// gone (the learner's card ended the turn's lesson) is no tip read: the
// last trick of the hand still waits for its tip.
func TestLateLessonTap(t *testing.T) {
	r := lessonRoom(t)
	r.phase = phasePlay
	r.lessonN = 7 // steps 1 to 7 were shown; none is on screen now
	r.pause(stepCollect, time.Hour)
	r.nextAt = r.pendingAt // the last trick waits for its tip
	n := 7
	r.cmdTipRead(&n)
	if r.pending != stepCollect {
		t.Errorf("the late tap for step %d ended the wait for the tip: pending %d", n, r.pending)
	}
}

// TestLessonsOnlyInTraining: the option means nothing outside training, and
// vrij spelen has no steps.
func TestLessonsOnlyInTraining(t *testing.T) {
	_, ts, _ := newTestServer(t)
	c := dial(t, ts)
	c.create("Speler", map[string]any{"lesson": "basis"}, false, true)
	if c.s.Opts.Lesson != "" {
		t.Error("a lesson outside training")
	}
	d := dial(t, ts)
	d.create("Leerling", map[string]any{"hands": 4}, true, true)
	drive(t, func() bool {
		if d.s.Lesson != nil {
			t.Fatalf("a lesson without the option: %+v", d.s.Lesson)
		}
		return d.phase() == phaseHandEnd // the training summary waits for ready
	}, d)
}

// TestPlayLesson: which cards may be played, for the situations a
// beginner meets first; the others are left to the rule above the hand.
func TestPlayLesson(t *testing.T) {
	// Hearts are trump; the learner is seat 0, Juf Jannie seat 2.
	view := func(hand, legal, trick string, leader game.Seat) game.View {
		v := game.View{Players: 4, Seat: 0, Trump: game.Hearts, TrumpKnown: true, Hand: game.MustParseCards(hand), Legal: game.MustParseCards(legal)}
		v.Current.Leader = leader
		for k, c := range game.MustParseCards(trick) {
			v.Current.Cards = append(v.Current.Cards, game.Played{Seat: (leader + game.Seat(k)) & 3, Card: c})
		}
		return v
	}
	for _, c := range []struct {
		name string
		v    game.View
		key  string
		has  string
	}{
		{"lead", view("7S 8D", "7S 8D", "", 0), "lead", "je mag elke kaart spelen"},
		{"follow", view("7S 8S 8D", "7S 8S", "AS", 1), "follow", "♠ is gevraagd en je hebt ♠"},
		{"trump led", view("7H 8D", "7H", "AH", 1), "trumpLed", "overtroeven"},
		{"trump led, none held", view("7S 8D", "7S 8D", "AH", 1), "free", "geen troef"},
		{"void, no trump", view("7C 8D", "7C 8D", "AS", 1), "free", "Je hebt geen ♠ en ook geen troef"},
		{"must trump", view("7H 8D", "7H", "AS", 3), "trump", "speel een ♥"},
		{"must overtrump", view("JH 8D", "JH", "AS 9H", 2), "trump", "Er ligt al troef"},
		{"partner's trick", view("7H 8D", "7H 8D", "AS 7S", 2), "partner", "ik heb de slag"},
		{"cannot overtrump", view("7H 8D", "8D", "AS JH", 2), "", ""},
	} {
		key, text := playLesson(c.v)
		if key != c.key || !strings.Contains(text, c.has) {
			t.Errorf("%s: %s %q, want %s with %q", c.name, key, text, c.key, c.has)
		}
		// room.taught holds these keys and the parts of the lessons: one
		// that both use would be given only once.
		if key != "" && slices.Contains([]string{lessonIntro, lessonTrump, lessonScore, lessonPoints, lessonLast, lessonCount, lessonNoTrump,
			lessonEarly, lessonWon, lessonRoem, lessonRoemAt, lessonSignals, lessonChance, lessonSignal}, key) {
			t.Errorf("%s: key %s is also a part of a lesson", c.name, key)
		}
	}
}

// lessonRoom is a training room in the lesson on the basic game with a deal,
// outside the room's goroutine.
func lessonRoom(t *testing.T) *room {
	s, _, _ := newTestServer(t)
	return lessonRoomOn(s)
}

// lessonRoomOn is lessonRoom on server s.
func lessonRoomOn(s *Server) *room {
	r := newRoom(s, "LESS")
	r.training, r.opts.Lesson = true, planBasis
	r.trainingOpts()
	r.seats[0] = newHuman("Leerling")
	r.seatTraining()
	hands, talon := game.ShuffleFor(4, rand.New(rand.NewPCG(4, 1)))
	r.deal = game.NewDealFor(4, 3, hands, talon, game.Utrechts, game.Amsterdams, 0)
	return r
}

// TestSignalStep: Juf Jannie explains a signal by a bot: her own with
// what follows for the learner, an opponent's as it is.
func TestSignalStep(t *testing.T) {
	r := lessonRoom(t)
	opp := r.displayName(1)
	for _, c := range []struct {
		sig  Signal
		want string
	}{
		{Signal{Seat: 2, Card: game.Card{Rank: game.Ace, Suit: game.Spades}, Kind: "aas", Means: game.Card{Rank: game.Ten, Suit: game.Spades}},
			"Dat was een sein. Ik gooide ♠A bij op jouw slag, en aan deze tafel betekent dat: “ik heb ♠10 ook” (met de aas seinen). " +
				"Speel later schoppen, dan kan mijn ♠10 de slag halen."},
		{Signal{Seat: 2, Card: game.Card{Rank: game.Seven, Suit: game.Clubs}, Kind: "hoogLaag", Means: game.Card{Rank: game.Ace, Suit: game.Clubs}},
			"Dat was een sein. Ik gooide ♣7 bij op jouw slag, een laag kaartje, en aan deze tafel betekent dat: “speel klaveren, daar heb ik de hoogste van” (opseinen). " +
				"Speel later klaveren, dan haal ik die slag."},
		{Signal{Seat: 3, Card: game.Card{Rank: game.Seven, Suit: game.Clubs}, Kind: "kleintjeBoer", Means: game.Card{Rank: game.Jack, Suit: game.Hearts}},
			"Dat was een sein. " + r.displayName(3) + " kwam voor het eerst uit, met ♣7: een kleintje van een bijkleur. Van het koppel dat troef koos, betekent dat aan deze tafel: “ik heb de troefboer” (kleintje boer)."},
		{Signal{Seat: 1, Card: game.Card{Rank: game.Jack, Suit: game.Spades}, Kind: "boerOverBoer", Means: game.Card{Rank: game.Jack, Suit: game.Hearts}},
			"Dat was een sein. " + opp + " kwam voor het eerst uit, met ♠B: de boer van een bijkleur. Van het koppel dat troef koos, betekent dat aan deze tafel: “ik heb de troefboer” (boer over boer)."},
	} {
		if got := r.signalStep(c.sig).Text; got != c.want {
			t.Errorf("got  %q\nwant %q", got, c.want)
		}
	}
}

// signalAI reports the signals it was given for every trick.
type signalAI struct {
	fakeAI
	signals []Signal
}

func (a *signalAI) TrickSignals(game.View) []Signal { return a.signals }

// TestFalseSignal: Juf Jannie points out her own signal only when it is true.
// A false one uses up no show, so a later signal is pointed out instead. An
// opponent's signal says how the table reads the card, true or not.
func TestFalseSignal(t *testing.T) {
	ai := &signalAI{}
	s, _ := newTestServerWith(t, ai)
	type given struct {
		seat  game.Seat
		holds bool // the seat holds the card the signal says
	}
	for _, c := range []struct {
		name  string
		given []given
		want  game.Seat // whose signal is pointed out, the last of given; NoSeat: none
	}{
		{"hers, false", []given{{2, false}}, game.NoSeat},
		{"hers, true", []given{{2, true}}, 2},
		{"hers false, an opponent's after it", []given{{2, false}, {3, false}}, 3},
		{"an opponent's, false", []given{{3, false}}, 3},
	} {
		r := lessonRoomOn(s)
		r.opts.Lesson, r.handNo = planSeinen, 2
		r.taught = map[string]int{lessonSignals: 1}
		if err := r.deal.ChooseTrump(r.deal.Turn(), game.Hearts); err != nil {
			t.Fatal(err)
		}
		ai.signals = nil
		for _, g := range c.given {
			means := r.deal.Hand(g.seat.Partner())[0]
			if g.holds {
				means = r.deal.Hand(g.seat)[0]
			}
			ai.signals = append(ai.signals, Signal{Seat: g.seat, Card: game.Card{Rank: game.Ace, Suit: game.Spades}, Kind: "aas", Means: means})
		}
		var want []lessonStep
		shows := 0
		if c.want != game.NoSeat {
			want, shows = []lessonStep{r.signalStep(ai.signals[len(ai.signals)-1])}, 1
		}
		if got := r.trickLessons(game.Trick{Winner: 1}, [4]string{}); !slices.Equal(got, want) || r.taught[lessonSignal] != shows {
			t.Errorf("%s: steps %+v, %d shows used up", c.name, got, r.taught[lessonSignal])
		}
	}
}

// TestChanceStep: a chance for the learner to signal names the card, what
// it would say and what Juf Jannie does with it, and whether the tip is
// another card.
func TestChanceStep(t *testing.T) {
	as, tc := game.Card{Rank: game.Ace, Suit: game.Spades}, game.Card{Rank: game.Ten, Suit: game.Clubs}
	for _, c := range []struct {
		sig    Signal
		hinted *game.Card
		want   string
	}{
		{Signal{Seat: 0, Card: as, Kind: "aas", Means: game.Card{Rank: game.Ten, Suit: game.Spades}}, &as,
			"Hier kun je seinen: gooi je ♠A bij op mijn slag, dan weet ik dat je ♠10 ook hebt (met de aas seinen). Dan speel ik later schoppen naar je toe."},
		{Signal{Seat: 0, Card: game.Card{Rank: game.Eight, Suit: game.Spades}, Kind: "hoogLaag", Means: as}, &tc,
			"Hier kun je seinen: gooi je ♠8 bij op mijn slag, een laag kaartje, dan weet ik dat je de hoogste schoppen hebt (opseinen). " +
				"Dan speel ik later schoppen naar je toe. Mijn tip is een andere kaart."},
		{Signal{Seat: 0, Card: game.Card{Rank: game.Seven, Suit: game.Diamonds}, Kind: "kleintjeBoer", Means: game.Card{Rank: game.Jack, Suit: game.Hearts}}, nil,
			"Hier kun je seinen: kom je uit met ♦7, een kleintje van een bijkleur, dan weet ik dat je de troefboer hebt (kleintje boer). Dan speel ik troef terug als ik aan slag kom."},
	} {
		st := chanceStep(c.sig, c.hinted)
		if st.Text != c.want || st.Spot != "card" || st.Card == nil || *st.Card != c.sig.Card {
			t.Errorf("got  %+v\nwant %q", st, c.want)
		}
	}
}

// chanceAI offers another card as the chance to signal than the one hinted.
type chanceAI struct{ fakeAI }

func (a *chanceAI) SignalChance(v game.View, prefer game.Card) (Signal, bool) {
	c := v.Legal[len(v.Legal)-1]
	return Signal{Seat: v.Seat, Card: c, Kind: "aas", Means: game.Card{Rank: game.Ten, Suit: c.Suit}}, true
}

// TestChanceWithoutTips: a chance to signal mentions the tip only when there
// is one.
func TestChanceWithoutTips(t *testing.T) {
	for _, tips := range []bool{true, false} {
		s, _ := newTestServerWith(t, &chanceAI{})
		r := lessonRoomOn(s)
		r.opts.Lesson, r.opts.Tips = planSeinen, tips
		r.taught = map[string]int{lessonSignals: 1}
		r.handNo, r.phase = 1, phasePlay
		if err := r.deal.ChooseTrump(r.deal.Turn(), game.Hearts); err != nil {
			t.Fatal(err)
		}
		r.turnLesson(r.deal.Turn())
		if r.lesson == nil || r.lesson.Spot != "card" {
			t.Fatalf("tips %v: step %+v", tips, r.lesson)
		}
		if got := strings.Contains(r.lesson.Text, "Mijn tip"); got != tips {
			t.Errorf("tips %v: %q", tips, r.lesson.Text)
		}
	}
}

// TestIntroWithoutTips: with tips off the intro promises none; with tips on
// its last step says what they are.
func TestIntroWithoutTips(t *testing.T) {
	r := lessonRoom(t)
	steps := r.introSteps()
	if last := steps[len(steps)-1]; last.Spot != "chat" || !strings.Contains(last.Text, "geef ik je een tip") || !strings.HasSuffix(last.Text, "teruglezen in de chat.") {
		t.Errorf("tips on: %+v", last)
	}
	r.opts.Tips = false
	steps = r.introSteps()
	if last := steps[len(steps)-1]; last.Spot != "chat" || last.Text != "Wat ik zeg, kun je teruglezen in de chat." {
		t.Errorf("tips off: %+v", last)
	}
	for _, st := range steps {
		if strings.Contains(strings.ToLower(st.Text), "tip") {
			t.Errorf("tips off: %q", st.Text)
		}
	}
}

// TestRoemByLesson: a trick with roem. The lesson on the basic game says once
// that it can wait for the lesson on roem; that lesson points out the first
// three, once it has introduced roem; the lesson on signals and vrij spelen
// say nothing.
func TestRoemByLesson(t *testing.T) {
	roem := game.Trick{Winner: 1, Roem: []game.RoemItem{{Points: 20}}, Cards: []game.Played{
		{Seat: 0, Card: game.Card{Rank: game.Nine, Suit: game.Spades}}, {Seat: 1, Card: game.Card{Rank: game.Ten, Suit: game.Spades}},
		{Seat: 2, Card: game.Card{Rank: game.Jack, Suit: game.Spades}}, {Seat: 3, Card: game.Card{Rank: game.Seven, Suit: game.Hearts}},
	}}
	texts := func(r *room) (out []string) {
		for range 5 {
			for _, st := range r.trickLessons(roem, [4]string{}) {
				out = append(out, st.Text)
			}
		}
		return out
	}
	r := lessonRoom(t)
	r.handNo = 2
	if got := texts(r); !slices.Equal(got, []string{"In deze slag zit roem: extra punten voor bepaalde kaarten samen in één slag. " +
		"Dat leer je in de les over roem; tot dan kun je het negeren."}) {
		t.Errorf("basic game: %q", got)
	}
	r = lessonRoom(t)
	r.opts.Lesson, r.handNo = planRoem, 2
	r.taught = map[string]int{lessonRoem: 1}
	if got := texts(r); len(got) != lessonShows || !strings.HasPrefix(got[0], "Roem in deze slag: ♠9, ♠10 en ♠B op een rij (driekaart, 20). ") {
		t.Errorf("roem: %q", got)
	}
	r = lessonRoom(t)
	r.opts.Lesson, r.handNo = planSeinen, 2
	r.taught = map[string]int{lessonSignal: lessonShows} // no signal by a bot to tell
	if got := texts(r); got != nil {
		t.Errorf("signals: %q", got)
	}
	r = lessonRoom(t)
	r.opts.Lesson, r.handNo = "", 2
	if got := texts(r); got != nil {
		t.Errorf("vrij spelen: %q", got)
	}
}

// playedOut is r's deal played to the end, with the result praise wants when
// won is true: another deal of the room's cards until it is.
func playedOut(t *testing.T, r *room, won bool) {
	t.Helper()
	for seed := uint64(1); seed < 100; seed++ {
		hands, talon := game.ShuffleFor(4, rand.New(rand.NewPCG(seed, 1)))
		r.deal = game.NewDealFor(4, 3, hands, talon, game.Utrechts, game.Amsterdams, 0)
		if err := r.deal.ChooseTrump(r.deal.Turn(), game.Hearts); err != nil {
			t.Fatal(err)
		}
		for r.deal.Phase() == game.PhasePlay {
			if err := r.deal.Play(r.deal.Turn(), r.deal.Legal()[0]); err != nil {
				t.Fatal(err)
			}
		}
		if _, well := r.praise(); (well != "") == won {
			return
		}
	}
	t.Fatalf("no deal with won %v", won)
}

// TestLastStep: the last trick says who gets its points; when the side that
// won it went nat, that the others get them all.
func TestLastStep(t *testing.T) {
	const opening = "Dit was de laatste slag: die levert 10 punten extra op. "
	check := func(r *room, winner game.Seat, want string) {
		t.Helper()
		if got := r.lastStep(game.Trick{Winner: winner, Points: 24}); got.Spot != "trick" || got.Text != opening+want {
			t.Errorf("got  %q\nwant %q", got.Text, opening+want)
		}
	}
	// The learner at seat 0 makes trump: won is gehaald, not won is nat.
	r := lessonRoom(t)
	opp := r.displayName(1)
	playedOut(t, r, true)
	check(r, 0, "Jij won hem, dus de 24 punten van deze slag zijn voor ons.")
	check(r, 1, opp+" won hem, dus de 24 punten van deze slag zijn voor hen.")
	playedOut(t, r, false)
	check(r, 0, "Jij won hem, maar wij gaan nat, dus zij krijgen alle punten.")
	check(r, 2, "Ik won hem, maar wij gaan nat, dus zij krijgen alle punten.")
	check(r, 1, opp+" won hem, dus de 24 punten van deze slag zijn voor hen.")
	// The learner at seat 1: seat 0 makes trump, and won is that it went nat.
	r = lessonRoom(t)
	r.seats[0], r.seats[1] = r.seats[1], r.seats[0]
	playedOut(t, r, true)
	if res := r.deal.Result(); !res.Nat || res.PlayingTeam == r.learner().Team() {
		t.Fatalf("result %+v", res)
	}
	check(r, 0, r.displayName(0)+" won hem, maar zij gaan nat, dus wij krijgen alle punten.")
	check(r, 1, "Jij won hem, dus de 24 punten van deze slag zijn voor ons.")
}

// TestPraiseAndClosing: a hand won is praised once per two hands, in every
// lesson, and the last trick of the last hand closes the lesson, after any
// other step. Vrij spelen has neither. The first hand of the basic game has
// the score instead, with the compliment in it.
func TestPraiseAndClosing(t *testing.T) {
	closing := map[string]string{
		planBasis:  "Dit was de les over het basisspel. In de volgende les leer je roem en troeven tellen: die kies je bij Oefenen.",
		planRoem:   "Dit was de les over roem en tellen. In de volgende les leer je seinen: die kies je bij Oefenen.",
		planSeinen: "Dit was de les over seinen, de laatste les. Bij Oefenen kun je nu vrij spelen.",
	}
	for _, plan := range []string{planBasis, planRoem, planSeinen} {
		r := lessonRoom(t)
		r.opts.Lesson = plan
		r.taught = map[string]int{lessonWon: 1, lessonLast: lastShows, lessonSignal: lessonShows}
		playedOut(t, r, true)
		var got [lessonLength + 1][]lessonStep
		for r.handNo = 1; r.handNo <= lessonLength; r.handNo++ {
			got[r.handNo] = r.trickLessons(game.Trick{Winner: 1}, [4]string{})
		}
		what, well := r.praise()
		praised := lessonStep{Spot: "score", Text: what + " " + well}
		end := lessonStep{Spot: "score", Text: closing[plan]}
		first := []lessonStep{praised}
		if plan == planBasis {
			if len(got[1]) != 1 || !strings.HasPrefix(got[1][0].Text, "Het potje is uit: ") || !strings.Contains(got[1][0].Text, well) {
				t.Errorf("%s, hand 1: %+v", plan, got[1])
			}
			first = got[1]
		}
		for h := 1; h <= lessonLength; h++ {
			var want []lessonStep
			switch {
			case h == 1:
				want = first
			case h == lessonLength:
				want = []lessonStep{end}
			case h%2 == 1:
				want = []lessonStep{praised}
			}
			if !slices.Equal(got[h], want) {
				t.Errorf("%s, hand %d: %+v, want %+v", plan, h, got[h], want)
			}
		}
		// Praise due in the last hand comes before the closing step.
		r.handNo, r.taught = lessonLength, map[string]int{lessonWon: 1, lessonLast: lastShows, lessonSignal: lessonShows}
		if got := r.trickLessons(game.Trick{Winner: 1}, [4]string{}); !slices.Equal(got, []lessonStep{praised, end}) {
			t.Errorf("%s, praise in the last hand: %+v", plan, got)
		}
		// A hand not won closes the lesson all the same, and the explanation
		// of the trick comes first.
		playedOut(t, r, false)
		r.handNo, r.taught = lessonLength, map[string]int{lessonWon: 1, lessonLast: lastShows, lessonSignal: lessonShows}
		tips := [4]string{"Opa Dirk wint de slag."}
		if got := r.trickLessons(game.Trick{Winner: 1}, tips); !slices.Equal(got, []lessonStep{{Spot: "trick", Text: tips[0]}, end}) {
			t.Errorf("%s, a hand lost: %+v", plan, got)
		}
		// The last hand's closing step needs the last trick of the hand.
		hands, talon := game.ShuffleFor(4, rand.New(rand.NewPCG(1, 2)))
		r.deal = game.NewDealFor(4, 3, hands, talon, game.Utrechts, game.Amsterdams, 0)
		if got := r.trickLessons(game.Trick{Winner: 1}, [4]string{}); got != nil {
			t.Errorf("%s, a trick before the last: %+v", plan, got)
		}
	}
	r := lessonRoom(t)
	r.opts.Lesson, r.handNo = "", lessonLength
	playedOut(t, r, true)
	if got := r.trickLessons(game.Trick{Winner: 1}, [4]string{"Opa Dirk wint de slag."}); got != nil {
		t.Errorf("vrij spelen: %+v", got)
	}
}

// TestTrumpsLeft: the trump counter runs in the counting hand of the lesson on
// roem only.
func TestTrumpsLeft(t *testing.T) {
	for _, c := range []struct {
		lesson string
		hand   int
		want   bool
	}{
		{planRoem, countHand, true},
		{planRoem, countHand - 1, false},
		{planRoem, countHand + 1, false},
		{planBasis, countHand, false},
		{planSeinen, countHand, false},
		{"", countHand, false},
	} {
		r := lessonRoom(t)
		r.opts.Lesson, r.handNo = c.lesson, c.hand
		if err := r.deal.ChooseTrump(r.deal.Turn(), game.Hearts); err != nil {
			t.Fatal(err)
		}
		n, ok := r.trumpsLeft()
		if ok != c.want {
			t.Errorf("lesson %q, hand %d: counter %v", c.lesson, c.hand, ok)
		}
		if want := game.NumRanks - trumpsIn(r.deal.Hand(0), game.Hearts); ok && n != want {
			t.Errorf("%d trumps left, want %d", n, want)
		}
	}
}

// TestGreeting: Juf Jannie's greeting is left out only in the lesson on the
// basic game, where she introduces herself at once.
func TestGreeting(t *testing.T) {
	s, _, _ := newTestServer(t)
	for _, plan := range []string{"", planBasis, planRoem, planSeinen} {
		juf := 0
		for range 16 { // two of the three bots speak, at random
			r := lessonRoomOn(s)
			r.opts.Lesson = plan
			r.greet()
			juf += len(r.seats[2].said["greet"])
			if !r.greets(1) || !r.greets(3) {
				t.Errorf("lesson %q: an opponent does not greet", plan)
			}
			r.stop()
		}
		if (juf > 0) != (plan != planBasis) {
			t.Errorf("lesson %q: Juf Jannie greeted %d times", plan, juf)
		}
	}
}

// TestNoSignalsMakkelijk: makkelijk bots neither give nor read a signal, so a
// training table with them has none, whatever it agreed: nothing in a view.
// Elsewhere the agreements stand: the people at the table may play them.
func TestNoSignalsMakkelijk(t *testing.T) {
	r := lessonRoom(t)
	r.opts.Lesson, r.opts.AI = "", "makkelijk"
	if got := r.signals(); got != (game.Signals{}) {
		t.Errorf("training at makkelijk: signals %+v", got)
	}
	if got := r.matchView(r.deal, 0, 1).Signals; *got != (game.Signals{}) {
		t.Errorf("training at makkelijk: a view with %+v", *got)
	}
	r.opts.AI = "normaal"
	if got := r.signals(); got != r.opts.Signals || got == (game.Signals{}) {
		t.Errorf("training at normaal: signals %+v", got)
	}
	r.training, r.opts.AI = false, "makkelijk"
	if got := r.signals(); got != r.opts.Signals || got == (game.Signals{}) {
		t.Errorf("no training: signals %+v", got)
	}
}

// TestSignalSteps: the introduction names each agreement of the table.
func TestSignalSteps(t *testing.T) {
	r := lessonRoom(t)
	steps := r.signalSteps()
	if len(steps) != 4 || !strings.Contains(steps[0].Text, "spreken we er drie af") || !strings.HasPrefix(steps[1].Text, "Met de aas seinen: ") ||
		!strings.HasPrefix(steps[2].Text, "Op- en afseinen: ") || !strings.HasPrefix(steps[3].Text, "Kleintje boer: ") {
		t.Errorf("default signals: %+v", steps)
	}
	r.opts.Signals = game.Signals{BoerOverBoer: true}
	if steps := r.signalSteps(); len(steps) != 2 || !strings.Contains(steps[0].Text, "spreken we er één af") || !strings.HasPrefix(steps[1].Text, "Boer over boer: ") {
		t.Errorf("boer over boer alone: %+v", steps)
	}
}

// TestSignalChat: a match of four starts with the table's agreements on
// signals in the chat, each with what it says, or a line that there are
// none, as in vrij spelen at makkelijk, whose bots play without. A lesson
// puts nothing there: Juf Jannie tells them herself, or there are none. With
// two or three players signals play no part.
func TestSignalChat(t *testing.T) {
	s, _, _ := newTestServer(t)
	lines := func(set func(r *room)) []string {
		r := newRoom(s, "SEIN")
		defer r.stop()
		set(r)
		r.signalChat()
		var out []string
		for _, m := range r.chat {
			if !m.Sys || m.Seat != -1 {
				t.Errorf("not a system line: %+v", m)
			}
			out = append(out, m.Text)
		}
		return out
	}
	got := lines(func(*room) {})
	if len(got) != 4 || got[0] != "Seinen aan deze tafel:" || !strings.HasPrefix(got[1], "Met de aas seinen: ") ||
		got[2] != "Op- en afseinen: heeft je maat de slag en kun je niet bekennen, dan zeg je met een 7, 8 of 9: speel deze kleur, daar heb ik de hoogste van (opseinen). "+
			"Met een 10, boer, vrouw of heer zeg je: de hoogste van deze kleur heb ik niet (afseinen)." || !strings.HasPrefix(got[3], "Kleintje boer: ") {
		t.Errorf("default signals: %q", got)
	}
	if got := lines(func(r *room) { r.opts.Signals = game.Signals{} }); !slices.Equal(got, []string{"Aan deze tafel spreken we geen seinen af."}) {
		t.Errorf("no signals: %q", got)
	}
	if got := lines(func(r *room) { r.opts.Players = 3 }); got != nil {
		t.Errorf("three players: %q", got)
	}
	if got := lines(func(r *room) { r.training, r.opts.AI = true, "makkelijk" }); !slices.Equal(got, []string{"Aan deze tafel spreken we geen seinen af."}) {
		t.Errorf("vrij spelen at makkelijk: %q", got)
	}
	if got := lines(func(r *room) { r.training = true }); len(got) != 4 {
		t.Errorf("vrij spelen: %q", got)
	}
	if got := lines(func(r *room) { r.opts.AI = "makkelijk" }); len(got) != 4 {
		t.Errorf("makkelijk bots at a table of people: %q", got)
	}
	for _, plan := range []string{planBasis, planRoem, planSeinen} {
		for _, sig := range []game.Signals{game.DefaultSignals, {}} {
			if got := lines(func(r *room) { r.training, r.opts.Lesson, r.opts.Signals = true, plan, sig }); got != nil {
				t.Errorf("lesson %s, signals %+v: %q", plan, sig, got)
			}
		}
	}
	// A match, rematches too, puts them right after its start line.
	r := newRoom(s, "SEIN")
	defer r.stop()
	r.seats[0] = newHuman("A")
	r.opts.Seed = 55
	for range 2 {
		r.chat = nil
		r.startMatch()
		if len(r.chat) < 2 || r.chat[0].Text != "Het spel begint: 16 potjes, Utrechts/Amsterdams. Veel plezier!" || r.chat[1].Text != "Seinen aan deze tafel:" {
			t.Errorf("start of a match: %+v", r.chat)
		}
	}
}

// TestRoemParts: the roem of a trick by the cards it is made of, as
// game.TrickRoem finds it.
func TestRoemParts(t *testing.T) {
	for _, c := range []struct {
		cards string
		want  []string
	}{
		{"9S TS JS 7H", []string{"♠9, ♠10 en ♠B op een rij (driekaart, 20)"}},
		{"TC JC QC KC", []string{"♣10, ♣B, ♣V en ♣H op een rij (vierkaart, 50)"}},
		{"QH KH 7S AD", []string{"♥V en ♥H van troef (stuk, 20)"}},
		{"KH JH QH 9C", []string{"♥B, ♥V en ♥H op een rij (driekaart, 20)", "♥V en ♥H van troef (stuk, 20)"}},
		{"JS JH JD JC", []string{"vier boeren (200)"}},
		{"AS AH AD AC", []string{"vier azen (100)"}},
		{"9S 9H 9D 9C", nil},
		{"9S TS 8H AD", nil},
		{"QS KS 7S AD", nil}, // heer en vrouw, but not of trump
	} {
		cards := game.MustParseCards(c.cards)
		got := roemParts(cards, game.Hearts)
		if !slices.Equal(got, c.want) {
			t.Errorf("%s: %q, want %q", c.cards, got, c.want)
		}
		points := 0
		for _, part := range got {
			n, _ := strconv.Atoi(part[strings.LastIndexAny(part, "( ")+1 : len(part)-1])
			points += n
		}
		if want := game.RoemPoints(cards, game.Hearts); points != want {
			t.Errorf("%s: parts add up to %d, roem is %d", c.cards, points, want)
		}
	}
}

// TestScoreStep: the score of the first hand, with roem, pit and nat.
func TestScoreStep(t *testing.T) {
	r := lessonRoom(t)
	d := r.deal
	if err := d.ChooseTrump(d.Turn(), game.Hearts); err != nil {
		t.Fatal(err)
	}
	for d.Phase() == game.PhasePlay {
		if err := d.Play(d.Turn(), d.Legal()[0]); err != nil {
			t.Fatal(err)
		}
	}
	res := d.Result()
	text := r.scoreStep("").Text
	who := capital(r.who(res.TrumpBy))
	for _, part := range []string{
		"Het potje is uit: wij hebben ",
		who + " koos troef, dus ",
		"Na " + strconv.Itoa(lessonLength) + " potjes wint het koppel met de meeste punten.",
	} {
		if !strings.Contains(text, part) {
			t.Errorf("%q lacks %q", text, part)
		}
	}
	if res.Nat != strings.Contains(text, "Dat is niet gelukt") || res.Pit != strings.Contains(text, "pit") {
		t.Errorf("%q for %+v", text, res)
	}
	// A compliment goes after the result, before the rule of the match.
	if text := r.scoreStep("Goed gespeeld.").Text; !strings.Contains(text, ". Goed gespeeld. Na "+strconv.Itoa(lessonLength)+" potjes") {
		t.Errorf("with a compliment: %q", text)
	}
}

// TestSharedSteps: the step lists every room shares stay unnumbered when a
// room starts them, so one room's numbers never show up in another's.
func TestSharedSteps(t *testing.T) {
	r := lessonRoom(t)
	r.lessonN = 40
	for _, steps := range [][]lessonStep{pointsSteps, roemSteps} {
		r.startLesson(steps)
		if steps[0].N != 0 || r.lesson == nil || r.lesson.N != r.lessonN-len(steps)+1 {
			t.Errorf("startLesson numbered the shared list: %+v, on screen %+v", steps[0], r.lesson)
		}
		r.clearLesson()
	}
}
