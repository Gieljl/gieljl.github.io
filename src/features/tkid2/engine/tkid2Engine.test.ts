import {
  BASE_HAND,
  FACTIONS,
  FOLLOWERS_PER_FACTION,
  FOLLOWERS_PER_FACTION_2P,
  Faction,
  HOME_REGION,
  REGION_IDS,
  SETUP_FOLLOWERS_PER_REGION,
  Tkid2State,
  applyAction,
  contestedRegionId,
  controlledCounts,
  enumerateCardParams,
  factionStandings,
  gameResult,
  instabilityOnBoard,
  isGameOver,
  legalActions,
  majorityFaction,
  newGame,
  setCount,
  summonOptions,
  supportTargets,
  totalCubes,
} from "./tkid2Engine";

const P3 = [
  { id: "a", name: "Alice", isBot: false },
  { id: "b", name: "Bob", isBot: true },
  { id: "c", name: "Cara", isBot: true },
];

function conservation(state: Tkid2State, perFaction: number) {
  for (const f of FACTIONS) {
    let sum = state.supply[f];
    for (const id of REGION_IDS) sum += state.regions[id].cubes[f];
    for (const p of state.players) sum += p.court[f];
    expect(sum).toBe(perFaction);
  }
}

/** Force-clear a region and give control to a faction (test helper). */
function grantControl(state: Tkid2State, regionId: string, faction: Faction) {
  const region = state.regions[regionId as keyof typeof state.regions];
  for (const f of FACTIONS) {
    state.supply[f] += region.cubes[f];
    region.cubes[f] = 0;
  }
  region.control = faction;
  const slot = state.slots.find((s) => s.regionId === regionId)!;
  slot.faceUp = false;
}

describe("setup", () => {
  it("deals four followers to every region, two per court, rest to supply", () => {
    const state = newGame(P3, 42);
    for (const id of REGION_IDS) {
      expect(totalCubes(state.regions[id].cubes)).toBe(SETUP_FOLLOWERS_PER_REGION);
    }
    for (const f of FACTIONS) {
      expect(state.regions[HOME_REGION[f]].cubes[f]).toBeGreaterThanOrEqual(2);
    }
    for (const p of state.players) {
      expect(totalCubes(p.court)).toBe(2);
      expect(p.hand).toEqual(BASE_HAND);
    }
    conservation(state, FOLLOWERS_PER_FACTION);
    expect(state.slots).toHaveLength(8);
    expect(state.slots.every((s) => s.faceUp)).toBe(true);
    expect(new Set(state.slots.map((s) => s.regionId)).size).toBe(8);
    expect(state.instabilityInFrance).toBe(3);
  });

  it("removes two followers of each faction in a two-player game", () => {
    const state = newGame(P3.slice(0, 2), 7);
    conservation(state, FOLLOWERS_PER_FACTION_2P);
  });

  it("advanced game: no support cards, three unique cunning cards each", () => {
    const state = newGame(P3, 3, { advanced: true });
    const seen = new Set<string>();
    for (const p of state.players) {
      expect(p.hand).toHaveLength(8);
      const cunning = p.hand.filter(
        (c) =>
          !["assemble-1", "assemble-2", "negotiate", "manoeuvre", "outmanoeuvre"].includes(c),
      );
      expect(cunning).toHaveLength(3);
      expect(p.hand).not.toContain("scottish-support");
      cunning.forEach((c) => {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      });
    }
  });

  it("is deterministic for a given seed", () => {
    expect(newGame(P3, 99)).toEqual(newGame(P3, 99));
  });
});

