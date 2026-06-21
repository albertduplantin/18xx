import type { GameDef } from "@18xx/shared";
import { STANDARD_TILES } from "./tiles.js";

/**
 * 1830 — Railroads & Robber Barons
 *
 * Classic 18xx game set in the northeastern USA (1830s).
 * Players compete to build the most valuable portfolio of railroad stock.
 *
 * NOTE: Map coordinates (q,r) are approximate axial coordinates.
 * Verify against the physical game board before play. Consult an
 * experienced 1830 player to confirm: city revenues by phase, par values,
 * tile counts, private company abilities, and exact map layout.
 */
export const GAME_1830: GameDef = {
  id: "1830",
  name: "1830 — Railroads & Robber Barons",
  minPlayers: 2,
  maxPlayers: 6,
  bankCash: 12000,
  certLimit: { 2: 28, 3: 20, 4: 16, 5: 13, 6: 11 },
  startingCash: { 2: 1200, 3: 800, 4: 600, 5: 480, 6: 400 },

  // ── STOCK MARKET ──────────────────────────────────────────────────────────
  // 1830 uses a 4-row × 12-col grid. Par values are in row 0 (cols 5-11).
  // NOTE: Verify exact prices and cell types.
  stockMarket: {
    // Par values verified against 18xx.games source: $67, $71, $76, $82, $90, $100
    market: [
      [
        { price: 60 },
        { price: 67, type: "par" }, { price: 71, type: "par" },
        { price: 76, type: "par" }, { price: 82, type: "par" },
        { price: 90, type: "par" }, { price: 100, type: "par" },
        { price: 112 }, { price: 124 }, { price: 137 }, { price: 151 }, { price: 167 },
        { price: 185 }, { price: 200 }, { price: 220 }, { price: 245 },
        { price: 270 }, { price: 300 },
      ],
      [
        { price: 53 }, { price: 60 }, { price: 65 }, { price: 70 }, { price: 75 },
        { price: 80 }, { price: 85 }, { price: 90 },
        { price: 95 }, { price: 100 }, { price: 110 }, { price: 120 },
        { price: 135 }, { price: 150 }, { price: 165 }, { price: 180 },
        { price: 195 }, { price: 210 },
      ],
      [
        { price: 45 }, { price: 50 }, { price: 55 }, { price: 60 }, { price: 65 },
        { price: 70 }, { price: 75 }, { price: 80 },
        { price: 85 }, { price: 90 }, { price: 95 }, { price: 100 },
        { price: 110 }, { price: 120 }, { price: 135 }, { price: 150 },
        { price: 165 }, { price: 180 },
      ],
      [
        { price: 0, type: "bankrupt" }, { price: 10 }, { price: 20 }, { price: 30 },
        { price: 40 }, { price: 50 }, { price: 60 }, { price: 70 },
        { price: 80 }, { price: 90 }, { price: 100 }, { price: 110 },
        { price: 120 }, { price: 130 }, { price: 145 }, { price: 160 },
        { price: 175 }, { price: 190 },
      ],
    ],
  },

  // ── GAME PHASES ──────────────────────────────────────────────────────────
  phases: [
    {
      id: "2",
      name: "Phase 2",
      trainLimit: 4,
      tiles: ["yellow"],
      operatingRounds: 1,
      triggers: ["2"],
    },
    {
      id: "3",
      name: "Phase 3",
      trainLimit: 4,
      tiles: ["yellow", "green"],
      operatingRounds: 2,
      triggers: ["3"],
    },
    {
      id: "4",
      name: "Phase 4",
      trainLimit: 3,
      tiles: ["yellow", "green"],
      operatingRounds: 2,
      triggers: ["4"],
    },
    {
      id: "5",
      name: "Phase 5",
      trainLimit: 2,
      tiles: ["yellow", "green", "brown"],
      operatingRounds: 3,
      triggers: ["5"],
    },
    {
      id: "6",
      name: "Phase 6",
      trainLimit: 2,
      tiles: ["yellow", "green", "brown"],
      operatingRounds: 3,
      triggers: ["6"],
    },
    {
      id: "D",
      name: "Phase D (Diesel)",
      trainLimit: 2,
      tiles: ["yellow", "green", "brown", "gray"],
      operatingRounds: 3,
      triggers: ["D"],
    },
  ],

  // ── TRAINS ────────────────────────────────────────────────────────────────
  // Prices verified against 18xx.games source (tobymao/18xx game.rb)
  trains: [
    { id: "2", name: "2",   distance: 2,  price:   80, rusts: "4",  available: 6 },
    { id: "3", name: "3",   distance: 3,  price:  180, rusts: "6",  available: 5 },
    { id: "4", name: "4",   distance: 4,  price:  300,              available: 4 },
    { id: "5", name: "5",   distance: 5,  price:  450,              available: 3 },
    { id: "6", name: "6",   distance: 6,  price:  630,              available: 2 },
    { id: "D", name: "D", distance: 999, price: 1100, discountable: true, available: 20 },
  ],

  // ── PRIVATE COMPANIES ─────────────────────────────────────────────────────
  // NOTE: Confirm exact special abilities with rulebook.
  privates: [
    {
      id: "SV",
      name: "Schuylkill Valley Railroad",
      shortName: "SV",
      value: 20,
      revenue: 5,
      description: "Blocks hex G15. No special abilities.",
      abilities: [{ type: "block_hex", coords: [[6, 8]] }],
    },
    {
      id: "CS",
      name: "Champlain & St.Lawrence Railroad",
      shortName: "CS",
      value: 40,
      revenue: 10,
      description: "Comes with a free yellow tile for B20. Owner may lay that tile for free in addition to their normal tile lay.",
      abilities: [{ type: "tile_lay", tiles: ["8", "9"], freeIfOwned: true }],
    },
    {
      id: "DH",
      name: "Delaware & Hudson Canal Company",
      shortName: "D&H",
      value: 70,
      revenue: 15,
      description: "Provides an extra yellow tile lay per operating round when purchased by a company.",
      abilities: [{ type: "tile_lay" }],
    },
    {
      id: "MH",
      name: "Mohawk & Hudson Railroad",
      shortName: "M&H",
      value: 110,
      revenue: 20,
      description: "Provides an extra yellow tile lay, or the ability to lay a green tile on the first operating round.",
      abilities: [{ type: "tile_lay" }],
    },
    {
      id: "CA",
      name: "Camden & Amboy Railroad",
      shortName: "C&A",
      value: 160,
      revenue: 25,
      description: "Comes with a 10% share of the Pennsylvania Railroad (PRR).",
      abilities: [],
    },
    {
      id: "BO",
      name: "Baltimore & Ohio Railroad",
      shortName: "B&O",
      value: 220,
      revenue: 30,
      description: "Owner immediately takes presidency of the B&O if they do not already have it. Closes when B&O buys its first train.",
      abilities: [{ type: "close_on_purchase" }],
    },
  ],

  // ── PUBLIC COMPANIES ──────────────────────────────────────────────────────
  // NOTE: Token costs, home hexes, and starting prices need verification.
  // ── PUBLIC COMPANIES ──────────────────────────────────────────────────────
  // Colors, token costs, and home hexes verified against 18xx.games source
  // (tobymao/18xx entities.rb). Home hex coordinates are in our axial system.
  companies: [
    {
      id: "PRR",
      name: "Pennsylvania Railroad",
      shortName: "PRR",
      color: "#32763f",
      textColor: "#ffffff",
      tokens: [0, 40, 100, 100],
      coordinates: [0, 1],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "NYC",
      name: "New York Central Railroad",
      shortName: "NYC",
      color: "#474548",
      textColor: "#ffffff",
      tokens: [0, 40, 100, 100],
      coordinates: [2, 3],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "CPR",
      name: "Canadian Pacific Railway",
      shortName: "CPR",
      color: "#d1232a",
      textColor: "#ffffff",
      tokens: [0, 40, 100, 100],
      coordinates: [4, 5],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "BO",
      name: "Baltimore & Ohio Railroad",
      shortName: "B&O",
      color: "#025aaa",
      textColor: "#ffffff",
      tokens: [0, 40, 100],
      coordinates: [6, 7],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "CO",
      name: "Chesapeake & Ohio Railway",
      shortName: "C&O",
      color: "#add8e6",   // Light blue — verified from 18xx.games
      textColor: "#000000",
      tokens: [0, 40, 100],
      coordinates: [8, 9],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "ERIE",
      name: "Erie Railroad",
      shortName: "ERIE",
      color: "#fff500",   // Bright yellow — verified from 18xx.games
      textColor: "#000000",
      tokens: [0, 40, 100],
      coordinates: [10, 11],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "NYNH",
      name: "New York, New Haven & Hartford Railroad",
      shortName: "NYNH",
      color: "#d88e39",   // Orange-brown — verified from 18xx.games
      textColor: "#ffffff",
      tokens: [0, 40],
      coordinates: [12, 13],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
    {
      id: "BM",
      name: "Boston & Maine Railroad",
      shortName: "B&M",
      color: "#95c054",   // Light green — verified from 18xx.games
      textColor: "#000000",
      tokens: [0, 40],
      coordinates: [14, 15],
      floatPercent: 60,
      shares: [20, 10, 10, 10, 10, 10, 10, 10, 10],
    },
  ],

  // ── MAP ───────────────────────────────────────────────────────────────────
  // NOTE: These are approximate axial coordinates (flat-top layout).
  // The full 1830 map has ~130 hexes. This is a skeleton — a 1830 expert
  // must verify all hex positions, terrain, preprinted tiles, and revenues.
  map: [
    // Off-map / border revenues (red hexes — no tile can be laid)
    { coord: { q: -4, r: -2 }, label: "Montreal",  offboard: { revenue: { "2": 30, "3": 40, "4": 50, "5": 60, "6": 60, D: 60 } } },
    { coord: { q: 8,  r: -3 }, label: "Boston",    offboard: { revenue: { "2": 30, "3": 40, "4": 50, "5": 60, "6": 60, D: 60 } } },
    { coord: { q: 5,  r: 4  }, label: "Washington", offboard: { revenue: { "2": 30, "3": 30, "4": 30, "5": 40, "6": 40, D: 40 } } },
    { coord: { q: -9, r: 3  }, label: "Chicago",   offboard: { revenue: { "2": 40, "3": 50, "4": 60, "5": 80, "6": 80, D: 80 } } },
    { coord: { q: -8, r: 0  }, label: "Detroit",   offboard: { revenue: { "2": 30, "3": 40, "4": 40, "5": 50, "6": 50, D: 50 } } },

    // Major cities (pre-printed tiles — yellow from start)
    // Water terrain ($80 surcharge) on New York — verified from 18xx.games map.rb
    {
      coord: { q: 5,  r: 1 },
      label: "New York",
      terrain: { type: "water", cost: 80 },
      tile: { id: "NYC_MAP", color: "yellow", paths: [{ from: 0, to: 3 }, { from: 1, to: 4 }], cities: [{ slots: 2, revenue: 40 }], towns: [] },
    },
    {
      coord: { q: 3,  r: 2 },
      label: "Philadelphia",
      tile: { id: "PHIL_MAP", color: "yellow", paths: [{ from: 0, to: 3 }], cities: [{ slots: 1, revenue: 30 }], towns: [] },
    },
    {
      coord: { q: 2,  r: 3 },
      label: "Baltimore",
      tile: { id: "BALT_MAP", color: "yellow", paths: [{ from: 0, to: 3 }], cities: [{ slots: 1, revenue: 30 }], towns: [] },
    },
    // Water terrain on Pittsburgh — verified from 18xx.games map.rb
    {
      coord: { q: 0,  r: 2 },
      label: "Pittsburgh",
      terrain: { type: "water", cost: 80 },
      tile: { id: "PITT_MAP", color: "yellow", paths: [{ from: 0, to: 3 }], cities: [{ slots: 1, revenue: 30 }], towns: [] },
    },
    {
      coord: { q: 1,  r: -1 },
      label: "Buffalo",
      tile: { id: "BUFF_MAP", color: "yellow", paths: [{ from: 1, to: 4 }], cities: [{ slots: 1, revenue: 30 }], towns: [] },
    },
    {
      coord: { q: 4,  r: -1 },
      label: "Albany",
      tile: { id: "ALB_MAP", color: "yellow", paths: [{ from: 0, to: 3 }], cities: [{ slots: 1, revenue: 20 }], towns: [] },
    },

    // Blank playable hexes — mountain terrain ($120) where identifiable from 18xx.games map
    { coord: { q: 0,  r: -1 } },
    { coord: { q: 1,  r: 0  } },
    { coord: { q: 2,  r: 0  } },
    { coord: { q: 3,  r: 0  } },
    { coord: { q: 4,  r: 0  } },
    { coord: { q: 2,  r: 1  } },
    { coord: { q: 3,  r: 1  } },
    { coord: { q: 4,  r: 1  } },
    { coord: { q: 1,  r: 1  } },
    { coord: { q: -1, r: 1  }, terrain: { type: "mountain", cost: 120 } },
    { coord: { q: -1, r: 2  } },
    { coord: { q: -2, r: 2  }, terrain: { type: "mountain", cost: 120 } },
    { coord: { q: -3, r: 2  }, terrain: { type: "mountain", cost: 120 } },
    { coord: { q: -2, r: 1  }, terrain: { type: "mountain", cost: 120 } },
    { coord: { q: -1, r: 0  } },
    { coord: { q: -2, r: 0  } },
    { coord: { q: -3, r: 0  } },
    { coord: { q: -3, r: -1 } },
    { coord: { q: -2, r: -1 } },
    { coord: { q: -1, r: -1 }, terrain: { type: "mountain", cost: 120 } },
    { coord: { q: 0,  r: -2 } },
    { coord: { q: 1,  r: -2 } },
    { coord: { q: 2,  r: -2 } },
    { coord: { q: 3,  r: -2 } },
    { coord: { q: 4,  r: -2 } },
    { coord: { q: 5,  r: -2 } },
    { coord: { q: 5,  r: 0  } },
    { coord: { q: 5,  r: 2  }, terrain: { type: "water", cost: 80 } },
    { coord: { q: 5,  r: 3  } },
    { coord: { q: 4,  r: 2  } },
    { coord: { q: 4,  r: 3  } },
    { coord: { q: 3,  r: 3  } },
    { coord: { q: 1,  r: 2  } },
    { coord: { q: 0,  r: 3  } },
    { coord: { q: 6,  r: -1 } },
    { coord: { q: 6,  r: 0  } },
    { coord: { q: 6,  r: 1  } },
    { coord: { q: 7,  r: -2 } },
    { coord: { q: 7,  r: -1 } },
    { coord: { q: 7,  r: 0  } },
  ],

  tiles: STANDARD_TILES,
  floatPercent: 60,
  sellAfterBuy: "not_current_or",
  endGame: "bank_broken",
  layout: "flat",
};
