import {
  CATEGORIES,
  CATEGORY_IDS,
  Fart,
  PRIOR_MEAN,
  RatingScores,
  applyRating,
  categoryAverage,
  cleanArtist,
  cleanTitle,
  emptySums,
  formatDuration,
  formatScore,
  isCompleteRating,
  overallAverage,
  pickNextFart,
  rankFarts,
  rankingScore,
  ratingMean,
  timeAgo,
  verdict,
} from "./scheetModel";

function uniform(score: number): RatingScores {
  return CATEGORY_IDS.reduce((acc, id) => ({ ...acc, [id]: score }), {} as RatingScores);
}

function makeFart(id: string, votes: RatingScores[] = [], createdAt = 0): Fart {
  const base: Fart = {
    id,
    title: id,
    artist: "Anoniem",
    durationMs: 1500,
    mimeType: "audio/wav",
    source: "recording",
    peaks: [],
    createdAt,
    ratingCount: 0,
    sums: emptySums(),
  };
  return votes.reduce((f, v) => applyRating(f, v), base);
}

describe("categories", () => {
  it("rates sound only — no smell or moisture categories", () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      "Toon",
      "Ritme",
      "Lengte",
      "Volume",
      "Timing",
      "Bereik",
    ]);
    expect(new Set(CATEGORY_IDS).size).toBe(6);
  });

  it("starts every category at zero", () => {
    expect(Object.values(emptySums())).toEqual(new Array(6).fill(0));
  });
});

describe("isCompleteRating", () => {
  it("requires a whole 1..10 score for every category", () => {
    expect(isCompleteRating(uniform(7))).toBe(true);
    expect(isCompleteRating({ ...uniform(7), toon: undefined })).toBe(false);
    expect(isCompleteRating({ ...uniform(7), toon: 0 })).toBe(false);
    expect(isCompleteRating({ ...uniform(7), toon: 11 })).toBe(false);
    expect(isCompleteRating({ ...uniform(7), toon: 6.5 })).toBe(false);
    expect(isCompleteRating({})).toBe(false);
  });
});

describe("averages", () => {
  it("returns null for unrated farts", () => {
    const f = makeFart("a");
    expect(categoryAverage(f, "volume")).toBeNull();
    expect(overallAverage(f)).toBeNull();
  });

  it("averages per category and overall", () => {
    const f = makeFart("a", [
      { ...uniform(6), volume: 10 },
      { ...uniform(8), volume: 4 },
    ]);
    expect(f.ratingCount).toBe(2);
    expect(categoryAverage(f, "volume")).toBe(7);
    expect(categoryAverage(f, "toon")).toBe(7);
    expect(overallAverage(f)).toBeCloseTo(7);
  });

  it("applyRating does not mutate the original", () => {
    const f = makeFart("a");
    const g = applyRating(f, uniform(9));
    expect(f.ratingCount).toBe(0);
    expect(f.sums.toon).toBe(0);
    expect(g.sums.toon).toBe(9);
  });

  it("computes the mean of one rating", () => {
    expect(ratingMean({ ...uniform(5), bereik: 11 })).toBe(6);
  });
});

describe("rankingScore", () => {
  it("pulls few-vote farts towards the middle of the scale", () => {
    const oneTen = makeFart("one", [uniform(10)]);
    const manyNines = makeFart("many", new Array(20).fill(uniform(9)));
    expect(rankingScore(oneTen, "totaal")).toBeLessThan(rankingScore(manyNines, "totaal"));
    expect(rankingScore(makeFart("none"), "toon")).toBe(PRIOR_MEAN);
  });
});

describe("rankFarts", () => {
  it("ranks per category and skips unrated farts", () => {
    const loud = makeFart("loud", [{ ...uniform(3), volume: 10 }, { ...uniform(3), volume: 10 }]);
    const sweet = makeFart("sweet", [{ ...uniform(9), volume: 2 }, { ...uniform(9), volume: 2 }]);
    const unrated = makeFart("unrated");
    const farts = [unrated, sweet, loud];

    expect(rankFarts(farts, "volume").map((r) => r.fart.id)).toEqual(["loud", "sweet"]);
    expect(rankFarts(farts, "totaal").map((r) => r.fart.id)).toEqual(["sweet", "loud"]);
    const top = rankFarts(farts, "volume")[0];
    expect(top.rank).toBe(1);
    expect(top.average).toBe(10);
  });

  it("breaks ties by vote count, then age, and shares ranks on exact ties", () => {
    const older = makeFart("older", [uniform(8)], 100);
    const newer = makeFart("newer", [uniform(8)], 200);
    const ranked = rankFarts([newer, older], "toon");
    expect(ranked.map((r) => r.fart.id)).toEqual(["older", "newer"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("honours the limit", () => {
    const farts = Array.from({ length: 5 }, (_, i) => makeFart(`f${i}`, [uniform(i + 1)]));
    expect(rankFarts(farts, "totaal", 3)).toHaveLength(3);
  });
});

describe("pickNextFart", () => {
  const farts = [makeFart("a"), makeFart("b"), makeFart("c")];

  it("never picks excluded farts", () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const f = pickNextFart(farts, new Set(["a", "c"]), () => r);
      expect(f?.id).toBe("b");
    }
  });

  it("returns null when everything is excluded", () => {
    expect(pickNextFart(farts, new Set(["a", "b", "c"]))).toBeNull();
    expect(pickNextFart([], new Set())).toBeNull();
  });

  it("stays in range for random() close to 1", () => {
    expect(pickNextFart(farts, new Set(), () => 0.999999)?.id).toBe("c");
  });
});

describe("text helpers", () => {
  it("cleans titles and artists", () => {
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle("  De   Donderslag ")).toBe("De Donderslag");
    expect(cleanTitle("x".repeat(100))).toHaveLength(60);
    expect(cleanArtist("")).toBe("Anoniem");
    expect(cleanArtist(" Piet ")).toBe("Piet");
  });

  it("formats durations and scores the Dutch way", () => {
    expect(formatDuration(1500)).toBe("1,5 s");
    expect(formatDuration(12000)).toBe("12 s");
    expect(formatScore(7.25)).toBe("7,3");
    expect(formatScore(null)).toBe("–");
  });

  it("gives a verdict for every score", () => {
    expect(verdict(9.5)).toMatch(/Legendarisch/);
    expect(verdict(1)).toBe("Loos alarm");
  });

  it("describes how long ago something happened", () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe("zojuist");
    expect(timeAgo(now - 60_000, now)).toBe("1 minuut geleden");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 uur geleden");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2 dagen geleden");
  });
});