describe("support cards", () => {
  it("targets only regions bordering the open home region at the start", () => {
    const state = newGame(P3, 1);
    // Nothing is controlled yet, so Scottish Support may only reach
    // regions bordering Moray — which is Strathclyde alone.
    expect(supportTargets(state, "scottish").sort()).toEqual(["strathclyde"]);
    expect(supportTargets(state, "welsh").sort()).toEqual(
      ["devon", "lancaster", "warwick"].sort(),
    );
    expect(supportTargets(state, "english").sort()).toEqual(
      ["devon", "northumbria", "warwick"].sort(),
    );
  });

  it("places two followers from the supply and then requires a summon", () => {
    const state = newGame(P3, 1);
    state.supply.scottish = 5;
    const before = state.regions.strathclyde.cubes.scottish;
    const params = enumerateCardParams(state, "scottish-support")[0];
    const res = applyAction(state, { type: "play", cardId: "scottish-support", params });
    expect(res.error).toBeUndefined();
    expect(res.state.regions.strathclyde.cubes.scottish).toBe(before + 2);
    expect(res.state.supply.scottish).toBe(3);
    expect(res.state.pendingSummon).toBe(true);
    // Only summon actions are legal now.
    const acts = legalActions(res.state);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.type === "summon")).toBe(true);
    const after = applyAction(res.state, acts[0]);
    expect(after.error).toBeUndefined();
    expect(totalCubes(after.state.players[0].court)).toBe(3);
    expect(after.state.currentPlayerIndex).toBe(1);
    expect(after.state.players[0].hand).not.toContain("scottish-support");
    expect(after.state.players[0].discard).toEqual(["scottish-support"]);
  });

  it("targets regions bordering controlled regions once the home is closed", () => {
    const state = newGame(P3, 1);
    grantControl(state, "moray", "scottish");
    // Moray is controlled → home fallback gone; Strathclyde borders Moray.
    expect(supportTargets(state, "scottish").sort()).toEqual(["strathclyde"]);
    grantControl(state, "warwick", "scottish");
    expect(supportTargets(state, "scottish").sort()).toEqual(
      ["devon", "essex", "gwynedd", "lancaster", "northumbria", "strathclyde"].sort(),
    );
  });

  it("places as many as possible when the supply runs short", () => {
    const state = newGame(P3, 1);
    state.supply.scottish = 1;
    const params = enumerateCardParams(state, "scottish-support");
    expect(params.length).toBeGreaterThan(0);
    expect(params.every((p) => (p.placements ?? []).length === 1)).toBe(true);
  });

  it("can only be played for no effect when the supply is empty", () => {
    const state = newGame(P3, 1);
    state.supply.scottish = 0;
    expect(enumerateCardParams(state, "scottish-support")).toHaveLength(0);
    const res = applyAction(state, {
      type: "play",
      cardId: "scottish-support",
      params: {},
    });
    expect(res.error).toBeUndefined();
  });
});

describe("assemble", () => {
  it("places one follower of each available faction anywhere", () => {
    const state = newGame(P3, 5);
    state.supply = { scottish: 3, welsh: 3, english: 0 };
    const params = enumerateCardParams(state, "assemble-1")[0];
    expect(params.placements).toHaveLength(2); // english skipped: no supply
    const res = applyAction(state, { type: "play", cardId: "assemble-1", params });
    expect(res.error).toBeUndefined();
    expect(res.state.supply.scottish + res.state.supply.welsh).toBe(4);
  });
});

describe("negotiate", () => {
  it("swaps two face-up region cards and leaves a negotiation disc", () => {
    const state = newGame(P3, 8);
    const [s1, s2] = [state.slots[0], state.slots[1]];
    const res = applyAction(state, {
      type: "play",
      cardId: "negotiate",
      params: { slotA: s1.position, slotB: s2.position, discRegionId: s1.regionId },
    });
    expect(res.error).toBeUndefined();
    const n1 = res.state.slots[0];
    const n2 = res.state.slots[1];
    expect(n1.regionId).toBe(s2.regionId);
    expect(n2.regionId).toBe(s1.regionId);
    // The disc followed the chosen card to its new space.
    expect(n2.negotiationDisc).toBe(true);
    expect(n1.negotiationDisc).toBe(false);
    // A card with a disc can no longer be swapped.
    expect(
      enumerateCardParams(res.state, "negotiate").some(
        (p) => p.slotA === n2.position || p.slotB === n2.position,
      ),
    ).toBe(false);
  });
});

