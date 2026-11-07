# Yasat

Yasat is a variant of Yaniv with a meta game: rounds of calling *Yasat*
with the fewest points, and a weighted score of what happened in them.
These rules are the Yasat app's (`src/features/play` in this repository),
ported to Go so that they run on Jannie's table.

## Rules

- A 52-card deck. An ace is 1 (at the end of a round 1 or 11, as its
  holder chooses), a court card 10, the others their pips.
- Everyone gets 4 cards; the top card of the deck goes face up on the
  discard pile. The dealer is whoever last called Yasat and won; the seat
  after the dealer starts.
- A turn: throw away one card, a pair, three or four of a rank, or a
  straight (three or more cards of one colour with consecutive ranks; an
  ace low, A-2-3, or high, Q-K-A). Then take one card: the top of the deck,
  or one of the cards the previous player threw away. An empty deck is
  refilled with the discards under the top ply, shuffled.
- At the start of your turn, with 7 points or fewer, you may call Yasat.
  Nobody lower (a tie counts for the caller): the caller adds 0 (*yasat*).
  Otherwise the caller adds 35 (*owned*, *multi-owned* for more than one)
  and whoever was lower adds 0 (*own*). The others add their hand.
- A total over 100 goes back to 0 (*death*; the winning caller gets a
  *kill*, or a double, multi, mega or monster kill). Exactly 50 or 100 goes
  back to 0 (*nullify*, the caller *enable*), 69 to 100 too (*lullify*,
  *enable-69*), and an owned caller who lands there with the 35 gets
  *contra-own*.
- The weighted score is the sum of the events' weights (the Yasat app's
  defaults, `yasat.Weights`), plus 2 for whoever first reached the longest
  run of yasats (longer than one).
- A game lasts ten rounds (`bo10`), until someone has a weighted score of
  10 (`first10`), or as long as you like (`classic`). The highest weighted
  score wins; a tie goes to the lowest total.

## Bots

`yasatbot` is the app's `botPolicy.ts`: it scores the hand left after
every discard and draw (few points, low cards, combinations still in it),
estimates the risk of a call from what it saw others take, and has five
personalities (cautious, balanced, aggressive, opportunist, gambler; per
persona, `PersonalityOf`). The levels are the app's: *makkelijk* (easy)
forgets most of what it saw and considers only singles and pairs,
*normaal* slips now and then, and *sterk* (the app's godlike) never slips
and looks at every card, the others' hands and the top of the deck
included. `TestArena` checks that sterk beats normaal beats makkelijk.

## The server

`yasatserver` plays a match on the table's Game API (`docs/server.md` in
Jannie). Its messages: `yasat` (call), `move` (`discard`: card codes, and
`deck: true` or `take`: a card of the top ply) and `aces` (`eleven`: the
aces to count 11). After a call, everyone but the caller who holds an ace
chooses within 25 seconds (bots at once); whoever does not gets the best
choice. The round's result waits for *ready*.

The state adds to the table's: `round`, `dealer`, `hand`, `top` (the top
ply), `deck` (its size), `totals`, `weighted`, `streak`, `canCall`,
`moves` (this round's), `caller`, `hands` (once the round is over), `aces`
and `acesEnd`, `last` and `history` (scored rounds), and `winner`.

## The site

`web/` is Yasat's site on Jannie's shell, from toepen's: seats on an
ellipse, the draw pile and the top ply in the middle, your cards below.
Tap cards to pick a discard, then tap the deck or a card of the top ply.

## Scoreblad

`web/js/score.js` keeps the score of a game with real cards: the players,
then per round who called and every hand's points. It scores with the
same rules (`score` and `weighted` in `rules.js`) and keeps the sheet in
this browser (`kj.score`).
