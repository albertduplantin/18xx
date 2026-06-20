/** A game phase, triggered by train purchases */
export type PhaseDef = {
  readonly id: string;
  readonly name: string;
  readonly trainLimit: number;
  readonly tiles: readonly string[];
  readonly operatingRounds: number;
  readonly buyingPrice?: number;
  readonly triggers?: readonly string[];
};
