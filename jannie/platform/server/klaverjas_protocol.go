package server

import "jannie/games/klaverjas/game"

// whyMsg is the engine's reasoning for one decision (expert): see
// cmdWhy.
type whyMsg struct {
	T        string       `json:"t"` // "why"
	Hand     int          `json:"hand"`
	Trick    int          `json:"trick"`
	Seat     game.Seat    `json:"seat"`   // the asker
	Played   *choiceJSON  `json:"played"` // null: the decision awaited now
	Normaal  choiceJSON   `json:"normaal"`
	Rule     string       `json:"rule"`
	Sterk    choiceJSON   `json:"sterk"`
	SterkWhy string       `json:"sterkWhy"` // why sterk's card is not one the search values most; else ""
	Hint     choiceJSON   `json:"hint"`
	HintText string       `json:"hintText"`
	HintWhy  string       `json:"hintWhy"` // why the hint keeps normaal's card while sterk plays another; else ""
	Worlds   int          `json:"worlds"`
	Options  []optionJSON `json:"options"`
}

// handReviewMsg is a finished hand of the match as the replay shows it,
// with the asker's graded decisions in it: see cmdHandReview.
type handReviewMsg struct {
	T       string     `json:"t"` // "handReview"
	Hand    int        `json:"hand"`
	Pending int        `json:"pending"` // grades of the hand still out
	Replay  replayHand `json:"replay"`
}

// optionJSON is one option of an explanation, rounded to tenths.
type optionJSON struct {
	choiceJSON
	Value   float64   `json:"value"`
	SE      float64   `json:"se"`
	Us      float64   `json:"us"`
	Them    float64   `json:"them"`
	NatUs   float64   `json:"natUs"`   // share of deals
	NatThem float64   `json:"natThem"` // share of deals
	Parts   []float64 `json:"parts,omitempty"`
	Why     string    `json:"why,omitempty"` // a card below the best: why the best brings more
}

// savedMsg confirms that something the player sent was kept (feedback).
type savedMsg struct {
	T    string `json:"t"`
	What string `json:"what"`
}

type tipMsg struct {
	T    string `json:"t"`
	Text string `json:"text"`
}

type evDeal struct {
	Type   string    `json:"type"`
	HandNo int       `json:"handNo"`
	Dealer game.Seat `json:"dealer"`
}

type evTurned struct {
	Type string    `json:"type"`
	Suit game.Suit `json:"suit"`
}

type evBid struct {
	Type string    `json:"type"`
	Seat game.Seat `json:"seat"`
	Play bool      `json:"play"`
}

// evAuction is a bid (bid > 0) or a pass (bid 0) with three players.
type evAuction struct {
	Type string    `json:"type"`
	Seat game.Seat `json:"seat"`
	Bid  int       `json:"bid"`
}

// evContract ends the auction: seat plays alone for bid (forced: the
// others passed and nobody bid) and takes the talon.
type evContract struct {
	Type   string    `json:"type"`
	Seat   game.Seat `json:"seat"`
	Bid    int       `json:"bid"`
	Forced bool      `json:"forced"`
}

type evTrump struct {
	Type   string    `json:"type"`
	Seat   game.Seat `json:"seat"`
	Suit   game.Suit `json:"suit"`
	Forced bool      `json:"forced"`
}

type evPlay struct {
	Type string    `json:"type"`
	Seat game.Seat `json:"seat"`
	Card game.Card `json:"card"`
}

type evTrick struct {
	Type   string          `json:"type"`
	Winner game.Seat       `json:"winner"`
	Points int             `json:"points"`
	Roem   []game.RoemItem `json:"roem"`
	Last   bool            `json:"last"`
}

type evCollect struct {
	Type   string    `json:"type"`
	Winner game.Seat `json:"winner"`
}

type evHandEnd struct {
	Type   string          `json:"type"`
	Result game.HandResult `json:"result"`
}

// state is the full per-seat state `s` of an update
// (games/klaverjas/README.md#state-s). Fields without omitempty are
// always present; roster, legal and rule only when they apply.
type state struct {
	Code        string              `json:"code"`
	Phase       string              `json:"phase"`
	Opts        Options             `json:"opts"`
	Training    bool                `json:"training"`
	Expert      bool                `json:"expert"`
	You         int                 `json:"you"`
	Host        int                 `json:"host"`
	Roster      []rosterEntry       `json:"roster,omitempty"`
	Players     []*playerState      `json:"players"`
	HandNo      int                 `json:"handNo"`
	Hands       int                 `json:"hands"`
	Dealer      int                 `json:"dealer"`
	Voorhand    int                 `json:"voorhand"`
	Turned      *game.Suit          `json:"turned"`
	Bids        []int               `json:"bids"`
	Forced      bool                `json:"forced"`
	Bid         int                 `json:"bid"`
	Bidder      int                 `json:"bidder"`
	Soloist     int                 `json:"soloist"`
	Talon       []game.Card         `json:"talon"`
	Discards    []game.Card         `json:"discards"`
	Piles       *[2][8]game.Pile    `json:"piles"`
	OpenRoem    *[2][]game.RoemItem `json:"openRoem"`
	Trump       *game.Suit          `json:"trump"`
	TrumpBy     int                 `json:"trumpBy"`
	PlayingTeam int                 `json:"playingTeam"`
	Turn        int                 `json:"turn"`
	Takeover    *takeoverState      `json:"takeover"`
	Hand        []game.Card         `json:"hand"`
	Legal       []game.Card         `json:"legal,omitempty"`
	Rule        string              `json:"rule,omitempty"`
	Trick       *game.Trick         `json:"trick"`
	LastTrick   *game.Trick         `json:"lastTrick"`
	TricksWon   [2]int              `json:"tricksWon"`
	HandPoints  [2]int              `json:"handPoints"`
	HandRoem    [2]int              `json:"handRoem"`
	Scores      []scoreRow          `json:"scores"`
	Total       []int               `json:"total"`
	PrevHand    *prevHand           `json:"prevHand"`
	NextAt      int64               `json:"nextAt"`
	Hint        *hint               `json:"hint"`
	Lesson      *lessonStep         `json:"lesson"`
	TrumpsLeft  *int                `json:"trumpsLeft"`
	Hands4      *[4][]game.Card     `json:"hands4"`
	Winner      int                 `json:"winner"`
	Review      *reviewState        `json:"review"`
}

// scoreRow is one line of the score sheet. Points, roem and score are per
// side, gains per scorer (game.HandResult).
type scoreRow struct {
	Hand        int       `json:"hand"`
	Dealer      game.Seat `json:"dealer"`
	Trump       game.Suit `json:"trump"`
	TrumpBy     game.Seat `json:"trumpBy"`
	PlayingTeam int       `json:"playingTeam"`
	Bid         int       `json:"bid"`
	Points      [2]int    `json:"points"`
	Roem        [2]int    `json:"roem"`
	Score       [2]int    `json:"score"`
	Gains       []int     `json:"gains"`
	Nat         bool      `json:"nat"`
	Pit         bool      `json:"pit"`
}

// prevHand is the review of the last finished hand.
type prevHand struct {
	Tricks []game.Trick    `json:"tricks"`
	Result game.HandResult `json:"result"`
}

// hint is a training hint; exactly one of Card, Suit and Play is set.
type hint struct {
	Card *game.Card `json:"card,omitempty"`
	Suit *game.Suit `json:"suit,omitempty"`
	Play *bool      `json:"play,omitempty"`
	Text string     `json:"text"`
}
