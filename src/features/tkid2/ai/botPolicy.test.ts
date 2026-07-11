import {
  Difficulty,
  chooseAction,
  evaluate,
} from "./botPolicy";
import {
  TKID2State,
  applyAction,
  currentPlayer,
  currentRegionId,
  isGameOver,
  legalActions,
  newGame,
} from "../engine/tkid2Engine";

const P = [
  { id: "p1", name: "Human", isBot: false },
  { id: "p2", name: "Bot", isBot: true },
];

describe("botPolicy", () => {
  it("always returns a legal action for the player on turn", () => {
    const s = newGame(P, 21);
    // Move to the bot's turn.
    const afterHuman = applyAction(s, { type: "pass" }).state;
    const bot = currentPlayer(afterHuman);
    const action = chooseAction(afterHuman, bot.id, "godlike");
    const legal = legalActions(afterHuman);
    expect(legal).toContainEqual(action);
  });

  it("is deterministic for the same state and difficulty", () => {
    const s = newGame(P, 33);
    const a = chooseAction(s, "p1", "godlike");
    const b = chooseAction(s, "p1", "godlike");
    expect(a).toEqual(b);
  });

  it("prefers taking a follower of the leading faction on easy", () => {
    let s = newGame(P, 5);
    const region = currentRegionId(s)!;
    s.regions[region] = { english: 3, scottish: 1, welsh: 0 };
    const action = chooseAction(s, "p1", "easy");
    expect(action).toEqual({ type: "pass", takeFollower: "english" });
  });

  it("evaluate rewards alignment with the projected deciding faction", () => {
    const base = newGame(P, 5);
    const region = currentRegionId(base)!;
    // Make english clearly the projected winner of the contested region.
    base.regions[region] = { english: 5, scottish: 0, welsh: 0 };
    const withEnglish: TKID2State = {
      ...base,
      players: [
        { ...base.players[0], court: { english: 3, scottish: 0, welsh: 0 } },
        { ...base.players[1], court: { english: 0, scottish: 0, welsh: 0 } },
      ],
    };
    const without: TKID2State = {
      ...base,
      players: [
        { ...base.players[0], court: { english: 0, scottish: 0, welsh: 0 } },
        { ...base.players[1], court: { english: 0, scottish: 0, welsh: 0 } },
      ],
    };
    expect(evaluate(withEnglish, "p1")).toBeGreaterThan(evaluate(without, "p1"));
  });

  it.each<Difficulty>(["easy", "normal", "godlike"])(
    "drives a full 2-player game to completion (%s)",
    (difficulty) => {
      let s = newGame(P, 77);
      let guard = 0;
      while (!isGameOver(s) && guard < 2000) {
        guard++;
        const player = currentPlayer(s);
        const action = chooseAction(s, player.id, difficulty);
        const res = applyAction(s, action);
        expect(res.error).toBeUndefined();
        s = res.state;
      }
      expect(isGameOver(s)).toBe(true);
    },
  );

  it("drives a human + 2 bot game with mixed difficulties", () => {
    const three = [
      { id: "p1", name: "Human", isBot: false },
      { id: "p2", name: "Bot A", isBot: true },
      { id: "p3", name: "Bot B", isBot: true },
    ];
    let s = newGame(three, 99);
    let guard = 0;
    while (!isGameOver(s) && guard < 3000) {
      guard++;
      const player = currentPlayer(s);
      const diff: Difficulty = player.id === "p2" ? "godlike" : "normal";
      const res = applyAction(s, chooseAction(s, player.id, diff));
      expect(res.error).toBeUndefined();
      s = res.state;
    }
    expect(isGameOver(s)).toBe(true);
  });
});
