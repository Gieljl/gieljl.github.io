package server

import "jannie/games/klaverjas/game"

// stateFor builds the full state `s` for the player at seat i
// (games/klaverjas/README.md#state-s).
func (r *room) stateFor(i game.Seat) *state {
	s := &state{
		Code:        r.code,
		Phase:       r.phase,
		Opts:        r.opts,
		Training:    r.training,
		Expert:      r.expert,
		You:         int(i),
		Host:        int(r.host),
		HandNo:      r.handNo,
		Hands:       r.opts.Hands,
		Players:     make([]*playerState, r.players()),
		Dealer:      -1,
		Voorhand:    -1,
		Bids:        make([]int, r.players()),
		Bidder:      -1,
		Soloist:     -1,
		Talon:       []game.Card{},
		Discards:    []game.Card{},
		TrumpBy:     -1,
		PlayingTeam: -1,
		Turn:        -1,
		Hand:        []game.Card{},
		Scores:      r.scores,
		Total:       r.total,
		PrevHand:    r.prev,
		LastTrick:   r.lastTrick,
		Winner:      -1,
	}
	if s.Scores == nil {
		s.Scores = []scoreRow{}
	}
	if r.training && i == r.learner() {
		s.Lesson = r.lesson
		if n, ok := r.trumpsLeft(); ok {
			s.TrumpsLeft = &n
		}
	}
	if s.Total == nil {
		s.Total = make([]int, game.Scorers(r.players()))
	}
	for k := range s.Players {
		s.Players[k] = r.playerState(game.Seat(k))
		s.Bids[k] = -1
	}
	switch r.phase {
	case phaseLobby:
		s.Roster = r.roster()
		return s
	case phaseHandEnd, phasePlay: // play: training, the last trick kept for its tip
		s.NextAt = unixMilli(r.nextAt)
	case phaseGameOver:
		s.Winner = r.winner
		s.Review = r.reviewFor(i)
	}
	d := r.deal
	if d == nil {
		return s
	}
	s.Dealer, s.Voorhand = int(d.Dealer()), int(d.Voorhand())
	bids := d.Bids()
	copy(s.Bids, bids[:])
	s.Forced = d.Forced()
	if d.Mode() == game.Gedraaid && d.Players() != 3 {
		t := d.Turned()
		s.Turned = &t
	}
	if d.Players() == 3 {
		bidder, bid := d.Contract()
		s.Bid, s.Bidder = bid, int(bidder)
		if d.Phase() != game.PhaseAuction {
			s.Soloist = int(bidder)
		}
		if bidder == i && d.Phase() != game.PhaseAuction && r.inHand() {
			s.Talon = d.Talon()
			if ds := d.Discards(); ds != nil {
				s.Discards = ds
			}
		}
	}
	trump, known := d.Trump()
	if known {
		s.Trump = &trump
		s.TrumpBy = int(d.TrumpBy())
		s.PlayingTeam = d.PlayingTeam()
	}
	s.TricksWon, s.HandPoints, s.HandRoem = d.TricksWon(), d.HandPoints(), d.HandRoem()
	if d.Players() == 2 && r.inHand() {
		var piles [2][8]game.Pile
		var roem [2][]game.RoemItem
		for k := range game.Seat(2) {
			piles[k] = d.Piles(k)
			roem[k] = d.OpenRoem(k)
			if roem[k] == nil {
				roem[k] = []game.RoemItem{}
			}
		}
		s.Piles, s.OpenRoem = &piles, &roem
	}
	if !r.inHand() {
		return s
	}
	s.Hand = game.SortHand(d.Hand(i), trump, known)
	s.Trick = r.shownTrick()
	if r.pending == stepNone {
		s.Turn = int(d.Turn())
	}
	if q := r.asking; q != game.NoSeat {
		s.Takeover = &takeoverState{Seat: q, Left: r.seats[q].kind == seatLeft}
	}
	if s.Turn == int(i) {
		if d.Phase() == game.PhasePlay {
			legal := d.Legal()
			s.Legal = make([]game.Card, 0, len(legal))
			for _, c := range s.Hand {
				for _, l := range legal {
					if c == l {
						s.Legal = append(s.Legal, c)
					}
				}
			}
			s.Rule = d.Constraint()
		}
		if r.tipsOn() {
			s.Hint = r.hintFor(i)
		}
	}
	if (r.training || r.expert) && r.opts.Open {
		var all [4][]game.Card
		for k := range all {
			all[k] = game.SortHand(d.Hand(game.Seat(k)), trump, known)
		}
		s.Hands4 = &all
	}
	return s
}

// shownTrick is the trick on the table: the complete trick until it is
// collected, then the empty next trick led by its winner.
func (r *room) shownTrick() *game.Trick {
	t := r.deal.Current()
	if len(t.Cards) == r.deal.Players() && r.collected {
		return &game.Trick{Leader: t.Winner, Winner: game.NoSeat, Cards: []game.Played{}}
	}
	return &t
}
