import {
  FACTIONS,
  INVASION_THRESHOLD,
  REGIONS,
  TKID2State,
  applyAction,
  crownCounts,
  currentPlayer,
  currentRegionId,
  decidingFaction,
  isGameOver,
  isInvasion,
  legalActions,
  newGame,
  projectedOwner,
  regionLeaders,
  results,
  seededShuffle,
  startingHand,
  winners,
} from "./tkid2Engine";

const P = [
  { id: "p1", name: "Alice", isBot: false },
  { id: "p2", name: "Bob", isBot: true },
];

describe("tkid2 setup", () => {
  it("gives every player the identical 8-card hand", () => {
    const s = newGame(P, 42);
    expect(startingHand()).toHaveLength(8);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(8);
      expect(p.court).toEqual({ english: 0, scottish: 0, welsh: 0 });
      expect(p.passed).toBe(false);
    }
  });

  it("seeds all regions and is deterministic for a given seed", () => {
    const a = newGame(P, 7);
    const b = newGame(P, 7);
    const c = newGame(P, 8);
    expect(a.eventOrder).toEqual(b.eventOrder);
    expect(a.eventOrder).not.toEqual(c.eventOrder); // extremely likely differs
    expect(a.eventOrder.slice().sort()).toEqual(REGIONS.map((r) => r.id).sort());
    for (const r of REGIONS) {
      expect(a.regions[r.id]).toEqual(r.setup);
    }
  });

  it("rejects illegal player counts", () => {
    expect(() => newGame([P[0]], 1)).toThrow();
    expect(() =>
      newGame(
        Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, name: `x${i}`, isBot: false })),
        1,
      ),
    ).toThrow();
  });

  it("seededShuffle is a permutation", () => {
    const input = [1, 2, 3, 4, 5];
    const out = seededShuffle(input, 123);
    expect(out.slice().sort()).toEqual(input);
  });
});

describe("region resolution", () => {
  it("regionLeaders / projectedOwner detect majority and ties", () => {
    expect(regionLeaders({ english: 3, scottish: 1, welsh: 0 })).toEqual(["english"]);
    expect(projectedOwner({ english: 3, scottish: 1, welsh: 0 })).toBe("english");
    expect(projectedOwner({ english: 2, scottish: 2, welsh: 0 })).toBe("french");
    expect(projectedOwner({ english: 0, scottish: 0, welsh: 0 })).toBe("french");
  });

  it("resolves a region and advances when everyone passes", () => {
    let s = newGame(P, 3);
    const region = currentRegionId(s)!;
    const owner = projectedOwner(s.regions[region]);

    // Both players pass without taking followers -> region resolves as-is.
    let r = applyAction(s, { type: "pass" });
    s = r.state;
    r = applyAction(s, { type: "pass" });
    s = r.state;

    expect(r.events.some((e) => e.kind === "regionResolved")).toBe(true);
    expect(s.crowns[region]).toBe(owner);
    // Settled region cubes cleared.
    expect(s.regions[region]).toEqual({ english: 0, scottish: 0, welsh: 0 });
    expect(s.eventIndex).toBe(1);
    // Pass flags reset for the next round.
    expect(s.players.every((p) => !p.passed)).toBe(true);
  });
});

describe("actions", () => {
  it("muster adds cubes and consumes the card", () => {
    let s = newGame(P, 5);
    const region = currentRegionId(s)!;
    const before = s.regions[region].english;
    const r = applyAction(s, { type: "playCard", cardId: "muster-english" });
    expect(r.error).toBeUndefined();
    s = r.state;
    expect(s.regions[region].english).toBe(before + 2);
    expect(s.players[0].hand).not.toContain("muster-english");
    // Turn passed to the other player.
    expect(s.currentPlayerIndex).toBe(1);
  });

  it("exile removes cubes (floored at 0) and needs a target", () => {
    let s = newGame(P, 5);
    // Point the contested region at one we control the contents of.
    const region = currentRegionId(s)!;
    s.regions[region] = { english: 1, scottish: 0, welsh: 0 };
    // Exiling scottish (none present) is rejected.
    const bad = applyAction(s, { type: "playCard", cardId: "exile-scottish" });
    expect(bad.error).toBeDefined();
    // Exiling english removes up to 2, floored at 0.
    const r = applyAction(s, { type: "playCard", cardId: "exile-english" });
    expect(r.state.regions[region].english).toBe(0);
  });

  it("manoeuvre pulls cubes from an adjacent region only", () => {
    let s = newGame(P, 5);
    const region = currentRegionId(s)!;
    const def = REGIONS.find((r) => r.id === region)!;
    const adj = def.adjacent[0];
    // Ensure the neighbour has welsh cubes to move.
    s.regions[adj] = { english: 0, scottish: 0, welsh: 2 };
    const before = s.regions[region].welsh;
    const r = applyAction(s, {
      type: "playCard",
      cardId: "manoeuvre-1",
      fromRegion: adj,
      faction: "welsh",
    });
    expect(r.error).toBeUndefined();
    expect(r.state.regions[region].welsh).toBe(before + 2);
    expect(r.state.regions[adj].welsh).toBe(0);

    // Non-adjacent source is rejected.
    const nonAdj = REGIONS.map((x) => x.id).find(
      (id) => id !== region && !def.adjacent.includes(id),
    )!;
    const bad = applyAction(s, {
      type: "playCard",
      cardId: "manoeuvre-1",
      fromRegion: nonAdj,
      faction: "welsh",
    });
    expect(bad.error).toBeDefined();
  });

  it("pass can take a follower present in the region", () => {
    let s = newGame(P, 5);
    const region = currentRegionId(s)!;
    s.regions[region] = { english: 2, scottish: 0, welsh: 0 };
    const r = applyAction(s, { type: "pass", takeFollower: "english" });
    expect(r.error).toBeUndefined();
    expect(r.state.players[0].court.english).toBe(1);
    expect(r.state.regions[region].english).toBe(1);
    expect(r.state.players[0].passed).toBe(true);
  });

  it("rejects taking a follower colour not present", () => {
    let s = newGame(P, 5);
    const region = currentRegionId(s)!;
    s.regions[region] = { english: 0, scottish: 0, welsh: 0 };
    const r = applyAction(s, { type: "pass", takeFollower: "english" });
    expect(r.error).toBeDefined();
  });

  it("rejects a card that is not in hand", () => {
    let s = newGame(P, 5);
    s = applyAction(s, { type: "playCard", cardId: "muster-english" }).state; // p0 plays, p1 to move
    s = applyAction(s, { type: "pass" }).state; // p1 passes -> back to p0
    // p0 already used muster-english.
    const r = applyAction(s, { type: "playCard", cardId: "muster-english" });
    expect(r.error).toBeDefined();
  });
});