describe("manoeuvre and outmanoeuvre", () => {
  it("swaps one follower for one follower between two regions", () => {
    const state = newGame(P3, 11);
    const params = enumerateCardParams(state, "manoeuvre")[0]!;
    const { from, to } = params;
    const beforeFrom = state.regions[from!.regionId].cubes[from!.factions[0]];
    const beforeTo = state.regions[to!.regionId].cubes[to!.factions[0]];
    const res = applyAction(state, { type: "play", cardId: "manoeuvre", params });
    expect(res.error).toBeUndefined();
    if (from!.factions[0] !== to!.factions[0]) {
      expect(res.state.regions[from!.regionId].cubes[from!.factions[0]]).toBe(beforeFrom - 1);
      expect(res.state.regions[to!.regionId].cubes[to!.factions[0]]).toBe(beforeTo - 1);
    }
    conservation(res.state, FOLLOWERS_PER_FACTION);
  });

  it("forbids immediately undoing another player's manoeuvre", () => {
    const state = newGame(P3, 11);
    // Alice manoeuvres.
    const params = enumerateCardParams(state, "manoeuvre").find(
      (p) => p.from!.factions[0] !== p.to!.factions[0],
    )!;
    let s = applyAction(state, { type: "play", cardId: "manoeuvre", params }).state;
    s = applyAction(s, legalActions(s)[0]).state; // Alice summons
    // Bob tries to reverse it: the exact undo must not be enumerated.
    const reverse = {
      from: { regionId: params.from!.regionId, factions: params.to!.factions },
      to: { regionId: params.to!.regionId, factions: params.from!.factions },
    };
    const rejected = applyAction(s, {
      type: "play",
      cardId: "manoeuvre",
      params: reverse,
    });
    expect(rejected.error).toBeDefined();
  });

  it("outmanoeuvre swaps one follower for two in a bordering region", () => {
    const state = newGame(P3, 13);
    const params = enumerateCardParams(state, "outmanoeuvre")[0]!;
    expect(params.to!.factions).toHaveLength(2);
    const res = applyAction(state, { type: "play", cardId: "outmanoeuvre", params });
    expect(res.error).toBeUndefined();
    const a = res.state.regions[params.from!.regionId];
    const b = res.state.regions[params.to!.regionId];
    expect(totalCubes(a.cubes)).toBe(SETUP_FOLLOWERS_PER_REGION + 1);
    expect(totalCubes(b.cubes)).toBe(SETUP_FOLLOWERS_PER_REGION - 1);
    conservation(res.state, FOLLOWERS_PER_FACTION);
  });

  it("rejects a partial outmanoeuvre while a full swap is available", () => {
    const state = newGame(P3, 13);
    const full = enumerateCardParams(state, "outmanoeuvre")[0]!;
    const partial = {
      from: full.from,
      to: { regionId: full.to!.regionId, factions: [full.to!.factions[0]] },
    };
    const res = applyAction(state, {
      type: "play",
      cardId: "outmanoeuvre",
      params: partial,
    });
    expect(res.error).toBeDefined();
  });
});

