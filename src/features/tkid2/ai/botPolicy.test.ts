import { chooseAction, evaluate } from "./botPolicy";
import {
  Tkid2State,
  applyAction,
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

  it("evaluate prefers courts aligned with the strongest faction", () => {
    const state = newGame(PLAYERS, 8);
    // Give bot-1 a court stacked with the projected leader everywhere.
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
