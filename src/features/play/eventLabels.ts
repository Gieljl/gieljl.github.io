import type { RoundStatEvent } from './engine/scoring';

/** Human-readable label for round summaries / logs. */
export const EVENT_LABELS: Record<RoundStatEvent, string> = {
  yasat: 'Yasat!',
  own: 'Own',
  owned: 'Owned',
  'multi-owned': 'Multi-owned',
  kill: 'Kill',
  'double-kill': 'Double Kill',
  'multi-kill': 'Multi Kill',
  'mega-kill': 'Mega Kill',
  'monster-kill': 'MONSTER KILL',
  death: 'Death',
  'nullify-50': 'Nullify 50',
  'nullify-100': 'Nullify 100',
  'enable-50': 'Enable 50',
  'enable-100': 'Enable 100',
  lullify: 'Lullify',
  'enable-69': 'Enable 69',
  'contra-own-50': 'Contra-own 50',
  'contra-own-100': 'Contra-own 100',
};

/**
 * Maps a play-engine RoundStatEvent to the `statName` used in
 * `statsSlice.weightedStats`. Names intentionally match existing entries so
 * the same weights drive the weighted score in Play mode.
 */
export const EVENT_TO_STAT_NAME: Record<RoundStatEvent, string> = {
  yasat: 'Yasat',
  own: 'Own',
  owned: 'Owned',
  'multi-owned': 'Multi-owned',
  kill: 'Kill',
  'double-kill': 'Double Kill',
  'multi-kill': 'Multi Kill',
  'mega-kill': 'Mega Kill',
  'monster-kill': 'Monster Kill',
  death: 'Death',
  'nullify-50': 'Nullify 50',
  'nullify-100': 'Nullify 100',
  'enable-50': 'Enable 50',
  'enable-100': 'Enable 100',
  lullify: 'Lullify',
  'enable-69': 'Enable 69',
  'contra-own-50': 'Contra-own 50',
  'contra-own-100': 'Contra-own 100',
};
