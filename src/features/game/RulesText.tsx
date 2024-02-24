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
      <h2>Meta Game and stats</h2>
      <br />
      To be continued...
      <br />
    </Typography>
  );
};

export default RulesPopUp;
