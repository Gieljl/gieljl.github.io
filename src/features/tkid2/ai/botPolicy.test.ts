import { chooseAction, evaluate } from "./botPolicy";
import {
  Tkid2State,
  applyAction,
  contestedRegionId,
  currentPlayer,
  gameResult,
  isGameOver,
  legalActions,
  newGame,
} from "../engine/tkid2Engine";

const PLAYERS = [
  { id: "bot-1", name: "One", isBot: true },
  { id: "bot-2", name: "Two", isBot: true },
  { id: "bot-3", name: "Three", isBot: true },
];

describe("botPolicy", () => {
  it("always returns a legal action", () => {
    const state = newGame(PLAYERS, 17);
    const action = chooseAction(state, "bot-1", "godlike");
    const res = applyAction(state, action);
    expect(res.error).toBeUndefined();
  });

  it("is deterministic", () => {
    const state = newGame(PLAYERS, 31);
    const a = chooseAction(state, "bot-1", "normal");
    const b = chooseAction(state, "bot-1", "normal");
    expect(a).toEqual(b);
  });

  it("passes when the contested struggle already favours its strategy", () => {
    const state = newGame(PLAYERS, 40);
    const contested = contestedRegionId(state)!;
    // The contested region is safely Welsh, and this bot plays a Welsh game.
    state.regions[contested].cubes = { scottish: 0, welsh: 4, english: 0 };
    state.players[0].court = { scottish: 0, welsh: 3, english: 0 };
    const action = chooseAction(state, "bot-1", "godlike");
    expect(action.type).toBe("pass");
  });

  it("spends a card rather than pass into a losing game end", () => {
    const state = newGame(PLAYERS, 41);
    const contested = contestedRegionId(state)!;
    // Two instability discs are already on the board; the contested region is
    // tied, and both opponents have passed. Passing now resolves the region
    // unstable → third disc → French invasion, which this bot loses on sets.
    state.instabilityInFrance = 1;
    state.regions.gwynedd.unstable = true;
    state.regions.devon.unstable = true;
    state.regions[contested].cubes = { scottish: 1, welsh: 1, english: 0 };
    state.consecutivePasses = PLAYERS.length - 1;
    state.players[0].court = { scottish: 2, welsh: 0, english: 0 }; // 0 sets
    state.players[1].court = { scottish: 1, welsh: 1, english: 1 }; // 1 set
    const action = chooseAction(state, "bot-1", "godlike");
    expect(action.type).toBe("play");
  });

  it("does not dump its whole hand — cards survive a full bots game", () => {
    let state: Tkid2State = newGame(PLAYERS, 9);
    let steps = 0;
    while (!isGameOver(state) && steps < 1000) {
      const onTurn = currentPlayer(state).id;
      const res = applyAction(state, chooseAction(state, onTurn, "godlike"));
      expect(res.error).toBeUndefined();
      state = res.state;
      steps++;
    }
    expect(isGameOver(state)).toBe(true);
    const cardsLeft = state.players.reduce((n, p) => n + p.hand.length, 0);
    expect(cardsLeft).toBeGreaterThan(0);
  });

  it("plays a bots-only game to completion at every difficulty", () => {
    for (const difficulty of ["easy", "normal", "godlike"] as const) {
      let state: Tkid2State = newGame(PLAYERS, 5, {
        advanced: difficulty === "godlike",
      });
      let steps = 0;
      while (!isGameOver(state) && steps < 1000) {
        const onTurn = currentPlayer(state).id;
        const action = chooseAction(state, onTurn, difficulty);
        const res = applyAction(state, action);
        expect(res.error).toBeUndefined();
        state = res.state;
        steps++;
      }
      expect(isGameOver(state)).toBe(true);
      expect(gameResult(state)).not.toBeNull();
    }
  });

  it("evaluate prefers courts aligned with powerful factions", () => {
    const state = newGame(PLAYERS, 8);
    const richer = JSON.parse(JSON.stringify(state)) as Tkid2State;
    richer.players[0].court = { scottish: 3, welsh: 3, english: 3 };
    expect(evaluate(richer, "bot-1")).toBeGreaterThan(evaluate(state, "bot-1"));
  });

  it("summons when a summon is pending", () => {
    let state = newGame(PLAYERS, 12);
    const play = legalActions(state).find((a) => a.type === "play")!;
    state = applyAction(state, play).state;
    expect(state.pendingSummon).toBe(true);
    const action = chooseAction(state, "bot-1", "normal");
    expect(action.type).toBe("summon");
  });
});