describe("power struggles", () => {
  function passRound(state: Tkid2State): Tkid2State {
    let s = state;
    for (let i = 0; i < state.players.length; i++) {
      s = applyAction(s, { type: "pass" }).state;
    }
    return s;
  }

  it("resolves the contested region for the majority faction", () => {
    const state = newGame(P3, 21);
    const contested = contestedRegionId(state)!;
    state.regions[contested].cubes = { scottish: 3, welsh: 1, english: 0 };
    const supplyBefore = state.supply.scottish;
    const s = passRound(state);
    expect(s.regions[contested].control).toBe("scottish");
    expect(totalCubes(s.regions[contested].cubes)).toBe(0);
    expect(s.supply.scottish).toBe(supplyBefore + 3);
    expect(s.slots.find((sl) => sl.regionId === contested)!.faceUp).toBe(false);
    expect(s.struggles).toHaveLength(1);
    // The next lowest face-up card is now contested.
    expect(contestedRegionId(s)).toBe(s.slots.find((sl) => sl.faceUp)!.regionId);
  });

  it("marks a tied region unstable and moves a disc out of France", () => {
    const state = newGame(P3, 22);
    const contested = contestedRegionId(state)!;
    state.regions[contested].cubes = { scottish: 2, welsh: 2, english: 0 };
    const s = passRound(state);
    expect(s.regions[contested].unstable).toBe(true);
    expect(s.regions[contested].control).toBeNull();
    expect(s.instabilityInFrance).toBe(2);
    expect(instabilityOnBoard(s)).toBe(1);
  });

  it("ends the game with an invasion on the third instability disc", () => {
    let state = newGame(P3, 23);
    for (let round = 0; round < 3; round++) {
      const contested = contestedRegionId(state)!;
      state.regions[contested].cubes = { scottish: 1, welsh: 1, english: 0 };
      state = passRound(state);
    }
    expect(isGameOver(state)).toBe(true);
    expect(state.ending).toBe("invasion");
    const result = gameResult(state)!;
    expect(result.ending).toBe("invasion");
    expect(result.winnerIds.length).toBeGreaterThanOrEqual(1);
  });

  it("ends with a coronation when all eight struggles resolve", () => {
    let state = newGame(P3, 24);
    let round = 0;
    while (!isGameOver(state) && round < 8) {
      const contested = contestedRegionId(state)!;
      state.regions[contested].cubes = { scottish: 2, welsh: 1, english: 0 };
      state = passRound(state);
      round++;
    }
    expect(isGameOver(state)).toBe(true);
    expect(state.ending).toBe("coronation");
    expect(controlledCounts(state).scottish).toBe(8);
    const standings = factionStandings(state);
    expect(standings[0].faction).toBe("scottish");
    const result = gameResult(state)!;
    const best = Math.max(...state.players.map((p) => p.court.scottish));
    for (const row of result.results) {
      if (row.winner) expect(row.score).toBe(best);
    }
  });

  it("breaks faction power ties by the most recent struggle win", () => {
    let state = newGame(P3, 25);
    const order: Faction[] = [
      "scottish",
      "welsh",
      "scottish",
      "welsh",
      "english",
      "english",
      "scottish",
      "welsh", // welsh wins last
    ];
    let i = 0;
    while (!isGameOver(state) && i < 8) {
      const contested = contestedRegionId(state)!;
      const cubes = { scottish: 0, welsh: 0, english: 0 };
      cubes[order[i]] = 2;
      state.regions[contested].cubes = cubes;
      state = passRound(state);
      i++;
    }
    // Scottish and Welsh both control 3 regions; Welsh won the final struggle.
    const standings = factionStandings(state);
    expect(standings[0].faction).toBe("welsh");
    expect(standings[1].faction).toBe("scottish");
  });
});

describe("scoring", () => {
  it("counts complete follower sets for an invasion", () => {
    expect(setCount({ scottish: 2, welsh: 1, english: 3 })).toBe(1);
    expect(setCount({ scottish: 0, welsh: 4, english: 3 })).toBe(0);
  });

  it("majorityFaction requires a strict majority", () => {
    expect(majorityFaction({ scottish: 2, welsh: 1, english: 0 })).toBe("scottish");
    expect(majorityFaction({ scottish: 2, welsh: 2, english: 0 })).toBeNull();
    expect(majorityFaction({ scottish: 0, welsh: 0, english: 0 })).toBeNull();
  });
});

describe("full random games", () => {
  function randomOf<T>(arr: T[], rng: () => number): T {
    return arr[Math.floor(rng() * arr.length)];
  }

  it("always terminate and conserve followers", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let rngState = seed * 7919 + 1;
      const rng = () => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState / 0x80000000;
      };
      let state = newGame(P3, seed, { advanced: seed % 2 === 0 });
      let steps = 0;
      while (!isGameOver(state) && steps < 2000) {
        const actions = legalActions(state);
        expect(actions.length).toBeGreaterThan(0);
        const action = randomOf(actions, rng);
        const res = applyAction(state, action);
        expect(res.error).toBeUndefined();
        state = res.state;
        conservation(state, FOLLOWERS_PER_FACTION);
        steps++;
      }
      expect(isGameOver(state)).toBe(true);
      const result = gameResult(state)!;
      expect(result.winnerIds.length).toBeGreaterThanOrEqual(1);
      expect(["invasion", "coronation"]).toContain(result.ending);
    }
  });

  it("summon options only ever come from regions", () => {
    const state = newGame(P3, 55);
    for (const o of summonOptions(state)) {
      expect(REGION_IDS).toContain(o.regionId);
      expect(state.regions[o.regionId].cubes[o.faction]).toBeGreaterThan(0);
    }
  });
});
