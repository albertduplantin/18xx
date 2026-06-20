import type { Share } from "./stock.js";

export type PlayerId = string;

export type PlayerState = {
  readonly id: PlayerId;
  readonly name: string;
  readonly cash: number;
  readonly shares: readonly Share[];
  readonly privates: readonly string[];
};
