import { create } from "zustand";
import type { HexDef, HexCoord, TileDef, CityDef, TownDef } from "@18xx/shared";

export type HexType = "blank" | "city" | "town" | "offboard" | "mountain" | "water";

export type EditorHex = {
  coord: HexCoord;
  type: HexType;
  label: string;
  citySlots: number;
  offboardRevenue: number;
  preprinted: boolean;
};

export type EditorState = {
  name: string;
  author: string;
  hexes: Map<string, EditorHex>;
  selectedCoord: HexCoord | null;
  tool: "add" | "erase" | "select";
  viewBox: { x: number; y: number; w: number; h: number };

  // Actions
  setMeta(name: string, author: string): void;
  setTool(tool: EditorState["tool"]): void;
  clickHex(coord: HexCoord): void;
  selectHex(coord: HexCoord | null): void;
  updateHex(coord: HexCoord, patch: Partial<EditorHex>): void;
  setViewBox(vb: EditorState["viewBox"]): void;
  loadFromJson(json: object): void;
  exportJson(): object;
};

function hexKey(coord: HexCoord) {
  return `${coord.q},${coord.r}`;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  name: "My New 18xx Game",
  author: "",
  hexes: new Map(),
  selectedCoord: null,
  tool: "add",
  viewBox: { x: -500, y: -400, w: 1100, h: 800 },

  setMeta(name, author) {
    set({ name, author });
  },

  setTool(tool) {
    set({ tool });
  },

  clickHex(coord) {
    const { tool, hexes } = get();
    const key = hexKey(coord);

    if (tool === "erase") {
      const next = new Map(hexes);
      next.delete(key);
      set({ hexes: next, selectedCoord: null });
    } else if (tool === "add") {
      if (!hexes.has(key)) {
        const next = new Map(hexes);
        next.set(key, { coord, type: "blank", label: "", citySlots: 1, offboardRevenue: 20, preprinted: false });
        set({ hexes: next, selectedCoord: coord });
      } else {
        set({ selectedCoord: coord });
      }
    } else {
      set({ selectedCoord: key === hexKey(get().selectedCoord ?? { q: -999, r: -999 }) ? null : coord });
    }
  },

  selectHex(coord) {
    set({ selectedCoord: coord });
  },

  updateHex(coord, patch) {
    const { hexes } = get();
    const key = hexKey(coord);
    const existing = hexes.get(key);
    if (!existing) return;
    const next = new Map(hexes);
    next.set(key, { ...existing, ...patch });
    set({ hexes: next });
  },

  setViewBox(vb) {
    set({ viewBox: vb });
  },

  loadFromJson(json) {
    const def = json as { name?: string; map?: HexDef[] };
    const hexes = new Map<string, EditorHex>();

    for (const h of def.map ?? []) {
      const key = hexKey(h.coord);
      let type: HexType = "blank";
      let citySlots = 1;
      let label = h.label ?? "";
      let offboardRevenue = 20;

      if (h.offboard) {
        type = "offboard";
        offboardRevenue = typeof h.offboard.revenue === "number" ? h.offboard.revenue : 20;
      } else if (h.tile?.cities && h.tile.cities.length > 0) {
        type = "city";
        citySlots = h.tile.cities[0]?.slots ?? 1;
      } else if (h.tile?.towns && h.tile.towns.length > 0) {
        type = "town";
      }

      hexes.set(key, { coord: h.coord, type, label, citySlots, offboardRevenue, preprinted: !!h.tile });
    }

    set({ name: def.name ?? "Imported Game", hexes });
  },

  exportJson() {
    const { hexes, name } = get();
    const map = [...hexes.values()].map((h): HexDef => {
      const label = h.label || undefined;
      if (h.type === "offboard") {
        return label
          ? { coord: h.coord, label, offboard: { revenue: h.offboardRevenue } }
          : { coord: h.coord, offboard: { revenue: h.offboardRevenue } };
      }
      if (h.type === "city" && h.preprinted) {
        const city: CityDef = { slots: h.citySlots as 1 | 2 | 3 | 4, revenue: 20 };
        const tile: TileDef = {
          id: `${h.label ?? "CITY"}_MAP`,
          color: "yellow",
          paths: [{ from: 0, to: 3 }],
          cities: [city],
          towns: [],
        };
        return label ? { coord: h.coord, label, tile } : { coord: h.coord, tile };
      }
      if (h.type === "town" && h.preprinted) {
        const town: TownDef = { revenue: 10 };
        const tile: TileDef = {
          id: `${h.label ?? "TOWN"}_MAP`,
          color: "yellow",
          paths: [{ from: 0, to: 3 }],
          cities: [],
          towns: [town],
        };
        return label ? { coord: h.coord, label, tile } : { coord: h.coord, tile };
      }
      return label ? { coord: h.coord, label } : { coord: h.coord };
    });

    return { id: name.toLowerCase().replace(/\s+/g, "_"), name, map };
  },
}));
