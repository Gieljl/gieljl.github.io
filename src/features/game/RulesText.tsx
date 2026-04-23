import React from "react";

import {
 
  Typography,
} from "@mui/material";


const RulesPopUp: React.FC = () => {

  return (
    <Typography>
      <br />
      Yasat is an advanced mangling of a traditional card game called Yaniv
      (also known as Yusuf, Jhyap, Jafar, aa’niv, Minca or Dave) which is played
      in the Middle East. The game is played with a standard 52-card deck. It
      played in rounds, and the goal of each round is to declare "Yasat" with 7
      or fewer points in your hand. You win the round if you have the fewest
      points when the game ends.
      <br />
      <br />
      However, Yasat has a Meta game, which is about collecting <i>
        stats
      </i>{" "}
      with specific values. The Meta Game is a game of strategy and tactics, and
      it is played by the players to gain an advantage over their opponents.{" "}
      <br />
      <br />
      <h2>Basic Rules</h2>
      <strong>1. Objective of a Round</strong>
      <br />
      The goal of a Yasat round is to declare "Yasat" with 7 or fewer points in
      your hand when you believe you have the least points. You can only declare
      "Yasat" at the beginning of your turn. If you go below 7 points during
      your turn by exchanging cards, you must wait until your next turn to
      declare "Yasat."
      <br />
      <br />
      <strong>2. Round Flow</strong>
      <br />
      Players aim to minimize the number and point value of cards in their hands
      by exchanging cards.
      <br />
      <br />
      <strong>Card Values:</strong>
      <br />
      - An Ace can count as 1 or 11 points, at the player's choice.
      <br />
      - Face cards (Jack, Queen, King) are each worth 10 points.
      <br />
      - The remaining cards are worth their nominal value in points.
      <br />
      <br />
      <strong>3. Combining Cards</strong>
      <br />
      Players can combine cards to improve their hand:
      <br />
      - Pairs: For example, two Jacks, regardless of color, can be exchanged for
      one card from the disc.
      <br />
      - Three of a Kind: Three cards of the same rank, such as three 7s, can be
      exchanged for 1 card.
      <br />
      - Four of a Kind: Four cards of the same rank, such as four 2s, can be
      exchanged for 1 card.
      <br />
      - Straights: Must consist of cards of the same suit (black or red). A
      straight begins with 3 cards and can vary, such as Ace-2-3,
      Queen-King-Ace, or 9-10-Jack. All combinations between these cards are
      possible.
      <br />
      <br />
      <strong>4. Round Mechanism</strong>
      <br />
      - Players take turns exchanging cards.
      <br />
      - If a player cannot form pairs, three of a kinds, four of kinds or
      straights, they draw a card from the discard pile or the closed deck. From
      the open discard pile, the player can only pick the last discarded card or
      one of the cards in the last discarded set. It's important that players
      must discard a card before picking a new one.
      <br />
      <br />
      <strong>5. Start of a Round</strong>
      <br />
      - Each player starts with 4 cards.
      <br />
      - The player who last declared "Yasat" becomes the dealer.
      <br />
      - The player to the left of the dealer starts the game.
      <br />
      - After dealing the 4 cards, the top card of the deck is discarded face up
      on the table to start the game.
      <br />
      <br />
      <strong>6. Declaring Yasat!</strong>
      <br />
      - A player may declare "Yasat" at the beginning of their turn if they have
      7 points or fewer.
      <br />
      - When "Yasat" is declared, players compare their points: - The player who
      declared "Yasat" wins if they have the fewest points. - If another player
      has fewer points, the one who declared "Yasat" loses. - In case of a tie
      in points, such as multiple players having 7 points, the player who
      declared "Yasat" wins.
      <br />
      <br />
      <strong>7. End of the Round and Points:</strong>
      <br />
      - Players accumulate points throughout the game. If a player gathers more
      than 100 points, they are out of the game.
      <br />
      - When counting points, an Ace can be counted as 1 or 11 points. This can
      be strategically used to reach exactly 50 or 100 points.
      <br />
      - There are special rules for resetting the score to zero if a player has
      exactly 50 or 100 points.
      <br />
      <br />
      <h2>Meta Game and Stats</h2>
      <br />
      Beyond the basic card game, Yasat features a Meta Game where players
      collect <i>stats</i> based on in-game events. Each stat has a weighted
      value, and the player with the highest weighted score is in the lead. In
      ranked games, these stats are tracked and saved online.
      <br />
      <br />
      <strong>Yasat</strong> (+1)
      <br />
      Awarded when you successfully declare Yasat and win the round. Winning
      consecutive rounds builds your <i>streak</i>.
      <br />
      <br />
      <strong>Longest Streak</strong> (+3)
      <br />
      The player who holds the longest consecutive Yasat streak in the game gets
      this bonus. If another player matches your streak it stays with you — they
      must beat it to take it over.
      <br />
      <br />
      <strong>Own</strong> (+3)
      <br />
      When Yasat is declared and you have a <i>lower</i> score than the Yasat
      caller, you "own" them. Your round score is reset to 0.
      <br />
      <br />
      <strong>Owned</strong> (−2)
      <br />
      You declared Yasat but another player had a lower score — you got owned.
      Instead of 0 points you receive 35 penalty points.
      <br />
      <br />
      <strong>Multi-owned</strong> (−1)
      <br />
      You got owned by more than one player in the same round. An extra penalty
      on top of each individual "Owned".
      <br />
      <br />
      <strong>Kill</strong> (+2)
      <br />
      When you declare Yasat and another player's total score exceeds 100, they
      "die" (reset to 0) and you earn a Kill.
      <br />
      <br />
      <strong>Double / Multi / Mega / Monster Kill</strong> (+1 / +2 / +3 / +4)
      <br />
      Bonus stats for killing 2, 3, 4, or 5 players in a single round.
      <br />
      <br />
      <strong>Death</strong> (−5)
      <br />
      Your total score exceeded 100. You're reset to 0 but lose 5 weighted
      points.
      <br />
      <br />
      <strong>Nullify 50</strong> (+1) / <strong>Nullify 100</strong> (+2)
      <br />
      When your total score lands on exactly 50 or 100, it resets to 0 — a
      Nullify.
      <br />
      <br />
      <strong>Enable 50</strong> (−1) / <strong>Enable 100</strong> (−1)
      <br />
      You declared Yasat and caused another player to land on exactly 50 or 100,
      enabling their Nullify.
      <br />
      <br />
      <strong>Lullify</strong> (+2)
      <br />
      A special Nullify: your score was 69 and the round pushed you to exactly
      100, which resets to 0.
      <br />
      <br />
      <strong>Enable 69</strong> (0)
      <br />
      You declared Yasat and caused a Lullify for another player. Tracked but
      carries no weighted value.
      <br />
      <br />
      <strong>Contra-own 50</strong> (+2) / <strong>Contra-own 100</strong> (+2)
      <br />
      A Nullify that originated from an Own. Your score was 15 and the Own pushed
      you to 50 (Contra-own 50), or your score was 65 and the Own pushed you to
      100 (Contra-own 100). You get both the Own and the Contra-own bonus.
      <br />
      <br />
      <h3>Weighted Score</h3>
      The weighted score is calculated by multiplying each stat's count by its
      weight and summing them up. The Longest Streak bonus is applied only once
      (not multiplied by streak length). Custom weight configurations can be set
      in the game settings.
      <br />
    </Typography>
  );
};

export default RulesPopUp;