describe("legalActions", () => {
  it("always offers pass options and card plays", () => {
    const s = newGame(P, 5);
    const actions = legalActions(s);
    expect(actions.some((a) => a.type === "pass")).toBe(true);
    expect(actions.some((a) => a.type === "playCard")).toBe(true);
    // Passed players have no actions.
    const passedState: TKID2State = {
      ...s,
      players: s.players.map((p) => ({ ...p, passed: true })),
    };
    expect(legalActions(passedState)).toEqual([]);
  });

  it("only lists exiles for factions present", () => {
    const s = newGame(P, 5);
    const region = currentRegionId(s)!;
    s.regions[region] = { english: 1, scottish: 0, welsh: 0 };
    const actions = legalActions(s);
    const exiles = actions.filter(
      (a) => a.type === "playCard" && a.cardId.startsWith("exile-"),
    );
    expect(exiles).toEqual([{ type: "playCard", cardId: "exile-english" }]);
  });
});

describe("full game & scoring", () => {
  it("plays out every region and ends the game", () => {
    let s = newGame(P, 11);
    let guard = 0;
    while (!isGameOver(s) && guard < 1000) {
      guard++;
      s = applyAction(s, { type: "pass" }).state;
    }
    expect(isGameOver(s)).toBe(true);
    expect(Object.keys(s.crowns)).toHaveLength(REGIONS.length);
    // crownCounts total equals number of regions.
    const counts = crownCounts(s);
    const total = FACTIONS.reduce((a, f) => a + counts[f], 0) + counts.french;
    expect(total).toBe(REGIONS.length);
  });

  it("normal game: strongest faction decides; most followers wins", () => {
    // Hand-craft an ended state.
    const s = newGame(P, 1);
    const ended: TKID2State = {
      ...s,
      phase: "ended",
      eventIndex: REGIONS.length,
      crowns: {
        r1: "english",
        r2: "english",
        r3: "english",
        r4: "scottish",
        r5: "welsh",
        r6: "welsh",
        r7: "scottish",
        r8: "french",
      } as any,
      players: [
        { ...s.players[0], court: { english: 3, scottish: 1, welsh: 0 } },
        { ...s.players[1], court: { english: 2, scottish: 5, welsh: 0 } },
      ],
    };
    expect(isInvasion(ended)).toBe(false);
    expect(decidingFaction(ended)).toBe("english"); // 3 crowns
    const ranked = results(ended);
    expect(ranked[0].playerId).toBe("p1"); // more english followers
    expect(winners(ended).map((w) => w.playerId)).toEqual(["p1"]);
  });

  it("invasion flips to the weakest faction", () => {
    const s = newGame(P, 1);
    const crowns: Record<string, string> = {
      r1: "french",
      r2: "french",
      r3: "french",
      r4: "french", // >= INVASION_THRESHOLD
      r5: "english",
      r6: "english",
      r7: "scottish",
      r8: "welsh",
    };
    const ended: TKID2State = {
      ...s,
      phase: "ended",
      eventIndex: REGIONS.length,
      crowns: crowns as any,
      players: [
        { ...s.players[0], court: { english: 5, scottish: 0, welsh: 3 } },
        { ...s.players[1], court: { english: 0, scottish: 0, welsh: 4 } },
      ],
    };
    expect(INVASION_THRESHOLD).toBeLessThanOrEqual(4);
    expect(isInvasion(ended)).toBe(true);
    // Weakest native faction is welsh (1 crown) — ties broken by fixed order,
    // scottish also has 1; welsh comes last so it is the weakest.
    expect(decidingFaction(ended)).toBe("welsh");
    const ranked = results(ended);
    expect(ranked[0].playerId).toBe("p2"); // 4 welsh > 3 welsh
  });

  it("supports three players (human + 2 bots)", () => {
    const three = [
      { id: "p1", name: "Human", isBot: false },
      { id: "p2", name: "Bot A", isBot: true },
      { id: "p3", name: "Bot B", isBot: true },
    ];
    let s = newGame(three, 9);
    expect(s.players).toHaveLength(3);
    let guard = 0;
    while (!isGameOver(s) && guard < 1000) {
      guard++;
      const player = currentPlayer(s);
      // Alternate a card play and passes to exercise turn rotation.
      const acts = legalActions(s);
      s = applyAction(s, acts[0]).state;
      expect(player).toBeDefined();
    }
    expect(isGameOver(s)).toBe(true);
  });
});
