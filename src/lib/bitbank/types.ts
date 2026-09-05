export type BitbankAsset = {
  asset: string;
  free_amount: string;
  amount_precision: number;
  onhand_amount: string;
  locked_amount: string;
  withdrawing_amount: string;
};

export type BitbankTrade = {
  trade_id: number;
  pair: string;
  order_id: number;
  side: "buy" | "sell";
  position_side?: string;
  type: string;
  amount: string;
  price: string;
  maker_taker: string;
  fee_amount_base: string;
  fee_amount_quote: string;
  fee_occurred_amount_quote?: string;
  profit_loss?: string;
  interest?: string;
  executed_at: number;
};

export type BitbankErrorBody = {
  success: 0;
  data: { code: number };
};

export type BitbankSuccess<T> = {
  success: 1;
  data: T;
};

export type TradeHistoryQuery = {
  pair?: string;
  count?: number;
  order_id?: number;
  since?: number;
  end?: number;
  order?: "asc" | "desc";
};
