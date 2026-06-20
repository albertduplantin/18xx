/** A train type definition */
export type TrainDef = {
  readonly id: string;
  readonly name: string;
  readonly distance: number | readonly { readonly nodes: number; readonly revenue: number }[];
  readonly price: number;
  readonly rusts?: string;
  readonly obsoletes?: string;
  readonly available: number;
  readonly discountable?: boolean;
  readonly variants?: readonly TrainVariant[];
};

export type TrainVariant = {
  readonly name: string;
  readonly distance: number;
  readonly price: number;
};

export type OwnedTrain = {
  readonly typeId: string;
  readonly variantName?: string;
};
