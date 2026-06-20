export type CompanyId = string;

export type CompanyType = "public" | "private" | "minor";

export type SharePercent = 10 | 20 | 40 | 50 | 60 | 80 | 100;

export type PrivateCompanyDef = {
  readonly id: CompanyId;
  readonly name: string;
  readonly shortName: string;
  readonly value: number;
  readonly revenue: number;
  readonly description: string;
  readonly abilities?: readonly PrivateAbility[];
};

export type PrivateAbility =
  | { readonly type: "tile_lay"; readonly tiles?: readonly string[]; readonly freeIfOwned?: boolean }
  | { readonly type: "token"; readonly cityCoord?: readonly number[] }
  | { readonly type: "close_on_purchase" }
  | { readonly type: "block_hex"; readonly coords: readonly number[][] }
  | { readonly type: "revenue_change"; readonly amount: number };

export type PublicCompanyDef = {
  readonly id: CompanyId;
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly textColor?: string;
  readonly logo?: string;
  readonly tokens: readonly number[];
  readonly coordinates: readonly number[];
  readonly city?: number;
  readonly floatPercent?: number;
  readonly startingPrice?: number | null;
  readonly shares: readonly SharePercent[];
};

export type CompanyStatus =
  | "unstarted"
  | "in_progress"
  | "floated"
  | "closed";

export type CompanyState = {
  readonly id: CompanyId;
  readonly status: CompanyStatus;
  readonly cash: number;
  readonly trains: readonly string[];
  readonly tokens: readonly (boolean)[];
  readonly revenue: readonly number[];
  readonly privateOwned?: CompanyId;
};
