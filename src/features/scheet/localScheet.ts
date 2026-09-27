import * as React from "react";

// Per-device memory: which farts this device uploaded or already rated, and
// the artist name last used. There are no accounts, so this is what keeps
// someone from rating the same fart twice or rating their own.

const RATED_KEY = "scheet.rated";
const OWN_KEY = "scheet.own";
const ARTIST_KEY = "scheet.artist";

function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage full or blocked — keep the in-memory copy */
  }
}

export function readArtistName(): string {
  try {
    return localStorage.getItem(ARTIST_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveArtistName(name: string) {
  try {
    localStorage.setItem(ARTIST_KEY, name);
  } catch {
    /* ignore */
  }
}

export interface LocalScheet {
  rated: ReadonlySet<string>;
  own: ReadonlySet<string>;
  markRated: (id: string) => void;
  markOwn: (id: string) => void;
}

export function useLocalScheet(): LocalScheet {
  const [rated, setRated] = React.useState<ReadonlySet<string>>(() => new Set(readList(RATED_KEY)));
  const [own, setOwn] = React.useState<ReadonlySet<string>>(() => new Set(readList(OWN_KEY)));

  const markRated = React.useCallback((id: string) => {
    setRated((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeList(RATED_KEY, Array.from(next));
      return next;
    });
  }, []);

  const markOwn = React.useCallback((id: string) => {
    setOwn((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeList(OWN_KEY, Array.from(next));
      return next;
    });
  }, []);

  return { rated, own, markRated, markOwn };
}
