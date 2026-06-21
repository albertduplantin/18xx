/** Axial coordinates on a hexagonal grid */
export type HexCoord = { readonly q: number; readonly r: number };

/** The 6 directions on a hex grid, clockwise from top-right */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5;

export type TileColor = "yellow" | "green" | "brown" | "gray" | "white" | "red";

/** A track exit: which edge (0-5) the track exits from */
export type Exit = Direction;

/** A path connects two exits (or a city/town to an exit) */
export type TrackPath = {
  readonly from: Exit;
  readonly to: Exit;
};

export type CitySize = 1 | 2 | 3 | 4;

export type RevenueValue = number;

/** Revenue varies by phase in some tiles */
export type PhaseRevenue = { readonly [phase: string]: RevenueValue };

export type CityDef = {
  readonly slots: CitySize;
  readonly revenue: RevenueValue | PhaseRevenue;
};

export type TownDef = {
  readonly revenue: RevenueValue | PhaseRevenue;
};

/** A tile definition: how track is laid on a hex */
export type TileDef = {
  readonly id: string;
  readonly color: TileColor;
  readonly paths: readonly TrackPath[];
  readonly cities: readonly CityDef[];
  readonly towns: readonly TownDef[];
  readonly label?: string;
  readonly count?: number;
};

/** A placed tile on the map */
export type PlacedTile = {
  readonly tileId: string;
  readonly rotation: Direction;
  readonly tokenSlots: readonly (string | null)[];
};

/** A hex on the map */
export type HexDef = {
  readonly coord: HexCoord;
  readonly tile?: TileDef;
  readonly label?: string;
  readonly border?: boolean;
  readonly offboard?: { readonly revenue: RevenueValue | PhaseRevenue };
  readonly terrain?: { readonly type: "mountain" | "water"; readonly cost: number };
};
