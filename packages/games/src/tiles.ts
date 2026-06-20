import type { TileDef } from "@18xx/shared";

/**
 * Standard 18xx tile definitions.
 * Directions (flat-top hex): 0=NE, 1=E, 2=SE, 3=SW, 4=W, 5=NW
 * NOTE: Verify exact counts and configurations against physical tile sheets.
 */
export const STANDARD_TILES: readonly TileDef[] = [
  // ── YELLOW TRACK (no towns/cities) ──────────────────────────────────────
  { id: "1",  color: "yellow", paths: [{ from: 0, to: 3 }], cities: [], towns: [], count: 1 },
  { id: "2",  color: "yellow", paths: [{ from: 0, to: 2 }], cities: [], towns: [], count: 1 },
  { id: "3",  color: "yellow", paths: [{ from: 0, to: 1 }], cities: [], towns: [], count: 2 },
  { id: "4",  color: "yellow", paths: [{ from: 0, to: 3 }, { from: 1, to: 4 }], cities: [], towns: [], count: 1 },
  { id: "7",  color: "yellow", paths: [{ from: 0, to: 3 }, { from: 2, to: 5 }], cities: [], towns: [], count: 4 },
  { id: "8",  color: "yellow", paths: [{ from: 0, to: 2 }, { from: 3, to: 5 }], cities: [], towns: [], count: 8 },
  { id: "9",  color: "yellow", paths: [{ from: 0, to: 1 }, { from: 2, to: 4 }], cities: [], towns: [], count: 7 },

  // ── YELLOW TOWNS ────────────────────────────────────────────────────────
  { id: "5",  color: "yellow", paths: [{ from: 0, to: 3 }], cities: [], towns: [{ revenue: 20 }], count: 5 },
  { id: "6",  color: "yellow", paths: [{ from: 0, to: 1 }], cities: [], towns: [{ revenue: 20 }], count: 3 },
  { id: "57", color: "yellow", paths: [{ from: 0, to: 3 }], cities: [{ slots: 1, revenue: 30 }], towns: [], count: 5 },
  { id: "58", color: "yellow", paths: [{ from: 0, to: 2 }], cities: [], towns: [{ revenue: 20 }], count: 2 },

  // ── GREEN ────────────────────────────────────────────────────────────────
  { id: "14", color: "green", paths: [{ from: 0, to: 3 }, { from: 1, to: 4 }], cities: [{ slots: 2, revenue: 30 }], towns: [], count: 3 },
  { id: "15", color: "green", paths: [{ from: 0, to: 3 }, { from: 1, to: 2 }], cities: [{ slots: 2, revenue: 30 }], towns: [], count: 3 },
  { id: "16", color: "green", paths: [{ from: 0, to: 3 }, { from: 2, to: 5 }], cities: [], towns: [], count: 1 },
  { id: "17", color: "green", paths: [{ from: 0, to: 2 }, { from: 1, to: 5 }], cities: [], towns: [], count: 1 },
  { id: "18", color: "green", paths: [{ from: 0, to: 3 }, { from: 2, to: 4 }], cities: [], towns: [], count: 2 },
  { id: "19", color: "green", paths: [{ from: 0, to: 3 }, { from: 1, to: 5 }], cities: [], towns: [], count: 2 },
  { id: "20", color: "green", paths: [{ from: 0, to: 4 }, { from: 2, to: 3 }], cities: [], towns: [], count: 2 },
  { id: "23", color: "green", paths: [{ from: 0, to: 2 }, { from: 1, to: 3 }], cities: [], towns: [], count: 4 },
  { id: "24", color: "green", paths: [{ from: 0, to: 1 }, { from: 2, to: 3 }], cities: [], towns: [], count: 4 },
  { id: "25", color: "green", paths: [{ from: 0, to: 2 }, { from: 3, to: 4 }], cities: [], towns: [], count: 2 },
  { id: "26", color: "green", paths: [{ from: 0, to: 1 }, { from: 3, to: 4 }], cities: [], towns: [], count: 2 },
  { id: "27", color: "green", paths: [{ from: 0, to: 5 }, { from: 2, to: 3 }], cities: [], towns: [], count: 2 },
  { id: "28", color: "green", paths: [{ from: 0, to: 1 }, { from: 2, to: 5 }], cities: [], towns: [], count: 1 },
  { id: "29", color: "green", paths: [{ from: 0, to: 4 }, { from: 1, to: 5 }], cities: [], towns: [], count: 1 },
  { id: "53", color: "green", paths: [{ from: 0, to: 2 }, { from: 1, to: 4 }, { from: 3, to: 5 }], cities: [{ slots: 2, revenue: 40 }], towns: [], count: 2 },
  { id: "54", color: "green", paths: [{ from: 0, to: 3 }, { from: 2, to: 5 }, { from: 1, to: 4 }], cities: [{ slots: 2, revenue: 40 }], towns: [], count: 2 },

  // ── BROWN ────────────────────────────────────────────────────────────────
  { id: "39", color: "brown", paths: [{ from: 0, to: 3 }, { from: 1, to: 4 }, { from: 2, to: 5 }], cities: [], towns: [], count: 1 },
  { id: "40", color: "brown", paths: [{ from: 0, to: 2 }, { from: 1, to: 3 }, { from: 4, to: 5 }], cities: [], towns: [], count: 2 },
  { id: "41", color: "brown", paths: [{ from: 0, to: 2 }, { from: 1, to: 5 }, { from: 3, to: 4 }], cities: [], towns: [], count: 2 },
  { id: "42", color: "brown", paths: [{ from: 0, to: 1 }, { from: 2, to: 3 }, { from: 4, to: 5 }], cities: [], towns: [], count: 2 },
  { id: "43", color: "brown", paths: [{ from: 0, to: 3 }, { from: 1, to: 5 }, { from: 2, to: 4 }], cities: [], towns: [], count: 2 },
  { id: "44", color: "brown", paths: [{ from: 0, to: 1 }, { from: 2, to: 5 }, { from: 3, to: 4 }], cities: [], towns: [], count: 2 },
  { id: "45", color: "brown", paths: [{ from: 0, to: 2 }, { from: 1, to: 3 }, { from: 4, to: 5 }], cities: [], towns: [], count: 2 },
  { id: "46", color: "brown", paths: [{ from: 0, to: 5 }, { from: 1, to: 4 }, { from: 2, to: 3 }], cities: [], towns: [], count: 2 },
  { id: "47", color: "brown", paths: [{ from: 0, to: 3 }, { from: 1, to: 2 }, { from: 4, to: 5 }], cities: [], towns: [], count: 2 },
  { id: "70", color: "brown", paths: [{ from: 0, to: 1 }, { from: 2, to: 4 }, { from: 3, to: 5 }], cities: [], towns: [], count: 1 },
];
